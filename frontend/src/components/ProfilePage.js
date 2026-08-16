import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db, storage } from '../firebase';
import { createApiClient } from '../api/createApiClient';
import AppHeader from './AppHeader';
import { PageLoadingShell } from './ui/AsyncPageStates';
import PageMain from './ui/PageMain';
import {
  doc,
  getDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { cleanAbn, isValidAbn } from '../utils/abn';
import {
  validateDob,
  hasVerifiedIdentity,
  requiresAbn,
  requiresBusinessName,
  getTodayDate,
  computeReadiness,
} from '../utils/profileCompliance';
import {
  normalizeBusinessName,
  normalizeAbn,
  validateTradieDobOnSave,
  computeTradieFieldErrors,
  buildTradieProfilePayload,
} from './profile/privateDetailsAdapter';
import VerificationGateBanner from './profile/VerificationGateBanner';
import TradieIdentitySection from './profile/TradieIdentitySection';
import TradieExpertiseSection from './profile/TradieExpertiseSection';
import { GoogleActionButton } from './profile/GoogleBrand';
import { ChangeRequestModal, PrivateDetailsConfirmModal } from './profile/ProfileModals';
import TradiePrivateDetailsPanel from './profile/TradiePrivateDetailsPanel';
import useClientAccountState from './profile/useHomeownerAccountState';
import useDebounce from '../hooks/useDebounce';
import './ProfilePage.css';

const EXPERT_PRIVATE_SAVE_SUCCESS = 'Profile updated successfully!';

function profileDobToInputString(dob) {
  if (!dob || typeof dob !== 'object') return '';
  const y = Number(dob.year);
  const m = Number(dob.month);
  const d = Number(dob.day);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Stable comparison for service location objects from profile vs draft. */
function serviceLocationFingerprint(loc) {
  if (!loc || typeof loc !== 'object') return '';
  return [
    String(loc.suburb || '').trim().toLowerCase(),
    String(loc.postcode || '').trim(),
    String(loc.state || '').trim().toLowerCase(),
  ].join('|');
}

const api = createApiClient();
const INNER_MELBOURNE_LAUNCH_MESSAGE = "We're currently launching in inner Melbourne. We'll be in your area soon.";

function fmtTs(ts) {
  if (!ts) return '—';
  if (ts?.seconds) return new Date(ts.seconds * 1000).toLocaleString('en-AU');
  if (ts?._seconds) return new Date(ts._seconds * 1000).toLocaleString('en-AU');
  return '—';
}

function safeStr(v) {
  return typeof v === 'string' ? v : '';
}

function sanitizeBio(input) {
  // Strip HTML tags and limit to plain text
  return String(input || '').replace(/<[^>]*>/g, '').trim();
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, loading] = useAuthState(auth);
  const [profile, setProfile] = useState(null);
  const [claimsIsAdmin, setClaimsIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [expertiseSaving, setExpertiseSaving] = useState(false);
  const [expertiseMsg, setExpertiseMsg] = useState('');
  const [expertiseMsgType, setExpertiseMsgType] = useState('error'); // 'error' | 'success'
  const [draftFirstName, setDraftFirstName] = useState('');
  const [draftLastName, setDraftLastName] = useState('');
  const [draftBusinessName, setDraftBusinessName] = useState('');
  const [draftAbn, setDraftAbn] = useState('');
  const [draftBio, setDraftBio] = useState('');
  const [savedBio, setSavedBio] = useState('');
  const [draftServiceLocation, setDraftServiceLocation] = useState(null);
  const [serviceLocationQuery, setServiceLocationQuery] = useState('');
  const [serviceLocationOpen, setServiceLocationOpen] = useState(false);
  const [serviceLocationResults, setServiceLocationResults] = useState([]);
  const [serviceLocationIndex, setServiceLocationIndex] = useState(-1);
  const [serviceLocationLoading, setServiceLocationLoading] = useState(false);
  const [serviceLocationErr, setServiceLocationErr] = useState('');
  const debouncedServiceLocationQuery = useDebounce(serviceLocationQuery, 750);
  const [draftDob, setDraftDob] = useState(''); // YYYY-MM-DD (input[type=date])
  const [dobError, setDobError] = useState('');
  const [draftBusinessType, setDraftBusinessType] = useState('');
  const [privateSaveConfirmOpen, setPrivateSaveConfirmOpen] = useState(false);
  const privateDetailsLocked = useMemo(() => profile?.privateDetailsLocked === true, [profile?.privateDetailsLocked]);
  const [businessNameError, setBusinessNameError] = useState('');
  const [abnError, setAbnError] = useState('');
  const [abnVerifyBusy, setAbnVerifyBusy] = useState(false);
  const [abnVerifyMsg, setAbnVerifyMsg] = useState('');
  const [draftExpertiseApproved, setDraftExpertiseApproved] = useState([]); // Phase 1 keys
  const [savedExpertiseApproved, setSavedExpertiseApproved] = useState([]); // last saved from server
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoProgress, setPhotoProgress] = useState(0);
  const [photoError, setPhotoError] = useState('');
  const [photoPreview, setPhotoPreview] = useState(null);
  const [changeReqOpen, setChangeReqOpen] = useState(false);
  const [changeReqField, setChangeReqField] = useState('firstName'); // 'firstName' | 'lastName' | 'businessName'
  const [changeReqValue, setChangeReqValue] = useState('');
  const [changeReqReason, setChangeReqReason] = useState('');
  const [changeReqHistory, setChangeReqHistory] = useState([]);
  const [changeReqHistoryLoading, setChangeReqHistoryLoading] = useState(false);
  const [gateBannerDismissed, setGateBannerDismissed] = useState(false);
  const tradieFileRef = useRef(null);
  const homeownerFileRef = useRef(null);

  const gate = location?.state?.gate || '';
  const gateReason = location?.state?.reason || '';
  const gateNext = location?.state?.next || '';

  // Auto-return: after phone is verified, send the user back to where they came from.
  useEffect(() => {
    if (gate !== 'phone') return;
    if (!gateNext) return;
    if (profile?.phoneVerified === true) {
      navigate(gateNext, { replace: true });
    }
  }, [gate, gateNext, profile?.phoneVerified, navigate]);
  const uploadTaskRef = useRef(null);
  const serviceLocationWrapRef = useRef(null);

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [loading, user, navigate]);

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
        const p = meRes?.data?.profile || {};

        // Keep a Firestore-like shape for compatibility with existing UI.
        setProfile(p);
        
        // Split displayName into first and last name (prefer stored parts when displayName is empty)
        const fromStoredParts = [safeStr(p.firstName), safeStr(p.lastName)].filter(Boolean).join(' ').trim();
        const fullName =
          safeStr(p.displayName) || fromStoredParts || safeStr(user.displayName) || '';
        const nameParts = fullName.trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        
        setDraftFirstName(firstName);
        setDraftLastName(lastName);
        setDraftBusinessName(safeStr(p.businessName) || '');
        setDraftAbn(safeStr(p.abn) || '');
        {
          const bio = safeStr(p.bio) || '';
          setDraftBio(bio);
          setSavedBio(bio);
        }
        {
          const approved = Array.isArray(p.expertiseApproved) ? p.expertiseApproved : [];
          setDraftExpertiseApproved(approved);
          setSavedExpertiseApproved(approved);
        }
        {
          const loc = p.serviceLocation && typeof p.serviceLocation === 'object' ? p.serviceLocation : null;
          setDraftServiceLocation(loc);
          setServiceLocationQuery(loc?.label ? String(loc.label) : '');
        }
        {
          const dob = p.dob && typeof p.dob === 'object' ? p.dob : null;
          const y = Number(dob?.year);
          const m = Number(dob?.month);
          const d = Number(dob?.day);
          if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d) && y > 0 && m > 0 && d > 0) {
            const mm = String(m).padStart(2, '0');
            const dd = String(d).padStart(2, '0');
            setDraftDob(`${y}-${mm}-${dd}`);
          } else {
            setDraftDob('');
          }
          setDraftBusinessType(String(p.businessType || ''));
        }
      } catch (e) {
        console.error('Profile read failed:', e);
        // Fallback to Firestore read (best-effort)
        try {
          try {
            const tokenResult = await user.getIdTokenResult();
            setClaimsIsAdmin(Boolean(tokenResult?.claims?.admin));
          } catch (_) {
            // ignore
          }
          const snap = await getDoc(doc(db, 'users', user.uid));
          const data = snap.exists() ? snap.data() : {};
          setProfile(data);
          
          const fullNameFallback = safeStr(data.displayName) || safeStr(data.name) || safeStr(user.displayName) || '';
          const namePartsFallback = fullNameFallback.trim().split(/\s+/);
          const firstNameFallback = namePartsFallback[0] || '';
          const lastNameFallback = namePartsFallback.slice(1).join(' ') || '';
          
          setDraftFirstName(firstNameFallback);
          setDraftLastName(lastNameFallback);
          setDraftBusinessName(safeStr(data.businessName) || '');
          setDraftAbn(safeStr(data.abn) || '');
          {
            const bio = safeStr(data.bio) || '';
            setDraftBio(bio);
            setSavedBio(bio);
          }
          {
            const approved = Array.isArray(data.expertiseApproved) ? data.expertiseApproved : [];
            setDraftExpertiseApproved(approved);
            setSavedExpertiseApproved(approved);
          }
          {
            const loc = data.serviceLocation && typeof data.serviceLocation === 'object' ? data.serviceLocation : null;
            setDraftServiceLocation(loc);
            setServiceLocationQuery(loc?.label ? String(loc.label) : '');
          }
          {
            const dob = data.dob && typeof data.dob === 'object' ? data.dob : null;
            const y = Number(dob?.year);
            const m = Number(dob?.month);
            const d = Number(dob?.day);
            if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d) && y > 0 && m > 0 && d > 0) {
              const mm = String(m).padStart(2, '0');
              const dd = String(d).padStart(2, '0');
              setDraftDob(`${y}-${mm}-${dd}`);
            } else {
              setDraftDob('');
            }
            setDraftBusinessType(String(data.businessType || ''));
          }
        } catch (e2) {
          setProfile({});
        }
        const fallbackNameError = safeStr(user.displayName) || '';
        const namePartsError = fallbackNameError.trim().split(/\s+/);
        setDraftFirstName(namePartsError[0] || '');
        setDraftLastName(namePartsError.slice(1).join(' ') || '');
        setDraftBusinessName('');
        setDraftAbn('');
        setDraftBio('');
        setDraftExpertiseApproved([]);
        setSavedExpertiseApproved([]);
        setSavedBio('');
        if (fallbackNameError || user.email) {
          setError('Some profile details may be unavailable right now. Please refresh if something looks wrong.');
        } else {
          setError('We could not load your profile right now. Please refresh and try again.');
        }
      }
    };
    run();
  }, [user]);

  // Define role early so it can be used in other hooks
  const role = useMemo(() => {
    if (claimsIsAdmin) return 'admin';
    const r = profile?.role;
    if (r === 'tradie' || r === 'homeowner' || r === 'admin') return r;
    return 'homeowner';
  }, [profile, claimsIsAdmin]);
  const {
    accountMethodBusy,
    accountMethodMsg,
    accountMethodMsgType,
    busy: homeownerBusy,
    cancelHomeownerProfileSave,
    confirmHomeownerProfileSave,
    displayPhotoUrl: homeownerDisplayPhotoUrl,
    draftFirstName: homeownerDraftFirstName,
    draftLastName: homeownerDraftLastName,
    error: homeownerError,
    handleCancelHomeownerEdit,
    handleHomeownerPaymentCta,
    handleLinkGoogleAccount,
    handleToggleHomeownerEdit,
    headerEmail: homeownerHeaderEmail,
    headerName: homeownerHeaderName,
    homeownerAccountStatus,
    homeownerEditingProfile,
    setHomeownerEditingProfile,
    homeownerMemberSince,
    homeownerNameConfirmOpen,
    homeownerMissingSteps,
    photoBusy: homeownerPhotoBusy,
    photoError: homeownerPhotoError,
    photoProgress: homeownerPhotoProgress,
    saved: homeownerSaved,
    saveHomeownerProfile,
    setDraftFirstName: setHomeownerDraftFirstName,
    setDraftLastName: setHomeownerDraftLastName,
    uploadPhoto: uploadHomeownerPhoto,
    verifyMsg: homeownerVerifyMsg,
  } = useClientAccountState({
    user,
    profile,
    setProfile,
    navigate,
  });

  const expertiseDirty = useMemo(() => {
    const a = Array.isArray(savedExpertiseApproved) ? [...savedExpertiseApproved].sort().join(',') : '';
    const b = Array.isArray(draftExpertiseApproved) ? [...draftExpertiseApproved].sort().join(',') : '';
    return a !== b;
  }, [savedExpertiseApproved, draftExpertiseApproved]);

  const bioDirty = useMemo(() => {
    const a = String(savedBio || '').trim().replace(/\s+/g, ' ');
    const b = String(draftBio || '').trim().replace(/\s+/g, ' ');
    return a !== b;
  }, [savedBio, draftBio]);

  const bioTooShort = useMemo(() => {
    if (role !== 'tradie') return false;
    const len = String(draftBio || '').trim().length;
    // Only enforce when user has started typing (avoid blocking empty initial state while loading).
    if (len === 0) return false;
    return len < 20;
  }, [role, draftBio]);

  const sectionDirty = bioDirty || expertiseDirty;

  /** Draft private fields vs loaded profile (Expert) — drives unsaved UI and beforeunload. */
  const privateDetailsDirty = useMemo(() => {
    if (role !== 'tradie') return false;
    const p = profile || {};
    const profileDob = profileDobToInputString(p.dob);
    const draftDobStr = String(draftDob || '').trim();
    if (profileDob !== draftDobStr) return true;
    if (String(p.businessType || '') !== String(draftBusinessType || '')) return true;
    if (normalizeAbn(p.abn) !== normalizeAbn(draftAbn)) return true;
    if (serviceLocationFingerprint(p.serviceLocation) !== serviceLocationFingerprint(draftServiceLocation)) {
      return true;
    }
    return false;
  }, [role, profile, draftDob, draftBusinessType, draftAbn, draftServiceLocation]);

  // Compliance-related computed values
  const verifiedIdentity = useMemo(() => hasVerifiedIdentity(profile), [profile]);
  const showAbn = useMemo(() => requiresAbn(draftBusinessType, draftBusinessName), [draftBusinessType, draftBusinessName]);
  const abnRequired = showAbn;
  const businessNameRequired = useMemo(() => requiresBusinessName(draftBusinessType), [draftBusinessType]);
  
  const dobValidation = useMemo(() => validateDob(draftDob), [draftDob]);
  const dobLocked = useMemo(() => role === 'tradie' && privateDetailsLocked, [role, privateDetailsLocked]);
  const businessTypeLocked = useMemo(() => role === 'tradie' && privateDetailsLocked, [role, privateDetailsLocked]);
  const abnLocked = useMemo(() => role === 'tradie' && privateDetailsLocked, [role, privateDetailsLocked]);

  const refreshMe = React.useCallback(async () => {
    if (!user) return;
    try {
      try { await user.reload?.(); } catch (e) {}
      const token = await user.getIdToken(true);
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const meRes = await api.get('/api/me', config);
      const p = meRes?.data?.profile || null;
      if (p) {
        setProfile(p);
      }
    } catch (e) {
      // ignore
    }
  }, [user]);
  
  const readiness = useMemo(() => {
    if (role !== 'tradie') return null;
    const patchedProfile = {
      ...(profile || {}),
      emailVerified: (profile?.emailVerified === true) || (user?.emailVerified === true),
      phoneVerified: profile?.phoneVerified === true,
    };
    return computeReadiness(
      patchedProfile,
      draftDob,
      draftServiceLocation,
      draftBusinessType,
      draftBusinessName,
      draftAbn
    );
  }, [role, profile, draftDob, draftServiceLocation, draftBusinessType, draftBusinessName, draftAbn, user?.emailVerified]);
  // Initialize change request modal when it opens
  useEffect(() => {
    if (changeReqOpen) {
      setChangeReqField('firstName');
      setChangeReqValue(draftFirstName || '');
      setChangeReqReason('');
    }
  }, [changeReqOpen, draftFirstName]);

  const toggleExpertiseLocal = (key) => {
    if (role !== 'tradie') return;
    setExpertiseMsg('');
    setExpertiseMsgType('error');
    setDraftExpertiseApproved((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
    });
  };

  const handleDobChange = (e) => {
    const value = e.target.value;
    setDraftDob(value);
    
    if (value) {
      const validation = validateDob(value);
      setDobError(validation.error || '');
    } else {
      setDobError('');
    }
  };

  const handleBusinessTypeChange = (newType) => {
    setDraftBusinessType(newType);
    setBusinessNameError('');
    setAbnError('');
    setAbnVerifyMsg('');
  };

  const verifyAbnFromProfile = async () => {
    if (!user) return;
    setAbnError('');
    setAbnVerifyMsg('');
    setAbnVerifyBusy(true);
    try {
      const cleaned = cleanAbn(draftAbn);
      if (!cleaned) {
        setAbnError('ABN is required.');
        return;
      }
      if (!isValidAbn(cleaned)) {
        setAbnError('ABN is invalid. Please check and try again.');
        return;
      }
      const token = await user.getIdToken();
      const config = { headers: { Authorization: `Bearer ${token}` } };

      // Persist ABN value (unverified) so it's saved even if verification fails
      await api.put('/api/me/profile', { abn: cleaned }, config);

      // Verify via server (ABR lookup)
      const res = await api.post('/api/me/abn/verify', { abn: cleaned }, config);
      const entityName = res?.data?.details?.entityName || '';
      setAbnVerifyMsg(entityName ? `ABN verified: ${entityName}` : 'ABN verified.');

      // Refresh profile snapshot so readiness/locks update immediately
      const meRes = await api.get('/api/me', config);
      const p = meRes?.data?.profile || null;
      if (p) setProfile(p);
    } catch (e) {
      const serverMsg = e?.response?.data?.message;
      setAbnError(serverMsg || e?.message || 'Failed to verify ABN.');
    } finally {
      setAbnVerifyBusy(false);
    }
  };

  const saveBioAndExpertise = async () => {
    if (!user) return;
    if (role !== 'tradie') return;
    setExpertiseMsg('');
    setExpertiseMsgType('error');
    setExpertiseSaving(true);
    try {
      const token = await user.getIdToken();
      const config = { headers: { Authorization: `Bearer ${token}` } };

      const errors = [];

      // Save bio (if changed)
      if (bioDirty) {
        if (bioTooShort) {
          setExpertiseMsgType('error');
          setExpertiseMsg('Bio must be at least 20 characters.');
          return;
        }
        try {
          const res = await api.put('/api/me/profile', { bio: String(draftBio || '') }, config);
          const updatedProfile = res?.data?.profile || null;
          if (updatedProfile) {
            setProfile(updatedProfile);
          } else {
            setProfile((prev) => ({ ...(prev || {}), bio: String(draftBio || '') }));
          }
          setSavedBio(String(draftBio || ''));
        } catch (e) {
          errors.push(e?.response?.data?.message || 'Failed to save bio.');
        }
      }

      const before = Array.isArray(savedExpertiseApproved) ? savedExpertiseApproved : [];
      const next = Array.isArray(draftExpertiseApproved) ? draftExpertiseApproved : [];
      const beforeSet = new Set(before);
      const nextSet = new Set(next);
      const add = next.filter((k) => !beforeSet.has(k));
      const remove = before.filter((k) => !nextSet.has(k));

      // Save expertise (if changed)
      if (add.length > 0 || remove.length > 0) {
        try {
          const res = await api.put('/api/tradie/expertise', { add, remove }, config);
          const savedList = Array.isArray(res?.data?.expertiseApproved) ? res.data.expertiseApproved : next;
          const profileCompletedFromExpertise =
            typeof res?.data?.profileCompleted === 'boolean' ? res.data.profileCompleted : undefined;
          setSavedExpertiseApproved(savedList);
          setDraftExpertiseApproved(savedList);
          setProfile((prev) => ({
            ...(prev || {}),
            expertiseApproved: savedList,
            ...(profileCompletedFromExpertise !== undefined ? { profileCompleted: profileCompletedFromExpertise } : {}),
          }));
        } catch (e) {
          errors.push(e?.response?.data?.message || 'Failed to save expertise.');
        }
      }

      if (!bioDirty && add.length === 0 && remove.length === 0) {
        setExpertiseMsgType('success');
        setExpertiseMsg('No changes to save.');
        return;
      }

      if (errors.length > 0) {
        setExpertiseMsgType('error');
        setExpertiseMsg(errors[0] || 'Failed to save changes.');
        return;
      }

      setExpertiseMsgType('success');
      setExpertiseMsg('Saved.');
      if (role === 'tradie') {
        setError('');
      }
    } catch (e) {
      setExpertiseMsgType('error');
      setExpertiseMsg(e?.response?.data?.message || 'Failed to update expertise.');
    } finally {
      setExpertiseSaving(false);
    }
  };

  const headerName = [draftFirstName, draftLastName].filter(Boolean).join(' ') || profile?.displayName || profile?.name || user?.displayName || '';
  const headerEmail = profile?.email || user?.email || '';

  const onServiceLocationQueryChange = (v) => {
    const q = String(v || '');
    setServiceLocationQuery(q);
    setDraftServiceLocation(null);
    setServiceLocationErr('');
    setServiceLocationOpen(true);
  };

  const selectServiceLocation = (suburb) => {
    if (!suburb) return;
    const state = suburb?.state?.abbreviation || suburb?.state || '';
    const label = `${suburb.name} ${state} ${suburb.postcode}`.trim();
    const selected = {
      label,
      suburb: suburb.name,
      state,
      postcode: String(suburb.postcode || ''),
      country: 'AU',
    };
    setDraftServiceLocation(selected);
    setServiceLocationQuery(label);
    setServiceLocationOpen(false);
    setServiceLocationResults([]);
    setServiceLocationIndex(-1);
    setServiceLocationErr('');
  };

  // Fetch suburb/postcode suggestions via the same backend proxy used in JobPostingForm step 4.
  useEffect(() => {
    const searchTerm = String(debouncedServiceLocationQuery || '').trim();
    if (searchTerm.length < 2) {
      setServiceLocationResults([]);
      setServiceLocationOpen(false);
      setServiceLocationErr('');
      setServiceLocationLoading(false);
      return;
    }
    const controller = new AbortController();
    setServiceLocationLoading(true);
    setServiceLocationErr('');
    api.get(`/api/suburb-search?q=${encodeURIComponent(searchTerm)}`, { signal: controller.signal })
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        const top = list.slice(0, 10);
        setServiceLocationResults(top);
        setServiceLocationOpen(top.length > 0);
        setServiceLocationIndex(top.length > 0 ? 0 : -1);
        setServiceLocationErr(top.length === 0 ? INNER_MELBOURNE_LAUNCH_MESSAGE : '');
      })
      .catch((e) => {
        if (e?.name === 'CanceledError') return;
        setServiceLocationResults([]);
        setServiceLocationOpen(false);
        setServiceLocationErr(INNER_MELBOURNE_LAUNCH_MESSAGE);
      })
      .finally(() => {
        setServiceLocationLoading(false);
      });
    return () => controller.abort();
  }, [debouncedServiceLocationQuery]);

  // Close service location suggestions when clicking outside.
  useEffect(() => {
    const onDown = (e) => {
      const t = e.target;
      if (serviceLocationWrapRef.current && serviceLocationWrapRef.current.contains(t)) return;
      setServiceLocationOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    if (location?.hash === '#dob') {
      // Give layout a tick to render before scrolling.
      const t = setTimeout(() => {
        const el = document.getElementById('dob-section');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [location?.hash]);

  useEffect(() => {
    if (role !== 'tradie') return undefined;
    const dirty = sectionDirty || privateDetailsDirty;
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [role, sectionDirty, privateDetailsDirty]);

  const onSave = async (confirmedLock = false) => {
    if (!user) return;
    setError('');
    setSaved('');

    // For Task Experts: first-time save of DOB/business type/ABN should show a confirmation
    if (role === 'tradie' && !confirmedLock && !privateDetailsLocked) {
      const willConfirm = Boolean(draftDob) || Boolean(draftBusinessType) || (showAbn && Boolean(String(draftAbn || '').trim()));
      if (willConfirm) {
        setPrivateSaveConfirmOpen(true);
        return;
      }
    }

    // Combine first and last name (homeowner only; Task Experts request changes instead)
    const firstName = String(draftFirstName || '').trim().replace(/\s+/g, ' ');
    const lastName = String(draftLastName || '').trim().replace(/\s+/g, ' ');
    let displayName = [firstName, lastName].filter(Boolean).join(' ');

    if (!displayName) {
      displayName = safeStr(profile?.displayName) || safeStr(profile?.name) || safeStr(user.displayName) || safeStr(user.email || '').split('@')[0] || 'User';
    }
    if (displayName.length > 80) return setError('Name is too long (max 80 characters).');

    const businessName = normalizeBusinessName(draftBusinessName);
    const abn = normalizeAbn(draftAbn);
    const bio = sanitizeBio(draftBio);
    
    if (businessName.length > 120) return setError('Business name is too long (max 120 characters).');
    if (abn.length > 30) return setError('ABN is too long (max 30 characters).');
    if (bio.length > 250) return setError('Bio is too long (max 250 characters).');

    // Task Expert compliance validations (do NOT hard-block save for missing ABN/business name; show field hints instead)
    if (role === 'tradie') {
      const dobErrorMessage = validateTradieDobOnSave(draftDob);
      if (dobErrorMessage) {
        return setError(dobErrorMessage);
      }

      // Field-level hints (not global blockers)
      const fieldErrors = computeTradieFieldErrors({
        businessNameRequired,
        abnRequired,
        businessName,
        abn,
      });
      setBusinessNameError(fieldErrors.businessNameError);
      setAbnError(fieldErrors.abnError);
    }

    const verifiedLocked = profile?.verified === true;
    if (verifiedLocked && role === 'tradie') {
      // Prevent local edits (server also enforces)
      if (displayName !== safeStr(profile?.displayName) && safeStr(profile?.displayName)) {
        return setError('Display name is locked after verification. Please request a change.');
      }
      if (businessName !== safeStr(profile?.businessName) && safeStr(profile?.businessName)) {
        return setError('Business name is locked after verification. Please request a change.');
      }
    }

    setBusy(true);
    try {
      const token = await user.getIdToken();
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const payload = {};

      // Identity/name fields
      if (role !== 'tradie') {
        payload.firstName = firstName;
        payload.lastName = lastName;
        payload.displayName = displayName;
      }

      if (role === 'tradie') {
        const tradiePayloadResult = buildTradieProfilePayload({
          businessName,
          bio,
          draftServiceLocation,
          draftDob,
          draftBusinessType,
          showAbn,
          abn,
          confirmedLock,
        });
        if (tradiePayloadResult.error) {
          setBusy(false);
          return setError(tradiePayloadResult.error);
        }
        Object.assign(payload, tradiePayloadResult.payload);
      }

      const res = await api.put('/api/me/profile', payload, config);
      const updatedProfile = res?.data?.profile || null;
      if (updatedProfile) {
        setProfile(updatedProfile);
      }
      if (role !== 'tradie') {
        setHomeownerEditingProfile(false);
      }
      setSaved(EXPERT_PRIVATE_SAVE_SUCCESS);
      if (role === 'tradie') {
        setExpertiseMsg('');
      }
    } catch (e) {
      console.error('Save error:', e);
      setError(e?.response?.data?.message || e?.message || 'Failed to save profile. Please try again.');
    } finally {
      setBusy(false);
      setTimeout(() => setSaved(''), 3000);
    }
  };

  const uploadPhoto = async (file) => {
    if (!user || !file) return;
    setPhotoError('');
    setPhotoPreview(null);
    setPhotoProgress(0);

    // If a previous upload is still running, cancel it before starting a new one.
    try {
      if (uploadTaskRef.current) uploadTaskRef.current.cancel();
    } catch (_) {}
    
    // Validate file type
    if (!file.type || (!file.type.includes('jpeg') && !file.type.includes('png') && !file.type.includes('webp'))) {
      return setPhotoError('Only JPEG, PNG, or WebP images are supported.');
    }
    
    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      return setPhotoError('Image must be less than 2MB.');
    }

    // Show instant preview
    const previewUrl = URL.createObjectURL(file);
    setPhotoPreview(previewUrl);
    setPhotoBusy(true);

    try {
      const ext = file.type.includes('png') ? 'png' : (file.type.includes('webp') ? 'webp' : 'jpg');
      const path = `profilePhotos/${user.uid}/${Date.now()}.${ext}`;
      const r = storageRef(storage, path);
      
      // Upload with progress tracking
      const uploadTask = uploadBytesResumable(r, file, { 
        contentType: file.type,
        customMetadata: {
          uploadedBy: user.uid,
          uploadedAt: new Date().toISOString()
        }
      });
      uploadTaskRef.current = uploadTask;

      // Guard against uploads hanging indefinitely.
      // - Idle timeout: no progress events for N seconds (e.g. blocked request)
      // - Overall timeout: very conservative cap (slow networks)
      const IDLE_TIMEOUT_MS = 45 * 1000;
      const OVERALL_TIMEOUT_MS = 3 * 60 * 1000;
      let idleTimeoutId;
      let overallTimeoutId;
      let unsub = null;
      let rejectIdle = null;
      const armIdleTimeout = () => {
        if (idleTimeoutId) clearTimeout(idleTimeoutId);
        idleTimeoutId = setTimeout(() => {
          try { uploadTask.cancel(); } catch (_) {}
          if (rejectIdle) rejectIdle(Object.assign(new Error('upload_stalled'), { code: 'upload_stalled' }));
        }, IDLE_TIMEOUT_MS);
      };

      const uploadPromise = new Promise((resolve, reject) => {
        unsub = uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = snapshot.totalBytes
              ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
              : 0;
            setPhotoProgress(progress);
            armIdleTimeout();
          },
          (error) => {
            console.error('Upload error:', error);
            reject(error);
          },
          () => resolve()
        );
      });

      const idlePromise = new Promise((_, reject) => {
        rejectIdle = reject;
      });

      const timeoutPromise = new Promise((_, reject) => {
        overallTimeoutId = setTimeout(() => {
          try { uploadTask.cancel(); } catch (_) {}
          reject(Object.assign(new Error('upload_timeout'), { code: 'upload_timeout' }));
        }, OVERALL_TIMEOUT_MS);
      });

      try {
        // Start timers once the listeners are attached.
        armIdleTimeout();
        await Promise.race([uploadPromise, idlePromise, timeoutPromise]);
      } finally {
        if (idleTimeoutId) clearTimeout(idleTimeoutId);
        if (overallTimeoutId) clearTimeout(overallTimeoutId);
        try { if (unsub) unsub(); } catch (_) {}
      }

      // Get download URL
      const url = await getDownloadURL(r);

      // Persist via backend (enforces locks + sanitisation)
      const token = await user.getIdToken();
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await api.put('/api/me/profile', { photoURL: url, profilePhotoPath: path }, config);
      const updatedProfile = res?.data?.profile || null;
      if (updatedProfile) {
        setProfile(updatedProfile);
      } else {
        setProfile((p) => ({ ...(p || {}), photoURL: url, profilePhotoPath: path }));
      }
      setSaved('Photo updated successfully!');
      setTimeout(() => setSaved(''), 3000);
    } catch (e) {
      console.error('Photo upload error:', e);
      // Surface the real reason to help debugging (permissions vs backend validation vs network)
      const serverMsg = e?.response?.data?.message;
      const code = e?.code || '';
      if (e?.message === 'upload_timeout' || code === 'upload_timeout') {
        setPhotoError('Upload is taking too long. Please try a smaller image, check your connection, and try again. If this keeps happening, verify Firebase Storage is enabled and the storage bucket/rules are configured correctly.');
      } else if (e?.message === 'upload_stalled' || code === 'upload_stalled') {
        setPhotoError('Upload stalled (no progress). This usually means the request is blocked (Storage rules/App Check/bucket config/ad blocker/VPN). Please check Firebase Storage configuration and try again.');
      } else
      if (serverMsg) {
        setPhotoError(serverMsg);
      } else if (code === 'storage/unauthorized' || code === 'storage/unauthenticated') {
        setPhotoError('Upload blocked by Storage permissions. Please ensure Storage rules allow profilePhotos/{uid}/… for signed-in users.');
      } else if (code === 'storage/canceled') {
        setPhotoError('Upload cancelled.');
      } else if (code) {
        setPhotoError(`Upload failed (${code}). Please try again.`);
      } else {
        setPhotoError('Could not upload your photo. Please try again.');
      }
      setPhotoPreview(null);
    } finally {
      setPhotoBusy(false);
      setPhotoProgress(0);
      uploadTaskRef.current = null;
      // Clean up preview URL
      if (previewUrl) {
        setTimeout(() => URL.revokeObjectURL(previewUrl), 100);
      }
    }
  };

  const handleChangeRequestFieldChange = (field) => {
    setChangeReqField(field);
    // Update the value based on selected field
    if (field === 'firstName') {
      setChangeReqValue(draftFirstName || '');
    } else if (field === 'lastName') {
      setChangeReqValue(draftLastName || '');
    } else if (field === 'businessName') {
      setChangeReqValue(draftBusinessName || '');
    }
  };

  const loadChangeRequestHistory = async () => {
    if (!user) return;
    setChangeReqHistoryLoading(true);
    try {
      const token = await user.getIdToken();
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await api.get('/api/me/profile/change-requests', config);
      setChangeReqHistory(res?.data?.items || []);
    } catch (e) {
      console.error('Load change request history failed:', e);
      // keep silent - non-blocking
    } finally {
      setChangeReqHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    // Only relevant when tradie profiles are verified (identity fields locked)
    if (role !== 'tradie') return;
    loadChangeRequestHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, role]);

  const submitChangeRequest = async () => {
    if (!user) return;
    
    // Validation
    if (!changeReqValue.trim()) {
      setError('Please enter a new value for the field.');
      return;
    }
    if (!changeReqReason.trim()) {
      setError('Please provide a reason for the change.');
      return;
    }
    
    setError('');
    setSaved('');
    setBusy(true);
    try {
      const token = await user.getIdToken();
      const config = { headers: { Authorization: `Bearer ${token}` } };
      await api.post('/api/me/profile/change-request', {
        field: changeReqField,
        requestedValue: changeReqValue.trim(),
        reason: changeReqReason.trim(),
      }, config);
      setSaved('Change request submitted. Our team will review it.');
      // Refresh history so the user can see it immediately.
      loadChangeRequestHistory();
      setChangeReqOpen(false);
      setChangeReqField('firstName');
      setChangeReqValue('');
      setChangeReqReason('');
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to submit change request.');
    } finally {
      setBusy(false);
    }
  };

  const closeChangeRequestModal = () => {
    setChangeReqOpen(false);
    setChangeReqField('firstName');
    setChangeReqValue('');
    setChangeReqReason('');
  };

  const bioCharsRemaining = 250 - draftBio.length;

  if (loading || !user) {
    return (
      <PageLoadingShell message="Loading profile…" detail="Getting your profile and verification settings." />
    );
  }

  const displayPhotoUrl = photoPreview || profile?.photoURL || profile?.profilePhotoURL;
  const activeSaved = role === 'tradie' ? saved : homeownerSaved;
  const suppressTopSavedForExpertPrivate =
    role === 'tradie' && saved === EXPERT_PRIVATE_SAVE_SUCCESS;
  const activeVerifyMsg = role === 'tradie' ? '' : homeownerVerifyMsg;
  const activeError = role === 'tradie' ? error : homeownerError;
  const activeAccountMethodMsg = role === 'tradie' ? '' : accountMethodMsg;
  const pageHeaderName = role === 'tradie' ? headerName : homeownerHeaderName;
  const pageHeaderEmail = role === 'tradie' ? headerEmail : homeownerHeaderEmail;

  return (
    <>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .profile-input:focus, .profile-textarea:focus {
          border-color: #14C5C5 !important;
          box-shadow: 0 0 0 3px rgba(20, 197, 197, 0.1) !important;
        }
        .location-typeahead-item:hover {
          background-color: #F9FAFB !important;
        }
        .smart-input-clear-btn:hover {
          background-color: #F3F4F6 !important;
        }
        .smart-location-input:focus {
          border-color: #14C5C5 !important;
          box-shadow: 0 0 0 3px rgba(20, 197, 197, 0.1) !important;
        }
        .profile-link-btn:hover {
          color: #0f9c9c !important;
          text-decoration-color: #0f9c9c !important;
        }
        .profile-photo-btn:hover:not(:disabled) {
          background: #e5e7eb !important;
          border-color: #9ca3af !important;
          transform: translateY(-1px);
          color: #374151 !important;
          text-decoration: underline;
        }
        .profile-card {
          transition: box-shadow 0.2s ease;
        }
        .profile-card:hover {
          box-shadow: 0 4px 20px rgba(0,0,0,0.08) !important;
        }
        button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        button:active:not(:disabled) {
          transform: translateY(0);
        }
        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        label:has(input[type="checkbox"]):hover {
          background: #E0F7F7 !important;
          border-color: #14C5C5 !important;
        }
        .request-change-btn:hover {
          color: #0f9c9c !important;
        }
        @media (max-width: 900px) {
          .name-business-row {
            grid-template-columns: 1fr !important;
          }
          .payment-hero,
          .security-row-main {
            flex-direction: column !important;
          }
          .payment-cta-col,
          .security-row-meta {
            width: 100% !important;
          }
          .payment-cta-col button,
          .homeowner-actions-row button,
          .security-row-meta button {
            width: 100% !important;
          }
        }
        @media (max-width: 640px) {
          .homeowner-actions-row {
            flex-direction: column !important;
            align-items: stretch !important;
          }
        }
      `}</style>

      {/* Verification gate banner (e.g., redirected from payment/chat) */}
      <VerificationGateBanner
        dismissed={gateBannerDismissed}
        gate={gate}
        reason={gateReason}
        next={gateNext}
        onDismiss={() => setGateBannerDismissed(true)}
      />

      <AppHeader userRole={role} userName={pageHeaderName} userEmail={pageHeaderEmail} />
      <PageMain label="Profile">
      <div
        style={styles.page}
        className={role === 'tradie' ? 'pp-profile-page pp-profile-page--expert' : 'pp-profile-page'}
      >
        <div style={styles.container} className="pp-profile-container">
          {/* Page Header */}
          <div
            style={styles.pageHeader}
            className={role === 'tradie' ? 'pp-expert-profile-header' : undefined}
          >
            <div>
              <h1
                style={styles.pageTitle}
                className={role === 'tradie' ? 'pp-expert-page-title' : undefined}
              >
                My Profile
              </h1>
              <p
                style={styles.pageSubtitle}
                className={role === 'tradie' ? 'pp-expert-page-subtitle' : undefined}
              >
                {role === 'tradie' 
                  ? 'Build trust with Clients by completing your professional profile'
                  : role === 'admin'
                    ? 'Manage your admin identity and keep your account details current.'
                    : 'Update your details for a smoother Taskio experience'}
              </p>
            </div>
          </div>

          {/* Notifications */}
          {activeSaved && !suppressTopSavedForExpertPrivate && (
            <div
              style={styles.successBanner}
              className={role === 'tradie' ? 'pp-expert-inline-banner' : undefined}
              role="status"
              aria-live="polite"
            >
              <span style={styles.successIcon} aria-hidden="true">
                ✓
              </span>{' '}
              {activeSaved}
            </div>
          )}
          {activeVerifyMsg && (
            <div
              style={styles.successBanner}
              className={role === 'tradie' ? 'pp-expert-inline-banner' : undefined}
              role="status"
              aria-live="polite"
            >
              <span style={styles.successIcon} aria-hidden="true">
                ✓
              </span>{' '}
              {activeVerifyMsg}
            </div>
          )}
          {activeError && (
            <div
              style={activeError.includes('unavailable') ? styles.warningBanner : styles.errorBanner}
              className={role === 'tradie' ? 'pp-expert-inline-banner' : undefined}
              role={activeError.includes('unavailable') ? 'status' : 'alert'}
              aria-live={activeError.includes('unavailable') ? 'polite' : 'assertive'}
            >
              {activeError}
            </div>
          )}
          {activeAccountMethodMsg && (
            <div
              style={accountMethodMsgType === 'error' ? styles.errorBanner : styles.successBanner}
              role={accountMethodMsgType === 'error' ? 'alert' : 'status'}
              aria-live={accountMethodMsgType === 'error' ? 'assertive' : 'polite'}
            >
              {accountMethodMsgType !== 'error' ? (
                <span style={styles.successIcon} aria-hidden="true">
                  ✓
                </span>
              ) : null}
              {activeAccountMethodMsg}
            </div>
          )}

          {/* Public Profile Section (Tradie only) */}
          {role === 'tradie' && (
            <div
              style={styles.profileCard}
              className={`pp-expert-public-profile pp-expert-profile-card${sectionDirty ? ' pp-expert-public-profile--dirty' : ''}`}
            >
              <div style={styles.cardHeader} className="pp-expert-card-header">
                <div>
                  <h2 style={styles.cardTitle}>Public profile</h2>
                  <p style={styles.cardSubtitle} className="pp-expert-public-lede">
                    What Clients see when they view your Expert profile — identity, your story, and the task types you
                    offer.
                  </p>
                </div>
              </div>

              <div style={styles.formSection} className="pp-expert-public-form">
                <TradieIdentitySection
                  styles={styles}
                  profile={profile}
                  displayPhotoUrl={displayPhotoUrl}
                  headerName={headerName}
                  headerEmail={headerEmail}
                  tradieFileRef={tradieFileRef}
                  onPhotoSelect={uploadPhoto}
                  photoBusy={photoBusy}
                  photoProgress={photoProgress}
                  photoError={photoError}
                  businessNameRequired={businessNameRequired}
                  draftFirstName={draftFirstName}
                  draftLastName={draftLastName}
                  draftBusinessName={draftBusinessName}
                  onDraftFirstNameChange={setDraftFirstName}
                  onDraftLastNameChange={setDraftLastName}
                  onDraftBusinessNameChange={setDraftBusinessName}
                  businessNameError={businessNameError}
                  onOpenChangeRequest={() => setChangeReqOpen(true)}
                  changeReqHistoryLoading={changeReqHistoryLoading}
                  changeReqHistory={changeReqHistory}
                />

                <TradieExpertiseSection
                  styles={styles}
                  draftBio={draftBio}
                  onDraftBioChange={setDraftBio}
                  bioTooShort={bioTooShort}
                  draftExpertiseApproved={draftExpertiseApproved}
                  toggleExpertiseLocal={toggleExpertiseLocal}
                  expertiseSaving={expertiseSaving}
                  expertiseMsg={expertiseMsg}
                  expertiseMsgType={expertiseMsgType}
                  sectionDirty={sectionDirty}
                  onSavePublicProfile={saveBioAndExpertise}
                />
              </div>
            </div>
          )}

          {/* Private Details & Verification Section */}
          {role === 'tradie' ? (
            <div
              style={styles.profileCard}
              className={`pp-expert-private-card pp-expert-profile-card${privateDetailsDirty ? ' pp-expert-private-card--dirty' : ''}`}
            >
              <div style={styles.cardHeader} className="pp-expert-card-header">
                <div>
                  <h2 style={styles.cardTitle}>Private details & verification</h2>
                  <p style={styles.cardSubtitle}>
                    Complete these details so you’re ready to quote for Clients. Save when you make changes.
                  </p>
                </div>
              </div>

              <div style={styles.formSection} className="pp-expert-private-form">
                <TradiePrivateDetailsPanel
                  styles={styles}
                  readiness={readiness}
                  onProfileRefresh={refreshMe}
                  serviceLocationWrapRef={serviceLocationWrapRef}
                  serviceLocationQuery={serviceLocationQuery}
                  onServiceLocationQueryChange={onServiceLocationQueryChange}
                  serviceLocationResults={serviceLocationResults}
                  setServiceLocationOpen={setServiceLocationOpen}
                  serviceLocationOpen={serviceLocationOpen}
                  serviceLocationIndex={serviceLocationIndex}
                  setServiceLocationIndex={setServiceLocationIndex}
                  selectServiceLocation={selectServiceLocation}
                  draftServiceLocation={draftServiceLocation}
                  setDraftServiceLocation={setDraftServiceLocation}
                  setServiceLocationQuery={setServiceLocationQuery}
                  setServiceLocationResults={setServiceLocationResults}
                  serviceLocationErr={serviceLocationErr}
                  serviceLocationLoading={serviceLocationLoading}
                  businessTypeLocked={businessTypeLocked}
                  draftBusinessType={draftBusinessType}
                  onBusinessTypeChange={handleBusinessTypeChange}
                  showAbn={showAbn}
                  abnRequired={abnRequired}
                  draftAbn={draftAbn}
                  setDraftAbn={setDraftAbn}
                  abnLocked={abnLocked}
                  profileAbnVerified={profile?.abnVerified === true}
                  verifyAbnFromProfile={verifyAbnFromProfile}
                  verifiedIdentity={verifiedIdentity}
                  abnVerifyBusy={abnVerifyBusy}
                  abnError={abnError}
                  abnVerifyMsg={abnVerifyMsg}
                  dobLocked={dobLocked}
                  draftDob={draftDob}
                  onDobChange={handleDobChange}
                  maxDobDate={getTodayDate()}
                  dobError={dobError}
                  dobValidation={dobValidation}
                  memberSince={fmtTs(profile?.createdAt)}
                />
              </div>

              <div
                style={styles.actionRow}
                className={`pp-expert-private-save-row${
                  privateDetailsDirty || saved === EXPERT_PRIVATE_SAVE_SUCCESS ? '' : ' pp-expert-private-save-row--clean'
                }`}
              >
                {privateDetailsDirty || saved === EXPERT_PRIVATE_SAVE_SUCCESS ? (
                  <div className="pp-expert-save-toolbar" aria-live="polite">
                    {privateDetailsDirty ? (
                      <span className="pp-save-pill pp-save-pill--unsaved">Unsaved changes</span>
                    ) : null}
                    {saved === EXPERT_PRIVATE_SAVE_SUCCESS ? (
                      <span className="pp-save-pill pp-save-pill--success" role="status">
                        Private details saved
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <button
                  type="button"
                  style={styles.saveButton}
                  onClick={() => onSave(false)}
                  disabled={busy || bioCharsRemaining < 0 || !privateDetailsDirty}
                >
                  {busy ? 'Saving…' : 'Save private details'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={styles.profileCard} className="profile-card">
                <div style={styles.cardHeader}>
                  <div>
                    <h2 style={styles.cardTitle}>Profile</h2>
                  </div>
                  <button
                    type="button"
                    style={styles.sectionActionButton}
                    onClick={handleToggleHomeownerEdit}
                  >
                    {homeownerEditingProfile ? 'Cancel' : 'Edit profile'}
                  </button>
                </div>

                <div style={styles.profileHeader}>
                  <div style={styles.avatarSection}>
                    <div style={styles.avatarWrapLarge}>
                      {homeownerDisplayPhotoUrl ? (
                        <img src={homeownerDisplayPhotoUrl} alt="Profile" style={styles.avatarImg} />
                      ) : (
                        <div style={styles.avatarFallback}>{(homeownerHeaderName || homeownerHeaderEmail || 'U').slice(0, 2).toUpperCase()}</div>
                      )}
                    </div>
                    <input
                      ref={homeownerFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: 'none' }}
                      onChange={(e) => uploadHomeownerPhoto(e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      style={styles.photoButton}
                      className="profile-photo-btn"
                      onClick={() => homeownerFileRef.current?.click()}
                      disabled={homeownerPhotoBusy}
                    >
                      {homeownerPhotoBusy ? (
                        <>
                          <span style={styles.buttonSpinner}>↻</span> Uploading {homeownerPhotoProgress}%
                        </>
                      ) : (
                        <>{homeownerDisplayPhotoUrl ? 'Change photo' : 'Upload photo'}</>
                      )}
                    </button>
                    {homeownerPhotoError && <div style={styles.photoError}>{homeownerPhotoError}</div>}
                  </div>

                  <div style={styles.profileInfo}>
                    <div style={styles.profileName}>{homeownerHeaderName || 'Add your name'}</div>
                    <div style={styles.profileMetaText}>Member since {homeownerMemberSince}</div>
                    <div style={styles.profileBadgeRow}>
                      <span style={styles.roleBadge}>{role === 'admin' ? 'Admin' : 'Client'}</span>
                    </div>
                    <div style={styles.nameGuidance}>
                      {role === 'admin'
                        ? 'Keep your name accurate so operational activity is clearly attributed.'
                        : 'Your name is used for payments and receipts. Make sure it&apos;s accurate.'}
                    </div>
                    {role === 'admin' ? (
                      <div style={styles.adminProfileMeta}>Use the top-right menu to manage your password.</div>
                    ) : null}
                  </div>
                </div>

                {homeownerEditingProfile ? (
                  <>
                    <div style={styles.privateFieldRow}>
                      <div style={styles.privateFieldCol}>
                        <label htmlFor="homeowner-first-name" style={styles.fieldLabel}>
                          First name <span style={styles.required}>*</span>
                        </label>
                        <input
                          id="homeowner-first-name"
                          value={homeownerDraftFirstName}
                          onChange={(e) => setHomeownerDraftFirstName(e.target.value)}
                          style={styles.textInput}
                          className="profile-input"
                          autoComplete="given-name"
                        />
                      </div>
                      <div style={styles.privateFieldCol}>
                        <label htmlFor="homeowner-last-name" style={styles.fieldLabel}>
                          Last name <span style={styles.required}>*</span>
                        </label>
                        <input
                          id="homeowner-last-name"
                          value={homeownerDraftLastName}
                          onChange={(e) => setHomeownerDraftLastName(e.target.value)}
                          style={styles.textInput}
                          className="profile-input"
                          autoComplete="family-name"
                        />
                      </div>
                    </div>

                    <div style={styles.homeownerActionsRow} className="homeowner-actions-row">
                      <button
                        type="button"
                        style={styles.saveButton}
                        onClick={saveHomeownerProfile}
                        disabled={homeownerBusy}
                      >
                        {homeownerBusy ? 'Saving…' : 'Save profile'}
                      </button>
                      <button
                        type="button"
                        style={styles.secondaryActionButton}
                        onClick={handleCancelHomeownerEdit}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : null}
              </div>

              {role !== 'admin' ? (
                <div style={{ ...styles.profileCard, ...(homeownerAccountStatus?.durableAccountReady ? styles.paymentReadyCard : styles.paymentNeedsAttentionCard) }} className="profile-card">
                  <div style={styles.paymentHero} className="payment-hero">
                    <div style={styles.paymentHeroText}>
                      <div style={styles.paymentEyebrow}>PAYMENT READINESS</div>
                      <div style={styles.paymentHeroTitle}>
                        {homeownerAccountStatus?.durableAccountReady
                          ? 'You are ready to make payments.'
                          : "You're not ready to make payments yet"}
                      </div>
                      <div style={styles.paymentHeroBody}>
                        {homeownerAccountStatus?.durableAccountReady
                          ? 'You can accept a quote and pay securely through Stripe whenever you are ready.'
                          : 'Add a verified email or continue with Google to unlock payments.'}
                      </div>
                      {!homeownerAccountStatus?.durableAccountReady && homeownerMissingSteps.length > 0 ? (
                        <div style={styles.paymentSupportMeta}>
                          Next: {homeownerMissingSteps.join(' • ')}
                        </div>
                      ) : null}
                      <div style={styles.paymentTrustText}>Secure payments powered by Stripe</div>
                    </div>

                    {!homeownerAccountStatus?.durableAccountReady && (
                      <div style={styles.paymentCtaCol} className="payment-cta-col">
                        <button
                          type="button"
                          style={styles.paymentPrimaryButton}
                          onClick={handleHomeownerPaymentCta}
                        >
                          Verify email to unlock payments
                        </button>
                        {!homeownerAccountStatus?.googleLinked && !homeownerAccountStatus?.emailVerified && (
                          <GoogleActionButton
                            style={styles.paymentSecondaryButton}
                            onClick={handleLinkGoogleAccount}
                            disabled={accountMethodBusy}
                          >
                            {accountMethodBusy ? 'Saving…' : 'Continue with Google'}
                          </GoogleActionButton>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </>
          )}

          {role === 'tradie' && (
            <PrivateDetailsConfirmModal
              open={privateSaveConfirmOpen}
              onClose={() => setPrivateSaveConfirmOpen(false)}
              onConfirm={() => {
                setPrivateSaveConfirmOpen(false);
                onSave(true);
              }}
              styles={styles}
            />
          )}

          {role === 'homeowner' && homeownerNameConfirmOpen && (
            <div style={styles.modalOverlay} role="presentation">
              <div style={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="confirm-homeowner-name-title">
                <div style={styles.modalHeader}>
                  <div>
                    <div id="confirm-homeowner-name-title" style={styles.modalTitle}>Confirm name change</div>
                    <div style={styles.modalBodyText}>
                      Changing your name may affect receipts and past transactions.
                    </div>
                  </div>
                  <button
                    type="button"
                    style={styles.modalClose}
                    onClick={cancelHomeownerProfileSave}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                <div style={styles.modalActions}>
                  <button
                    type="button"
                    style={styles.buttonSecondary}
                    onClick={cancelHomeownerProfileSave}
                    disabled={homeownerBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    style={styles.buttonPrimary}
                    onClick={confirmHomeownerProfileSave}
                    disabled={homeownerBusy}
                  >
                    {homeownerBusy ? 'Saving…' : 'Confirm change'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <ChangeRequestModal
            open={changeReqOpen}
            onClose={closeChangeRequestModal}
            styles={styles}
            changeReqField={changeReqField}
            onFieldChange={handleChangeRequestFieldChange}
            changeReqValue={changeReqValue}
            onChangeReqValue={setChangeReqValue}
            changeReqReason={changeReqReason}
            onChangeReqReason={setChangeReqReason}
            draftFirstName={draftFirstName}
            draftLastName={draftLastName}
            draftBusinessName={draftBusinessName}
            onSubmit={submitChangeRequest}
            busy={busy}
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
  title: { fontFamily: 'Poppins, sans-serif', fontSize: 22, fontWeight: 900, color: '#222' },
  subTitle: { fontSize: 13, color: '#666', marginTop: 4 },
  card: { background: '#fff', border: '1px solid #E0E0E0', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginTop: 16 },
  sectionTitle: { 
    fontSize: 16, 
    fontWeight: 900, 
    color: '#222', 
    marginBottom: 16, 
    paddingBottom: 12, 
    borderBottom: '1px solid #E0E0E0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  sectionHint: { fontSize: 12, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px' },
  error: { background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', padding: '12px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12 },
  warning: { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '12px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12 },
  success: { background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '12px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12, fontWeight: 600 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 },
  labelRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 7 },
  label: { fontSize: 12, fontWeight: 900, color: '#555', marginBottom: 7 },
  hint: { fontSize: 11, color: '#888', marginTop: 6, lineHeight: 1.4 },
  input: { width: '100%', boxSizing: 'border-box', borderRadius: 10, border: '1px solid #E0E0E0', padding: '11px 13px', fontSize: 14, fontFamily: 'Inter, sans-serif' },
  buttonPrimary: { background: '#14C5C5', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 18px', cursor: 'pointer', fontWeight: 900, fontSize: 14 },
  buttonSecondary: { background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 10, padding: '11px 18px', cursor: 'pointer', fontWeight: 900, fontSize: 14 },
  buttonDanger: { background: '#DC3545', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 18px', fontWeight: 900, fontSize: 14 },
  buttonDangerSecondary: { background: '#fff', color: '#DC3545', border: '1px solid #DC3545', borderRadius: 10, padding: '11px 18px', fontWeight: 900, fontSize: 14, cursor: 'pointer' },
  buttonSecondarySm: { background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 10, padding: '8px 12px', cursor: 'pointer', fontWeight: 900, fontSize: 12 },
  buttonPrimarySm: { background: '#14C5C5', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 12px', cursor: 'pointer', fontWeight: 900, fontSize: 12 },
  avatarWrap: { width: 80, height: 80, borderRadius: 16, overflow: 'hidden', border: '2px solid #E0E0E0', background: '#F7F9FA', flexShrink: 0 },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  avatarFallback: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 24, color: '#0f766e' },
  pill: { display: 'inline-block', fontSize: 11, fontWeight: 900, padding: '5px 11px', borderRadius: 999, border: '1px solid #E0E0E0', background: '#F7F9FA', color: '#555', textTransform: 'capitalize' },
  pillOk: { background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' },
  pillWarn: { background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' },
  verifiedBadge: { background: '#52D68A', color: '#fff', borderRadius: 999, padding: '5px 10px', fontSize: 11, fontWeight: 900 },
  linkBtn: { background: 'transparent', border: 'none', color: '#14C5C5', fontWeight: 900, cursor: 'pointer', fontSize: 12, padding: 0 },
  smallOk: { fontSize: 12, fontWeight: 900, color: '#15803d', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '6px 10px', borderRadius: 999 },
  smallWarn: { fontSize: 12, fontWeight: 900, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', padding: '6px 10px', borderRadius: 999 },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 1000,
  },
  modalCard: {
    width: 'min(560px, 100%)',
    background: '#fff',
    borderRadius: 14,
    border: '1px solid #E0E0E0',
    boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
    padding: 16,
  },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  modalClose: { background: 'transparent', border: 'none', fontSize: 22, lineHeight: 1, cursor: 'pointer', color: '#444', padding: '6px 10px', borderRadius: 10 },
  modalTitle: { fontFamily: 'Poppins, sans-serif', fontSize: 20, fontWeight: 700, color: '#222', marginBottom: 8 },
  modalBodyText: { fontSize: 14, color: '#5F6368', lineHeight: 1.6 },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20, flexWrap: 'wrap' },
  
  // Modern profile page styles
  pageHeader: { marginBottom: 32 },
  pageTitle: { fontFamily: 'Poppins, sans-serif', fontSize: 28, fontWeight: 700, color: '#222', margin: 0, marginBottom: 8 },
  pageSubtitle: { fontSize: 15, color: '#666', margin: 0, lineHeight: 1.5 },
  successBanner: { background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '14px 18px', borderRadius: 12, fontSize: 14, marginBottom: 20, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 },
  successIcon: { fontSize: 18, fontWeight: 900 },
  warningBanner: { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '14px 18px', borderRadius: 12, fontSize: 14, marginBottom: 20 },
  errorBanner: { background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', padding: '14px 18px', borderRadius: 12, fontSize: 14, marginBottom: 20 },
  
  profileCard: { background: '#fff', border: '1px solid #E0E0E0', borderRadius: 16, padding: 32, boxShadow: '0 2px 12px rgba(0,0,0,0.04)', marginBottom: 24, transition: 'box-shadow 0.2s' },
  cardHeader: { marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
  cardTitle: { fontFamily: 'Poppins, sans-serif', fontSize: 20, fontWeight: 700, color: '#222', margin: 0, marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: '#666', margin: 0, lineHeight: 1.5 },
  
  profileHeader: { display: 'flex', gap: 24, alignItems: 'flex-start', marginBottom: 32, flexWrap: 'wrap' },
  avatarSection: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  avatarWrapLarge: { width: 100, height: 100, borderRadius: 20, overflow: 'hidden', border: '3px solid #E0E0E0', background: '#F7F9FA', flexShrink: 0, transition: 'border-color 0.2s' },
  photoButton: { background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 10, padding: '10px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', transition: 'all 0.2s', fontFamily: 'Inter, sans-serif' },
  photoError: { fontSize: 12, color: '#9f1239', maxWidth: 200, textAlign: 'center', marginTop: 4 },
  buttonSpinner: { display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: 16 },
  savingIndicator: { fontSize: 12, color: '#14C5C5', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 },
  
  profileInfo: { flex: 1, minWidth: 200 },
  profileName: { fontFamily: 'Poppins, sans-serif', fontSize: 22, fontWeight: 700, color: '#222', marginBottom: 6 },
  profileBusiness: { fontSize: 15, color: '#666', marginBottom: 12 },
  badgeRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  roleBadge: { display: 'inline-block', fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999, background: '#E0F7F7', color: '#0f766e', textTransform: 'capitalize' },
  
  // Improved profile header with better hierarchy
  profileHeaderImproved: { display: 'flex', gap: 32, alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', paddingBottom: 24, borderBottom: '1px solid #E0E0E0' },
  avatarSectionCentered: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  avatarWrapLarger: { width: 120, height: 120, borderRadius: 24, overflow: 'hidden', border: '4px solid #E0E0E0', background: '#F7F9FA', flexShrink: 0, transition: 'border-color 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  photoButtonSubtle: { background: 'transparent', color: '#666', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 500, fontSize: 12, transition: 'all 0.2s', fontFamily: 'Inter, sans-serif' },
  
  profileInfoImproved: { flex: 1, minWidth: 240 },
  profileNameLarge: { fontFamily: 'Poppins, sans-serif', fontSize: 26, fontWeight: 700, color: '#111', marginBottom: 6, lineHeight: 1.2 },
  profileBusinessSubtle: { fontSize: 16, color: '#666', marginBottom: 14, fontWeight: 500 },
  badgeRowInline: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  roleBadgeSubtle: { display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 999, background: '#F7F9FA', color: '#666', textTransform: 'capitalize', border: '1px solid #E0E0E0' },
  verifiedBadgeWithTooltip: { display: 'inline-flex', alignItems: 'center', background: '#52D68A', color: '#fff', borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'help', boxShadow: '0 2px 6px rgba(82, 214, 138, 0.3)' },
  
  formSection: { display: 'flex', flexDirection: 'column', gap: 32 },
  formGroup: { display: 'flex', flexDirection: 'column' },
  labelContainer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8, minHeight: 32 },
  fieldLabel: { fontSize: 13, fontWeight: 700, color: '#374151', fontFamily: 'Inter, sans-serif', margin: 0 },
  required: { color: '#DC3545', marginLeft: 2 },
  lockIcon: { fontSize: 14, marginLeft: 8, marginRight: 4 },
  linkButton: { background: 'transparent', border: 'none', color: '#14C5C5', fontWeight: 700, cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline', transition: 'color 0.2s' },
  charCounter: { fontSize: 12, color: '#999', fontWeight: 600 },
  
  textInput: { width: '100%', boxSizing: 'border-box', borderRadius: 10, border: '1.5px solid #D1D5DB', padding: '11px 14px', fontSize: 14, fontFamily: 'Inter, sans-serif', transition: 'border-color 0.2s, box-shadow 0.2s', outline: 'none', minHeight: 44, backgroundColor: '#FFFFFF' },
  textArea: { width: '100%', boxSizing: 'border-box', borderRadius: 10, border: '1.5px solid #D1D5DB', padding: '12px 14px', fontSize: 14, fontFamily: 'Inter, sans-serif', minHeight: 100, resize: 'vertical', lineHeight: 1.6, transition: 'border-color 0.2s, box-shadow 0.2s', outline: 'none', backgroundColor: '#FFFFFF' },
  inputDisabled: { background: '#F9FAFB', color: '#9CA3AF', cursor: 'not-allowed', borderColor: '#E5E7EB' },
  inputLocked: { background: '#F9FAFB', color: '#6B7280', cursor: 'not-allowed', borderColor: '#E5E7EB', border: '1.5px solid #E5E7EB' },
  fieldHint: { fontSize: 12, color: '#9CA3AF', margin: '6px 0 0 0', lineHeight: 1.5 },
  lockIconSmall: { fontSize: 12, marginLeft: 6, opacity: 0.65 },
  
  // Private details layout
  privateFieldRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 20 },
  privateFieldCol: { display: 'flex', flexDirection: 'column' },
  readOnlyInput: { width: '100%', boxSizing: 'border-box', borderRadius: 10, border: '1px solid #d1d5db', padding: '12px 14px', fontSize: 14, fontFamily: 'Inter, sans-serif', background: '#F7F9FA', color: '#6b7280', cursor: 'not-allowed', minHeight: 44 },
  // Private details cards sit inside a white parent card; add a subtle surface so spacing is visible.
  privateCardsPanel: {
    background: '#F8F9FB',
    border: '1px solid #E8EAF0',
    borderRadius: 14,
    padding: 20,
  },
  privateCardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
    columnGap: 20,
    rowGap: 24,
    alignItems: 'start',
  },
  privateCardsCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  
  // Verification cards
  verificationCard: { background: '#F7F9FA', border: '1px solid #E0E0E0', borderRadius: 12, padding: 20, marginBottom: 20 },
  verificationHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 },
  verificationTitle: { fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 700, color: '#222', marginBottom: 4 },
  verificationSubtitle: { fontSize: 13, color: '#666', lineHeight: 1.5 },
  verificationBody: { display: 'flex', flexDirection: 'column', gap: 12 },
  verificationActions: { display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 },
  verificationCodeRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  
  verifiedPill: { background: '#ecfdf5', color: '#15803d', border: '1px solid #a7f3d0', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  unverifiedPill: { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  
  // Private details sub-cards (match Email/Phone card look)
  privateSubCard: {
    border: '1px solid #E5E7EB',
    borderRadius: 14,
    padding: 24,
    backgroundColor: '#FFFFFF',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    display: 'flex',
    flexDirection: 'column',
    transition: 'box-shadow 0.2s ease',
  },
  privateSubCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  privateSubCardTitle: { fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 700, color: '#111827', margin: 0, letterSpacing: '-0.01em' },
  privateSubCardSub: { fontSize: 12, color: '#6B7280', marginTop: 4, lineHeight: 1.5 },
  
  verifyButton: { background: '#F3F4F6', color: '#374151', border: '1.5px solid #D1D5DB', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'Inter, sans-serif', transition: 'all 0.2s', alignSelf: 'flex-start', minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  verifyButtonDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  confirmButton: { background: '#14C5C5', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'Inter, sans-serif', transition: 'all 0.2s', whiteSpace: 'nowrap', minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  codeInput: { flex: 1, minWidth: 140, maxWidth: 200, boxSizing: 'border-box', borderRadius: 10, border: '1.5px solid #D1D5DB', padding: '10px 14px', fontSize: 14, fontFamily: 'Inter, sans-serif', outline: 'none' },
  
  verificationMessage: { fontSize: 13, color: '#374151', padding: '8px 12px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8 },
  devCodeMessage: { fontSize: 12, color: '#92400e', padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 },
  sectionActionButton: { background: '#FFFFFF', color: '#111827', border: '1px solid #D1D5DB', borderRadius: 10, padding: '10px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'Inter, sans-serif' },
  homeownerActionsRow: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 18 },
  profileMetaText: { fontSize: 14, color: '#6B7280', marginBottom: 6, lineHeight: 1.5 },
  profileBadgeRow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 },
  nameGuidance: { marginTop: 14, fontSize: 13, color: '#6B7280', lineHeight: 1.55, maxWidth: 440 },
  adminProfileMeta: { marginTop: 8, fontSize: 12, color: '#6B7280', lineHeight: 1.5 },
  profileSummaryRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 },
  summaryInfoCard: { border: '1px solid #E5E7EB', borderRadius: 14, padding: 16, background: '#FAFAFA' },
  summaryInfoLabel: { fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 },
  summaryInfoValue: { fontSize: 16, fontWeight: 700, color: '#111827' },
  paymentReadyCard: { borderColor: '#A7F3D0', boxShadow: '0 8px 20px rgba(22, 101, 52, 0.08)' },
  paymentNeedsAttentionCard: { borderColor: '#FDE68A', background: '#FFFCF0', boxShadow: '0 10px 26px rgba(146, 64, 14, 0.10)' },
  paymentHeaderIcon: { width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFF7D6', color: '#92400E', fontSize: 18, fontWeight: 800, flexShrink: 0 },
  paymentHero: { display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' },
  paymentHeroText: { flex: 1, minWidth: 260 },
  paymentEyebrow: { fontSize: 12, fontWeight: 800, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 },
  paymentHeroTitle: { fontFamily: 'Poppins, sans-serif', fontSize: 30, lineHeight: 1.12, color: '#111827', marginBottom: 10 },
  paymentHeroBody: { fontSize: 15, color: '#4B5563', lineHeight: 1.7, maxWidth: 640 },
  paymentSupportMeta: { marginTop: 14, fontSize: 13, color: '#6B7280', lineHeight: 1.6 },
  paymentTrustText: { marginTop: 18, fontSize: 12, fontWeight: 600, color: '#6B7280', lineHeight: 1.5 },
  paymentCtaCol: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 240 },
  paymentPrimaryButton: { background: '#FF9100', color: '#FFFFFF', border: 'none', borderRadius: 12, padding: '14px 18px', cursor: 'pointer', fontWeight: 800, fontSize: 15, fontFamily: 'Inter, sans-serif', boxShadow: '0 6px 18px rgba(255, 145, 0, 0.18)' },
  paymentSecondaryButton: { width: '100%' },
  securityRows: { display: 'flex', flexDirection: 'column', gap: 14 },
  securityRow: { border: '1px solid #E5E7EB', borderRadius: 16, background: '#FFFFFF', overflow: 'hidden' },
  securityRowMain: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: 18 },
  securityRowIdentity: { flex: 1, minWidth: 220 },
  securityRowLabel: { fontFamily: 'Poppins, sans-serif', fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 4 },
  securityRowSubtext: { fontSize: 13, color: '#6B7280', lineHeight: 1.6 },
  securityRowMeta: { display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
  securityRowExpanded: { borderTop: '1px solid #E5E7EB', padding: 18, background: '#FCFCFD', display: 'flex', flexDirection: 'column', gap: 16 },
  inlineStatusOk: { fontSize: 13, fontWeight: 700, color: '#15803D' },
  inlineStatusWarn: { fontSize: 13, fontWeight: 700, color: '#B45309' },
  rowActionButton: { background: 'transparent', color: '#111827', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'Inter, sans-serif' },
  secondaryActionButton: { background: '#FFFFFF', color: '#111827', border: '1px solid #D1D5DB', borderRadius: 10, padding: '11px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'Inter, sans-serif' },
  accountMethodSuccess: { marginTop: 14, background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#166534', padding: '12px 14px', borderRadius: 12, fontSize: 14 },
  accountMethodError: { marginTop: 14, background: '#FFF1F2', border: '1px solid #FECDD3', color: '#9F1239', padding: '12px 14px', borderRadius: 12, fontSize: 14 },
  
  // Action row
  actionRow: { display: 'flex', justifyContent: 'flex-end', marginTop: 32, paddingTop: 24, borderTop: '1px solid #E5E7EB' },
  saveButton: { background: '#14C5C5', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 32px', cursor: 'pointer', fontWeight: 700, fontSize: 15, fontFamily: 'Inter, sans-serif', transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 2px 8px rgba(20, 197, 197, 0.25)' },
  
  // Alert card (email verification)
  alertCard: { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 16, padding: 24, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 16 },
  alertHeader: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  alertIcon: { fontSize: 24, flexShrink: 0 },
  alertTitle: { fontFamily: 'Poppins, sans-serif', fontSize: 17, fontWeight: 700, color: '#78350f', marginBottom: 4 },
  alertSubtitle: { fontSize: 14, color: '#92400e', lineHeight: 1.5 },
  alertButton: { background: '#fff', color: '#92400e', border: '1px solid #d97706', borderRadius: 10, padding: '11px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'Inter, sans-serif', alignSelf: 'flex-start', transition: 'all 0.2s' },
  
  // Danger card
  // Identity fields (name + business) with locked state support
  identityFieldsContainer: { marginBottom: 24 },
  nameBusinessRow: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 0, alignItems: 'start' },
  fieldHintFixed: { fontSize: 12, color: '#888', margin: '6px 0 0 0', lineHeight: 1.5, minHeight: 21 },
  requestChangeLinkContainer: { display: 'flex', justifyContent: 'flex-end', marginTop: 8 },
  requestChangeLinkSimple: { background: 'transparent', border: 'none', color: '#14C5C5', fontWeight: 700, cursor: 'pointer', fontSize: 13, padding: '4px 0', textDecoration: 'underline', transition: 'color 0.2s', fontFamily: 'Inter, sans-serif' },
  historyDetails: { marginTop: 10 },
  historySummary: { cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#334155', display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none' },
  historyCountPill: { display: 'inline-block', marginLeft: 8, fontSize: 11, fontWeight: 900, padding: '4px 8px', borderRadius: 999, background: '#F7F9FA', border: '1px solid #E0E0E0', color: '#555' },
  historyEmpty: { padding: 12, fontSize: 12, color: '#666' },
  historyList: { display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 },
  historyRow: { border: '1px solid #E0E0E0', borderRadius: 12, padding: 12, background: '#fff' },
  historyStatusPill: { display: 'inline-block', fontSize: 11, fontWeight: 900, padding: '5px 10px', borderRadius: 999, border: '1px solid #E0E0E0' },
  historyStatusPending: { background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' },
  historyStatusApproved: { background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' },
  historyStatusRejected: { background: '#fff1f2', borderColor: '#fecdd3', color: '#9f1239' },
  historyAdminNote: { marginTop: 10, fontSize: 12, color: '#374151', background: '#F7F9FA', border: '1px solid #E5E7EB', borderRadius: 10, padding: 10 },
  
  typeaheadWrap: { position: 'relative', width: '100%' },
  smartInputWrap: {
    position: 'relative',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
  },
  smartInputIconLeft: {
    position: 'absolute',
    left: 14,
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    alignItems: 'center',
    pointerEvents: 'none',
    zIndex: 1,
  },
  smartInputClearBtn: {
    position: 'absolute',
    right: 12,
    top: '50%',
    marginTop: -11,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    padding: 0,
    background: 'transparent',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
    zIndex: 1,
  },
  smartInputFilled: {
    backgroundColor: '#F9FAFB',
    fontWeight: 500,
  },
  typeaheadMenu: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: 0,
    right: 0,
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: 12,
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    zIndex: 50,
    maxHeight: 280,
    overflowY: 'auto',
    padding: 6,
    listStyle: 'none',
    margin: 0,
  },
  typeaheadItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '12px 14px',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
    marginBottom: 2,
  },
  typeaheadItemActive: {
    background: '#F0F9FF',
    borderLeft: '3px solid #14C5C5',
    paddingLeft: '11px',
  },
  typeaheadItemIcon: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    paddingTop: 2,
  },
  typeaheadItemContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
  },
  typeaheadItemPrimary: {
    fontSize: 14,
    fontWeight: 600,
    color: '#111827',
    lineHeight: 1.3,
    fontFamily: 'Inter, sans-serif',
  },
  typeaheadItemSecondary: {
    fontSize: 13,
    fontWeight: 400,
    color: '#6B7280',
    lineHeight: 1.3,
    fontFamily: 'Inter, sans-serif',
  },
  radioPill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid #E5E7EB',
    background: '#FFFFFF',
    cursor: 'pointer',
    fontWeight: 700,
    color: '#374151',
    fontSize: 13,
  },
  radioPillLocked: {
    background: '#FAFAFA',
    borderColor: '#E5E7EB',
    color: '#6B7280',
    cursor: 'not-allowed',
    opacity: 0.9,
  },
};
