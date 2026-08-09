import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auth, googleProvider, storage } from '../../firebase';
import { createApiClient } from '../../api/createApiClient';
import { getHomeownerAccountStatus } from '../../utils/homeownerAccount';
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import {
  EmailAuthProvider,
  linkWithCredential,
  linkWithPopup,
  sendEmailVerification,
  verifyBeforeUpdateEmail,
} from 'firebase/auth';

const api = createApiClient();

function safeStr(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function hasMeaningfulNameChars(value) {
  return /[\p{L}\p{N}]/u.test(String(value || ''));
}

function fmtMonthYear(ts) {
  if (!ts) return '—';
  const value = ts?.seconds
    ? new Date(ts.seconds * 1000)
    : ts?._seconds
      ? new Date(ts._seconds * 1000)
      : new Date(ts);
  if (Number.isNaN(value.getTime())) return '—';
  return value.toLocaleString('en-AU', { month: 'long', year: 'numeric' });
}

export default function useClientAccountState({
  user,
  profile,
  setProfile,
  navigate,
  initialExpandedRow = '',
}) {
  const [draftFirstName, setDraftFirstName] = useState('');
  const [draftLastName, setDraftLastName] = useState('');
  const [draftEmail, setDraftEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoProgress, setPhotoProgress] = useState(0);
  const [photoError, setPhotoError] = useState('');
  const [photoPreview, setPhotoPreview] = useState(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState('');
  const [accountMethodBusy, setAccountMethodBusy] = useState(false);
  const [accountMethodMsg, setAccountMethodMsg] = useState('');
  const [accountMethodMsgType, setAccountMethodMsgType] = useState('success');
  const [homeownerEditingProfile, setHomeownerEditingProfile] = useState(false);
  const [homeownerExpandedRow, setHomeownerExpandedRow] = useState(initialExpandedRow || '');
  const [homeownerNameConfirmOpen, setHomeownerNameConfirmOpen] = useState(false);
  const uploadTaskRef = useRef(null);

  useEffect(() => {
    const fullName = safeStr(profile?.displayName) || safeStr(profile?.name) || safeStr(user?.displayName) || '';
    const nameParts = fullName.trim().split(/\s+/);
    setDraftFirstName(profile?.firstName || nameParts[0] || '');
    setDraftLastName(profile?.lastName || nameParts.slice(1).join(' ') || '');
    setDraftEmail(safeStr(profile?.email) || safeStr(user?.email) || '');
  }, [profile, user]);

  useEffect(() => {
    if (!initialExpandedRow) return;
    setHomeownerExpandedRow(initialExpandedRow);
  }, [initialExpandedRow]);

  const homeownerAccountStatus = useMemo(
    () => getHomeownerAccountStatus(profile, user),
    [profile, user]
  );

  const homeownerMissingSteps = useMemo(() => {
    const steps = [];
    if (!homeownerAccountStatus.firstName) steps.push('Add your first name');
    if (!String(profile?.lastName || '').trim()) steps.push('Add your last name');
    if (!homeownerAccountStatus.phoneVerified) steps.push('Verify your phone');
    if (!homeownerAccountStatus.hasDurableMethod) steps.push('Add a verified email or continue with Google');
    return steps;
  }, [homeownerAccountStatus, profile?.lastName]);

  const homeownerMemberSince = useMemo(() => fmtMonthYear(profile?.createdAt), [profile?.createdAt]);
  const headerName = useMemo(
    () => [draftFirstName, draftLastName].filter(Boolean).join(' ') || profile?.displayName || profile?.name || user?.displayName || '',
    [draftFirstName, draftLastName, profile, user]
  );
  const headerEmail = useMemo(() => profile?.email || user?.email || '', [profile, user]);
  const displayPhotoUrl = photoPreview || profile?.photoURL || profile?.profilePhotoURL;

  const resetHomeownerDrafts = useCallback(() => {
    const fullName = safeStr(profile?.displayName) || safeStr(profile?.name) || safeStr(user?.displayName) || '';
    const nameParts = fullName.trim().split(/\s+/);
    setDraftFirstName(profile?.firstName || nameParts[0] || '');
    setDraftLastName(profile?.lastName || nameParts.slice(1).join(' ') || '');
    setDraftEmail(safeStr(profile?.email) || safeStr(user?.email) || '');
    setEmailPassword('');
  }, [profile, user]);

  const refreshMe = useCallback(async () => {
    if (!user) return;
    try {
      try { await user.reload?.(); } catch (_) {}
      const token = await user.getIdToken(true);
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const meRes = await api.get('/api/me', config);
      const nextProfile = meRes?.data?.profile || null;
      if (nextProfile) {
        setProfile(nextProfile);
        setDraftEmail(safeStr(nextProfile.email) || safeStr(user?.email) || '');
      }
    } catch (_) {
      // ignore
    }
  }, [setProfile, user]);

  const validateHomeownerNameDrafts = useCallback(() => {
    const firstName = normalizeName(draftFirstName);
    const lastName = normalizeName(draftLastName);
    if (!firstName) return { error: 'Enter your first name.' };
    if (!lastName) return { error: 'Enter your last name.' };
    if (!hasMeaningfulNameChars(firstName)) return { error: 'Enter a valid first name.' };
    if (!hasMeaningfulNameChars(lastName)) return { error: 'Enter a valid last name.' };
    const displayName = `${firstName} ${lastName}`.trim();
    if (displayName.length > 80) return { error: 'Name is too long (max 80 characters).' };
    const currentFirstName = normalizeName(profile?.firstName || '');
    const currentLastName = normalizeName(profile?.lastName || '');
    return {
      firstName,
      lastName,
      displayName,
      nameChanged: firstName !== currentFirstName || lastName !== currentLastName,
    };
  }, [draftFirstName, draftLastName, profile?.firstName, profile?.lastName]);

  const runHomeownerProfileSave = useCallback(async () => {
    if (!user) return;
    setError('');
    setSaved('');

    const validation = validateHomeownerNameDrafts();
    if (validation.error) {
      setError(validation.error);
      return;
    }

    if (validation.nameChanged && profile?.nameChangeBlockedMessage) {
      setError(profile.nameChangeBlockedMessage);
      return;
    }

    setBusy(true);
    try {
      const token = await user.getIdToken();
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await api.put('/api/me/profile', {
        firstName: validation.firstName,
        lastName: validation.lastName,
        displayName: validation.displayName,
      }, config);
      const updatedProfile = res?.data?.profile || null;
      if (updatedProfile) {
        setProfile(updatedProfile);
        setDraftEmail(safeStr(updatedProfile.email) || safeStr(user?.email) || '');
      }
      setHomeownerEditingProfile(false);
      setHomeownerNameConfirmOpen(false);
      setSaved('Profile updated successfully!');
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save profile. Please try again.');
    } finally {
      setBusy(false);
      setTimeout(() => setSaved(''), 3000);
    }
  }, [profile?.nameChangeBlockedMessage, setProfile, user, validateHomeownerNameDrafts]);

  const saveHomeownerProfile = useCallback(() => {
    setError('');
    const validation = validateHomeownerNameDrafts();
    if (validation.error) {
      setError(validation.error);
      return;
    }
    if (validation.nameChanged && profile?.nameChangeBlockedMessage) {
      setError(profile.nameChangeBlockedMessage);
      return;
    }
    if (validation.nameChanged && profile?.hasPaymentHistory) {
      setHomeownerNameConfirmOpen(true);
      return;
    }
    runHomeownerProfileSave();
  }, [profile?.hasPaymentHistory, profile?.nameChangeBlockedMessage, runHomeownerProfileSave, validateHomeownerNameDrafts]);

  const confirmHomeownerProfileSave = useCallback(() => {
    runHomeownerProfileSave();
  }, [runHomeownerProfileSave]);

  const cancelHomeownerProfileSave = useCallback(() => {
    setHomeownerNameConfirmOpen(false);
  }, []);

  const uploadPhoto = useCallback(async (file) => {
    if (!user || !file) return;
    setPhotoError('');
    setPhotoPreview(null);
    setPhotoProgress(0);
    try {
      if (uploadTaskRef.current) uploadTaskRef.current.cancel();
    } catch (_) {}

    if (!file.type || (!file.type.includes('jpeg') && !file.type.includes('png') && !file.type.includes('webp'))) {
      setPhotoError('Only JPEG, PNG, or WebP images are supported.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError('Image must be less than 2MB.');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setPhotoPreview(previewUrl);
    setPhotoBusy(true);

    try {
      const ext = file.type.includes('png') ? 'png' : (file.type.includes('webp') ? 'webp' : 'jpg');
      const path = `profilePhotos/${user.uid}/${Date.now()}.${ext}`;
      const ref = storageRef(storage, path);
      const uploadTask = uploadBytesResumable(ref, file, {
        contentType: file.type,
        customMetadata: {
          uploadedBy: user.uid,
          uploadedAt: new Date().toISOString(),
        },
      });
      uploadTaskRef.current = uploadTask;

      await new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = snapshot.totalBytes
              ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
              : 0;
            setPhotoProgress(progress);
          },
          reject,
          resolve
        );
      });

      const url = await getDownloadURL(ref);
      const token = await user.getIdToken();
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await api.put('/api/me/profile', { photoURL: url }, config);
      const updatedProfile = res?.data?.profile || null;
      if (updatedProfile) {
        setProfile(updatedProfile);
      } else {
        setProfile((prev) => ({ ...(prev || {}), photoURL: url }));
      }
      setSaved('Photo updated successfully!');
      setTimeout(() => setSaved(''), 3000);
    } catch (e) {
      const serverMsg = e?.response?.data?.message;
      const code = e?.code || '';
      if (serverMsg) {
        setPhotoError(serverMsg);
      } else if (code === 'storage/unauthorized' || code === 'storage/unauthenticated') {
        setPhotoError('Upload blocked by Storage permissions.');
      } else if (code === 'storage/canceled') {
        setPhotoError('Upload cancelled.');
      } else {
        setPhotoError('Could not upload your photo. Please try again.');
      }
      setPhotoPreview(null);
    } finally {
      setPhotoBusy(false);
      setPhotoProgress(0);
      uploadTaskRef.current = null;
      if (previewUrl) setTimeout(() => URL.revokeObjectURL(previewUrl), 100);
    }
  }, [setProfile, user]);

  const resendVerification = useCallback(async () => {
    if (!auth.currentUser) return;
    setVerifyMsg('');
    setVerifyBusy(true);
    try {
      await sendEmailVerification(auth.currentUser);
      setVerifyMsg('Verification email sent. Please check your inbox.');
    } catch (_) {
      setVerifyMsg('Could not send verification email. Please try again later.');
    } finally {
      setVerifyBusy(false);
      setTimeout(() => setVerifyMsg(''), 4000);
    }
  }, []);

  const handleHomeownerEmailAction = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const normalizedEmail = String(draftEmail || '').trim().toLowerCase();
    if (!/\S+@\S+\.\S+/.test(normalizedEmail)) {
      setAccountMethodMsgType('error');
      setAccountMethodMsg('Enter a valid email address.');
      return;
    }

    setAccountMethodBusy(true);
    setAccountMethodMsg('');
    try {
      const currentEmail = String(currentUser.email || profile?.email || '').trim().toLowerCase();
      const hasPasswordProvider = homeownerAccountStatus?.passwordLinked === true;

      if (!currentEmail) {
        if (String(emailPassword || '').length < 8) {
          throw new Error('Password must be at least 8 characters.');
        }
        const credential = EmailAuthProvider.credential(normalizedEmail, emailPassword);
        await linkWithCredential(currentUser, credential);
        await sendEmailVerification(currentUser);
        setAccountMethodMsgType('success');
        setAccountMethodMsg('Email added. Please verify it to unlock chat and payment.');
      } else if (normalizedEmail !== currentEmail) {
        await verifyBeforeUpdateEmail(currentUser, normalizedEmail);
        setAccountMethodMsgType('success');
        setAccountMethodMsg('Check your new email for a verification link to finish updating your address.');
      } else if (currentUser.emailVerified !== true) {
        await sendEmailVerification(currentUser);
        setAccountMethodMsgType('success');
        setAccountMethodMsg('Verification email sent. Please check your inbox.');
      } else if (!hasPasswordProvider) {
        if (String(emailPassword || '').length < 8) {
          throw new Error('Password must be at least 8 characters.');
        }
        const credential = EmailAuthProvider.credential(normalizedEmail, emailPassword);
        await linkWithCredential(currentUser, credential);
        setAccountMethodMsgType('success');
        setAccountMethodMsg('Email sign-in added to your account.');
      } else {
        setAccountMethodMsgType('success');
        setAccountMethodMsg('Your email is already verified.');
      }

      setEmailPassword('');
      await refreshMe();
    } catch (e) {
      setAccountMethodMsgType('error');
      setAccountMethodMsg(e?.message || 'Could not update your email right now.');
    } finally {
      setAccountMethodBusy(false);
    }
  }, [draftEmail, emailPassword, homeownerAccountStatus?.passwordLinked, profile?.email, refreshMe]);

  const handleLinkGoogleAccount = useCallback(async () => {
    if (!auth.currentUser) return;
    setAccountMethodBusy(true);
    setAccountMethodMsg('');
    try {
      await linkWithPopup(auth.currentUser, googleProvider);
      setAccountMethodMsgType('success');
      setAccountMethodMsg('Google linked. You can now use it as a sign-in method.');
      await refreshMe();
    } catch (e) {
      setAccountMethodMsgType('error');
      setAccountMethodMsg(e?.message || 'Could not link Google right now.');
    } finally {
      setAccountMethodBusy(false);
    }
  }, [refreshMe]);

  const toggleHomeownerExpandedRow = useCallback((rowId) => {
    setHomeownerExpandedRow((prev) => (prev === rowId ? '' : rowId));
    setAccountMethodMsg('');
    setVerifyMsg('');
  }, []);

  const handleHomeownerPaymentCta = useCallback(() => {
    if (!homeownerAccountStatus.firstName || !String(profile?.lastName || '').trim()) {
      setHomeownerEditingProfile(true);
      return;
    }
    if (!homeownerAccountStatus.phoneVerified) {
      navigate('/settings', {
        state: {
          openRow: 'phone',
          notice: 'Verify your phone to unlock payments.',
        },
      });
      return;
    }
    if (!homeownerAccountStatus.hasDurableMethod) {
      navigate('/settings', {
        state: {
          openRow: 'email',
          notice: 'Add a verified email or continue with Google to unlock payments.',
        },
      });
    }
  }, [homeownerAccountStatus, navigate, profile?.lastName]);

  const handleCancelHomeownerEdit = useCallback(() => {
    resetHomeownerDrafts();
    setHomeownerEditingProfile(false);
    setHomeownerNameConfirmOpen(false);
  }, [resetHomeownerDrafts]);

  const handleToggleHomeownerEdit = useCallback(() => {
    if (homeownerEditingProfile) {
      handleCancelHomeownerEdit();
      return;
    }
    setHomeownerEditingProfile(true);
  }, [handleCancelHomeownerEdit, homeownerEditingProfile]);

  return {
    accountMethodBusy,
    accountMethodMsg,
    accountMethodMsgType,
    busy,
    displayPhotoUrl,
    draftEmail,
    draftFirstName,
    draftLastName,
    emailPassword,
    error,
    handleCancelHomeownerEdit,
    handleHomeownerEmailAction,
    handleHomeownerPaymentCta,
    handleLinkGoogleAccount,
    handleToggleHomeownerEdit,
    headerEmail,
    headerName,
    homeownerAccountStatus,
    homeownerEditingProfile,
    homeownerExpandedRow,
    homeownerMemberSince,
    homeownerNameConfirmOpen,
    homeownerMissingSteps,
    cancelHomeownerProfileSave,
    confirmHomeownerProfileSave,
    photoBusy,
    photoError,
    photoProgress,
    resetHomeownerDrafts,
    refreshMe,
    resendVerification,
    saved,
    saveHomeownerProfile,
    setDraftEmail,
    setDraftFirstName,
    setDraftLastName,
    setEmailPassword,
    setHomeownerExpandedRow,
    setHomeownerEditingProfile,
    toggleHomeownerExpandedRow,
    uploadPhoto,
    verifyBusy,
    verifyMsg,
  };
}
