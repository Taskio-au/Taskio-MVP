import fs from 'fs';
import path from 'path';
import {
  confirmPhoneOtp,
  createInvisibleRecaptcha,
  clearRecaptchaVerifier,
  ensureOfficialRecaptchaVerifier,
  normalizeAuMobileToE164,
  RECAPTCHA_CONTAINER_MISSING,
  requestPhoneOtp,
  requestPhoneOtpForSignIn,
} from './phoneVerification';

const mockLinkWithPhoneNumber = jest.fn();
const mockSignInWithPhoneNumber = jest.fn();
const mockRecaptchaVerifier = jest.fn();

jest.mock('firebase/auth', () => ({
  PhoneAuthProvider: {
    credential: jest.fn(() => ({ providerId: 'phone' })),
  },
  RecaptchaVerifier: function RecaptchaVerifier(...args) {
    return mockRecaptchaVerifier(...args);
  },
  signInWithPhoneNumber: (...args) => mockSignInWithPhoneNumber(...args),
  linkWithCredential: jest.fn(),
  linkWithPhoneNumber: (...args) => mockLinkWithPhoneNumber(...args),
}));

const SRC_ROOT = path.resolve(__dirname, '..');
const PHONE_AUTH_SOURCE_FILES = [
  'firebase.js',
  'services/phoneVerification.js',
  'Login.js',
  'components/JobPostingForm.js',
  'components/profile/PrivateDetailsVerificationCard.jsx',
];

function readSrc(relPath) {
  return fs.readFileSync(path.join(SRC_ROOT, relPath), 'utf8');
}

describe('phone verification identity rules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes australian mobile numbers to e164', () => {
    expect(normalizeAuMobileToE164('0405 000 123')).toBe('+61405000123');
  });

  it('rejects linking a phone that already belongs to another account during otp request', async () => {
    const error = new Error('Phone already belongs to another account');
    error.code = 'auth/credential-already-in-use';
    mockLinkWithPhoneNumber.mockRejectedValue(error);

    await expect(requestPhoneOtp({
      auth: {},
      user: { uid: 'user-1' },
      phoneNumberE164: '+61405000123',
      recaptchaVerifier: {},
    })).rejects.toMatchObject({
      code: 'auth/credential-already-in-use',
      message: 'This phone number is already linked to another Taskio account. Use that account instead or choose a different number.',
    });
  });

  it('rejects confirming a phone link when the phone belongs to another account', async () => {
    const confirmationResult = {
      confirm: jest.fn(async () => {
        const error = new Error('Phone already belongs to another account');
        error.code = 'auth/credential-already-in-use';
        throw error;
      }),
    };

    await expect(confirmPhoneOtp({
      auth: {},
      user: { uid: 'user-1' },
      confirmationResult,
      code: '000000',
    })).rejects.toMatchObject({
      code: 'auth/credential-already-in-use',
      message: 'This phone number is already linked to another Taskio account. Use that account instead or choose a different number.',
    });
  });
});

describe('official RecaptchaVerifier lifecycle', () => {
  const containerId = 'taskio-recaptcha-container';
  let auth;

  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = `<div id="${containerId}"></div>`;
    auth = {
      name: '[DEFAULT]',
      settings: { appVerificationDisabledForTesting: false },
    };
    mockRecaptchaVerifier.mockImplementation(() => ({
      clear: jest.fn(),
      verify: jest.fn(),
      render: jest.fn(async () => 'widget-1'),
    }));
    mockSignInWithPhoneNumber.mockResolvedValue({ verificationId: 'session-1' });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('constructs the official RecaptchaVerifier while testing mode is enabled', () => {
    auth.settings.appVerificationDisabledForTesting = true;
    const verifierRef = { current: null };

    const verifier = ensureOfficialRecaptchaVerifier({
      auth,
      containerId,
      verifierRef,
    });

    expect(mockRecaptchaVerifier).toHaveBeenCalledTimes(1);
    expect(mockRecaptchaVerifier).toHaveBeenCalledWith(auth, containerId, { size: 'invisible' });
    expect(verifierRef.current).toBe(verifier);
    expect(typeof verifier.verify).not.toBe('undefined');
  });

  it('constructs the same official RecaptchaVerifier in non-test mode', () => {
    auth.settings.appVerificationDisabledForTesting = false;
    const verifierRef = { current: null };

    ensureOfficialRecaptchaVerifier({
      auth,
      containerId,
      verifierRef,
    });

    expect(mockRecaptchaVerifier).toHaveBeenCalledTimes(1);
    expect(mockRecaptchaVerifier).toHaveBeenCalledWith(auth, containerId, { size: 'invisible' });
  });

  it('passes the same Auth instance to RecaptchaVerifier and signInWithPhoneNumber', async () => {
    const verifier = createInvisibleRecaptcha(auth, containerId);

    await requestPhoneOtpForSignIn({
      auth,
      phoneNumberE164: '+61405000123',
      recaptchaVerifier: verifier,
    });

    expect(mockRecaptchaVerifier.mock.calls[0][0]).toBe(auth);
    expect(mockSignInWithPhoneNumber).toHaveBeenCalledWith(auth, '+61405000123', verifier);
  });

  it('reuses one live verifier until it is discarded', () => {
    const verifierRef = { current: null };
    const first = ensureOfficialRecaptchaVerifier({ auth, containerId, verifierRef });
    const second = ensureOfficialRecaptchaVerifier({ auth, containerId, verifierRef });

    expect(first).toBe(second);
    expect(mockRecaptchaVerifier).toHaveBeenCalledTimes(1);
  });

  it('clears and discards the verifier after a failed OTP send so retry constructs a new one', async () => {
    const firstInstance = { clear: jest.fn(), verify: jest.fn(), render: jest.fn() };
    const secondInstance = { clear: jest.fn(), verify: jest.fn(), render: jest.fn() };
    mockRecaptchaVerifier
      .mockImplementationOnce(() => firstInstance)
      .mockImplementationOnce(() => secondInstance);

    const verifierRef = { current: null };
    const first = ensureOfficialRecaptchaVerifier({ auth, containerId, verifierRef });
    mockSignInWithPhoneNumber.mockRejectedValueOnce(new Error('send failed'));

    await expect(requestPhoneOtpForSignIn({
      auth,
      phoneNumberE164: '+61405000123',
      recaptchaVerifier: first,
    })).rejects.toThrow('send failed');

    clearRecaptchaVerifier(verifierRef);

    expect(firstInstance.clear).toHaveBeenCalledTimes(1);
    expect(verifierRef.current).toBeNull();

    const second = ensureOfficialRecaptchaVerifier({ auth, containerId, verifierRef });
    expect(second).toBe(secondInstance);
    expect(second).not.toBe(firstInstance);
    expect(mockRecaptchaVerifier).toHaveBeenCalledTimes(2);
  });

  it('fails deterministically when the container is missing and does not construct a verifier or send OTP', async () => {
    document.getElementById(containerId).remove();
    const verifierRef = { current: null };

    expect(() => ensureOfficialRecaptchaVerifier({ auth, containerId, verifierRef })).toThrow(RECAPTCHA_CONTAINER_MISSING);
    expect(() => createInvisibleRecaptcha(auth, containerId)).toThrow(RECAPTCHA_CONTAINER_MISSING);
    expect(mockRecaptchaVerifier).not.toHaveBeenCalled();
    expect(mockSignInWithPhoneNumber).not.toHaveBeenCalled();
    expect(verifierRef.current).toBeNull();
  });

  it('does not keep a live verifier after unmount-style cleanup', () => {
    const verifierRef = { current: null };
    const instance = ensureOfficialRecaptchaVerifier({ auth, containerId, verifierRef });
    clearRecaptchaVerifier(verifierRef);
    expect(instance.clear).toHaveBeenCalledTimes(1);
    expect(verifierRef.current).toBeNull();
  });
});

describe('phone auth sources use the supported verifier', () => {
  it('does not supply a homemade verifier or literal fake token', () => {
    const homemade = /verify\s*:\s*async\s*\(\)\s*=>\s*['"]test['"]/;
    const homemadeType = /testAppVerifierRef/;

    for (const relPath of PHONE_AUTH_SOURCE_FILES) {
      const source = readSrc(relPath);
      expect(source).not.toMatch(homemade);
      expect(source).not.toMatch(homemadeType);
    }
  });

  it('keeps testing-mode initialization on the shared Auth export before verifier construction', () => {
    const source = readSrc('firebase.js');
    expect(source).toMatch(/auth\.settings\.appVerificationDisabledForTesting = true/);
    expect(source.indexOf('export const auth = getAuth(app)')).toBeLessThan(
      source.indexOf('auth.settings.appVerificationDisabledForTesting = true')
    );
  });

  it('uses the official lifecycle helpers in all three callers', () => {
    const callers = [
      'Login.js',
      'components/JobPostingForm.js',
      'components/profile/PrivateDetailsVerificationCard.jsx',
    ];
    for (const relPath of callers) {
      const source = readSrc(relPath);
      expect(source).toMatch(/ensureOfficialRecaptchaVerifier/);
      expect(source).toMatch(/clearRecaptchaVerifier/);
      expect(source).not.toMatch(/new RecaptchaVerifier\(/);
    }
  });
});
