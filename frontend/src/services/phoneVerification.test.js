import {
  confirmPhoneOtp,
  normalizeAuMobileToE164,
  requestPhoneOtp,
} from './phoneVerification';

const mockLinkWithPhoneNumber = jest.fn();

jest.mock('firebase/auth', () => ({
  PhoneAuthProvider: {
    credential: jest.fn(() => ({ providerId: 'phone' })),
  },
  RecaptchaVerifier: jest.fn(),
  signInWithPhoneNumber: jest.fn(),
  linkWithCredential: jest.fn(),
  linkWithPhoneNumber: (...args) => mockLinkWithPhoneNumber(...args),
}));

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
      code: '123456',
    })).rejects.toMatchObject({
      code: 'auth/credential-already-in-use',
      message: 'This phone number is already linked to another Taskio account. Use that account instead or choose a different number.',
    });
  });
});
