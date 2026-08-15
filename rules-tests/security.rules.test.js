import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  getBytes,
  ref,
  uploadBytes,
} from 'firebase/storage';

const PROJECT_ID = 'demo-taskio-rules';

let testEnv;

function firestoreFor(uid, claims = {}) {
  return testEnv.authenticatedContext(uid, claims).firestore();
}

function storageFor(uid, claims = {}) {
  return testEnv.authenticatedContext(uid, claims).storage();
}

async function seedFirestore(entries) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all(entries.map(([path, data]) => setDoc(doc(db, path), data)));
  });
}

async function seedStorage(path, contentType = 'image/png') {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(
      ref(context.storage(), path),
      new Uint8Array([1, 2, 3]),
      { contentType },
    );
  });
}

function job(overrides = {}) {
  return {
    homeownerUid: 'homeowner-1',
    acceptedTradieUid: 'tradie-1',
    invitedTradieUids: ['invited-1'],
    status: 'FUNDED',
    chatFrozen: false,
    ...overrides,
  };
}

function message(messageId, overrides = {}) {
  return {
    jobId: 'job-funded',
    messageId,
    senderUid: 'homeowner-1',
    senderRole: 'homeowner',
    senderName: 'Home Owner',
    messageType: 'text',
    text: 'A valid test message',
    ...overrides,
  };
}

function supportTicket(overrides = {}) {
  return {
    ownerUid: 'homeowner-1',
    userUid: 'homeowner-1',
    role: 'homeowner',
    category: 'other',
    status: 'new',
    message: 'Please help with this test ticket.',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastUpdatedBy: 'user',
    ...overrides,
  };
}

before(async () => {
  const [firestoreRules, storageRules] = await Promise.all([
    readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    readFile(new URL('../storage.rules', import.meta.url), 'utf8'),
  ]);

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: firestoreRules },
    storage: { rules: storageRules },
  });
});

beforeEach(async () => {
  await Promise.all([
    testEnv.clearFirestore(),
    testEnv.clearStorage(),
  ]);

  await seedFirestore([
    ['jobs/job-funded', job()],
    ['jobs/job-pending', job({ status: 'PENDING' })],
    ['jobs/job-frozen', job({ chatFrozen: true })],
    ['jobs/job-cancelled', job({ status: 'CANCELLED' })],
    ['jobs/job-paid', job({ status: 'PAID' })],
  ]);
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

describe('Firestore user and admin authorization', () => {
  test('allows homeowner self-bootstrap', async () => {
    const db = firestoreFor('new-homeowner', { email: 'owner@example.test' });
    await assertSucceeds(setDoc(doc(db, 'users/new-homeowner'), {
      uid: 'new-homeowner',
      role: 'homeowner',
      email: 'owner@example.test',
      provider: 'google',
      status: 'active',
      verified: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
  });

  test('denies self-bootstrap with expert or admin privileges', async () => {
    const db = firestoreFor('new-user');

    await assertFails(setDoc(doc(db, 'users/new-user'), {
      role: 'tradie',
    }));
    await assertFails(setDoc(doc(db, 'users/new-user'), {
      role: 'admin',
    }));
    await assertFails(setDoc(doc(db, 'users/new-user'), {
      role: 'homeowner',
      admin: true,
    }));
    await assertFails(setDoc(doc(db, 'users/new-user'), {
      role: 'homeowner',
      verified: true,
    }));
    await assertFails(setDoc(doc(db, 'users/new-user'), {
      role: 'homeowner',
      stripePayoutsEnabled: true,
    }));
    await assertFails(setDoc(doc(db, 'users/new-user'), {
      role: 'homeowner',
      status: 'suspended',
    }));

    const emailDb = firestoreFor('new-email-user', { email: 'real@example.test' });
    await assertFails(setDoc(doc(emailDb, 'users/new-email-user'), {
      role: 'homeowner',
      email: 'spoofed@example.test',
    }));
  });

  test('does not trust admin fields stored in a user profile', async () => {
    await seedFirestore([
      ['users/profile-admin', { role: 'admin', admin: true }],
      ['users/another-user', { role: 'homeowner' }],
    ]);

    const db = firestoreFor('profile-admin');
    await assertFails(getDoc(doc(db, 'users/another-user')));
  });

  test('allows an admin custom claim to read another profile', async () => {
    await seedFirestore([
      ['users/another-user', { role: 'homeowner' }],
    ]);

    const db = firestoreFor('claims-admin', { admin: true });
    await assertSucceeds(getDoc(doc(db, 'users/another-user')));
  });
});

describe('Firestore chat authorization', () => {
  test('allows valid homeowner, selected expert, and invited expert messages', async () => {
    const homeownerDb = firestoreFor('homeowner-1');
    await assertSucceeds(setDoc(
      doc(homeownerDb, 'jobs/job-funded/messages/homeowner-message'),
      message('homeowner-message'),
    ));

    const tradieDb = firestoreFor('tradie-1');
    await assertSucceeds(setDoc(
      doc(tradieDb, 'jobs/job-funded/messages/tradie-message'),
      message('tradie-message', {
        senderUid: 'tradie-1',
        senderRole: 'tradie',
      }),
    ));

    const invitedDb = firestoreFor('invited-1');
    await assertSucceeds(setDoc(
      doc(invitedDb, 'jobs/job-funded/messages/invited-message'),
      message('invited-message', {
        senderUid: 'invited-1',
        senderRole: 'tradie',
      }),
    ));
  });

  test('denies strangers and sender-role spoofing', async () => {
    const strangerDb = firestoreFor('stranger-1');
    await assertFails(setDoc(
      doc(strangerDb, 'jobs/job-funded/messages/stranger-message'),
      message('stranger-message', {
        senderUid: 'stranger-1',
      }),
    ));

    const homeownerDb = firestoreFor('homeowner-1');
    await assertFails(setDoc(
      doc(homeownerDb, 'jobs/job-funded/messages/spoofed-role'),
      message('spoofed-role', { senderRole: 'tradie' }),
    ));
  });

  test('denies messages before payment, while frozen, and after cancellation', async () => {
    const db = firestoreFor('homeowner-1');

    for (const [jobId, messageId] of [
      ['job-pending', 'pending-message'],
      ['job-frozen', 'frozen-message'],
      ['job-cancelled', 'cancelled-message'],
    ]) {
      await assertFails(setDoc(
        doc(db, `jobs/${jobId}/messages/${messageId}`),
        message(messageId, { jobId }),
      ));
    }
  });

  test('keeps messages immutable', async () => {
    await seedFirestore([
      ['jobs/job-funded/messages/existing-message', message('existing-message')],
    ]);

    const db = firestoreFor('homeowner-1');
    await assertFails(deleteDoc(doc(db, 'jobs/job-funded/messages/existing-message')));
  });
});

describe('Firestore support ticket authorization', () => {
  test('allows an owner ticket and denies an admin-role ticket', async () => {
    const db = firestoreFor('homeowner-1');
    await assertSucceeds(setDoc(
      doc(db, 'supportTickets/valid-ticket'),
      supportTicket(),
    ));
    await assertFails(setDoc(
      doc(db, 'supportTickets/spoofed-admin-ticket'),
      supportTicket({ role: 'admin' }),
    ));
  });

  test('limits ticket reads to the owner or an admin claim', async () => {
    await seedFirestore([
      ['supportTickets/private-ticket', {
        ownerUid: 'homeowner-1',
        role: 'homeowner',
      }],
    ]);

    await assertSucceeds(getDoc(doc(
      firestoreFor('homeowner-1'),
      'supportTickets/private-ticket',
    )));
    await assertFails(getDoc(doc(
      firestoreFor('stranger-1'),
      'supportTickets/private-ticket',
    )));
    await assertSucceeds(getDoc(doc(
      firestoreFor('claims-admin', { admin: true }),
      'supportTickets/private-ticket',
    )));
  });
});

describe('Storage authorization', () => {
  test('allows funded-job participants to upload safe chat attachments', async () => {
    await assertSucceeds(uploadBytes(
      ref(storageFor('homeowner-1'), 'job-attachments/job-funded/message-1/photo.png'),
      new Uint8Array([1, 2, 3]),
      { contentType: 'image/png' },
    ));
    await assertSucceeds(uploadBytes(
      ref(storageFor('homeowner-1'), 'job-attachments/job-funded/variation-1/evidence.png'),
      new Uint8Array([1, 2, 3]),
      { contentType: 'image/png' },
    ));
  });

  test('denies stranger, frozen, cancelled, unsafe-type, and oversized uploads', async () => {
    await assertFails(uploadBytes(
      ref(storageFor('stranger-1'), 'job-attachments/job-funded/message-1/photo.png'),
      new Uint8Array([1, 2, 3]),
      { contentType: 'image/png' },
    ));
    await assertFails(uploadBytes(
      ref(storageFor('homeowner-1'), 'job-attachments/job-frozen/message-1/photo.png'),
      new Uint8Array([1, 2, 3]),
      { contentType: 'image/png' },
    ));
    await assertFails(uploadBytes(
      ref(storageFor('homeowner-1'), 'job-attachments/job-cancelled/message-1/photo.png'),
      new Uint8Array([1, 2, 3]),
      { contentType: 'image/png' },
    ));
    await assertFails(uploadBytes(
      ref(storageFor('homeowner-1'), 'job-attachments/job-funded/message-1/script.js'),
      new Uint8Array([1, 2, 3]),
      { contentType: 'application/javascript' },
    ));
    await assertFails(uploadBytes(
      ref(storageFor('homeowner-1'), 'job-attachments/job-funded/message-1/large.png'),
      new Uint8Array((10 * 1024 * 1024) + 1),
      { contentType: 'image/png' },
    ));
  });

  test('prevents generic attachment rules from bypassing variation restrictions', async () => {
    await assertFails(uploadBytes(
      ref(storageFor('homeowner-1'), 'job-attachments/job-paid/variation-1/evidence.png'),
      new Uint8Array([1, 2, 3]),
      { contentType: 'image/png' },
    ));
  });

  test('keeps chat and support attachments immutable after upload', async () => {
    const chatRef = ref(
      storageFor('homeowner-1'),
      'job-attachments/job-funded/message-immutable/photo.png',
    );
    await assertSucceeds(uploadBytes(
      chatRef,
      new Uint8Array([1, 2, 3]),
      { contentType: 'image/png' },
    ));
    await assertFails(uploadBytes(
      chatRef,
      new Uint8Array([4, 5, 6]),
      { contentType: 'image/png' },
    ));

    const supportRef = ref(
      storageFor('homeowner-1'),
      'support-tickets/homeowner-1/ticket-immutable/evidence.png',
    );
    await assertSucceeds(uploadBytes(
      supportRef,
      new Uint8Array([1, 2, 3]),
      { contentType: 'image/png' },
    ));
    await assertFails(uploadBytes(
      supportRef,
      new Uint8Array([4, 5, 6]),
      { contentType: 'image/png' },
    ));
  });

  test('enforces profile-image ownership, type, and extension', async () => {
    await assertSucceeds(uploadBytes(
      ref(storageFor('homeowner-1'), 'profile-images/homeowner-1.png'),
      new Uint8Array([1, 2, 3]),
      { contentType: 'image/png' },
    ));
    await assertFails(uploadBytes(
      ref(storageFor('stranger-1'), 'profile-images/homeowner-1.png'),
      new Uint8Array([1, 2, 3]),
      { contentType: 'image/png' },
    ));
    await assertFails(uploadBytes(
      ref(storageFor('homeowner-1'), 'profile-images/homeowner-1.gif'),
      new Uint8Array([1, 2, 3]),
      { contentType: 'image/gif' },
    ));
  });

  test('does not trust Firestore admin fields for protected file reads', async () => {
    await seedFirestore([
      ['users/profile-admin', { role: 'admin', admin: true }],
    ]);
    await seedStorage('support-tickets/homeowner-1/ticket-1/file.png');

    await assertFails(getBytes(ref(
      storageFor('profile-admin'),
      'support-tickets/homeowner-1/ticket-1/file.png',
    )));
    await assertSucceeds(getBytes(ref(
      storageFor('claims-admin', { admin: true }),
      'support-tickets/homeowner-1/ticket-1/file.png',
    )));
  });
});
