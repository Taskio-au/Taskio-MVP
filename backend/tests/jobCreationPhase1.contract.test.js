const express = require('express');
const request = require('supertest');

const mockState = {
  collections: new Map(),
  addCounter: 0,
};

function resetState() {
  mockState.collections = new Map();
  mockState.addCounter = 0;
}

function mockGetCollectionStore(name) {
  const key = String(name);
  if (!mockState.collections.has(key)) {
    mockState.collections.set(key, new Map());
  }
  return mockState.collections.get(key);
}

function mockClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function readDocs(name) {
  return Array.from(mockGetCollectionStore(name).values()).map((value) => mockClone(value));
}

jest.mock('../src/firebaseAdmin', () => ({
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => '__server_ts__'),
      },
    },
  },
  db: {
    collection: jest.fn((name) => ({
      async add(payload) {
        const id = `${String(name)}-${++mockState.addCounter}`;
        mockGetCollectionStore(name).set(id, { id, ...mockClone(payload) });
        return { id };
      },
      doc: jest.fn((id) => ({
        get: jest.fn(async () => {
          const existing = mockGetCollectionStore(name).get(id);
          return { exists: !!existing, data: () => mockClone(existing) };
        }),
        update: jest.fn(async (payload) => {
          const existing = mockGetCollectionStore(name).get(id);
          if (!existing) {
            throw new Error(`Missing document ${String(name)}/${id}`);
          }
          mockGetCollectionStore(name).set(id, { ...existing, ...mockClone(payload) });
        }),
      })),
      where: jest.fn(() => ({
        get: jest.fn(async () => ({ empty: true, docs: [], size: 0 })),
        limit: jest.fn(() => ({
          get: jest.fn(async () => ({ empty: true, docs: [], size: 0 })),
        })),
      })),
    })),
  },
}));

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = {
      uid: 'homeowner-1',
      role: 'homeowner',
      email: 'homeowner@example.com',
      email_verified: true,
    };
    next();
  },
  requireRole: () => (_req, _res, next) => next(),
}));

jest.mock('../src/services/stripe', () => ({
  createPaymentIntent: jest.fn(),
  retrievePaymentIntent: jest.fn(),
  retrieveCheckoutSession: jest.fn(),
  createTransfer: jest.fn(),
  createRefund: jest.fn(),
}));

jest.mock('../src/utils/firestore', () => ({
  safeToMillis: jest.fn(() => 0),
}));

const jobsRoutes = require('../src/routes/jobs');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(jobsRoutes);
  return app;
}

describe('job creation Phase 1 contract', () => {
  let app;

  beforeEach(() => {
    resetState();
    mockGetCollectionStore('users').set('homeowner-1', {
      id: 'homeowner-1',
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: true,
    });
    app = buildApp();
  });

  it('creates a job only when the request matches current launch constraints and generates the internal title', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({
        jobType: 'mounting_shelves',
        description: 'I need two small floating shelves installed in the living room wall.',
        location: {
          suburb: 'Richmond',
          state: 'VIC',
          postcode: '3121',
          country: 'AU',
          coordinates: { latitude: -37.8182, longitude: 144.9985 },
        },
        estimatedDuration: 'under_1_hour',
        timeline: 'Within 2 days',
        budget: '150_to_300',
        siteAccess: {
          propertyType: 'apartment_unit',
          liftAvailable: 'yes',
          stairs: 'none',
          parking: 'easy',
        },
        details: {
          mirrorSize: '',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Task created successfully');

    const jobs = readDocs('jobs');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].jobType).toBe('mounting_shelves');
    expect(jobs[0].jobTypeLabel).toBe('Shelves');
    expect(jobs[0].jobTypeCategory).toBe('Mounting');
    expect(jobs[0].title).toBe('Install shelves in Richmond');
    expect(jobs[0].estimatedDuration).toBe('under_1_hour');
    expect(jobs[0].budget).toBe('$150 - $300');
    expect(jobs[0].budgetAmountCents).toBe(30000);
    expect(jobs[0].location).toBe('Richmond, VIC 3121');
    expect(jobs[0].locationSuburb).toBe('Richmond');
    expect(jobs[0].locationPostcode).toBe('3121');
    expect(jobs[0].locationCoordinates).toEqual({ latitude: -37.8182, longitude: 144.9985 });
    expect(jobs[0].siteAccess).toEqual({
      propertyType: 'apartment_unit',
      liftAvailable: 'yes',
      stairs: 'none',
      parking: 'easy',
    });
    expect(jobs[0].details).toEqual({ mirrorSize: '' });
    expect(jobs[0].postingPhotos).toEqual([]);
    expect(jobs[0].items).toEqual([{ type: 'mounting_shelves', quantity: 1, customDescription: '' }]);
  });

  it('stores a multi-item whole-job brief while retaining primary legacy fields', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({
        primaryCategory: 'Mounting',
        items: [
          { type: 'mounting_shelves', quantity: 3, customDescription: '' },
          { type: 'mounting_tv', quantity: 1, customDescription: '' },
          { type: 'custom', quantity: 2, customDescription: 'Small wall-mounted planters' },
        ],
        description: 'Install all listed items on internal walls in the living room.',
        location: { suburb: 'Richmond', state: 'VIC', postcode: '3121' },
        estimatedDuration: 'one_to_two_hours',
        timeline: 'Flexible',
        budget: '150_to_300',
        siteAccess: {
          propertyType: 'apartment_unit', liftAvailable: 'yes', stairs: 'none', parking: 'easy',
        },
        details: { mirrorSize: '' },
      });

    expect(res.status).toBe(201);
    const [job] = readDocs('jobs');
    expect(job.primaryCategory).toBe('Mounting');
    expect(job.jobType).toBe('mounting_shelves');
    expect(job.items).toHaveLength(3);
    expect(job.items[2]).toEqual({ type: 'custom', quantity: 2, customDescription: 'Small wall-mounted planters' });
  });

  it('requires mirror details when a custom Mounting item describes mirror work', async () => {
    const payload = {
      primaryCategory: 'Mounting',
      items: [{ type: 'custom', quantity: 1, customDescription: 'Mount a mirror above the console' }],
      description: 'Install the listed item securely on an internal wall.',
      location: { suburb: 'Richmond', state: 'VIC', postcode: '3121' },
      estimatedDuration: 'under_1_hour',
      timeline: 'Flexible',
      budget: 'under_150',
      siteAccess: {
        propertyType: 'apartment_unit', liftAvailable: 'yes', stairs: 'none', parking: 'easy',
      },
      details: { mirrorSize: '' },
    };

    const missingDetailsRes = await request(app).post('/api/jobs').send(payload);
    expect(missingDetailsRes.status).toBe(400);
    expect(missingDetailsRes.body.message).toBe('Please confirm whether the mirror is standard or large/heavy.');

    const validRes = await request(app)
      .post('/api/jobs')
      .send({ ...payload, details: { mirrorSize: 'large_heavy' } });
    expect(validRes.status).toBe(201);
    expect(readDocs('jobs')[0].details).toEqual({ mirrorSize: 'large_heavy' });
    expect(readDocs('jobs')[0]).toMatchObject({
      postingPhotoRequired: true,
      postingReady: false,
    });
  });

  it('keeps a custom-only Apartment Make-Good brief unready until a photo is saved', async () => {
    const createRes = await request(app)
      .post('/api/jobs')
      .send({
        primaryCategory: 'Apartment Make-Good',
        items: [{ type: 'custom', quantity: 1, customDescription: 'Patch small picture-hook holes' }],
        description: 'A few small cosmetic fixes before moving out.',
        location: { suburb: 'Carlton', state: 'VIC', postcode: '3053' },
        estimatedDuration: 'under_1_hour',
        timeline: 'Flexible',
        budget: 'under_150',
        siteAccess: {
          propertyType: 'apartment_unit', liftAvailable: 'yes', stairs: 'none', parking: 'limited',
        },
        details: { mirrorSize: '' },
      });

    expect(createRes.status).toBe(201);
    const jobId = createRes.body.jobId;
    expect(readDocs('jobs')[0]).toMatchObject({
      primaryCategory: 'Apartment Make-Good',
      postingPhotoRequired: true,
      postingReady: false,
    });

    const emptyPhotoRes = await request(app)
      .post(`/api/jobs/${jobId}/photos`)
      .send({ photos: [] });
    expect(emptyPhotoRes.status).toBe(400);
    expect(readDocs('jobs')[0].postingReady).toBe(false);
  });

  it('rejects jobs outside the inner Melbourne allowlist with the exact launch message', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({
        jobType: 'mounting_tv',
        title: 'TV mounting in lounge room',
        description: 'I need a TV mounted on an internal wall.',
        location: {
          suburb: 'Geelong',
          state: 'VIC',
          postcode: '3220',
        },
        estimatedDuration: 'under_1_hour',
        timeline: 'Flexible',
        budget: 'under_150',
        siteAccess: {
          propertyType: 'house_townhouse',
          liftAvailable: 'no',
          stairs: 'one_flight',
          parking: 'limited',
        },
        details: {
          mirrorSize: '',
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("We're currently launching in inner Melbourne. We'll be in your area soon.");
  });

  it('rejects blocked work, over-budget text, and jobs beyond the current duration cap', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({
        jobType: 'minor_repairs_handle_replacement',
        title: 'Replace a few handles and do some plumbing',
        description: 'There is also waterproofing to check and the whole job could take 4 hours with a $500 budget.',
        location: {
          suburb: 'Carlton',
          state: 'VIC',
          postcode: '3053',
        },
        estimatedDuration: 'one_to_two_hours',
        timeline: 'Flexible',
        budget: '150_to_300',
        siteAccess: {
          propertyType: 'house_townhouse',
          liftAvailable: 'not_sure',
          stairs: 'multiple_flights',
          parking: 'none',
        },
        details: {
          mirrorSize: '',
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Taskio currently supports small indoor jobs under $300 and up to 2 hours. Electrical, plumbing, gas, and waterproofing work are not available yet.');
  });

  it('stores posting photo metadata for the homeowner after job creation', async () => {
    const createRes = await request(app)
      .post('/api/jobs')
      .send({
        jobType: 'apartment_make_good',
        description: 'I need a few small cosmetic fixes done before moving out.',
        location: {
          suburb: 'Carlton',
          state: 'VIC',
          postcode: '3053',
        },
        estimatedDuration: 'one_to_two_hours',
        timeline: 'Flexible',
        budget: '150_to_300',
        siteAccess: {
          propertyType: 'apartment_unit',
          liftAvailable: 'yes',
          stairs: 'none',
          parking: 'limited',
        },
        details: {
          mirrorSize: '',
        },
      });

    expect(createRes.status).toBe(201);
    const jobId = createRes.body.jobId;

    const photoRes = await request(app)
      .post(`/api/jobs/${jobId}/photos`)
      .send({
        photos: [
          {
            fileName: 'wall-damage.jpg',
            fileSize: 120400,
            mimeType: 'image/jpeg',
            storagePath: `job-posting-attachments/${jobId}/wall-damage.jpg`,
            downloadUrl: 'https://example.com/wall-damage.jpg',
          },
        ],
      });

    expect(photoRes.status).toBe(200);
    expect(photoRes.body.message).toBe('Job photos saved successfully.');

    const jobs = readDocs('jobs');
    expect(jobs[0].postingPhotos).toEqual([
      {
        fileName: 'wall-damage.jpg',
        fileSize: 120400,
        mimeType: 'image/jpeg',
        storagePath: `job-posting-attachments/${jobId}/wall-damage.jpg`,
        downloadUrl: 'https://example.com/wall-damage.jpg',
      },
    ]);
    expect(jobs[0].postingReady).toBe(true);
  });

  it('rejects invalid property types in site access', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({
        jobType: 'mounting_tv',
        description: 'I need a TV mounted in the living room.',
        location: {
          suburb: 'Richmond',
          state: 'VIC',
          postcode: '3121',
        },
        estimatedDuration: 'under_1_hour',
        timeline: 'Flexible',
        budget: 'under_150',
        siteAccess: {
          propertyType: 'office_commercial',
          liftAvailable: 'yes',
          stairs: 'none',
          parking: 'easy',
        },
        details: {
          mirrorSize: '',
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Please confirm lift, stairs, and parking details.');
  });

  it('rejects job creation when quoteAccessVerified is not true', async () => {
    mockGetCollectionStore('users').set('homeowner-1', {
      id: 'homeowner-1',
      role: 'homeowner',
      status: 'active',
      quoteAccessVerified: false,
      emailVerified: true,
      accountCompleted: true,
    });

    const res = await request(app)
      .post('/api/jobs')
      .send({
        jobType: 'mounting_shelves',
        description: 'I need two small floating shelves installed in the living room wall.',
        location: {
          suburb: 'Richmond',
          state: 'VIC',
          postcode: '3121',
          country: 'AU',
          coordinates: { latitude: -37.8182, longitude: 144.9985 },
        },
        estimatedDuration: 'under_1_hour',
        siteAccess: {
          propertyType: 'apartment_unit',
          liftAvailable: 'yes',
          stairs: 'none',
          parking: 'easy',
        },
        details: { mirrorSize: '' },
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('quote_access_required');
    expect(readDocs('jobs')).toHaveLength(0);
  });

  it('rejects job creation when the profile is missing', async () => {
    mockGetCollectionStore('users').delete('homeowner-1');

    const res = await request(app)
      .post('/api/jobs')
      .send({
        jobType: 'mounting_shelves',
        description: 'I need two small floating shelves installed in the living room wall.',
        location: {
          suburb: 'Richmond',
          state: 'VIC',
          postcode: '3121',
          country: 'AU',
        },
        estimatedDuration: 'under_1_hour',
        siteAccess: {
          propertyType: 'apartment_unit',
          liftAvailable: 'yes',
          stairs: 'none',
          parking: 'easy',
        },
        details: { mirrorSize: '' },
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('account_not_enrolled');
    expect(readDocs('jobs')).toHaveLength(0);
  });

  it('rejects job photos when the homeowner profile is missing without creating a user', async () => {
    mockGetCollectionStore('users').delete('homeowner-1');

    const res = await request(app)
      .post('/api/jobs/job-1/photos')
      .send({ photos: [{ downloadURL: 'https://example.com/a.jpg', storagePath: 'jobs/job-1/a.jpg' }] });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('account_not_enrolled');
    expect(mockGetCollectionStore('users').has('homeowner-1')).toBe(false);
    expect(readDocs('jobs')).toHaveLength(0);
  });

  it('rejects job photos when the homeowner profile is malformed without writing a user', async () => {
    mockGetCollectionStore('users').set('homeowner-1', { id: 'homeowner-1', phone: '+61400000001' });

    const res = await request(app)
      .post('/api/jobs/job-1/photos')
      .send({ photos: [{ downloadURL: 'https://example.com/a.jpg', storagePath: 'jobs/job-1/a.jpg' }] });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('account_state_invalid');
    expect(mockGetCollectionStore('users').get('homeowner-1')).toEqual({
      id: 'homeowner-1',
      phone: '+61400000001',
    });
  });
});
