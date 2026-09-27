import { resolveFirebaseEmulatorConfig } from './firebaseEmulators';

const LOCAL_ENV = {
  NODE_ENV: 'development',
  REACT_APP_USE_FIREBASE_EMULATORS: 'true',
  REACT_APP_FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  REACT_APP_FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
};

describe('resolveFirebaseEmulatorConfig', () => {
  it('stays disconnected unless the local flag is set', () => {
    expect(resolveFirebaseEmulatorConfig({ NODE_ENV: 'development' }, 'demo-taskio-local')).toBeNull();
    expect(resolveFirebaseEmulatorConfig({ ...LOCAL_ENV, REACT_APP_USE_FIREBASE_EMULATORS: '1' }, 'demo-taskio-local')).toBeNull();
  });

  it('connects a local development bundle for a demo- project to loopback emulators', () => {
    expect(resolveFirebaseEmulatorConfig(LOCAL_ENV, 'demo-taskio-local')).toEqual({
      authUrl: 'http://127.0.0.1:9099',
      firestore: { host: '127.0.0.1', port: 8080 },
    });
  });

  it.each(['taskio-v2-staging', 'taskio-v2', ''])('refuses the %p Firebase project', (projectId) => {
    expect(() => resolveFirebaseEmulatorConfig(LOCAL_ENV, projectId)).toThrow(/demo- Firebase project/);
  });

  it.each(['production', 'test', undefined])('refuses NODE_ENV=%p builds', (nodeEnv) => {
    expect(() => resolveFirebaseEmulatorConfig({ ...LOCAL_ENV, NODE_ENV: nodeEnv }, 'demo-taskio-local'))
      .toThrow(/local development only/);
  });

  it('refuses non-loopback or missing emulator hosts', () => {
    expect(() => resolveFirebaseEmulatorConfig(
      { ...LOCAL_ENV, REACT_APP_FIREBASE_AUTH_EMULATOR_HOST: 'identitytoolkit.googleapis.com:443' },
      'demo-taskio-local',
    )).toThrow(/REACT_APP_FIREBASE_AUTH_EMULATOR_HOST/);
    expect(() => resolveFirebaseEmulatorConfig(
      { ...LOCAL_ENV, REACT_APP_FIRESTORE_EMULATOR_HOST: '' },
      'demo-taskio-local',
    )).toThrow(/REACT_APP_FIRESTORE_EMULATOR_HOST/);
  });
});
