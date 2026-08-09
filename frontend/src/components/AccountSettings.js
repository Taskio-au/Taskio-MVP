import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../firebase';
import { createApiClient } from '../api/createApiClient';
import AppHeader from './AppHeader';
import { PageLoadingShell } from './ui/AsyncPageStates';
import PageMain from './ui/PageMain';
import PrivateDetailsVerificationCard from './profile/PrivateDetailsVerificationCard';
import { GoogleActionButton, GoogleGlyph } from './profile/GoogleBrand';
import { DeletionRequestModal } from './profile/ProfileModals';
import useClientAccountState from './profile/useHomeownerAccountState';
import { doc, getDoc } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

const api = createApiClient();

function maskPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 4) return value || '';
  return `•••• ${digits.slice(-4)}`;
}

export default function AccountSettings() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, loading] = useAuthState(auth);
  const [profile, setProfile] = useState(null);
  const [claimsIsAdmin, setClaimsIsAdmin] = useState(false);
  const [pageSaved, setPageSaved] = useState('');
  const [pageError, setPageError] = useState('');
  const [deactivateBusy, setDeactivateBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState(0);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteTyped, setDeleteTyped] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteDevLink, setDeleteDevLink] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [loading, navigate, user]);

  useEffect(() => {
    const run = async () => {
      if (!user) return;
      setPageError('');
      try {
        const tokenResult = await user.getIdTokenResult();
        setClaimsIsAdmin(Boolean(tokenResult?.claims?.admin));
        const token = tokenResult?.token || await user.getIdToken();
        const config = { headers: { Authorization: `Bearer ${token}` } };
        const meRes = await api.get('/api/me', config);
        setProfile(meRes?.data?.profile || {});
      } catch (e) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          setProfile(snap.exists() ? snap.data() : {});
        } catch (_) {
          setProfile({});
          setPageError('We could not load your settings right now. Please refresh and try again.');
        }
      }
    };
    run();
  }, [user]);

  const role = useMemo(() => {
    if (claimsIsAdmin) return 'admin';
    const nextRole = profile?.role;
    if (nextRole === 'tradie' || nextRole === 'homeowner' || nextRole === 'admin') return nextRole;
    return 'homeowner';
  }, [claimsIsAdmin, profile]);

  const {
    accountMethodBusy,
    accountMethodMsg,
    accountMethodMsgType,
    draftEmail,
    emailPassword,
    error: homeownerError,
    handleHomeownerEmailAction,
    handleLinkGoogleAccount,
    headerEmail,
    headerName,
    homeownerAccountStatus,
    homeownerExpandedRow,
    refreshMe,
    resendVerification,
    setDraftEmail,
    setEmailPassword,
    toggleHomeownerExpandedRow,
    verifyBusy,
    verifyMsg,
  } = useClientAccountState({
    user,
    profile,
    setProfile,
    navigate,
    initialExpandedRow: location.state?.openRow || '',
  });

  const notice = location.state?.notice || '';

  const deactivateAccount = async () => {
    if (!user) return;
    setPageError('');
    setPageSaved('');
    setDeactivateBusy(true);
    try {
      const token = await user.getIdToken();
      const config = { headers: { Authorization: `Bearer ${token}` } };
      await api.post('/api/me/deactivate', {}, config);
      setPageSaved('Account deactivated. You can contact support to reactivate.');
      const refreshed = await api.get('/api/me', config);
      setProfile(refreshed?.data?.profile || profile);
    } catch (e) {
      setPageError(e?.response?.data?.message || 'Failed to deactivate account.');
    } finally {
      setDeactivateBusy(false);
    }
  };

  const cancelDeletion = async () => {
    if (!user) return;
    setPageError('');
    setPageSaved('');
    setDeleteBusy(true);
    try {
      const token = await user.getIdToken();
      const config = { headers: { Authorization: `Bearer ${token}` } };
      await api.post('/api/me/deletion/cancel', {}, config);
      setPageSaved('Deletion cancelled. Your account remains active.');
      const refreshed = await api.get('/api/me', config);
      setProfile(refreshed?.data?.profile || profile);
    } catch (e) {
      setPageError(e?.response?.data?.message || 'Failed to cancel deletion.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const startDeletionFlow = () => {
    setDeleteDevLink('');
    setDeleteTyped('');
    setDeleteReason('');
    setDeletePassword('');
    setDeleteStep(0);
    setDeleteOpen(true);
  };

  const doReauth = async () => {
    if (!auth.currentUser?.email) throw new Error('missing_email');
    const credential = EmailAuthProvider.credential(auth.currentUser.email, deletePassword);
    await reauthenticateWithCredential(auth.currentUser, credential);
  };

  const requestDeletion = async () => {
    if (!user) return;
    setPageError('');
    setDeleteBusy(true);
    try {
      if (deleteStep === 0) {
        await doReauth();
        setDeleteStep(1);
        setDeleteBusy(false);
        return;
      }
      const token = await user.getIdToken();
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await api.post('/api/me/deletion/request', { typed: deleteTyped, reason: deleteReason }, config);
      setDeleteDevLink(res?.data?.devConfirmUrl || '');
      setDeleteStep(2);
    } catch (e) {
      setPageError(e?.response?.data?.message || 'Failed to request deletion.');
    } finally {
      setDeleteBusy(false);
    }
  };

  if (loading || !user) {
    return (
      <PageLoadingShell message="Loading account settings…" detail="Getting your account and sign-in options." />
    );
  }

  if (role !== 'homeowner') {
    return <Navigate to="/profile" replace />;
  }

  return (
    <>
      <style>{`
        .account-settings-row-action:hover {
          color: #0f766e !important;
        }
        .account-settings-google-btn:hover:not(:disabled),
        .account-settings-secondary-btn:hover:not(:disabled),
        .account-settings-primary-btn:hover:not(:disabled) {
          transform: translateY(-1px);
        }
        @media (max-width: 720px) {
          .account-settings-row-main {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
          .account-settings-row-meta,
          .account-settings-actions {
            width: 100% !important;
          }
          .account-settings-row-meta button,
          .account-settings-actions button {
            width: 100% !important;
          }
        }
      `}</style>

      <AppHeader userRole={role} userName={headerName} userEmail={headerEmail} />
      <PageMain label="Account settings">
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={styles.headerRow}>
            <div>
              <h1 style={styles.title}>Account Settings</h1>
              <p style={styles.subTitle}>Manage your security, login methods, and account status.</p>
            </div>
          </div>

          {notice ? (
            <div style={styles.warningBanner} role="status" aria-live="polite">
              {notice}
            </div>
          ) : null}
          {pageSaved ? (
            <div style={styles.successBanner} role="status" aria-live="polite">
              {pageSaved}
            </div>
          ) : null}
          {pageError ? (
            <div style={styles.errorBanner} role="alert">
              {pageError}
            </div>
          ) : null}
          {homeownerError ? (
            <div style={styles.errorBanner} role="alert">
              {homeownerError}
            </div>
          ) : null}
          {verifyMsg ? (
            <div style={styles.successBanner} role="status" aria-live="polite">
              {verifyMsg}
            </div>
          ) : null}
          {accountMethodMsg ? (
            <div
              style={accountMethodMsgType === 'error' ? styles.errorBanner : styles.successBanner}
              role={accountMethodMsgType === 'error' ? 'alert' : 'status'}
              aria-live={accountMethodMsgType === 'error' ? 'assertive' : 'polite'}
            >
              {accountMethodMsg}
            </div>
          ) : null}

          <div style={styles.card}>
            <div style={styles.sectionHeader}>
              <div>
                <h2 style={styles.sectionTitle}>Account & Security</h2>
              </div>
            </div>

            <div style={styles.rows}>
              <div style={styles.row}>
                <div style={styles.rowMain} className="account-settings-row-main">
                  <div style={styles.rowIdentity}>
                    <div style={styles.rowLabel}>Phone</div>
                    <div style={styles.rowText}>
                      {profile?.phone ? `Verified number ${maskPhone(profile.phone)}` : 'Required for quote access'}
                    </div>
                  </div>
                  <div style={styles.rowMeta} className="account-settings-row-meta">
                    <span style={homeownerAccountStatus?.phoneVerified ? styles.statusOk : styles.statusWarn}>
                      {homeownerAccountStatus?.phoneVerified ? 'Verified' : 'Needs verification'}
                    </span>
                    <button
                      type="button"
                      style={styles.rowAction}
                      className="account-settings-row-action"
                      aria-expanded={homeownerExpandedRow === 'phone'}
                      aria-controls="settings-phone-panel"
                      onClick={() => toggleHomeownerExpandedRow('phone')}
                    >
                      {homeownerExpandedRow === 'phone' ? 'Close' : 'Edit'}
                    </button>
                  </div>
                </div>
                {homeownerExpandedRow === 'phone' ? (
                  <div id="settings-phone-panel" style={styles.rowExpanded}>
                    <PrivateDetailsVerificationCard variant="phone" onProfileRefresh={refreshMe} />
                  </div>
                ) : null}
              </div>

              <div style={styles.row}>
                <div style={styles.rowMain} className="account-settings-row-main">
                  <div style={styles.rowIdentity}>
                    <div style={styles.rowLabel}>Email</div>
                    <div style={styles.rowText}>{headerEmail || 'Add an email to unlock secure payments.'}</div>
                  </div>
                  <div style={styles.rowMeta} className="account-settings-row-meta">
                    <span style={homeownerAccountStatus?.emailVerified ? styles.statusOk : styles.statusWarn}>
                      {homeownerAccountStatus?.emailVerified ? 'Verified' : (headerEmail ? 'Needs verification' : 'Not added')}
                    </span>
                    <button
                      type="button"
                      style={styles.rowAction}
                      className="account-settings-row-action"
                      aria-expanded={homeownerExpandedRow === 'email'}
                      aria-controls="settings-email-panel"
                      onClick={() => toggleHomeownerExpandedRow('email')}
                    >
                      {homeownerExpandedRow === 'email' ? 'Close' : (headerEmail ? 'Edit' : 'Add')}
                    </button>
                  </div>
                </div>
                {homeownerExpandedRow === 'email' ? (
                  <div id="settings-email-panel" style={styles.rowExpanded}>
                    <div style={styles.fieldCol}>
                      <label htmlFor="settings-email-address" style={styles.fieldLabel}>Email</label>
                      <input
                        id="settings-email-address"
                        value={draftEmail}
                        onChange={(e) => setDraftEmail(e.target.value)}
                        style={styles.input}
                        autoComplete="email"
                        placeholder="you@example.com"
                      />
                    </div>
                    {!homeownerAccountStatus?.passwordLinked && Boolean(String(draftEmail || '').trim()) ? (
                      <div style={styles.fieldCol}>
                        <label htmlFor="settings-email-password" style={styles.fieldLabel}>Password</label>
                        <input
                          id="settings-email-password"
                          value={emailPassword}
                          onChange={(e) => setEmailPassword(e.target.value)}
                          style={styles.input}
                          type="password"
                          autoComplete="new-password"
                          placeholder="At least 8 characters"
                        />
                      </div>
                    ) : null}
                    <div style={styles.actions} className="account-settings-actions">
                      <button
                        type="button"
                        style={styles.primaryButton}
                        className="account-settings-primary-btn"
                        onClick={handleHomeownerEmailAction}
                        disabled={accountMethodBusy}
                      >
                        {accountMethodBusy ? 'Saving…' : (homeownerAccountStatus?.emailVerified ? 'Update email' : 'Verify email')}
                      </button>
                      {headerEmail && !homeownerAccountStatus?.emailVerified ? (
                        <button
                          type="button"
                          style={styles.secondaryButton}
                          className="account-settings-secondary-btn"
                          onClick={resendVerification}
                          disabled={verifyBusy}
                        >
                          {verifyBusy ? 'Sending…' : 'Resend verification email'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              <div style={styles.row}>
                <div style={styles.rowMain} className="account-settings-row-main">
                  <div style={styles.rowIdentity}>
                    <div style={styles.rowLabelWithIcon}>
                      <GoogleGlyph size={18} />
                      <span>Google</span>
                    </div>
                    <div style={styles.rowText}>Use Google for faster sign-in.</div>
                  </div>
                  <div style={styles.rowMeta} className="account-settings-row-meta">
                    <span style={homeownerAccountStatus?.googleLinked ? styles.statusOk : styles.statusWarn}>
                      {homeownerAccountStatus?.googleLinked ? 'Linked' : 'Not linked'}
                    </span>
                    <button
                      type="button"
                      style={styles.rowAction}
                      className="account-settings-row-action"
                      aria-expanded={homeownerExpandedRow === 'google'}
                      aria-controls="settings-google-panel"
                      onClick={() => toggleHomeownerExpandedRow('google')}
                    >
                      {homeownerExpandedRow === 'google' ? 'Close' : (homeownerAccountStatus?.googleLinked ? 'Manage' : 'Link')}
                    </button>
                  </div>
                </div>
                {homeownerExpandedRow === 'google' ? (
                  <div id="settings-google-panel" style={styles.rowExpanded}>
                    {homeownerAccountStatus?.googleLinked ? (
                      <div style={styles.rowPanelNote}>Google is already linked to this account.</div>
                    ) : null}
                    <div style={styles.actions} className="account-settings-actions">
                      <GoogleActionButton
                        style={styles.googleButton}
                        className="account-settings-google-btn"
                        onClick={handleLinkGoogleAccount}
                        disabled={accountMethodBusy}
                      >
                        {accountMethodBusy ? 'Saving…' : 'Continue with Google'}
                      </GoogleActionButton>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div style={styles.dangerCard}>
            <div style={styles.sectionHeader}>
              <div>
                <div style={styles.dangerEyebrow}>Account actions</div>
                <h2 style={styles.dangerTitle}>Danger Zone</h2>
              </div>
            </div>
            <div style={styles.dangerCopy}>
              Deactivate your account if you need a break, or request permanent deletion when you want to leave Taskio for good.
            </div>
            <div style={styles.actions} className="account-settings-actions">
              <button type="button" style={styles.deactivateButton} onClick={deactivateAccount} disabled={deactivateBusy}>
                {deactivateBusy ? 'Deactivating…' : 'Deactivate account'}
              </button>
              <button type="button" style={styles.deleteButton} onClick={startDeletionFlow}>
                Request permanent deletion
              </button>
              {profile?.status === 'pending_deletion' ? (
                <button type="button" style={styles.secondaryButton} onClick={cancelDeletion} disabled={deleteBusy}>
                  {deleteBusy ? 'Cancelling…' : 'Cancel deletion'}
                </button>
              ) : null}
            </div>
          </div>

          <DeletionRequestModal
            open={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            styles={modalStyles}
            deleteStep={deleteStep}
            deletePassword={deletePassword}
            onDeletePasswordChange={setDeletePassword}
            deleteTyped={deleteTyped}
            onDeleteTypedChange={setDeleteTyped}
            deleteReason={deleteReason}
            onDeleteReasonChange={setDeleteReason}
            deleteDevLink={deleteDevLink}
            onRequestDeletion={requestDeletion}
            deleteBusy={deleteBusy}
          />
        </div>
      </div>
      </PageMain>
    </>
  );
}

const styles = {
  page: { background: '#F7F9FA', minHeight: 'calc(100vh - 64px)' },
  container: { maxWidth: 1100, margin: '0 auto', padding: '28px 32px 40px' },
  headerRow: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 },
  title: { fontFamily: 'Poppins, sans-serif', fontSize: 22, fontWeight: 900, color: '#222', margin: 0 },
  subTitle: { fontSize: 13, color: '#666', marginTop: 4, marginBottom: 0 },
  successBanner: { background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#166534', padding: '12px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12 },
  errorBanner: { background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', padding: '12px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12 },
  warningBanner: { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '12px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12 },
  card: { background: '#fff', border: '1px solid #E0E0E0', borderRadius: 16, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginTop: 16 },
  dangerCard: { background: '#FFFBFB', border: '1px solid #F6DEDE', borderRadius: 16, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.02)', marginTop: 16 },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 },
  sectionTitle: { margin: 0, fontFamily: 'Poppins, sans-serif', fontSize: 18, fontWeight: 800, color: '#111827' },
  rows: { display: 'flex', flexDirection: 'column', gap: 14 },
  row: { border: '1px solid #E5E7EB', borderRadius: 16, overflow: 'hidden', background: '#fff' },
  rowMain: { display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'center', padding: '18px 20px' },
  rowIdentity: { flex: 1, minWidth: 220 },
  rowLabel: { fontSize: 15, fontWeight: 800, color: '#111827', marginBottom: 4 },
  rowLabelWithIcon: { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: '#111827', marginBottom: 4 },
  rowText: { fontSize: 13, color: '#6B7280', lineHeight: 1.5 },
  rowMeta: { display: 'flex', gap: 14, alignItems: 'center', flexShrink: 0 },
  rowAction: { background: 'transparent', border: 'none', color: '#111827', cursor: 'pointer', padding: 0, fontSize: 14, fontWeight: 700, fontFamily: 'Inter, sans-serif' },
  rowExpanded: { borderTop: '1px solid #E5E7EB', padding: '18px 20px 20px', background: '#FCFCFD', display: 'flex', flexDirection: 'column', gap: 16 },
  rowPanelNote: { fontSize: 13, color: '#4B5563', lineHeight: 1.6 },
  statusOk: { fontSize: 13, fontWeight: 700, color: '#15803d' },
  statusWarn: { fontSize: 13, fontWeight: 700, color: '#b45309' },
  fieldCol: { display: 'flex', flexDirection: 'column', gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: 700, color: '#374151', fontFamily: 'Inter, sans-serif' },
  input: { width: '100%', boxSizing: 'border-box', borderRadius: 10, border: '1.5px solid #D1D5DB', padding: '11px 14px', fontSize: 14, fontFamily: 'Inter, sans-serif', outline: 'none', minHeight: 44, backgroundColor: '#FFFFFF' },
  actions: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' },
  primaryButton: { background: '#FF9100', color: '#FFFFFF', border: 'none', borderRadius: 12, padding: '13px 18px', cursor: 'pointer', fontWeight: 800, fontSize: 14, fontFamily: 'Inter, sans-serif' },
  secondaryButton: { background: '#FFFFFF', color: '#111827', border: '1px solid #D1D5DB', borderRadius: 12, padding: '13px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'Inter, sans-serif' },
  googleButton: { width: '100%', maxWidth: 280, justifyContent: 'flex-start' },
  dangerCopy: { fontSize: 13, color: '#7F1D1D', lineHeight: 1.6, marginBottom: 16 },
  dangerEyebrow: { fontSize: 12, fontWeight: 700, color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 },
  dangerTitle: { margin: 0, fontFamily: 'Poppins, sans-serif', fontSize: 16, fontWeight: 700, color: '#7F1D1D' },
  deactivateButton: { background: '#FFFFFF', color: '#B91C1C', border: '1px solid #F0B7B7', borderRadius: 12, padding: '13px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'Inter, sans-serif' },
  deleteButton: { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 12, padding: '13px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'Inter, sans-serif' },
};

const modalStyles = {
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.48)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1200 },
  modalCard: { width: '100%', maxWidth: 520, background: '#fff', borderRadius: 16, border: '1px solid #E5E7EB', boxShadow: '0 16px 40px rgba(0,0,0,0.18)', overflow: 'hidden' },
  modalHeader: { padding: '18px 20px', borderBottom: '1px solid #E5E7EB' },
  modalClose: { background: 'transparent', border: 'none', color: '#6B7280', fontSize: 24, cursor: 'pointer', padding: 0, lineHeight: 1 },
  fieldLabel: { fontSize: 13, fontWeight: 700, color: '#374151', fontFamily: 'Inter, sans-serif' },
  label: { fontSize: 13, fontWeight: 700, color: '#374151', fontFamily: 'Inter, sans-serif' },
  input: { width: '100%', boxSizing: 'border-box', borderRadius: 10, border: '1.5px solid #D1D5DB', padding: '11px 14px', fontSize: 14, fontFamily: 'Inter, sans-serif', minHeight: 44, backgroundColor: '#FFFFFF' },
  hint: { fontSize: 12, color: '#6B7280', lineHeight: 1.5 },
  buttonDanger: { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'Inter, sans-serif' },
  secondaryButton: { background: '#FFFFFF', color: '#111827', border: '1px solid #D1D5DB', borderRadius: 12, padding: '12px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'Inter, sans-serif' },
  buttonSecondary: { background: '#FFFFFF', color: '#111827', border: '1px solid #D1D5DB', borderRadius: 12, padding: '12px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'Inter, sans-serif' },
};
