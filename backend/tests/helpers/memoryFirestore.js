'use strict';

function mockClone(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

function createMemoryFirestore() {
  const collections = new Map();
  let txQueue = Promise.resolve();

  function store(name) {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name);
  }

  function makeDocRef(collectionName, id) {
    const ref = {
      id,
      get: async () => {
        const data = store(collectionName).get(id);
        return {
          exists: data !== undefined,
          data: () => mockClone(data),
          id,
          ref,
        };
      },
      set: async (payload, options = {}) => {
        const previous = store(collectionName).get(id);
        const next = options.merge
          ? { ...(previous || {}), ...mockClone(payload) }
          : (mockClone(payload) || {});
        store(collectionName).set(id, next);
      },
      update: async (payload) => {
        const previous = store(collectionName).get(id) || {};
        store(collectionName).set(id, { ...previous, ...mockClone(payload) });
      },
    };
    return ref;
  }

  const db = {
    collection: (name) => ({
      doc: (docId) => makeDocRef(name, String(docId)),
      where: () => ({
        limit: () => ({
          get: async () => ({ empty: true, docs: [] }),
        }),
      }),
    }),
    runTransaction: (fn) => {
      const run = txQueue.then(() => {
        const tx = {
          get: (ref) => ref.get(),
          set: (ref, payload, options) => ref.set(payload, options),
          update: (ref, payload) => ref.update(payload),
        };
        return fn(tx);
      });
      txQueue = run.then(() => undefined, () => undefined);
      return run;
    },
  };

  return {
    db,
    admin: {
      firestore: {
        FieldValue: {
          serverTimestamp: () => '__ts__',
          arrayUnion: (...values) => values,
          increment: (v) => ({ __increment: v }),
        },
      },
    },
    store,
    reset() {
      collections.clear();
      txQueue = Promise.resolve();
    },
  };
}

module.exports = { createMemoryFirestore };
