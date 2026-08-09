import { useState, useCallback } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { createApiClient } from '../../api/createApiClient';
import { auth } from '../../firebase';

const api = createApiClient();

/**
 * Account deactivation and deletion request flow (same API behavior as previous ProfilePage handlers).
 * @param {object} params
 * @param {import('firebase/auth').User | null | undefined} params.user
 * @param {object | null} params.profile
 * @param {function} params.setProfile
 * @param {function} params.setSaved
 * @param {function} params.setError
 */
export default function useAccountDangerActions({ user, profile, setProfile, setSaved, setError }) {
  const [deactivateBusy, setDeactivateBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState(0);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteTyped, setDeleteTyped] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteDevLink, setDeleteDevLink] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  const deactivateAccount = useCallback(async () => {
    if (!user) return;
    setError('');
    setSaved('');
    setDeactivateBusy(true);
    try {
      const token = await user.getIdToken();
      const config = { headers: { Authorization: `Bearer ${token}` } };
      await api.post('/api/me/deactivate', {}, config);
      setSaved('Account deactivated. You can contact support to reactivate.');
      const refreshed = await api.get('/api/me', config);
      setProfile(refreshed?.data?.profile || profile);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to deactivate account.');
    } finally {
      setDeactivateBusy(false);
    }
  }, [user, profile, setProfile, setSaved, setError]);

  const cancelDeletion = useCallback(async () => {
    if (!user) return;
    setError('');
    setSaved('');
    setDeleteBusy(true);
    try {
      const token = await user.getIdToken();
      const config = { headers: { Authorization: `Bearer ${token}` } };
      await api.post('/api/me/deletion/cancel', {}, config);
      setSaved('Deletion cancelled. Your account remains deactivated.');
      const refreshed = await api.get('/api/me', config);
      setProfile(refreshed?.data?.profile || profile);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to cancel deletion.');
    } finally {
      setDeleteBusy(false);
    }
  }, [user, profile, setProfile, setSaved, setError]);

  const startDeletionFlow = useCallback(() => {
    setDeleteDevLink('');
    setDeleteTyped('');
    setDeleteReason('');
    setDeletePassword('');
    setDeleteStep(0);
    setDeleteOpen(true);
  }, []);

  const doReauth = useCallback(async (password) => {
    if (!auth.currentUser?.email) throw new Error('missing_email');
    const cred = EmailAuthProvider.credential(auth.currentUser.email, password);
    await reauthenticateWithCredential(auth.currentUser, cred);
  }, []);

  const requestDeletion = useCallback(async () => {
    if (!user) return;
    setError('');
    setDeleteBusy(true);
    try {
      if (deleteStep === 0) {
        await doReauth(deletePassword);
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
      setError(e?.response?.data?.message || 'Failed to request deletion.');
    } finally {
      setDeleteBusy(false);
    }
  }, [user, deleteStep, deletePassword, deleteTyped, deleteReason, doReauth, setError]);

  return {
    deactivateBusy,
    deleteOpen,
    setDeleteOpen,
    deleteStep,
    deletePassword,
    setDeletePassword,
    deleteTyped,
    setDeleteTyped,
    deleteReason,
    setDeleteReason,
    deleteDevLink,
    deleteBusy,
    deactivateAccount,
    cancelDeletion,
    startDeletionFlow,
    requestDeletion,
  };
}
