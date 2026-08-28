import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Mail, Smartphone } from 'lucide-react';
import {
  fetchSignInMethodsForEmail,
  getAdditionalUserInfo,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import { createApiClient } from './api/createApiClient';
import PublicPageHeader from './components/PublicPageHeader';
import OtpCodeInput from './components/auth/OtpCodeInput';
import { GoogleActionButton } from './components/profile/GoogleBrand';
import {
  getIdentifierType,
  maskEmail,
  maskPhone,
  normalizeIdentifier,
  PUBLIC_AUTH_ERROR,
  PUBLIC_AUTH_TEMPORARY_ERROR,
  resolveEmailSignIn,
  sendTaskioMagicLink,
} from './features/auth/utils';
import { buildExistingMethodMessage, finalizeAuthenticatedSession } from './features/auth/postAuth';
import {
  createInvisibleRecaptcha,
  requestPhoneOtpForSignIn,
  confirmPhoneOtpForSignIn,
} from './services/phoneVerification';

const OTP_RESEND_MS = 30000;

function inferResolutionFromMethods(methods = []) {
  const availableMethods = Array.isArray(methods) ? methods : [];
  if (availableMethods.includes('password')) return 'password';
  if (availableMethods.includes('google.com')) return 'google';
  if (availableMethods.length > 0) return 'magic_link';
  return 'unknown';
}

const PROFILE_BOOTSTRAP_ERROR =
  "We signed you in, but couldn't finish setting up your account. Please try again or contact support.";

function friendlyAuthError(err) {
  const code = err?.code || err?.response?.data?.code || '';
  if (code === 'account_not_enrolled') return 'This account is not enrolled.';
  if (code === 'account_state_invalid') return 'This account is in an invalid state and needs support.';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return PUBLIC_AUTH_ERROR;
  }
  if (code === 'auth/popup-closed-by-user') return 'Sign-in was cancelled.';
  if (code === 'auth/popup-blocked') return 'Your browser blocked the sign-in popup. Please allow popups and try again.';
  if (code === 'auth/unauthorized-domain') return 'This domain is not authorised for Firebase Auth yet.';
  if (code === 'auth/operation-not-allowed') return 'This sign-in method is not enabled for this Firebase project.';
  if (code === 'auth/invalid-verification-code') return "We couldn't sign you in. Please check the code and try again.";
  // Firestore (e.g. profile bootstrap after Firebase Auth succeeds)
  if (code === 'permission-denied') {
    // eslint-disable-next-line no-console
    console.error('[Login] permission-denied (full error for diagnostics):', err);
    return PROFILE_BOOTSTRAP_ERROR;
  }
  return err?.message || PUBLIC_AUTH_ERROR;
}

function StepBadge({ icon, text }) {
  return (
    <div style={styles.stepBadge}>
      {icon}
      <span>{text}</span>
    </div>
  );
}

function PasswordResetModal({
  open,
  email,
  onEmailChange,
  onClose,
  onSubmit,
  loading,
  error,
  success,
}) {
  if (!open) return null;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalCard} onClick={(event) => event.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div>
            <h2 style={styles.modalTitle}>Reset your password</h2>
            <p style={styles.modalSubtitle}>Enter your email address and we&apos;ll send you a reset link.</p>
          </div>
          <button type="button" onClick={onClose} style={styles.closeButton} aria-label="Close">
            ×
          </button>
        </div>
        <form onSubmit={onSubmit} style={styles.modalForm}>
          <div style={styles.inputGroup}>
            <label htmlFor="reset-email" style={styles.label}>Email address</label>
            <input
              id="reset-email"
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="you@example.com"
              style={styles.input}
              disabled={loading}
              autoFocus
            />
          </div>
          {error ? <div style={styles.errorBanner} role="alert" aria-live="assertive"><AlertTriangle size={18} />{error}</div> : null}
          {success ? <div style={styles.successBanner}><CheckCircle2 size={18} />{success}</div> : null}
          <div style={styles.modalActions}>
            <button type="button" style={styles.secondaryButton} onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" style={{ ...styles.primaryButton, ...(loading ? styles.buttonDisabled : {}) }} disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Login({ adminMode = false }) {
  const navigate = useNavigate();
  const publicApi = useMemo(() => createApiClient(), []);
  const recaptchaVerifierRef = useRef(null);
  const recaptchaContainerId = useRef('taskio-login-recaptcha');
  const testAppVerifierRef = useRef(null);

  const [authFlowState, setAuthFlowState] = useState('input');
  const [enteredIdentifier, setEnteredIdentifier] = useState('');
  const [resolvedIdentifier, setResolvedIdentifier] = useState('');
  const [emailStepVariant, setEmailStepVariant] = useState('magic_link');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  useEffect(() => {
    if (!auth.currentUser) return undefined;
    let cancelled = false;

    const run = async () => {
      try {
        const destination = await finalizeAuthenticatedSession(auth.currentUser);
        if (!cancelled) navigate(destination, { replace: true });
      } catch (err) {
        if (!cancelled) setError(friendlyAuthError(err));
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (!resendAvailableAt) return undefined;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [resendAvailableAt]);

  const resendSeconds = Math.max(0, Math.ceil((resendAvailableAt - nowMs) / 1000));

  const resetStepState = useCallback(() => {
    setError('');
    setInfo('');
    setPassword('');
    setOtpCode('');
    setEmailStepVariant('magic_link');
  }, []);

  const ensureRecaptchaVerifier = useCallback(() => {
    try {
      if (auth?.settings?.appVerificationDisabledForTesting) {
        if (!testAppVerifierRef.current) {
          testAppVerifierRef.current = {
            type: 'recaptcha',
            verify: async () => 'test',
            clear: () => {},
            reset: () => {},
            _reset: () => {},
          };
        }
        return testAppVerifierRef.current;
      }
    } catch (_) {
      // ignore
    }

    if (recaptchaVerifierRef.current) return recaptchaVerifierRef.current;
    recaptchaVerifierRef.current = createInvisibleRecaptcha(auth, recaptchaContainerId.current);
    return recaptchaVerifierRef.current;
  }, []);

  const openResetModal = useCallback(() => {
    setResetModalOpen(true);
    setResetEmail(resolvedIdentifier || normalizeIdentifier(enteredIdentifier));
    setResetError('');
    setResetSuccess('');
  }, [enteredIdentifier, resolvedIdentifier]);

  const closeResetModal = useCallback(() => {
    setResetModalOpen(false);
    setResetError('');
    setResetSuccess('');
  }, []);

  const handlePasswordReset = async (event) => {
    event.preventDefault();
    setResetError('');
    setResetSuccess('');

    if (!resetEmail) {
      setResetError('Please enter your email address.');
      return;
    }

    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim().toLowerCase());
      setResetSuccess('Password reset email sent. Please check your inbox.');
    } catch (err) {
      if (err?.code === 'auth/user-not-found') setResetSuccess('If that email can be used to sign in, we sent a reset link.');
      else if (err?.code === 'auth/invalid-email') setResetError('Please enter a valid email address.');
      else setResetError('Failed to send reset email. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const goBackToInput = () => {
    setAuthFlowState('input');
    setConfirmationResult(null);
    setResolvedIdentifier('');
    setResendAvailableAt(0);
    resetStepState();
  };

  const handleIdentifierContinue = async (event) => {
    event.preventDefault();
    setError('');
    setInfo('');

    const detected = getIdentifierType(enteredIdentifier);
    if (adminMode) {
      if (detected.type !== 'email') {
        setError('Enter a valid email address.');
        return;
      }
      setResolvedIdentifier(detected.value);
      setResetEmail(detected.value);
      setAuthFlowState('email_password');
      return;
    }

    if (detected.type === 'empty' || detected.type === 'invalid') {
      setError('Enter a valid phone number or email.');
      return;
    }

    setLoading(true);
    try {
      if (detected.type === 'phone') {
        const verifier = ensureRecaptchaVerifier();
        const nextConfirmation = await requestPhoneOtpForSignIn({
          auth,
          phoneNumberE164: detected.value,
          recaptchaVerifier: verifier,
        });
        setResolvedIdentifier(detected.value);
        setConfirmationResult(nextConfirmation);
        setOtpCode('');
        setAuthFlowState('phone_otp');
        setResendAvailableAt(Date.now() + OTP_RESEND_MS);
        setInfo('We sent a 6-digit verification code to your phone.');
        return;
      }

      const resolution = await resolveEmailSignIn(publicApi, detected.value);
      setResolvedIdentifier(detected.value);
      setResetEmail(detected.value);

      let resolvedStrategy = resolution.strategy;
      if (resolvedStrategy === 'ambiguous' || resolvedStrategy === 'unavailable') {
        try {
          const methods = await fetchSignInMethodsForEmail(auth, detected.value);
          const inferred = inferResolutionFromMethods(methods);
          if (inferred !== 'unknown') {
            resolvedStrategy = inferred;
          }
        } catch (_) {
          // keep resolver result
        }
      }

      if (resolvedStrategy === 'password') {
        setAuthFlowState('email_password');
        return;
      }

      if (resolvedStrategy === 'magic_link') {
        setEmailStepVariant('magic_link');
        await sendTaskioMagicLink(auth, detected.value);
        setAuthFlowState('email_magic');
        setInfo(`Check your email at ${maskEmail(detected.value)} for a secure sign-in link.`);
        return;
      }

      if (resolvedStrategy === 'google') {
        setEmailStepVariant('google');
        setAuthFlowState('email_magic');
        setInfo('Continue with Google to sign in to this account.');
        return;
      }

      setError(resolution.strategy === 'unavailable' ? PUBLIC_AUTH_TEMPORARY_ERROR : PUBLIC_AUTH_ERROR);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setInfo('');

    if (!resolvedIdentifier || !password) {
      setError('Enter your password to continue.');
      return;
    }

    setLoading(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, resolvedIdentifier, password);
      const destination = await finalizeAuthenticatedSession(credential.user, {
        providerName: 'password',
        profileOverrides: { email: resolvedIdentifier },
      });
      navigate(destination, { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleContinue = async () => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      const additionalInfo = getAdditionalUserInfo(credential);
      if (additionalInfo?.isNewUser === true) {
        navigate('/get-started', { replace: true });
        return;
      }
      const destination = await finalizeAuthenticatedSession(credential.user, {
        providerName: 'google',
        profileOverrides: { email: credential.user?.email || '' },
      });
      navigate(destination, { replace: true });
    } catch (err) {
      if (err?.code === 'auth/account-exists-with-different-credential') {
        const conflictEmail = err?.customData?.email || '';
        const resolution = conflictEmail ? await resolveEmailSignIn(publicApi, conflictEmail) : { strategy: 'ambiguous' };
        let methods = resolution.strategy === 'password'
          ? ['password']
          : resolution.strategy === 'google'
            ? ['google.com']
            : resolution.strategy === 'magic_link'
              ? ['emailLink']
              : [];
        let resolvedStrategy = resolution.strategy;
        if ((resolvedStrategy === 'ambiguous' || resolvedStrategy === 'unavailable') && conflictEmail) {
          try {
            methods = await fetchSignInMethodsForEmail(auth, conflictEmail);
            resolvedStrategy = inferResolutionFromMethods(methods);
          } catch (_) {
            // ignore fallback failures
          }
        }
        setEnteredIdentifier(conflictEmail);
        setResolvedIdentifier(conflictEmail);
        if (resolvedStrategy === 'password') {
          setAuthFlowState('email_password');
        } else if (resolvedStrategy === 'magic_link') {
          setEmailStepVariant('magic_link');
          await sendTaskioMagicLink(auth, conflictEmail);
          setAuthFlowState('email_magic');
          setInfo(`Check your email at ${maskEmail(conflictEmail)} for a secure sign-in link.`);
        } else if (resolvedStrategy === 'google') {
          setEmailStepVariant('google');
          setAuthFlowState('email_magic');
          setInfo('Continue with Google to sign in to this account.');
        }
        setError(await buildExistingMethodMessage(conflictEmail, methods));
      } else {
        setError(friendlyAuthError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneOtpSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const result = await confirmPhoneOtpForSignIn({
        confirmationResult,
        code: otpCode,
      });
      const destination = await finalizeAuthenticatedSession(result.user, { providerName: 'phone' });
      navigate(destination, { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendPhoneCode = async () => {
    if (resendSeconds > 0 || !resolvedIdentifier) return;
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const verifier = ensureRecaptchaVerifier();
      const nextConfirmation = await requestPhoneOtpForSignIn({
        auth,
        phoneNumberE164: resolvedIdentifier,
        recaptchaVerifier: verifier,
      });
      setConfirmationResult(nextConfirmation);
      setOtpCode('');
      setResendAvailableAt(Date.now() + OTP_RESEND_MS);
      setInfo('We sent a new verification code.');
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendMagicLink = async () => {
    if (!resolvedIdentifier) return;
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await sendTaskioMagicLink(auth, resolvedIdentifier);
      setInfo(`We sent a fresh sign-in link to ${maskEmail(resolvedIdentifier)}.`);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const renderInputStep = () => (
    <>
      <div style={styles.cardHeader}>
        <h1 style={styles.title}>Welcome back</h1>
        <p style={styles.subtitle}>Sign in to your Taskio account</p>
      </div>
      <form onSubmit={handleIdentifierContinue} style={styles.form}>
        <div style={styles.inputGroup}>
          <label htmlFor="identifier" style={styles.label}>Phone number or email</label>
          <input
            id="identifier"
            type="text"
            placeholder="Enter phone number or email"
            value={enteredIdentifier}
            onChange={(event) => setEnteredIdentifier(event.target.value)}
            style={styles.input}
            disabled={loading}
            autoComplete="username"
          />
        </div>
        {error ? <div style={styles.errorBanner} role="alert" aria-live="assertive"><AlertTriangle size={18} />{error}</div> : null}
        {info ? <div style={styles.infoBanner}><CheckCircle2 size={18} />{info}</div> : null}
        <button type="submit" style={{ ...styles.primaryButton, ...(loading ? styles.buttonDisabled : {}) }} disabled={loading}>
          {loading ? 'Continuing…' : 'Continue'}
        </button>
      </form>

      <div style={styles.dividerRow}>
        <div style={styles.dividerLine} />
        <span style={styles.dividerText}>or</span>
        <div style={styles.dividerLine} />
      </div>

      <GoogleActionButton style={styles.googleButton} onClick={handleGoogleContinue} disabled={loading}>
        {loading ? 'Please wait…' : 'Continue with Google'}
      </GoogleActionButton>
    </>
  );

  const renderEmailPasswordStep = () => (
    <>
      <button type="button" style={styles.backButton} onClick={goBackToInput}>
        <ArrowLeft size={16} />
        Use a different sign-in method
      </button>
      <div style={styles.cardHeaderLeft}>
        <StepBadge icon={<Mail size={16} />} text={maskEmail(resolvedIdentifier)} />
        <h1 style={styles.titleLeft}>Enter your password</h1>
        <p style={styles.subtitleLeft}>Use the password for this email address to continue.</p>
      </div>
      <form onSubmit={handlePasswordSubmit} style={styles.form}>
        <div style={styles.inputGroup}>
          <div style={styles.labelRow}>
            <label htmlFor="password" style={styles.label}>Password</label>
            <button type="button" onClick={openResetModal} style={styles.inlineLink}>
              Forgot password?
            </button>
          </div>
          <input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={styles.input}
            disabled={loading}
            autoComplete="current-password"
          />
        </div>
        {error ? <div style={styles.errorBanner} role="alert" aria-live="assertive"><AlertTriangle size={18} />{error}</div> : null}
        <button type="submit" style={{ ...styles.primaryButton, ...(loading ? styles.buttonDisabled : {}) }} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </>
  );

  const renderEmailMagicStep = () => (
    <>
      <button type="button" style={styles.backButton} onClick={goBackToInput}>
        <ArrowLeft size={16} />
        Use a different sign-in method
      </button>
      <div style={styles.cardHeaderLeft}>
        <StepBadge icon={<Mail size={16} />} text={maskEmail(resolvedIdentifier)} />
        <h1 style={styles.titleLeft}>{emailStepVariant === 'google' ? 'Continue with Google' : 'Check your email'}</h1>
        <p style={styles.subtitleLeft}>
          {emailStepVariant === 'google'
            ? 'Use Google to finish signing in for this account.'
            : 'We sent a secure sign-in link. Open it on this device to finish signing in.'}
        </p>
      </div>
      {info ? <div style={styles.infoBanner}><CheckCircle2 size={18} />{info}</div> : null}
      {error ? <div style={styles.errorBanner} role="alert" aria-live="assertive"><AlertTriangle size={18} />{error}</div> : null}
      <div style={styles.stackActions}>
        {emailStepVariant === 'google' ? (
          <GoogleActionButton style={styles.googleButton} onClick={handleGoogleContinue} disabled={loading}>
            {loading ? 'Please wait…' : 'Continue with Google'}
          </GoogleActionButton>
        ) : (
          <button type="button" style={{ ...styles.primaryButton, ...(loading ? styles.buttonDisabled : {}) }} onClick={handleResendMagicLink} disabled={loading}>
            {loading ? 'Sending…' : 'Resend link'}
          </button>
        )}
        <button type="button" style={styles.secondaryButton} onClick={goBackToInput} disabled={loading}>
          Back
        </button>
      </div>
    </>
  );

  const renderPhoneOtpStep = () => (
    <>
      <button type="button" style={styles.backButton} onClick={goBackToInput}>
        <ArrowLeft size={16} />
        Use a different sign-in method
      </button>
      <div style={styles.cardHeaderLeft}>
        <StepBadge icon={<Smartphone size={16} />} text={maskPhone(resolvedIdentifier)} />
        <h1 style={styles.titleLeft}>Enter verification code</h1>
        <p style={styles.subtitleLeft}>Enter the 6-digit code we sent to your phone.</p>
      </div>
      <form onSubmit={handlePhoneOtpSubmit} style={styles.form}>
        <OtpCodeInput value={otpCode} onChange={setOtpCode} disabled={loading} />
        {info ? <div style={styles.infoBanner}><CheckCircle2 size={18} />{info}</div> : null}
        {error ? <div style={styles.errorBanner} role="alert" aria-live="assertive"><AlertTriangle size={18} />{error}</div> : null}
        <button type="submit" style={{ ...styles.primaryButton, ...(loading ? styles.buttonDisabled : {}) }} disabled={loading}>
          {loading ? 'Verifying…' : 'Continue'}
        </button>
      </form>
      <div style={styles.otpFooter}>
        {resendSeconds > 0 ? (
          <span style={styles.mutedText}>Resend available in {resendSeconds}s</span>
        ) : (
          <button type="button" onClick={handleResendPhoneCode} style={styles.inlineLink} disabled={loading}>
            Resend code
          </button>
        )}
      </div>
    </>
  );

  const content = adminMode
    ? (
      authFlowState === 'email_password' ? renderEmailPasswordStep() : (
        <>
          <div style={styles.cardHeader}>
            <h1 style={styles.title}>Admin sign in</h1>
            <p style={styles.subtitle}>Use your existing email and password to access Taskio admin tools.</p>
          </div>
          <form onSubmit={handleIdentifierContinue} style={styles.form}>
            <div style={styles.inputGroup}>
              <label htmlFor="admin-email" style={styles.label}>Email address</label>
              <input
                id="admin-email"
                type="email"
                placeholder="you@example.com"
                value={enteredIdentifier}
                onChange={(event) => setEnteredIdentifier(event.target.value)}
                style={styles.input}
                disabled={loading}
              />
            </div>
            {error ? <div style={styles.errorBanner} role="alert" aria-live="assertive"><AlertTriangle size={18} />{error}</div> : null}
            <button type="submit" style={{ ...styles.primaryButton, ...(loading ? styles.buttonDisabled : {}) }} disabled={loading}>
              {loading ? 'Continuing…' : 'Continue'}
            </button>
          </form>
        </>
      )
    )
    : authFlowState === 'email_password'
      ? renderEmailPasswordStep()
      : authFlowState === 'email_magic'
        ? renderEmailMagicStep()
        : authFlowState === 'phone_otp'
          ? renderPhoneOtpStep()
          : renderInputStep();

  return (
    <div style={styles.page}>
      <PublicPageHeader homeTo="/" logoStyle={styles.logoLink} />
      <main style={styles.container}>
        <div style={styles.card}>
          {content}
          <div style={styles.footer}>
            {!adminMode ? (
              <p style={styles.footerText}>
                Don&apos;t have an account? <Link to="/get-started" style={styles.link}>Get started</Link>
              </p>
            ) : (
              <Link to="/login" style={styles.adminLink}>
                Back to public login
              </Link>
            )}
          </div>
          <div id={recaptchaContainerId.current} />
        </div>
      </main>

      <PasswordResetModal
        open={resetModalOpen}
        email={resetEmail}
        onEmailChange={setResetEmail}
        onClose={closeResetModal}
        onSubmit={handlePasswordReset}
        loading={resetLoading}
        error={resetError}
        success={resetSuccess}
      />
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#F7F9FA',
    fontFamily: 'Inter, sans-serif',
  },
  header: {
    backgroundColor: '#FFFFFF',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
    borderBottom: '1px solid #E5E7EB',
    padding: '20px 32px',
    display: 'flex',
    alignItems: 'center',
  },
  logoLink: {
    display: 'flex',
    alignItems: 'center',
    textDecoration: 'none',
  },
  container: {
    maxWidth: '560px',
    margin: '0 auto',
    padding: '60px 24px',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: '20px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.02)',
    padding: '40px',
    border: '1px solid #E5E7EB',
  },
  cardHeader: {
    marginBottom: '28px',
    textAlign: 'center',
  },
  cardHeaderLeft: {
    marginBottom: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '32px',
    fontWeight: '700',
    color: '#111827',
    margin: '0 0 10px 0',
  },
  subtitle: {
    fontSize: '16px',
    color: '#6B7280',
    margin: '0',
    lineHeight: '1.5',
  },
  titleLeft: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: 28,
    fontWeight: 700,
    color: '#111827',
    margin: 0,
  },
  subtitleLeft: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 1.6,
    margin: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#374151',
  },
  inlineLink: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#14C5C5',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '14px 16px',
    fontSize: '15px',
    borderRadius: '12px',
    border: '1.5px solid #D1D5DB',
    outline: 'none',
    fontFamily: 'Inter, sans-serif',
    backgroundColor: '#FFFFFF',
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    border: '1.5px solid #FCA5A5',
    color: '#DC2626',
    padding: '16px 18px',
    borderRadius: '12px',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontWeight: '600',
  },
  successBanner: {
    backgroundColor: '#ECFDF5',
    border: '1.5px solid #86EFAC',
    color: '#16A34A',
    padding: '16px 18px',
    borderRadius: '12px',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontWeight: '600',
  },
  infoBanner: {
    backgroundColor: '#F0FDFA',
    border: '1.5px solid #99F6E4',
    color: '#0F766E',
    padding: '16px 18px',
    borderRadius: 12,
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontWeight: 600,
  },
  primaryButton: {
    width: '100%',
    padding: '16px 24px',
    fontSize: '16px',
    fontWeight: '700',
    color: '#FFFFFF',
    backgroundColor: '#14C5C5',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontFamily: 'Poppins, sans-serif',
    boxShadow: '0 4px 16px rgba(20, 197, 197, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
  },
  secondaryButton: {
    width: '100%',
    padding: '16px 24px',
    fontSize: '15px',
    fontWeight: '700',
    color: '#374151',
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #D1D5DB',
    borderRadius: '12px',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  dividerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    margin: '24px 0',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: 600,
  },
  googleButton: {
    width: '100%',
    boxShadow: '0 2px 10px rgba(17, 24, 39, 0.06)',
  },
  stepBadge: {
    alignSelf: 'flex-start',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 999,
    backgroundColor: '#F0FDFA',
    color: '#0F766E',
    fontSize: 12,
    fontWeight: 700,
    border: '1px solid #CCFBF1',
  },
  backButton: {
    alignSelf: 'flex-start',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: 'transparent',
    border: 'none',
    color: '#6B7280',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: 18,
    padding: 0,
  },
  stackActions: {
    display: 'grid',
    gap: 12,
  },
  otpFooter: {
    marginTop: 16,
    textAlign: 'center',
  },
  mutedText: {
    color: '#6B7280',
    fontSize: 13,
  },
  footer: {
    marginTop: '28px',
    textAlign: 'center',
    paddingTop: '28px',
    borderTop: '1px solid #E5E7EB',
  },
  footerText: {
    fontSize: '14px',
    color: '#6B7280',
    margin: '0',
  },
  link: {
    color: '#14C5C5',
    fontWeight: '700',
    textDecoration: 'none',
  },
  adminLink: {
    marginTop: 14,
    display: 'inline-block',
    color: '#6B7280',
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    zIndex: 1000,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '20px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25)',
    maxWidth: '480px',
    width: '100%',
    padding: '32px',
    border: '1px solid #E5E7EB',
  },
  modalHeader: {
    marginBottom: '24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '20px',
  },
  modalTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '24px',
    fontWeight: '700',
    color: '#111827',
    margin: '0 0 8px 0',
  },
  modalSubtitle: {
    fontSize: '15px',
    color: '#6B7280',
    margin: '0',
    lineHeight: '1.5',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '32px',
    lineHeight: '1',
    color: '#9CA3AF',
    cursor: 'pointer',
    padding: '0',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
    flexWrap: 'wrap',
  },
};
