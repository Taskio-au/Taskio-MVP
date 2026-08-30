import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { EmailAuthProvider, linkWithCredential, linkWithPopup, sendEmailVerification } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { createApiClient } from '../api/createApiClient';
import BrandLogo from '../design/components/BrandLogo';
import { getClientAccountStatus } from '../utils/homeownerAccount';
import { CLIENT_ACCOUNT_COMPLETE_PAGE } from '../constants/blockedFlowCopy';
import { ANALYTICS_EVENTS, trackEvent } from '../config/analytics';

const api = createApiClient();

export default function CompleteClientAccountPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return params.get('next') || '/dashboard';
  }, [location.search]);

  const [firstName, setFirstName] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const accountStatus = getClientAccountStatus(null, auth.currentUser);
  const emailNeedsPassword = !accountStatus.passwordLinked;

  useEffect(() => {
    const run = async () => {
      if (!auth.currentUser) {
        navigate('/login', { replace: true });
        return;
      }
      try {
        const token = await auth.currentUser.getIdToken();
        const config = { headers: { Authorization: `Bearer ${token}` } };
        const me = await api.get('/api/me', config);
        const profile = me?.data?.profile || {};
        const status = getClientAccountStatus(profile, auth.currentUser);
        if (status.durableAccountReady) {
          navigate(nextPath, { replace: true });
          return;
        }
        if (profile.firstName) setFirstName(String(profile.firstName));
        if (profile.email || auth.currentUser?.email) setEmail(String(profile.email || auth.currentUser?.email || ''));
      } catch (_) {
        // ignore initial hydrate failures
      }
    };
    run();
  }, [navigate, nextPath]);

  const finalize = async (method) => {
    const user = auth.currentUser;
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    await user.reload?.();
    const token = await user.getIdToken(true);
    const config = { headers: { Authorization: `Bearer ${token}` } };
    await api.post('/api/me/homeowner/complete-account', {
      method,
      firstName: String(firstName || '').trim(),
    }, config);
    trackEvent(ANALYTICS_EVENTS.ACCOUNT_ACTIVATION_COMPLETED, { role: 'homeowner', result: 'success' });
    navigate(nextPath, { replace: true });
  };

  const handleGoogleContinue = async () => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      if (!auth.currentUser) throw new Error('Please log in again.');
      await linkWithPopup(auth.currentUser, googleProvider);
      await finalize('google');
    } catch (e) {
      setError(e?.message || 'Could not continue with Google.');
    } finally {
      setBusy(false);
    }
  };

  const handleEmailContinue = async () => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      if (!auth.currentUser) throw new Error('Please log in again.');
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!/\S+@\S+\.\S+/.test(normalizedEmail)) {
        throw new Error('Enter a valid email address.');
      }
      if (emailNeedsPassword && String(password || '').length < 8) {
        throw new Error('Password must be at least 8 characters.');
      }
      if (emailNeedsPassword) {
        const credential = EmailAuthProvider.credential(normalizedEmail, password);
        await linkWithCredential(auth.currentUser, credential);
      }
      await auth.currentUser.reload?.();
      if (auth.currentUser.emailVerified !== true) {
        await sendEmailVerification(auth.currentUser);
        setInfo('Verification email sent. Please verify your email, then return here to continue.');
        return;
      }
      await finalize('email');
    } catch (e) {
      setError(e?.message || 'Could not continue with email.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <BrandLogo to="/dashboard" style={{ textDecoration: 'none' }} />
      </div>
      <div style={styles.card}>
        <h1 style={styles.title}>{CLIENT_ACCOUNT_COMPLETE_PAGE.title}</h1>
        <p style={styles.subtitle}>
          {CLIENT_ACCOUNT_COMPLETE_PAGE.subtitle}
        </p>

        <div style={styles.fieldBlock}>
          <label style={styles.label}>First name</label>
          <input
            style={styles.input}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            autoComplete="given-name"
          />
        </div>

        <div style={styles.methods}>
          <button
            type="button"
            style={{ ...styles.methodButton, ...(selectedMethod === 'google' ? styles.methodButtonActive : {}) }}
            onClick={() => setSelectedMethod('google')}
          >
            Google
          </button>
          <button
            type="button"
            style={{ ...styles.methodButton, ...(selectedMethod === 'email' ? styles.methodButtonActive : {}) }}
            onClick={() => setSelectedMethod('email')}
          >
            Email
          </button>
        </div>

        {selectedMethod === 'google' && (
          <div style={styles.panel}>
            <p style={styles.panelText}>
              Continue with Google for a faster, trusted sign-in next time.
            </p>
            <button type="button" style={styles.primaryButton} onClick={handleGoogleContinue} disabled={busy}>
              {busy ? 'Saving...' : 'Continue with Google'}
            </button>
          </div>
        )}

        {selectedMethod === 'email' && (
          <div style={styles.panel}>
            <div style={styles.fieldBlock}>
              <label style={styles.label}>Email address</label>
              <input
                style={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            {emailNeedsPassword && (
              <div style={styles.fieldBlock}>
                <label style={styles.label}>Password</label>
                <input
                  style={styles.input}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
              </div>
            )}
            <p style={styles.panelText}>
              We&apos;ll email you a secure verification link before payments are unlocked.
            </p>
            <button type="button" style={styles.primaryButton} onClick={handleEmailContinue} disabled={busy}>
              {busy ? 'Saving...' : (accountStatus.emailVerified ? 'Continue with email' : 'Verify email to continue')}
            </button>
          </div>
        )}

        {info && <div style={styles.info}>{info}</div>}
        {error && <div style={styles.error}>{error}</div>}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#F7F9FA',
    padding: '28px 16px',
    fontFamily: 'Inter, sans-serif',
  },
  header: {
    maxWidth: 960,
    margin: '0 auto 24px',
  },
  card: {
    maxWidth: 620,
    margin: '0 auto',
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: 20,
    padding: '32px 28px',
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: 30,
    lineHeight: 1.15,
    margin: '0 0 10px',
    color: '#111827',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 1.6,
    color: '#4B5563',
    margin: '0 0 22px',
  },
  fieldBlock: {
    marginBottom: 16,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 700,
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    height: 46,
    borderRadius: 12,
    border: '1px solid #D1D5DB',
    padding: '0 14px',
    fontSize: 15,
    fontFamily: 'Inter, sans-serif',
  },
  methods: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 10,
    marginBottom: 18,
  },
  methodButton: {
    height: 44,
    borderRadius: 12,
    border: '1px solid #D1D5DB',
    background: '#FFFFFF',
    color: '#374151',
    fontWeight: 700,
    cursor: 'pointer',
  },
  methodButtonActive: {
    borderColor: '#14C5C5',
    background: '#EEFCFB',
    color: '#0F766E',
  },
  panel: {
    border: '1px solid #E5E7EB',
    borderRadius: 16,
    padding: 18,
    background: '#F9FAFB',
  },
  panelText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 1.6,
    margin: '0 0 16px',
  },
  primaryButton: {
    width: '100%',
    height: 46,
    borderRadius: 12,
    border: 'none',
    background: '#14C5C5',
    color: '#FFFFFF',
    fontWeight: 800,
    fontSize: 15,
    cursor: 'pointer',
  },
  error: {
    marginTop: 16,
    background: '#FFF1F2',
    border: '1px solid #FECDD3',
    color: '#9F1239',
    padding: '12px 14px',
    borderRadius: 12,
    fontSize: 14,
  },
  info: {
    marginTop: 16,
    background: '#ECFDF5',
    border: '1px solid #A7F3D0',
    color: '#166534',
    padding: '12px 14px',
    borderRadius: 12,
    fontSize: 14,
  },
};
