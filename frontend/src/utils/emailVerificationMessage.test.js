import { emailVerificationResendMessage } from './emailVerificationMessage';

describe('email verification resend messages', () => {
  it('hides raw provider details', () => {
    const message = emailVerificationResendMessage({
      code: 'auth/operation-not-allowed',
      message: 'Firebase: Error (auth/operation-not-allowed). The email template is missing.',
    });

    expect(message).toBe("We couldn't send the verification email. Please try again.");
    expect(message).not.toMatch(/firebase|template|operation-not-allowed/i);
  });

  it('maps too many requests and service failures separately', () => {
    expect(emailVerificationResendMessage({ code: 'auth/too-many-requests', message: 'TOO_MANY' }))
      .toBe('Too many attempts. Please wait a moment and try again.');
    expect(emailVerificationResendMessage({ code: 'auth/network-request-failed', message: 'Network Error: token=secret' }))
      .toBe("We couldn't send the verification email right now. Please try again.");
    expect(emailVerificationResendMessage({ message: 'Firebase: Error (auth/internal-error).' }))
      .not.toMatch(/firebase|internal-error/i);
  });
});
