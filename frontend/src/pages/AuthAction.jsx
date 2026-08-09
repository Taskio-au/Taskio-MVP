import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../firebase';
import {
  applyActionCode,
  confirmPasswordReset,
  isSignInWithEmailLink,
  signInWithEmailLink,
  verifyPasswordResetCode,
} from 'firebase/auth';
import BrandLogo from '../design/components/BrandLogo';
import { clearPendingMagicLinkEmail, readPendingMagicLinkEmail } from '../features/auth/utils';
import { finalizeAuthenticatedSession } from '../features/auth/postAuth';

function safeContinueTarget(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.startsWith('/')) return s;
  try {
    const u = new URL(s);
    if (typeof window !== 'undefined' && u.origin === window.location.origin) {
      return `${u.pathname}${u.search || ''}${u.hash || ''}`;
    }
  } catch (_) {
    // ignore
  }
  return null;
}

export default function AuthAction() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const mode = params.get('mode');
  const oobCode = params.get('oobCode');
  const continueUrl = params.get('continueUrl');
  const safeContinueUrl = useMemo(() => safeContinueTarget(continueUrl), [continueUrl]);
  const magicLinkDetected = typeof window !== 'undefined' ? isSignInWithEmailLink(auth, window.location.href) : false;

  const [status, setStatus] = useState('loading'); // loading | success | error | invalid | form | magic_email
  const [detail, setDetail] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [primaryTarget, setPrimaryTarget] = useState(safeContinueUrl || '/login');

  useEffect(() => {
    if (magicLinkDetected) {
      const completeMagicLink = async (resolvedEmail) => {
        setStatus('loading');
        setDetail('Signing you in…');
        try {
          const credential = await signInWithEmailLink(auth, resolvedEmail, window.location.href);
          clearPendingMagicLinkEmail();
          const destination = safeContinueUrl || await finalizeAuthenticatedSession(credential.user, {
            providerName: 'emailLink',
            profileOverrides: { email: resolvedEmail },
          });
          setPrimaryTarget(destination);
          setStatus('success');
          setDetail('You’re signed in and ready to continue.');
        } catch (err) {
          setStatus('error');
          if (err?.code === 'auth/expired-action-code') {
            setDetail('This sign-in link has expired. Please request a new one.');
          } else if (err?.code === 'auth/invalid-action-code') {
            setDetail('This sign-in link is invalid or has already been used.');
          } else {
            setDetail('We couldn’t complete this sign-in link. Please try again.');
          }
        }
      };

      const savedEmail = readPendingMagicLinkEmail();
      if (savedEmail) {
        setEmail(savedEmail);
        completeMagicLink(savedEmail);
      } else {
        setStatus('magic_email');
        setDetail('Confirm the email address that requested this sign-in link.');
      }
      return;
    }

    if (!mode || !oobCode) {
      setStatus('invalid');
      setDetail('This link is missing required parameters. Please request a new email and try again.');
      return;
    }

    if (mode === 'verifyEmail') {
      setStatus('loading');
      applyActionCode(auth, oobCode)
        .then(() => {
          setStatus('success');
          setDetail('Your email address has been verified. You can now sign in to Taskio.');
        })
        .catch((err) => {
          const code = err?.code;
          setStatus('error');
          if (code === 'auth/expired-action-code') setDetail('This verification link has expired. Please request a new one.');
          else if (code === 'auth/invalid-action-code') setDetail('This verification link is invalid or has already been used.');
          else setDetail('We couldn’t verify your email. Please try again or contact support.');
        });
      return;
    }

    if (mode === 'resetPassword') {
      setStatus('loading');
      verifyPasswordResetCode(auth, oobCode)
        .then((mail) => {
          setEmail(String(mail || ''));
          setStatus('form');
        })
        .catch((err) => {
          const code = err?.code;
          setStatus('error');
          if (code === 'auth/expired-action-code') setDetail('This password reset link has expired. Please request a new one.');
          else if (code === 'auth/invalid-action-code') setDetail('This password reset link is invalid or has already been used.');
          else setDetail('We couldn’t validate this password reset link. Please try again.');
        });
      return;
    }

    setStatus('error');
    setDetail('This action type isn’t supported yet.');
  }, [magicLinkDetected, mode, oobCode, safeContinueUrl]);

  const onResetPassword = async (e) => {
    e.preventDefault();
    if (!oobCode) return;
    setDetail('');

    const p1 = String(newPassword || '');
    const p2 = String(newPassword2 || '');
    if (p1.length < 6) {
      setDetail('Password must be at least 6 characters.');
      return;
    }
    if (p1 !== p2) {
      setDetail('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await confirmPasswordReset(auth, oobCode, p1);
      setStatus('success');
      setDetail('Your password has been updated. You can now sign in.');
    } catch (err) {
      const code = err?.code;
      setStatus('error');
      if (code === 'auth/weak-password') setDetail('Please choose a stronger password.');
      else if (code === 'auth/expired-action-code') setDetail('This password reset link has expired. Please request a new one.');
      else if (code === 'auth/invalid-action-code') setDetail('This password reset link is invalid or has already been used.');
      else setDetail('We couldn’t reset your password. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onCompleteMagicLink = async (e) => {
    e.preventDefault();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      setDetail('Enter the email address that requested this sign-in link.');
      return;
    }
    setBusy(true);
    try {
      const credential = await signInWithEmailLink(auth, normalizedEmail, window.location.href);
      clearPendingMagicLinkEmail();
      const destination = safeContinueUrl || await finalizeAuthenticatedSession(credential.user, {
        providerName: 'emailLink',
        profileOverrides: { email: normalizedEmail },
      });
      setPrimaryTarget(destination);
      setStatus('success');
      setDetail('You’re signed in and ready to continue.');
    } catch (err) {
      setStatus('error');
      if (err?.code === 'auth/expired-action-code') {
        setDetail('This sign-in link has expired. Please request a new one.');
      } else if (err?.code === 'auth/invalid-action-code') {
        setDetail('This sign-in link is invalid or has already been used.');
      } else {
        setDetail('We couldn’t complete this sign-in link. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const primaryLabel = primaryTarget === '/login' ? 'Go to login' : 'Continue';

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <BrandLogo to="/" style={styles.logoLink} />
      </header>

      <main style={styles.container}>
        <div style={styles.card}>
          {status === 'form' ? (
            <>
              <div style={styles.title}>Reset your password</div>
              <div style={styles.subtitle}>
                {email ? `For ${email}` : 'Choose a new password for your account.'}
              </div>

              <form onSubmit={onResetPassword} style={styles.form}>
                <label style={styles.label}>New password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={styles.input}
                  placeholder="••••••••"
                  disabled={busy}
                />
                <label style={styles.label}>Confirm new password</label>
                <input
                  type="password"
                  value={newPassword2}
                  onChange={(e) => setNewPassword2(e.target.value)}
                  style={styles.input}
                  placeholder="••••••••"
                  disabled={busy}
                />
                {detail ? <div style={styles.inlineMsg}>{detail}</div> : null}
                <button type="submit" style={{ ...styles.primaryBtn, ...(busy ? styles.btnDisabled : {}) }} disabled={busy}>
                  {busy ? 'Updating…' : 'Update password'}
                </button>
              </form>
            </>
          ) : status === 'magic_email' ? (
            <>
              <div style={styles.title}>Confirm your email</div>
              <div style={styles.subtitle}>
                Enter the email address that requested this sign-in link so we can finish signing you in.
              </div>
              <form onSubmit={onCompleteMagicLink} style={styles.form}>
                <label style={styles.label}>Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={styles.input}
                  placeholder="you@example.com"
                  disabled={busy}
                />
                {detail ? <div style={styles.inlineMsg}>{detail}</div> : null}
                <button type="submit" style={{ ...styles.primaryBtn, ...(busy ? styles.btnDisabled : {}) }} disabled={busy}>
                  {busy ? 'Signing in…' : 'Continue'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div style={styles.title}>
                {status === 'loading'
                  ? 'Working on it…'
                  : status === 'success'
                    ? 'All set'
                    : status === 'invalid'
                      ? 'Invalid link'
                      : 'Something went wrong'}
              </div>
              <div style={styles.subtitle}>
                {status === 'loading' ? 'Please wait a moment.' : detail || 'Please try again.'}
              </div>

              <div style={styles.actions}>
                <button type="button" onClick={() => navigate(primaryTarget)} style={styles.primaryBtn}>
                  {primaryLabel}
                </button>
                <Link to="/" style={styles.secondaryBtn}>
                  Back to home
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

const styles = {
  page: { fontFamily: 'Inter, sans-serif', minHeight: '100vh', backgroundColor: '#F7F9FA' },
  header: {
    backgroundColor: '#FFFFFF',
    borderBottom: '1px solid #E5E7EB',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    padding: '16px 32px',
  },
  logoLink: { display: 'inline-flex', alignItems: 'center', textDecoration: 'none' },
  container: { display: 'flex', justifyContent: 'center', padding: '72px 24px' },
  card: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)',
    padding: 28,
  },
  title: { fontFamily: 'Poppins, sans-serif', fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 10 },
  subtitle: { fontSize: 14, color: '#6B7280', lineHeight: 1.5, marginBottom: 18 },
  form: { display: 'grid', gap: 10 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151' },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 10,
    border: '1.5px solid #D1D5DB',
    fontSize: 14,
    boxSizing: 'border-box',
    outline: 'none',
  },
  inlineMsg: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
    padding: '10px 12px',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    border: '1px solid #E5E7EB',
  },
  actions: { display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap' },
  primaryBtn: {
    padding: '12px 18px',
    backgroundColor: '#14C5C5',
    color: '#FFFFFF',
    borderRadius: 12,
    fontWeight: 700,
    fontSize: 14,
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(20, 197, 197, 0.22)',
  },
  secondaryBtn: {
    padding: '12px 18px',
    backgroundColor: '#FFFFFF',
    color: '#374151',
    borderRadius: 12,
    fontWeight: 700,
    fontSize: 14,
    border: '1px solid #E5E7EB',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6, cursor: 'not-allowed', boxShadow: 'none' },
};










