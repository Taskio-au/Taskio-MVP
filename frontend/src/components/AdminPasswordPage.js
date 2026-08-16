import React, { useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth } from '../firebase';
import AppHeader from './AppHeader';
import { PageLoadingShell } from './ui/AsyncPageStates';

export default function AdminPasswordPage() {
  const [user, loading] = useAuthState(auth);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!user?.email) {
      setError('This admin account does not have an email address available for password changes.');
      return;
    }

    const trimmedPassword = String(nextPassword || '').trim();
    if (trimmedPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (trimmedPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setBusy(true);
    setError('');
    setSaved('');
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, trimmedPassword);
      setCurrentPassword('');
      setNextPassword('');
      setConfirmPassword('');
      setSaved('Password updated successfully.');
    } catch (err) {
      const code = String(err?.code || '');
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Your current password is incorrect.');
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Please wait a moment and try again.');
      } else if (code === 'auth/requires-recent-login') {
        setError('Please sign in again, then retry changing your password.');
      } else {
        setError('We could not update your password right now. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user) {
    return <PageLoadingShell message="Loading password settings…" detail="Verifying your administrator session." />;
  }

  return (
    <>
      <AppHeader userRole="admin" userName={user.displayName || ''} userEmail={user.email || ''} />
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={styles.headerBlock}>
            <div style={styles.eyebrow}>Admin account</div>
            <h1 style={styles.title}>Password</h1>
            <p style={styles.subTitle}>Update your admin password for this account.</p>
          </div>

          {saved ? <div style={styles.successBanner}>{saved}</div> : null}
          {error ? <div style={styles.errorBanner}>{error}</div> : null}

          <form style={styles.card} onSubmit={handleSubmit}>
            <div style={styles.field}>
              <label htmlFor="admin-current-password" style={styles.label}>Current password</label>
              <input
                id="admin-current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                style={styles.input}
                autoComplete="current-password"
              />
            </div>

            <div style={styles.field}>
              <label htmlFor="admin-new-password" style={styles.label}>New password</label>
              <input
                id="admin-new-password"
                type="password"
                value={nextPassword}
                onChange={(e) => setNextPassword(e.target.value)}
                style={styles.input}
                autoComplete="new-password"
              />
            </div>

            <div style={styles.field}>
              <label htmlFor="admin-confirm-password" style={styles.label}>Confirm new password</label>
              <input
                id="admin-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={styles.input}
                autoComplete="new-password"
              />
            </div>

            <div style={styles.actions}>
              <button type="submit" style={styles.primaryButton} disabled={busy}>
                {busy ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

const styles = {
  page: { background: '#F7F9FA', minHeight: 'calc(100vh - 64px)' },
  container: { maxWidth: 720, margin: '0 auto', padding: '28px 32px 40px' },
  headerBlock: { marginBottom: 16 },
  eyebrow: { fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0f766e', marginBottom: 6 },
  title: { margin: 0, fontFamily: 'Poppins, sans-serif', fontSize: 28, fontWeight: 700, color: '#111827' },
  subTitle: { margin: '8px 0 0', fontSize: 14, color: '#6B7280', lineHeight: 1.6 },
  card: { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 16, padding: 24, display: 'grid', gap: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' },
  field: { display: 'grid', gap: 8 },
  label: { fontSize: 13, fontWeight: 700, color: '#374151' },
  input: { width: '100%', boxSizing: 'border-box', borderRadius: 12, border: '1.5px solid #D1D5DB', padding: '12px 14px', fontSize: 14, fontFamily: 'Inter, sans-serif', outline: 'none' },
  actions: { display: 'flex', justifyContent: 'flex-end' },
  primaryButton: { background: '#111827', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 18px', cursor: 'pointer', fontWeight: 800, fontSize: 14 },
  successBanner: { background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#166534', padding: '12px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12 },
  errorBanner: { background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', padding: '12px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12 },
};
