'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../src/services/gemini', () => ({
  extractJsonObject: jest.fn(),
  generateContent: jest.fn(),
}));

jest.mock('../src/firebaseAdmin', () => ({
  db: {
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn(),
      }),
    }),
  },
}));

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { uid: 'expert-1' };
    next();
  },
  requireRole: () => (_req, _res, next) => next(),
}));

const gemini = require('../src/services/gemini');
const { db } = require('../src/firebaseAdmin');
// Import after mocks are set up
const aiRoutes = require('../src/routes/ai');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(aiRoutes);
  return app;
}

describe('AI routes', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  let app;

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    jest.clearAllMocks();
    app = buildApp();
  });

  afterAll(() => {
    if (originalApiKey) {
      process.env.GEMINI_API_KEY = originalApiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  });

  // -------------------------------------------------------------------------
  // generate-description route
  // -------------------------------------------------------------------------

  it('only supports clarify mode for tidy-only description rewrites', async () => {
    const res = await request(app)
      .post('/api/generate-description')
      .send({ mode: 'clarify', jobTypeLabel: 'TV mounting', description: 'need tv mounted in living room  ' });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe('Need tv mounted in living room.');
    expect(res.body.fallback).toBe(true);
  });

  it('rejects legacy draft mode requests', async () => {
    const res = await request(app)
      .post('/api/generate-description')
      .send({ mode: 'draft', jobTypeLabel: 'TV mounting', description: 'Need help with the TV.' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid mode specified.');
  });

  // -------------------------------------------------------------------------
  // quote-assistant route
  // -------------------------------------------------------------------------

  describe('POST /api/quote-assistant', () => {
    function mockJobDoc(jobData) {
      db.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              title: 'Fix leaking tap',
              description: 'Kitchen tap dripping constantly.',
              invitedTradieUids: ['expert-1'],
              ...jobData,
            }),
          }),
        }),
      });
    }

    // --- fallback (no API key) ---

    it('returns wording-only fallback when GEMINI_API_KEY is absent', async () => {
      mockJobDoc({});
      const res = await request(app)
        .post('/api/quote-assistant')
        .set('Authorization', 'Bearer test')
        .send({ jobId: 'job-1' });

      expect(res.status).toBe(200);
      expect(res.body.fallback).toBe(true);
      expect(res.body.message).toBeDefined();
      expect(res.body.amount).toBeUndefined();
      expect(res.body.amountLow).toBeUndefined();
      expect(res.body.amountHigh).toBeUndefined();
    });

    it('fallback message does not contain "tradie" or default inspection language', async () => {
      mockJobDoc({});
      const res = await request(app)
        .post('/api/quote-assistant')
        .set('Authorization', 'Bearer test')
        .send({ jobId: 'job-1' });

      const msg = (res.body.message || '').toLowerCase();
      expect(msg).not.toContain('tradie');
      expect(msg).not.toContain('subject to on-site inspection');
      expect(msg).not.toContain('subject to inspection');
      expect(msg).not.toContain('on-site inspection required');
      expect(msg).not.toContain('firm quote after inspection');
    });

    it('fallback disclaimer says "Final price and availability are set by the Expert"', async () => {
      mockJobDoc({});
      const res = await request(app)
        .post('/api/quote-assistant')
        .set('Authorization', 'Bearer test')
        .send({ jobId: 'job-1' });

      expect(res.body.message).toMatch(/Final price and availability are set by the Expert/i);
    });

    it('fallback message contains no dollar amounts', async () => {
      mockJobDoc({});
      const res = await request(app)
        .post('/api/quote-assistant')
        .set('Authorization', 'Bearer test')
        .send({ jobId: 'job-1' });

      expect(res.body.message).not.toMatch(/\$\s*\d/);
      expect(res.body.message).not.toMatch(/\bAUD\b/i);
    });

    // --- AI path (with API key) ---

    it('returns message + assumptions only — no price fields', async () => {
      process.env.GEMINI_API_KEY = 'fake-key';
      mockJobDoc({});
      gemini.generateContent.mockResolvedValue('raw');
      gemini.extractJsonObject.mockReturnValue({ message: 'Happy to help with the tap.', assumptions: ['Standard access assumed.'] });

      const res = await request(app)
        .post('/api/quote-assistant')
        .set('Authorization', 'Bearer test')
        .send({ jobId: 'job-1' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Happy to help with the tap.');
      expect(res.body.assumptions).toEqual(['Standard access assumed.']);
      expect(res.body.amount).toBeUndefined();
      expect(res.body.amountLow).toBeUndefined();
      expect(res.body.amountHigh).toBeUndefined();
    });

    it('appends "Final price and availability are set by the Expert" disclaimer to AI message', async () => {
      process.env.GEMINI_API_KEY = 'fake-key';
      mockJobDoc({});
      gemini.generateContent.mockResolvedValue('raw');
      gemini.extractJsonObject.mockReturnValue({ message: 'I can fix the tap.', assumptions: [] });

      const res = await request(app)
        .post('/api/quote-assistant')
        .set('Authorization', 'Bearer test')
        .send({ jobId: 'job-1' });

      expect(res.body.message).toMatch(/Final price and availability are set by the Expert/i);
      expect(res.body.message).not.toMatch(/set by the tradie/i);
    });

    // --- Sanitisation guard ---

    it('sanitiser strips dollar amounts injected by AI', async () => {
      process.env.GEMINI_API_KEY = 'fake-key';
      mockJobDoc({});
      const dirtyMsg = 'I can fix the tap.\nEstimated price range: $120 - $180 (GST included).\nPlease let me know a good time.';
      gemini.generateContent.mockResolvedValue('raw');
      gemini.extractJsonObject.mockReturnValue({ message: dirtyMsg, assumptions: [] });

      const res = await request(app)
        .post('/api/quote-assistant')
        .set('Authorization', 'Bearer test')
        .send({ jobId: 'job-1' });

      const msg = res.body.message || '';
      expect(msg).not.toMatch(/\$\s*\d/);
      expect(msg).not.toMatch(/price range/i);
      expect(msg).not.toMatch(/GST included/i);
      expect(msg).toContain('I can fix the tap.');
    });

    it('sanitiser strips "subject to on-site inspection" when job description does not mention inspection', async () => {
      process.env.GEMINI_API_KEY = 'fake-key';
      mockJobDoc({ description: 'Kitchen tap dripping. Please fix it.' });
      const dirtyMsg = 'I can fix the tap.\nAll work is subject to on-site inspection.\nPlease confirm a suitable time for an on-site inspection.';
      gemini.generateContent.mockResolvedValue('raw');
      gemini.extractJsonObject.mockReturnValue({ message: dirtyMsg, assumptions: [] });

      const res = await request(app)
        .post('/api/quote-assistant')
        .set('Authorization', 'Bearer test')
        .send({ jobId: 'job-1' });

      const msg = res.body.message || '';
      expect(msg).not.toMatch(/subject to on-site inspection/i);
      expect(msg).not.toMatch(/suitable time for.*inspect/i);
      expect(msg).toContain('I can fix the tap.');
    });

    it('sanitiser replaces "tradie" with "Expert" in AI output', async () => {
      process.env.GEMINI_API_KEY = 'fake-key';
      mockJobDoc({});
      const dirtyMsg = 'The tradie will fix the tap. Contact the tradie directly for details.';
      gemini.generateContent.mockResolvedValue('raw');
      gemini.extractJsonObject.mockReturnValue({ message: dirtyMsg, assumptions: [] });

      const res = await request(app)
        .post('/api/quote-assistant')
        .set('Authorization', 'Bearer test')
        .send({ jobId: 'job-1' });

      const msg = res.body.message || '';
      expect(msg).not.toMatch(/\btradie\b/i);
      expect(msg).toContain('Expert');
    });

    it('sanitiser strips price from assumptions too', async () => {
      process.env.GEMINI_API_KEY = 'fake-key';
      mockJobDoc({});
      gemini.generateContent.mockResolvedValue('raw');
      gemini.extractJsonObject.mockReturnValue({
        message: 'I can help with the tap.',
        assumptions: ['Standard access assumed.', 'Estimated price: $150 AUD', 'No hidden damage.'],
      });

      const res = await request(app)
        .post('/api/quote-assistant')
        .set('Authorization', 'Bearer test')
        .send({ jobId: 'job-1' });

      const assumptions = res.body.assumptions || [];
      const joined = assumptions.join(' ');
      expect(joined).not.toMatch(/\$\s*\d/);
      expect(joined).not.toMatch(/Estimated price/i);
    });

    it('falls back to safe message when AI response is empty', async () => {
      process.env.GEMINI_API_KEY = 'fake-key';
      mockJobDoc({});
      gemini.generateContent.mockResolvedValue('raw');
      gemini.extractJsonObject.mockReturnValue({ message: '', assumptions: [] });

      const res = await request(app)
        .post('/api/quote-assistant')
        .set('Authorization', 'Bearer test')
        .send({ jobId: 'job-1' });

      expect(res.status).toBe(200);
      expect(res.body.fallback).toBe(true);
      expect(res.body.message).toMatch(/Final price and availability are set by the Expert/i);
    });

    it('falls back when sanitisation removes almost all AI content', async () => {
      process.env.GEMINI_API_KEY = 'fake-key';
      mockJobDoc({ description: 'Fix tap.' });
      // Entire message is pricing lines that will all be stripped
      const allPricing = '$120 - $180 AUD.\nEstimated price range: $300.\nTotal cost: $250 GST included.';
      gemini.generateContent.mockResolvedValue('raw');
      gemini.extractJsonObject.mockReturnValue({ message: allPricing, assumptions: [] });

      const res = await request(app)
        .post('/api/quote-assistant')
        .set('Authorization', 'Bearer test')
        .send({ jobId: 'job-1' });

      expect(res.status).toBe(200);
      expect(res.body.fallback).toBe(true);
    });

    it('returns 400 when jobId is missing', async () => {
      const res = await request(app)
        .post('/api/quote-assistant')
        .set('Authorization', 'Bearer test')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('jobId is required.');
    });
  });
});
