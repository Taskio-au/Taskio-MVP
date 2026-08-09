import React, { useEffect, useRef, useState } from 'react';
import { auth } from '../../firebase';
import { sendEmailVerification } from 'firebase/auth';
import { getUserProfile, updateUserProfile } from '../../services/userProfile';
import { createInvisibleRecaptcha, normalizeAuMobileToE164, requestPhoneOtp, confirmPhoneOtp } from '../../services/phoneVerification';

/**
 * Private Details & Verification (Tradie)
 *
 * Firebase Console requirements:
 * - Authentication → Sign-in method → enable Phone
 * - Authentication → Settings → Authorized domains:
 *   - localhost
 *   - app.taskio.com.au
 * - If using App Check, ensure it’s configured for your domains.
 */
export default function PrivateDetailsVerificationCard({ onProfileRefresh, variant = 'all' }) {
  const user = auth.currentUser;

  // Email
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');

  // Firestore profile fields
  const [loading, setLoading] = useState(true);
  const [phoneNumberE164, setPhoneNumberE164] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);

  // Phone OTP
  const [phoneInput, setPhoneInput] = useState('');
  const [sendBusy, setSendBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [code, setCode] = useState('');
  const [phoneMsg, setPhoneMsg] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const cooldownTimerRef = useRef(null);

  // Use a stable container id so Firebase can reuse the same invisible reCAPTCHA instance.
  const recaptchaId = 'recaptcha-container';
  const recaptchaRef = useRef(null);
  const recaptchaWidgetIdRef = useRef(null);
  const testAppVerifierRef = useRef(null);

  const hardResetRecaptcha = () => {
    // Firebase can throw "reCAPTCHA has already been rendered in this element" if a previous widget
    // wasn't fully cleaned up. Clearing the verifier is not always enough; also clear the container DOM.
    try {
      recaptchaRef.current?.clear?.();
    } catch (e) {
      // ignore
    }
    recaptchaRef.current = null;
    recaptchaWidgetIdRef.current = null;
    testAppVerifierRef.current = null;
    try {
      const el = document.getElementById(recaptchaId);
      if (el) el.innerHTML = '';
    } catch (e) {
      // ignore
    }
  };

  const ensureRecaptchaReady = async () => {
    // Ensure container exists and is clean
    try {
      const el = document.getElementById(recaptchaId);
      if (el && !el.innerHTML) {
        // ok
      }
    } catch (e) {
      // ignore
    }

    // If dev bypass is enabled (auth.settings.appVerificationDisabledForTesting),
    // do NOT instantiate or render reCAPTCHA at all (managed browsers can block it and throw "Timeout").
    // Firebase will short-circuit verification when using Auth test phone numbers.
    try {
      if (auth?.settings?.appVerificationDisabledForTesting) {
        if (!testAppVerifierRef.current) {
          // Minimal ApplicationVerifier interface (type + verify + clear).
          // Returning a deterministic token prevents any reCAPTCHA network/script load.
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
    } catch (e) {
      // ignore
    }

    if (!recaptchaRef.current) {
      // wipe the container before creating a new verifier
      try {
        const el = document.getElementById(recaptchaId);
        if (el) el.innerHTML = '';
      } catch (e) {
        // ignore
      }

      recaptchaRef.current = createInvisibleRecaptcha(auth, recaptchaId, {
        // Avoid noisy dev crashes when reCAPTCHA expires; we'll just recreate on next send.
        'expired-callback': () => {
          hardResetRecaptcha();
          setPhoneMsg('reCAPTCHA expired. Please click “Send code” again.');
        },
      });
    }

    // Explicitly render so we can catch "Timeout" instead of letting it become an unhandled rejection.
    if (!recaptchaWidgetIdRef.current && recaptchaRef.current?.render) {
      const renderPromise = recaptchaRef.current.render();
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve('__recaptcha_timeout__'), 12000));
      const res = await Promise.race([renderPromise, timeoutPromise]);
      if (res === '__recaptcha_timeout__') {
        throw new Error('recaptcha_render_timeout');
      }
      recaptchaWidgetIdRef.current = res;
    }

    return recaptchaRef.current;
  };

  const canSend = !sendBusy && !phoneVerified && Date.now() >= cooldownUntil;
  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
  const canVerify = !verifyBusy && !phoneVerified && /^\d{6}$/.test(code) && !!confirmationResult;

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        if (!user?.uid) return;
        const p = await getUserProfile(user.uid);
        if (!mounted) return;
        const storedPhone = String(p?.phoneNumberE164 || p?.phoneNumber || p?.phone || '');
        setPhoneNumberE164(storedPhone);
        setPhoneVerified(Boolean(p?.phoneVerified));
        setPhoneInput(storedPhone);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [user?.uid]);

  // If Firebase Auth already has a linked phone but Firestore doesn't, sync it.
  useEffect(() => {
    let cancelled = false;
    async function syncAuthPhone() {
      if (!user?.uid) return;
      if (loading) return;
      if (phoneVerified) return;
      if (!user?.phoneNumber) return;
      try {
        await updateUserProfile(user.uid, { phoneNumberE164: user.phoneNumber, phoneNumber: user.phoneNumber, phone: user.phoneNumber, phoneVerified: true });
        if (!cancelled) {
          setPhoneVerified(true);
          setPhoneInput(user.phoneNumber);
          setPhoneNumberE164(user.phoneNumber);
        }
      } catch (e) {
        // ignore
      }
    }
    syncAuthPhone();
    return () => {
      cancelled = true;
    };
  }, [user, loading, phoneVerified]);

  useEffect(() => {
    if (!cooldownUntil) return undefined;
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      if (Date.now() >= cooldownUntil) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    }, 250);
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    };
  }, [cooldownUntil]);

  useEffect(() => {
    return () => {
      hardResetRecaptcha();
    };
  }, []);

  const resendVerification = async () => {
    if (!user) return;
    setEmailMsg('');
    setEmailBusy(true);
    try {
      await sendEmailVerification(user);
      setEmailMsg('Verification email sent. Please check your inbox.');
    } catch (e) {
      setEmailMsg(e?.message || 'Failed to send verification email.');
    } finally {
      setEmailBusy(false);
    }
  };

  const sendCode = async () => {
    if (!user) return;
    setPhoneMsg('');
    setSendBusy(true);
    try {
      const e164 = normalizeAuMobileToE164(phoneInput);
      setPhoneNumberE164(e164);
      setCooldownUntil(Date.now() + 30_000);

      // Persist phone number (unverified) so it’s saved even before OTP completes.
      await updateUserProfile(user.uid, { phoneNumberE164: e164, phoneNumber: e164, phone: e164, phoneVerified: false });

      const verifier = await ensureRecaptchaReady();
      const cr = await requestPhoneOtp({ auth, user, phoneNumberE164: e164, recaptchaVerifier: verifier });
      setConfirmationResult(cr);
      setPhoneMsg('Verification code sent.');
    } catch (e) {
      const code = e?.code ? String(e.code) : '';
      const devSuffix = process.env.NODE_ENV !== 'production' && code ? ` (${code})` : '';
      // If Firebase says the provider is already linked, the user already has a phone on the auth account.
      // Sync Firestore/UI to avoid confusing "Not verified" state.
      if (e?.code === 'auth/provider-already-linked') {
        try {
          await user.reload?.();
        } catch (err) {
          // ignore
        }
        const linked = user?.phoneNumber || phoneNumberE164;
        if (linked) {
          // Ensure token has phone_number claim before Firestore write (rules enforce this).
          try { await user.getIdToken(true); } catch (err) {}
          await updateUserProfile(user.uid, { phoneNumberE164: linked, phoneNumber: linked, phone: linked, phoneVerified: true });
          setPhoneVerified(true);
          setPhoneInput(linked);
          setPhoneNumberE164(linked);
          setPhoneMsg('Phone already verified.');
          setCooldownUntil(0);
          try { await onProfileRefresh?.(); } catch (err) {}
        } else {
          setPhoneMsg(`Phone is already linked to your account. If you need to change it, please contact support.${devSuffix}`);
        }
      } else if (String(e?.message || '') === 'recaptcha_render_timeout') {
        setPhoneMsg(
          'reCAPTCHA timed out loading. Please disable ad blockers/VPN, allow third‑party cookies, and try again.' + devSuffix
        );
      } else {
        setPhoneMsg((e?.message || 'Failed to send verification code.') + devSuffix);
      }
      // If reCAPTCHA gets into a bad state, hard reset so the next attempt can recreate safely.
      // This also prevents "reCAPTCHA has already been rendered in this element".
      hardResetRecaptcha();
      setConfirmationResult(null);
    } finally {
      setSendBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!user) return;
    setPhoneMsg('');
    setVerifyBusy(true);
    try {
      const res = await confirmPhoneOtp({ auth, user, confirmationResult, code });
      // Refresh token so Firestore rules can see request.auth.token.phone_number
      try { await user.getIdToken(true); } catch (err) {}
      const linkedPhone = user?.phoneNumber || phoneNumberE164;
      await updateUserProfile(user.uid, { phoneNumberE164: linkedPhone, phoneNumber: linkedPhone, phone: linkedPhone, phoneVerified: true });
      setPhoneVerified(true);
      setPhoneMsg('Phone verified.');
      try { await onProfileRefresh?.(); } catch (err) {}
      setCode('');
      setConfirmationResult(null);
      // Clear the verifier to avoid “reCAPTCHA already rendered” issues.
      try {
        recaptchaRef.current?.clear?.();
      } catch (e) {
        // ignore
      }
      recaptchaRef.current = null;
      return res;
    } catch (e) {
      setPhoneMsg(e?.message || 'Failed to verify phone.');
    } finally {
      setVerifyBusy(false);
    }
  };

  const emailVerified = Boolean(user?.emailVerified);

  const sharedStyleTag = (
    <style>{`
      .phone-input:focus,
      .code-input:focus {
        border-color: #14C5C5 !important;
        box-shadow: 0 0 0 3px rgba(20, 197, 197, 0.1) !important;
      }
      .primary-btn:not(:disabled):hover {
        background-color: #0EA5A5 !important;
        box-shadow: 0 4px 12px rgba(20, 197, 197, 0.3) !important;
        transform: translateY(-1px);
      }
      .link-btn:hover {
        color: #0EA5A5 !important;
        text-decoration: underline;
      }
    `}</style>
  );

  const EmailCard = (
    <div style={styles.section}>
      {sharedStyleTag}
      <div style={styles.sectionHeader}>
        <div>
          <div style={styles.sectionTitle}>Email</div>
          <div style={styles.sectionSub}>Your email details</div>
        </div>
        {emailVerified ? (
          <span style={{ ...styles.pill, ...styles.pillVerified }}>✓ Verified</span>
        ) : (
          <span style={{ ...styles.pill, ...styles.pillUnverified }}>Not verified</span>
        )}
      </div>

      <div style={styles.field}>
        <input
          value={user?.email || ''}
          readOnly
          style={styles.readOnlyInput}
          aria-label="Email"
        />
        {!emailVerified && (
          <div style={styles.hintRow}>
            <button type="button" style={styles.linkBtn} onClick={resendVerification} disabled={emailBusy} className="link-btn">
              {emailBusy ? 'Sending…' : 'Resend verification email'}
            </button>
          </div>
        )}
        {emailMsg ? <div style={styles.inlineMsg}>{emailMsg}</div> : null}
      </div>
    </div>
  );

  const PhoneCard = (
    <div style={styles.section}>
      {sharedStyleTag}
      <div style={styles.sectionHeader}>
        <div>
          <div style={styles.sectionTitle}>
            Phone number <span style={styles.required}>*</span>
          </div>
        </div>
        <span style={{ ...styles.pill, ...(phoneVerified ? styles.pillVerified : styles.pillUnverified) }}>
          {phoneVerified ? '✓ Verified' : 'Not verified'}
        </span>
      </div>

      <div style={styles.phoneRow}>
        <input
          value={phoneInput}
          onChange={(e) => {
            const next = e.target.value;
            setPhoneInput(next);
            // If a previously verified user edits the phone, require re-verification.
            if (phoneVerified) {
              setPhoneVerified(false);
              setConfirmationResult(null);
              setCode('');
              setPhoneMsg('Phone changed. Please verify the new number.');
              try {
                if (user?.uid) updateUserProfile(user.uid, { phoneVerified: false });
              } catch (_) {}
            }
          }}
          style={{
            ...styles.textInput,
            ...(phoneVerified ? styles.inputVerified : {})
          }}
          className="phone-input"
          placeholder="e.g. 04xx xxx xxx"
          disabled={loading}
        />
        {!phoneVerified && (
          <button type="button" style={{ ...styles.primaryBtn, ...styles.primaryBtnNudgeUp, ...(canSend ? null : styles.btnDisabled) }} className="primary-btn" onClick={sendCode} disabled={!canSend}>
            {sendBusy ? 'Sending…' : cooldownSeconds > 0 ? `Send code (${cooldownSeconds}s)` : 'Send code'}
          </button>
        )}
      </div>

      {!phoneVerified && (
        <div style={styles.codeRow}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
            style={styles.codeInput}
            className="code-input"
            placeholder="6-digit code"
            inputMode="numeric"
            disabled={phoneVerified || loading}
          />
          <button type="button" style={{ ...styles.primaryBtn, ...styles.primaryBtnNudgeUp, ...(canVerify ? null : styles.btnDisabled) }} className="primary-btn" onClick={verifyCode} disabled={!canVerify}>
            {verifyBusy ? 'Verifying…' : 'Verify phone'}
          </button>
        </div>
      )}

      {phoneMsg ? <div style={styles.inlineMsg}>{phoneMsg}</div> : null}

      {/* Invisible reCAPTCHA mount point */}
      <div id={recaptchaId} style={{ height: 0, overflow: 'hidden' }} />
    </div>
  );

  if (variant === 'email') return EmailCard;
  if (variant === 'phone') return PhoneCard;

  return (
    <div style={styles.card}>
      <div style={styles.topGrid}>
        {EmailCard}
        {PhoneCard}
      </div>
    </div>
  );
}

const styles = {
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  topGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    rowGap: 20,
    columnGap: 20,
    alignItems: 'stretch',
  },
  rowGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 20, // Increased from 16
  },
  verificationGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 20,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 2,
  },
  readOnlyInput: {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 10,
    border: '1.5px solid #E5E7EB',
    backgroundColor: '#F9FAFB',
    color: '#6B7280',
    fontSize: 14,
    boxSizing: 'border-box',
    fontFamily: 'Inter, sans-serif',
  },
  hintRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '5px 11px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: '1px solid transparent',
  },
  pillVerified: {
    color: '#15803D',
    backgroundColor: '#ECFDF5',
    borderColor: '#BBF7D0',
  },
  pillUnverified: {
    color: '#92400E',
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  linkBtn: {
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    color: '#14C5C5',
    fontWeight: 600,
    fontSize: 13,
    textDecoration: 'none',
    transition: 'color 0.2s ease',
    fontFamily: 'Inter, sans-serif',
  },
  inlineMsg: {
    marginTop: 8,
    fontSize: 13,
    color: '#6B7280',
    padding: '8px 12px',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    border: '1px solid #E5E7EB',
    lineHeight: 1.5,
  },
  helperText: {
    marginTop: 10,
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 1.4,
  },
  section: {
    border: '1px solid #E5E7EB',
    borderRadius: 14,
    padding: 24,
    backgroundColor: '#FFFFFF',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    transition: 'box-shadow 0.2s ease',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,
    fontWeight: 700,
    color: '#111827',
    letterSpacing: '-0.01em',
  },
  sectionSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    lineHeight: 1.5,
  },
  required: {
    color: '#EF4444',
    marginLeft: 4,
  },
  textInput: {
    flex: 1,
    padding: '0 14px',
    borderRadius: 10,
    border: '1.5px solid #D1D5DB',
    fontSize: 14,
    minHeight: 44,
    height: 44,
    lineHeight: '44px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease',
    backgroundColor: '#FFFFFF',
    fontFamily: 'Inter, sans-serif',
  },
  inputVerified: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    color: '#6B7280',
    fontWeight: 500,
  },
  phoneRow: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  codeRow: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    marginTop: 12, // Increased from 10
  },
  codeInput: {
    width: 180,
    padding: '0 14px',
    borderRadius: 10,
    border: '1.5px solid #D1D5DB',
    fontSize: 14,
    minHeight: 44,
    height: 44,
    lineHeight: '44px',
    letterSpacing: 1.5,
    outline: 'none',
    boxSizing: 'border-box',
    textAlign: 'center',
    fontWeight: 500,
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
    backgroundColor: '#FFFFFF',
    fontFamily: 'Inter, sans-serif',
  },
  primaryBtn: {
    padding: '0 20px',
    borderRadius: 10,
    backgroundColor: '#14C5C5',
    color: '#FFFFFF',
    border: 'none',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(20, 197, 197, 0.2)',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s ease',
    fontFamily: 'Inter, sans-serif',
    minHeight: 44,
    height: 44,
    minWidth: 130,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnNudgeUp: {
    position: 'relative',
    top: -2,
  },
  secondaryBtn: {
    padding: '12px 20px',
    borderRadius: 10,
    backgroundColor: '#FF9100',
    color: '#FFFFFF',
    border: 'none',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(255, 145, 0, 0.2)',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s ease',
    fontFamily: 'Inter, sans-serif',
  },
  btnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
};

