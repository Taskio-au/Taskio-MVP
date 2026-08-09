import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { createApiClient } from '../api/createApiClient';
import AppHeader from './AppHeader';
import { PageLoadingShell } from './ui/AsyncPageStates';
import PageMain from './ui/PageMain';
import { DeletionRequestModal } from './profile/ProfileModals';
import TradieAccountDangerZone from './profile/TradieAccountDangerZone';
import useAccountDangerActions from './profile/useAccountDangerActions';
import { tradieAccountSettingsPageStyles as styles } from './profile/tradieAccountSettingsPageStyles';
import ExpertFeeProgramCard from './expert/ExpertFeeProgramCard';
import './ProfilePage.css';

const api = createApiClient();

function safeStr(v) {
  return typeof v === 'string' ? v : '';
}

export default function TradieAccountSettingsPage() {
  const navigate = useNavigate();
  const [user, loading] = useAuthState(auth);
  const [profile, setProfile] = useState(null);
  const [foundingFeeProfile, setFoundingFeeProfile] = useState(null);
  const [feeProfileUnavailable, setFeeProfileUnavailable] = useState(false);
  const [claimsIsAdmin, setClaimsIsAdmin] = useState(false);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [loading, navigate, user]);

  useEffect(() => {
    const run = async () => {
      if (!user) return;
      setError('');
      try {
        const tokenResult = await user.getIdTokenResult();
        setClaimsIsAdmin(Boolean(tokenResult?.claims?.admin));
        const token = tokenResult?.token || await user.getIdToken();
        const config = { headers: { Authorization: `Bearer ${token}` } };
        const meRes = await api.get('/api/me', config);
        const data = meRes?.data || {};
        setProfile(data.profile || {});
        setFoundingFeeProfile(data.foundingExpertFeeProfile ?? null);
        setFeeProfileUnavailable(false);
      } catch (e) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          setProfile(snap.exists() ? snap.data() : {});
          setFoundingFeeProfile(null);
          setFeeProfileUnavailable(true);
        } catch (_) {
          setProfile({});
          setFoundingFeeProfile(null);
          setFeeProfileUnavailable(true);
          setError('We could not load your account right now. Please refresh and try again.');
        }
      }
    };
    run();
  }, [user]);

  const role = useMemo(() => {
    if (claimsIsAdmin) return 'admin';
    const r = profile?.role;
    if (r === 'tradie' || r === 'homeowner' || r === 'admin') return r;
    return 'homeowner';
  }, [profile, claimsIsAdmin]);

  const danger = useAccountDangerActions({ user, profile, setProfile, setSaved, setError });

  const pageHeaderName = useMemo(() => {
    const full = safeStr(profile?.displayName) || safeStr(profile?.name) || safeStr(user?.displayName) || '';
    return full.trim() || safeStr(user?.email || '').split('@')[0] || 'User';
  }, [profile, user]);

  const pageHeaderEmail = profile?.email || user?.email || '';

  if (loading || !user) {
    return (
      <PageLoadingShell message="Loading account settings…" detail="Getting your Expert account and security options." />
    );
  }

  if (role !== 'tradie') {
    return <Navigate to="/profile" replace />;
  }

  return (
    <>
      <AppHeader userRole="tradie" userName={pageHeaderName} userEmail={pageHeaderEmail} />
      <PageMain label="Expert account settings">
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={styles.pageHeader}>
            <h1 style={styles.pageTitle}>Account settings</h1>
            <p style={styles.pageSubtitle}>
              Deactivate your Expert account or request permanent deletion. For profile details and verification, use{' '}
              <Link to="/profile" style={{ color: '#0f766e', fontWeight: 700 }}>
                My Profile
              </Link>
              .
            </p>
          </div>

          {saved ? (
            <div style={styles.successBanner} role="status" aria-live="polite">
              <span style={styles.successIcon} aria-hidden="true">✓</span>
              {saved}
            </div>
          ) : null}
          {error ? (
            <div style={styles.errorBanner} role="alert">
              {error}
            </div>
          ) : null}

          <ExpertFeeProgramCard
            foundingExpertFeeProfile={foundingFeeProfile}
            compact={
              feeProfileUnavailable ||
              !foundingFeeProfile ||
              String(foundingFeeProfile.stage || '') === 'standard_launch'
            }
            apiUnavailable={feeProfileUnavailable}
          />

          <TradieAccountDangerZone
            profile={profile}
            deactivateBusy={danger.deactivateBusy}
            deleteBusy={danger.deleteBusy}
            onDeactivate={danger.deactivateAccount}
            onStartDeletion={danger.startDeletionFlow}
            onCancelDeletion={danger.cancelDeletion}
          />

          <DeletionRequestModal
            open={danger.deleteOpen}
            onClose={() => danger.setDeleteOpen(false)}
            styles={styles}
            deleteStep={danger.deleteStep}
            deletePassword={danger.deletePassword}
            onDeletePasswordChange={danger.setDeletePassword}
            deleteTyped={danger.deleteTyped}
            onDeleteTypedChange={danger.setDeleteTyped}
            deleteReason={danger.deleteReason}
            onDeleteReasonChange={danger.setDeleteReason}
            deleteDevLink={danger.deleteDevLink}
            onRequestDeletion={danger.requestDeletion}
            deleteBusy={danger.deleteBusy}
          />
        </div>
      </div>
      </PageMain>
    </>
  );
}
