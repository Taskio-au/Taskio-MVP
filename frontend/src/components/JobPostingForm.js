// src/components/JobPostingForm.js
import React, { useState, useEffect, useMemo, useCallback, useId, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { createApiClient } from '../api/createApiClient';
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { auth, storage } from '../firebase';
import { phase1ExpertiseCatalog } from '../shared/expertiseCatalog';
import {
    buildGroupedJobTypesFromCatalog,
    getTopLevelCategoryId,
} from '../constants/taskTaxonomy';
import { melbournePilotLocations } from '../shared/auLocations';
import {
    categoryRequiresPostingPhoto,
    includesMirrorWork,
    itemScopeText,
} from '../shared/jobPostingSemantics.generated';
import TaskSummary from './job-posting/TaskSummaryCard';
import LegalNotice from './LegalNotice';
import {
    clearRecaptchaVerifier,
    ensureOfficialRecaptchaVerifier,
    normalizeAuMobileToE164,
    requestPhoneOtpForSignIn,
    confirmPhoneOtpForSignIn,
} from '../services/phoneVerification';
import '../styles/publicPageHeader.css';
import PublicPageHeader from './PublicPageHeader';
import './JobPostingForm.css';
import { ANALYTICS_EVENTS, trackEvent, trackEventOnce } from '../config/analytics';
import { coercePilotSuburb } from '../config/analyticsConfig';
import { InlineErrorCardWithNavLinks } from './ui/AsyncPageStates';
import { getPostJobFlowErrorPresentation } from '../utils/userFacingApiErrors';
import InviteOnlyNotice from './InviteOnlyNotice';
import { isPublicAcquisitionEnabled } from '../config/publicAcquisitionConfig';

// Shared API client
const api = createApiClient();

const PHASE1_SCOPE_HELP = 'Small indoor jobs only. No electrical, plumbing, gas, or waterproofing.';
const PHASE1_TEXT_SCOPE_ERROR = 'This job is outside our current scope. Please keep it to a small indoor job only.';
const durationOptions = [
    { value: 'under_1_hour', label: 'Under 1 hour', helper: 'Quick single-task jobs.' },
    { value: 'one_to_two_hours', label: '1 to 2 hours', helper: 'This fits within our current job limit.' },
];
const urgencyOptions = [
    { value: 'Today', label: 'Today', helper: 'Best for urgent same-day jobs.' },
    { value: 'Tomorrow', label: 'Tomorrow', helper: 'Good if it can wait until the next day.' },
    { value: 'Within 2 days', label: 'Within 2 days', helper: 'Useful for near-term dispatch.' },
    { value: 'Flexible', label: 'Flexible', helper: 'Best if timing is not urgent.' },
    { value: 'On a specific date', label: 'Specific date', helper: 'Choose an exact date next.' },
];
const budgetOptions = [
    { value: 'under_150', label: 'Under $150', helper: 'Good for quick single-item jobs.' },
    { value: '150_to_300', label: '$150 - $300', helper: 'Current job limit.' },
    { value: 'not_sure_under_300', label: 'Not sure, but under $300', helper: 'We will keep quotes inside the launch range.' },
];
const siteAccessFieldOptions = {
    propertyType: [
        { value: 'apartment_unit', label: 'Apartment / unit' },
        { value: 'house_townhouse', label: 'House / townhouse' },
    ],
    liftAvailable: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
        { value: 'not_sure', label: 'Not sure' },
    ],
    stairs: [
        { value: 'none', label: 'No stairs (ground floor)' },
        { value: 'one_flight', label: '1 flight' },
        { value: 'multiple_flights', label: '2+ flights' },
        { value: 'not_sure', label: 'Not sure' },
    ],
    parking: [
        { value: 'easy', label: 'Easy parking nearby' },
        { value: 'limited', label: 'Limited parking' },
        { value: 'none', label: 'No nearby parking' },
        { value: 'not_sure', label: 'Not sure' },
    ],
};
const PHOTO_LEVELS = {
    NONE: 'none',
    RECOMMENDED: 'recommended',
    REQUIRED: 'required',
};
const photoRequirementByJobType = {
    mounting_tv: PHOTO_LEVELS.RECOMMENDED,
    mounting_shelves: PHOTO_LEVELS.RECOMMENDED,
    mounting_mirrors: PHOTO_LEVELS.RECOMMENDED,
    hanging_picture_frames: PHOTO_LEVELS.NONE,
    hanging_artwork: PHOTO_LEVELS.NONE,
    curtains_blinds_curtain_rods: PHOTO_LEVELS.RECOMMENDED,
    curtains_blinds_install: PHOTO_LEVELS.RECOMMENDED,
    curtains_blinds_minor_fixes: PHOTO_LEVELS.RECOMMENDED,
    furniture_assembly_flat_pack: PHOTO_LEVELS.NONE,
    furniture_assembly_bed_desk_wardrobe: PHOTO_LEVELS.NONE,
    minor_repairs_door_hinge: PHOTO_LEVELS.RECOMMENDED,
    minor_repairs_cabinet_alignment: PHOTO_LEVELS.RECOMMENDED,
    minor_repairs_handle_replacement: PHOTO_LEVELS.NONE,
    minor_repairs_small_fixture: PHOTO_LEVELS.RECOMMENDED,
    wall_patch_touchup_small_holes: PHOTO_LEVELS.RECOMMENDED,
    wall_patch_touchup_cosmetic: PHOTO_LEVELS.RECOMMENDED,
    silicone_sealing_cosmetic: PHOTO_LEVELS.RECOMMENDED,
    silicone_sealing_touchups: PHOTO_LEVELS.RECOMMENDED,
    apartment_make_good: PHOTO_LEVELS.REQUIRED,
};
const blockedScopePattern = /\b(electrical|electrician|plumbing|plumber|gas|waterproofing)\b/i;
const overDurationPattern = /\b([3-9]|[1-9]\d)\s*(hours?|hrs?)\b|\bhalf[- ]day\b|\bfull[- ]day\b|\ball[- ]day\b/i;

function hasOverBudgetMention(text) {
    const matches = String(text || '').match(/\$\s*([0-9]{3,4})\b/g) || [];
    return matches.some((match) => {
        const amount = Number(String(match).replace(/[^0-9]/g, ''));
        return Number.isFinite(amount) && amount > 300;
    });
}

function getOutOfScopeTextError(title, description) {
    const combined = `${String(title || '')} ${String(description || '')}`.trim();
    if (!combined) return '';
    if (blockedScopePattern.test(combined)) return PHASE1_TEXT_SCOPE_ERROR;
    if (overDurationPattern.test(combined)) return PHASE1_TEXT_SCOPE_ERROR;
    if (hasOverBudgetMention(combined)) return PHASE1_TEXT_SCOPE_ERROR;
    return '';
}

function toLocationLabel(location) {
    if (!location || typeof location !== 'object') return '';
    return `${location.suburb}, ${location.state} ${location.postcode}`;
}

function toLocationValue(location) {
    if (!location || typeof location !== 'object') return '';
    return `${location.suburb}|${location.postcode}`;
}

function normalizeSelectedLocation(rawLocation) {
    if (!rawLocation) return null;
    if (typeof rawLocation === 'string') {
        return melbournePilotLocations.find(
            (item) => toLocationValue(item) === rawLocation || toLocationLabel(item) === rawLocation || item.label === rawLocation
        ) || null;
    }
    if (typeof rawLocation === 'object') {
        const match = melbournePilotLocations.find(
            (item) => item.suburb === rawLocation.suburb && item.postcode === rawLocation.postcode
        );
        if (!match) return null;
        return {
            ...match,
            country: 'AU',
            coordinates: {
                latitude: match.latitude,
                longitude: match.longitude,
            },
            label: toLocationLabel(match),
        };
    }
    return null;
}

/** Title-case suburb for stored title (aligned with shared/paymentDisplayTaskTitle.formatLocality). */
function formatLocalityTitleCase(suburb) {
    const s = String(suburb || '').trim();
    if (!s) return '';
    return s
        .split(/\s+/)
        .map((w) => {
            if (!w) return '';
            if (/^[A-Za-z]+-[A-Za-z]+$/.test(w)) {
                return w
                    .split('-')
                    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ''))
                    .join('-');
            }
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        })
        .join(' ');
}

/** Matches shared/paymentDisplayTaskTitle.buildPostedJobTitleFromPhase1Row — catalogue expertLabel + locality. */
function buildPostedJobTitleFromCatalogRow(row, location) {
    const phrase = String(row?.expertLabel || row?.label || '').trim();
    if (!phrase) return 'Task';
    const suburbRaw = String(location?.suburb || '').trim();
    if (!suburbRaw) return phrase;
    return `${phrase} in ${formatLocalityTitleCase(suburbRaw)}`;
}

function getPhotoRequirement(jobType, mirrorSize) {
    const base = photoRequirementByJobType[jobType] || PHOTO_LEVELS.NONE;
    if (jobType === 'mounting_mirrors' && mirrorSize === 'large_heavy') {
        return PHOTO_LEVELS.REQUIRED;
    }
    return base;
}

// --- Helper Components ---

const visuallyHiddenStyle = {
    border: 0,
    clip: 'rect(0 0 0 0)',
    height: '1px',
    margin: '-1px',
    overflow: 'hidden',
    padding: 0,
    position: 'absolute',
    width: '1px',
};

const GeminiInspiredIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '6px' }}>
        <path d="M12 2L13.66 8.34L20 10L13.66 11.66L12 18L10.34 11.66L4 10L10.34 8.34L12 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 2V5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 18V21" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4 10H7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M17 10H20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const Calendar = ({ selectedDate, onDateSelect, onClose }) => {
    const [date, setDate] = useState(new Date());
    const calendarRef = useRef(null);

    useEffect(() => {
        if (selectedDate) {
            setDate(new Date(selectedDate.replace(/-/g, '/')));
        } else {
            setDate(new Date());
        }
    }, [selectedDate]);


    // SVG Icons for navigation buttons
    const ChevronLeftIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>);
    const ChevronRightIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (calendarRef.current && !calendarRef.current.contains(event.target)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onClose]);

    const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

    const changeMonth = (offset) => {
        setDate(prevDate => {
            const newDate = new Date(prevDate);
            newDate.setMonth(newDate.getMonth() + offset);
            return newDate;
        });
    };

    const handleDayClick = (day) => {
        const newDate = new Date(date.getFullYear(), date.getMonth(), day);
        const formattedDate = newDate.toISOString().split('T')[0];
        onDateSelect(formattedDate);
    };

    const renderDays = () => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const totalDays = daysInMonth(year, month);
        const firstDay = firstDayOfMonth(year, month);
        const today = new Date();
        const selected = selectedDate ? new Date(selectedDate.replace(/-/g, '/')) : null;

        let days = [];
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} style={{ width: 'calc(100% / 7)', height: '40px' }}></div>);
        }

        for (let day = 1; day <= totalDays; day++) {
            const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
            const isSelected = selected && selected.getFullYear() === year && selected.getMonth() === month && selected.getDate() === day;

            const dayStyle = {
                width: 'calc(100% / 7)',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                borderRadius: '50%',
                transition: 'background-color 0.2s ease, color 0.2s ease',
                backgroundColor: isSelected ? 'var(--taskio-orange, #FF9100)' : 'transparent',
                color: isSelected ? 'white' : 'inherit',
                fontWeight: isToday ? 'bold' : 'normal',
                border: isToday && !isSelected ? '1px solid var(--taskio-teal, #14C5C5)' : 'none',
            };

            days.push(
                <div key={day} style={dayStyle} onClick={() => handleDayClick(day)} onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = '#f0f0f0'; }} onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}>
                    {day}
                </div>
            );
        }
        return days;
    };
    
    const calendarStyle = { position: 'absolute', zIndex: 10, backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '16px', boxShadow: '0 8px 16px rgba(0,0,0,0.1)', marginTop: '8px', width: '300px', fontFamily: 'sans-serif' };
    const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '0 4px' };
    const monthYearStyle = { fontWeight: '600', fontSize: '16px' };
    const buttonStyle = { background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' };
    const gridStyle = { display: 'flex', flexWrap: 'wrap' };
    const dayHeaderStyle = { width: 'calc(100% / 7)', textAlign: 'center', fontWeight: '600', color: '#999', fontSize: '12px', paddingBottom: '12px' };

    return (
        <div ref={calendarRef} style={calendarStyle}>
            <div style={headerStyle}>
                <button onClick={() => changeMonth(-1)} style={buttonStyle}><ChevronLeftIcon /></button>
                <span style={monthYearStyle}>{date.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                <button onClick={() => changeMonth(1)} style={buttonStyle}><ChevronRightIcon /></button>
            </div>
            <div style={gridStyle}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => <div key={day} style={dayHeaderStyle}>{day}</div>)}
                {renderDays()}
            </div>
        </div>
    );
};


// --- Main Task Posting Form Component ---
function JobPostingForm() {
    const [currentStep, setCurrentStep] = useState(1);
    const [formData, setFormData] = useState(() => {
        try {
            const savedDraft = sessionStorage.getItem('taskio_job_draft');
            const parsed = savedDraft ? JSON.parse(savedDraft) : {};
            const normalizedLocation = normalizeSelectedLocation(parsed?.location);
            const draftItems = Array.isArray(parsed?.items)
                ? parsed.items
                : (parsed?.jobType ? [{ type: parsed.jobType, quantity: 1, customDescription: '' }] : []);
            return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? {
                jobType: '', description: '', timeline: '', specificDate: '', estimatedDuration: '', budget: '',
                propertyType: '', liftAvailable: '', stairs: '', parking: '', mirrorSize: '',
                firstName: '', phone: '', primaryCategoryId: '',
                ...parsed,
                items: draftItems,
                location: normalizedLocation,
            } : {};
        } catch (error) {
            console.error("Failed to parse draft from sessionStorage", error);
            return {
                jobType: '', description: '', location: null, timeline: '', specificDate: '', estimatedDuration: '', budget: '',
                propertyType: '', liftAvailable: '', stairs: '', parking: '', mirrorSize: '',
                firstName: '', phone: '', primaryCategoryId: '', items: []
            };
        }
    });

    const navigate = useNavigate();
    const [user, setUser] = useState(auth.currentUser);
    const [formErrors, setFormErrors] = useState({});
    /** Structured post errors (never raw API text for permission / leaked messages). */
    const [postSubmitBlocked, setPostSubmitBlocked] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [acceptedLegal, setAcceptedLegal] = useState(false);
    const [liveRegionMessage, setLiveRegionMessage] = useState('');
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [photos, setPhotos] = useState([]); // [{ id, file, url }]
    const photoInputRef = useRef(null);
    const lastAiDescriptionRef = useRef(''); // for Undo
    const [aiUndoVisible, setAiUndoVisible] = useState(false);
    const [aiAssistAvailable, setAiAssistAvailable] = useState(true);
    const [showContactWarning, setShowContactWarning] = useState(false);
    const [photoUploadBusy, setPhotoUploadBusy] = useState(false);
    const [otpCode, setOtpCode] = useState('');
    const [otpRequested, setOtpRequested] = useState(false);
    const [otpBusy, setOtpBusy] = useState(false);
    const [otpMessage, setOtpMessage] = useState('');
    const confirmationResultRef = useRef(null);
    const recaptchaVerifierRef = useRef(null);
    const recaptchaContainerId = useRef(`taskio-post-job-phone-recaptcha-${Math.random().toString(36).slice(2)}`);
    
    const totalSteps = user ? 4 : 5;
    const [selectedTopLevelCategory, setSelectedTopLevelCategory] = useState(
        () => formData.primaryCategoryId || getTopLevelCategoryId(formData.jobType)
    );
    const groupedJobTypes = useMemo(
        () => buildGroupedJobTypesFromCatalog(phase1ExpertiseCatalog),
        []
    );
    const selectedJobType = useMemo(
        () => phase1ExpertiseCatalog.find((item) => item.key === formData.jobType) || null,
        [formData.jobType]
    );
    const selectedTopLevelGroup = useMemo(
        () => groupedJobTypes.find((group) => group.id === selectedTopLevelCategory) || null,
        [groupedJobTypes, selectedTopLevelCategory]
    );
    const includesMirror = useMemo(
        () => includesMirrorWork(formData.items, selectedTopLevelGroup?.sourceCategory),
        [formData.items, selectedTopLevelGroup]
    );
    const phase1TextScopeError = useMemo(
        () => getOutOfScopeTextError(
            selectedJobType?.label || '',
            `${formData.description} ${itemScopeText(formData.items)}`
        ),
        [formData.description, formData.items, selectedJobType]
    );
    const photoRequirement = useMemo(() => {
        const rank = { [PHOTO_LEVELS.NONE]: 0, [PHOTO_LEVELS.RECOMMENDED]: 1, [PHOTO_LEVELS.REQUIRED]: 2 };
        const categoryMinimum = categoryRequiresPostingPhoto(selectedTopLevelGroup?.sourceCategory)
            ? PHOTO_LEVELS.REQUIRED
            : PHOTO_LEVELS.NONE;
        const itemRequirement = (formData.items || []).reduce((highest, item) => {
            const next = getPhotoRequirement(item.type, formData.mirrorSize);
            return rank[next] > rank[highest] ? next : highest;
        }, PHOTO_LEVELS.NONE);
        const mirrorRequirement = includesMirror
            ? (formData.mirrorSize === 'large_heavy' ? PHOTO_LEVELS.REQUIRED : PHOTO_LEVELS.RECOMMENDED)
            : PHOTO_LEVELS.NONE;
        return [categoryMinimum, itemRequirement, mirrorRequirement].reduce(
            (highest, next) => (rank[next] > rank[highest] ? next : highest),
            PHOTO_LEVELS.NONE
        );
    }, [formData.items, formData.mirrorSize, includesMirror, selectedTopLevelGroup]);
    
    // Move all useId calls to the top level
    const descId = useId(), firstNameId = useId(), phoneId = useId(), otpId = useId();
    const aiUndoId = useId();
    const locationHeadingId = useId();
    const locationSelectId = useId();
    trackEventOnce(ANALYTICS_EVENTS.JOB_POST_STARTED, 'session', { role: 'homeowner', surface: 'post_job' });

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(newUser => {
            setUser(newUser);
            if (newUser && currentStep === 5 && !isSubmitting && !otpBusy) {
                setCurrentStep(4);
            }
        });
        return unsubscribe;
    }, [currentStep, isSubmitting, otpBusy]);

    useEffect(() => () => {
        clearRecaptchaVerifier(recaptchaVerifierRef);
    }, []);

    useEffect(() => {
        const draftData = { ...formData };
        sessionStorage.setItem('taskio_job_draft', JSON.stringify(draftData));
    }, [formData]);

    // Cleanup object URLs for photo previews
    useEffect(() => {
        return () => {
            photos.forEach(p => {
                try { URL.revokeObjectURL(p.url); } catch (e) {}
            });
        };
    }, [photos]);

    const addPhotos = useCallback((fileList) => {
        const files = Array.from(fileList || []).filter(f => f && f.type && f.type.startsWith('image/'));
        if (files.length === 0) return;
        setFormErrors(prev => ({ ...prev, photos: '' }));
        setPhotos(prev => {
            const next = [...prev];
            for (const file of files) {
                const id = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2)}`;
                next.push({ id, file, url: URL.createObjectURL(file) });
            }
            // cap to prevent huge memory usage
            return next.slice(0, 12);
        });
    }, []);

    const removePhoto = useCallback((id) => {
        setPhotos(prev => {
            const target = prev.find(p => p.id === id);
            if (target?.url) {
                try { URL.revokeObjectURL(target.url); } catch (e) {}
            }
            return prev.filter(p => p.id !== id);
        });
    }, []);

    useEffect(() => {
        if (!formData.jobType || formData.primaryCategoryId) return;
        const categoryId = getTopLevelCategoryId(formData.jobType);
        if (categoryId && categoryId !== selectedTopLevelCategory) {
            setSelectedTopLevelCategory(categoryId);
        }
    }, [formData.jobType, formData.primaryCategoryId, selectedTopLevelCategory]);

    useEffect(() => {
        if (includesMirror || !formData.mirrorSize) return;
        setFormData((prev) => ({ ...prev, mirrorSize: '' }));
    }, [formData.mirrorSize, includesMirror]);

    const handleLocationChange = useCallback((e) => {
        const nextLocation = normalizeSelectedLocation(e.target.value);
        setFormData(prev => ({ ...prev, location: nextLocation }));
        setFormErrors(prev => ({ ...prev, location: nextLocation ? '' : 'Please choose one of the supported suburbs.' }));
    }, []);

    const handleTopLevelCategorySelect = useCallback((categoryId) => {
        setSelectedTopLevelCategory(categoryId);
        setFormData((prev) => {
            const next = { ...prev, primaryCategoryId: categoryId };
            if (prev.primaryCategoryId !== categoryId && getTopLevelCategoryId(prev.jobType) !== categoryId) {
                next.jobType = '';
                next.items = [];
                next.mirrorSize = '';
            }
            return next;
        });
    }, []);

    const toggleJobItem = useCallback((type, checked) => {
        setFormData((prev) => {
            const current = Array.isArray(prev.items) ? prev.items : [];
            const nextItems = checked
                ? [...current, { type, quantity: 1, customDescription: '' }]
                : current.filter((item) => item.type !== type);
            return {
                ...prev,
                items: nextItems,
                jobType: nextItems.find((item) => item.type !== 'custom')?.type || '',
                ...(type === 'mounting_mirrors' && !checked ? { mirrorSize: '' } : {}),
            };
        });
        setFormErrors((prev) => ({ ...prev, items: '' }));
    }, []);

    const updateJobItem = useCallback((type, patch) => {
        setFormData((prev) => ({
            ...prev,
            items: (Array.isArray(prev.items) ? prev.items : []).map((item) => (
                item.type === type ? { ...item, ...patch } : item
            )),
        }));
        setFormErrors((prev) => ({ ...prev, items: '' }));
    }, []);
    
    const handleChange = useCallback((e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value,
            ...(name === 'timeline' && value !== 'On a specific date' ? { specificDate: '' } : {}),
            ...(name === 'jobType' && value !== 'mounting_mirrors' ? { mirrorSize: '' } : {}),
        }));
        // If the user starts editing after an AI rewrite, hide the Undo banner to reduce clutter.
        if (name === 'description' && aiUndoVisible) {
            setAiUndoVisible(false);
        }
        // Check for contact info patterns in description
        if (name === 'description') {
            const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
            const phonePattern = /\b(\+?61|0)4\d{2}[\s-]?\d{3}[\s-]?\d{3}\b|\b\d[\d\s-]{7,11}\d\b/;
            const hasContactInfo = emailPattern.test(value) || phonePattern.test(value);
            setShowContactWarning(hasContactInfo);
        }
        if (['propertyType', 'liftAvailable', 'stairs', 'parking', 'jobType', 'mirrorSize', 'timeline'].includes(name)) {
            setFormErrors(prev => ({ ...prev, [name]: '' }));
        }
        if (name === 'phone') {
            setFormErrors(prev => ({ ...prev, phone: '', otp: '', submit: '' }));
            setPostSubmitBlocked(null);
            setOtpRequested(false);
            setOtpCode('');
            setOtpMessage('');
            confirmationResultRef.current = null;
        }
        if (formErrors.submit || postSubmitBlocked) {
            setFormErrors(prev => ({ ...prev, submit: '' }));
            setPostSubmitBlocked(null);
        }
    }, [formErrors.submit, postSubmitBlocked, aiUndoVisible]);
    
    const handleBlur = useCallback((e) => {
        const { name, value } = e.target;
        const trimmedValue = value.trim();
        if (['firstName'].includes(name)) {
            setFormData(prev => ({...prev, [name]: trimmedValue.replace(/\s+/g, ' ')}));
        }
    }, []);

    const handleGenerateDescription = useCallback(async ({ enableUndo = false } = {}) => {
        if (!formData.jobType) {
            setFormErrors(prev => ({ ...prev, description: 'Please choose a supported job type first.' }));
            return;
        }
        if (!formData.description.trim()) {
            setFormErrors(prev => ({ ...prev, description: 'Please add a short description first.' }));
            return;
        }
        setIsGenerating(true);
        setFormErrors(prev => ({ ...prev, description: '' }));

        try {
            if (enableUndo) {
                lastAiDescriptionRef.current = formData.description;
            }
            const response = await api.post('/api/generate-description', {
                jobType: formData.jobType,
                jobTypeLabel: selectedJobType?.label || '',
                description: formData.description,
                mode: 'clarify',
            });

            if (response.data && response.data.fallback) {
                setAiAssistAvailable(false);
                return;
            }
            if (response.data && response.data.description) {
                setFormData(prev => ({ ...prev, description: response.data.description }));
                if (enableUndo) {
                    setAiUndoVisible(true);
                }
            } else {
                throw new Error("Invalid response structure from server.");
            }
        } catch (error) {
            console.error("Error generating description:", error);
            setFormErrors(prev => ({ ...prev, description: 'Failed to generate description. Please try again.' }));
        } finally {
            setIsGenerating(false);
        }
    }, [formData.description, formData.jobType, selectedJobType]);

    const undoAiDescription = useCallback(() => {
        const prev = lastAiDescriptionRef.current;
        if (typeof prev === 'string') {
            setFormData((p) => ({ ...p, description: prev }));
        }
        setAiUndoVisible(false);
    }, []);

    const handleDateSelect = useCallback((date) => {
        setFormData(prev => ({...prev, specificDate: date}));
        setIsCalendarOpen(false);
    }, []);

    const stepValid = useMemo(() => {
        switch (currentStep) {
            case 1:
                return Array.isArray(formData.items)
                    && formData.items.length > 0
                    && formData.items.every((item) => (
                        Number.isInteger(Number(item.quantity))
                        && Number(item.quantity) >= 1
                        && Number(item.quantity) <= 99
                        && (item.type !== 'custom' || String(item.customDescription || '').trim().length >= 3)
                    ))
                    && (!includesMirror || !!formData.mirrorSize)
                    && formData.description.trim().length >= 10
                    && !phase1TextScopeError
                    && (photoRequirement !== PHOTO_LEVELS.REQUIRED || photos.length > 0);
            case 2: return !!formData.estimatedDuration && (formData.timeline === 'On a specific date' ? formData.specificDate.trim() !== '' : !!formData.timeline);
            case 3: return !!formData.budget;
            case 4: return !!formData.location && !!formData.propertyType && !!formData.liftAvailable && !!formData.stairs && !!formData.parking && !formErrors.location;
            case 5: {
                try {
                    normalizeAuMobileToE164(formData.phone);
                } catch (error) {
                    return false;
                }
                return acceptedLegal && (!otpRequested || /^\d{6}$/.test(otpCode.trim()));
            }
            default: return false;
        }
    }, [acceptedLegal, currentStep, formData, formErrors.location, includesMirror, otpCode, otpRequested, phase1TextScopeError, photoRequirement, photos.length]);

    const nextStep = useCallback(() => {
        setCurrentStep((prev) => {
            const next = Math.min(prev + 1, totalSteps);
            if (next !== prev) {
                trackEvent(ANALYTICS_EVENTS.JOB_POST_STEP_COMPLETED, {
                    role: 'homeowner',
                    step: prev,
                });
            }
            return next;
        });
    }, [totalSteps]);
    const prevStep = useCallback(() => setCurrentStep(prev => Math.max(1, prev - 1)), []);

    const handleFormKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && e.target.tagName !== 'TEXTAREA' && currentStep < totalSteps && stepValid) {
            e.preventDefault();
            nextStep();
        }
    };

    const buildTaskData = useCallback(() => {
        const generatedTitle = buildPostedJobTitleFromCatalogRow(selectedJobType, formData.location);
        return {
            jobType: formData.jobType,
            primaryCategory: selectedTopLevelGroup?.sourceCategory || '',
            items: (formData.items || []).map((item) => ({
                type: item.type,
                quantity: Number(item.quantity),
                customDescription: String(item.customDescription || '').trim(),
            })),
            title: generatedTitle,
            description: formData.description.trim().replace(/\s+/g, ' '), 
            location: formData.location,
            estimatedDuration: formData.estimatedDuration,
            timeline: formData.timeline === 'On a specific date' ? formData.specificDate : formData.timeline,
            budget: formData.budget,
            siteAccess: {
                propertyType: formData.propertyType,
                liftAvailable: formData.liftAvailable,
                stairs: formData.stairs,
                parking: formData.parking,
            },
            details: {
                mirrorSize: includesMirror ? formData.mirrorSize : '',
            },
        };
    }, [formData, includesMirror, selectedJobType, selectedTopLevelGroup]);

    const uploadPhotosForJob = useCallback(async (jobId) => {
        if (!jobId || photos.length === 0) return [];

        const uploadedPhotos = [];
        for (const photo of photos) {
            const extension = String(photo.file?.name || 'jpg').split('.').pop()?.toLowerCase() || 'jpg';
            const path = `job-posting-attachments/${jobId}/${Date.now()}-${photo.id}.${extension}`;
            const photoRef = storageRef(storage, path);
            const task = uploadBytesResumable(photoRef, photo.file, { contentType: photo.file?.type || undefined });
            await new Promise((resolve, reject) => {
                task.on('state_changed', undefined, reject, resolve);
            });
            const downloadUrl = await getDownloadURL(photoRef);
            uploadedPhotos.push({
                fileName: photo.file.name,
                fileSize: photo.file.size,
                mimeType: photo.file.type || 'application/octet-stream',
                storagePath: path,
                downloadUrl,
            });
        }

        return uploadedPhotos;
    }, [photos]);

    const createAndFinalizeTask = useCallback(async (token) => {
        const config = { headers: { Authorization: `Bearer ${token}` } };
        const createRes = await api.post(`/api/jobs`, buildTaskData(), config);
        const jobId = createRes?.data?.jobId;
        if (!jobId) {
            throw new Error('Missing created job ID.');
        }
        const category = String(selectedTopLevelGroup?.sourceCategory || formData.jobType || '').trim().slice(0, 40);
        const suburb = coercePilotSuburb(formData.location?.suburb);
        trackEvent(ANALYTICS_EVENTS.JOB_CREATED, {
            role: 'homeowner',
            ...(category ? { category } : {}),
            ...(suburb ? { suburb } : {}),
        });
        trackEvent(ANALYTICS_EVENTS.JOB_POST_COMPLETED, { role: 'homeowner' });
        if (photos.length > 0) {
            setPhotoUploadBusy(true);
            try {
                const uploadedPhotos = await uploadPhotosForJob(jobId);
                await api.post(`/api/jobs/${jobId}/photos`, { photos: uploadedPhotos }, config);
            } finally {
                setPhotoUploadBusy(false);
            }
        }
        sessionStorage.removeItem('taskio_job_draft');
        navigate(`/job-posted/${jobId}`);
    }, [buildTaskData, formData.jobType, formData.location, navigate, photos.length, selectedTopLevelGroup, uploadPhotosForJob]);

    const ensureRecaptchaVerifier = useCallback(() => (
        ensureOfficialRecaptchaVerifier({
            auth,
            containerId: recaptchaContainerId.current,
            verifierRef: recaptchaVerifierRef,
        })
    ), []);

    const activateQuoteAccess = useCallback(async (token) => {
        const config = { headers: { Authorization: `Bearer ${token}` } };
        await api.post('/api/me/homeowner/activate-quote-access', {
            firstName: formData.firstName.trim().replace(/\s+/g, ' '),
        }, config);
    }, [formData.firstName]);

    const requestPostingOtp = useCallback(async () => {
        let phoneNumberE164 = '';
        try {
            phoneNumberE164 = normalizeAuMobileToE164(formData.phone);
        } catch (err) {
            setFormErrors(prev => ({ ...prev, phone: err.message || 'Enter a valid phone number.' }));
            throw err;
        }

        const verifier = ensureRecaptchaVerifier();
        try {
            const confirmation = await requestPhoneOtpForSignIn({
                auth,
                phoneNumberE164,
                recaptchaVerifier: verifier,
            });
            confirmationResultRef.current = confirmation;
            setOtpRequested(true);
            setOtpMessage("We sent a 6-digit code to your phone.");
        } catch (error) {
            clearRecaptchaVerifier(recaptchaVerifierRef);
            throw error;
        }
    }, [ensureRecaptchaVerifier, formData.phone]);

    const verifyOtpAndPostTask = useCallback(async () => {
        if (!confirmationResultRef.current) {
            throw new Error('Please request a verification code first.');
        }
        const result = await confirmPhoneOtpForSignIn({
            confirmationResult: confirmationResultRef.current,
            code: otpCode,
        });
        const token = await result.user.getIdToken();
        await activateQuoteAccess(token);
        await createAndFinalizeTask(token);
    }, [activateQuoteAccess, createAndFinalizeTask, otpCode]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!stepValid) return;

        setIsSubmitting(true);
        setFormErrors({});
        setPostSubmitBlocked(null);
        setLiveRegionMessage('');

        try {
            if (user) {
                const token = await user.getIdToken();
                await createAndFinalizeTask(token);
            } else {
                if (!isPublicAcquisitionEnabled()) {
                    const errorMsg = 'This private launch is invite-only. Log in with your invited account to post a task.';
                    setFormErrors({ submit: errorMsg });
                    setLiveRegionMessage(errorMsg);
                    return;
                }
                if (!acceptedLegal) {
                    const errorMsg = 'Please accept the Terms of Use and Privacy Policy to continue.';
                    setFormErrors({ submit: errorMsg });
                    setLiveRegionMessage(errorMsg);
                    return;
                }
                if (!otpRequested) {
                    setOtpBusy(true);
                    await requestPostingOtp();
                    setLiveRegionMessage('Verification code sent.');
                    return;
                }
                setOtpBusy(true);
                await verifyOtpAndPostTask();
            }
        } catch (err) {
            if (err.name !== 'CanceledError') {
                const presentation = getPostJobFlowErrorPresentation(err);
                setLiveRegionMessage(presentation.liveRegion);
                if (presentation.kind === 'blocked_permission') {
                    setPostSubmitBlocked({
                        kind: 'blocked_permission',
                        title: presentation.title,
                        body: presentation.body,
                    });
                    setFormErrors({});
                } else if (presentation.kind === 'blocked_generic') {
                    setPostSubmitBlocked({
                        kind: 'blocked_generic',
                        title: presentation.title,
                        body: presentation.body,
                    });
                    setFormErrors({});
                } else {
                    setPostSubmitBlocked(null);
                    setFormErrors({ submit: presentation.body });
                }
            }
            console.error(err);
        } finally {
            setIsSubmitting(false);
            setOtpBusy(false);
        }
    };

    const renderStep = () => {
        switch (currentStep) {
            case 1: return (
                <div>
                    <div style={{ marginBottom: '32px' }}>
                        <h2 style={{ 
                            fontFamily: 'Poppins, sans-serif', 
                            marginBottom: '0',
                            fontSize: '22px'
                        }}>
                            What needs to be done?
                        </h2>
                    </div>
                    <div style={{ marginBottom: '22px' }}>
                        <div className="taskio-fieldLabel">Choose a category *</div>
                        <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                            {groupedJobTypes.map((group) => (
                                <button
                                    key={group.id}
                                    type="button"
                                    aria-pressed={selectedTopLevelCategory === group.id}
                                    className={`taskio-radioCard taskio-categoryCard ${selectedTopLevelCategory === group.id ? 'taskio-radioCardActive' : ''}`}
                                    onClick={() => handleTopLevelCategorySelect(group.id)}
                                    style={{ width: '100%' }}
                                >
                                    <strong className="taskio-categoryCardLabel" style={{ fontSize: '16px', display: 'block' }}>{group.label}</strong>
                                </button>
                            ))}
                        </div>
                        <div style={{ marginTop: '16px' }} />
                        <div className="taskio-fieldLabel">{selectedTopLevelGroup ? `${selectedTopLevelGroup.question} (choose one or more) *` : 'Choose task items *'}</div>
                        {selectedTopLevelGroup ? (
                            <div style={{ display: 'grid', gap: '10px' }}>
                                {[...selectedTopLevelGroup.items, {
                                    key: 'custom',
                                    label: 'Something else within this category',
                                    summary: 'Describe another small indoor task in this category.',
                                }].map((option) => {
                                    const item = (formData.items || []).find((entry) => entry.type === option.key);
                                    return (
                                    <div key={option.key} className={`taskio-radioCard taskio-radioCardDetailed ${item ? 'taskio-radioCardActive' : ''}`}>
                                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                        <input
                                            type="checkbox"
                                            name={`jobItem-${option.key}`}
                                            value={option.key}
                                            checked={Boolean(item)}
                                            onChange={(event) => toggleJobItem(option.key, event.target.checked)}
                                            style={{ marginRight: '8px' }}
                                        />
                                        <span>
                                            <strong>{option.label}</strong>
                                            <span style={{ display: item ? 'block' : 'none', fontSize: '13px', color: '#666', fontWeight: 400, marginTop: '4px', lineHeight: 1.45 }}>
                                                {option.summary}
                                            </span>
                                        </span>
                                      </label>
                                      {item && (
                                        <div style={{ display: 'grid', gridTemplateColumns: option.key === 'custom' ? '1fr 110px' : '110px', gap: 10, marginTop: 10 }}>
                                          {option.key === 'custom' && (
                                            <label>
                                              <span className="taskio-fieldLabel">Item description</span>
                                              <input
                                                aria-label="Custom task item description"
                                                value={item.customDescription || ''}
                                                maxLength={200}
                                                onChange={(event) => updateJobItem(option.key, { customDescription: event.target.value })}
                                                className="taskio-input"
                                              />
                                            </label>
                                          )}
                                          <label>
                                            <span className="taskio-fieldLabel">Quantity</span>
                                            <input
                                              aria-label={`${option.label} quantity`}
                                              type="number"
                                              min="1"
                                              max="99"
                                              step="1"
                                              value={item.quantity}
                                              onChange={(event) => updateJobItem(option.key, { quantity: Number(event.target.value) })}
                                              className="taskio-input"
                                            />
                                          </label>
                                        </div>
                                      )}
                                    </div>
                                    );
                                })}
                                {formErrors.items && <div role="alert" style={{ color: '#b91c1c' }}>{formErrors.items}</div>}
                            </div>
                        ) : (
                            <div style={{ padding: '12px 14px', borderRadius: '12px', backgroundColor: '#F8FAFC', color: '#475569', fontSize: '13px', lineHeight: 1.5 }}>
                                Choose a category above to see job types.
                            </div>
                        )}
                        <div style={{ marginTop: '10px', fontSize: '12px', color: '#666', lineHeight: 1.45 }}>
                            {PHASE1_SCOPE_HELP}
                        </div>
                    </div>

                    {includesMirror && (
                        <div style={{ marginBottom: '22px' }}>
                            <div className="taskio-fieldLabel" style={{ marginBottom: '8px' }}>Mirror size *</div>
                            <div style={{ display: 'grid', gap: '10px' }}>
                                {[
                                    { value: 'standard', label: 'Standard mirror', helper: 'Smaller mirror that is easy to carry and position.' },
                                    { value: 'large_heavy', label: 'Large or heavy mirror', helper: 'Oversized, heavier, or awkward mirrors need at least one photo.' },
                                ].map((option) => (
                                    <label key={option.value} className={`taskio-radioCard taskio-radioCardDetailed ${formData.mirrorSize === option.value ? 'taskio-radioCardActive' : ''}`}>
                                        <input
                                            type="radio"
                                            name="mirrorSize"
                                            value={option.value}
                                            checked={formData.mirrorSize === option.value}
                                            onChange={handleChange}
                                            style={{ marginRight: '8px' }}
                                        />
                                        <span>
                                            <strong>{option.label}</strong>
                                            <span style={{ display: 'block', fontSize: '13px', color: '#666', fontWeight: 400, marginTop: '2px' }}>
                                                {option.helper}
                                            </span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    <div style={{ marginBottom: '28px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <label className="taskio-fieldLabel" htmlFor={descId} style={{ margin: 0 }}>Description *</label>
                            {aiAssistAvailable ? (
                                <div className="taskio-aiAssistInline">
                                    <span className="taskio-aiAssistMicrocopy">Clarity only</span>
                                    <button
                                        type="button"
                                        className="taskio-aiAssistSecondaryBtn"
                                        onClick={() => handleGenerateDescription({ enableUndo: true })}
                                        disabled={isGenerating || !formData.jobType || !formData.description.trim()}
                                    >
                                        <GeminiInspiredIcon />
                                        {isGenerating ? 'Tidying…' : 'Tidy description'}
                                    </button>
                                </div>
                            ) : null}
                            </div>
                        <div>
                            <textarea
                                id={descId}
                                className="taskio-textarea taskio-textareaStep1"
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                placeholder="Describe the job, key measurements, access details, and anything the expert should know."
                                required
                                minLength="10"
                                rows="6"
                            />
                        </div>
                        {aiUndoVisible && (
                            <div id={aiUndoId} className="taskio-aiInlineFeedback" role="status" aria-live="polite">
                                <span>Description updated</span>
                                <span className="taskio-aiInlineDot">·</span>
                                <button type="button" className="taskio-aiUndoBtn" onClick={undoAiDescription}>
                                    Undo
                                </button>
                            </div>
                        )}

                        {showContactWarning && (
                            <div className="taskio-contactWarning" role="alert">
                                💡 Don't include phone/email — Taskio chat keeps you protected
                            </div>
                        )}
                        {phase1TextScopeError && <p style={{ color: 'var(--warning-red, #DC3545)', fontSize: '12px', marginTop: '8px' }}>{phase1TextScopeError}</p>}
                        {formErrors.description && <p style={{ color: 'var(--warning-red, #DC3545)', fontSize: '12px', marginTop: '8px' }}>{formErrors.description}</p>}
                    </div>

                    <div style={{ marginBottom: '28px' }}>
                        <div className="taskio-fieldLabel">
                            Photos{photoRequirement === PHOTO_LEVELS.REQUIRED ? ' *' : ' (optional)'}
                        </div>
                        {photoRequirement === PHOTO_LEVELS.RECOMMENDED && (
                            <p className="taskio-fieldHint" style={{ marginTop: 0, marginBottom: '10px', color: '#64748B' }}>
                                Add a photo for faster, more accurate quotes
                            </p>
                        )}
                        {photoRequirement === PHOTO_LEVELS.REQUIRED && (
                            <p style={{ color: 'var(--warning-red, #DC3545)', fontSize: '12px', marginTop: 0, marginBottom: '10px' }}>
                                Please upload at least 1 photo so experts can quote this job
                            </p>
                        )}
                        <div
                            className="taskio-dropzone"
                            role="button"
                            tabIndex={0}
                            style={{
                                borderColor: photoRequirement === PHOTO_LEVELS.REQUIRED ? '#DC3545' : (photoRequirement === PHOTO_LEVELS.RECOMMENDED ? '#CBD5E1' : undefined),
                                backgroundColor: photoRequirement === PHOTO_LEVELS.RECOMMENDED ? '#F8FAFC' : undefined,
                            }}
                            onClick={() => photoInputRef.current?.click()}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    photoInputRef.current?.click();
                                }
                            }}
                            onDragOver={(e) => { e.preventDefault(); }}
                            onDrop={(e) => {
                                e.preventDefault();
                                addPhotos(e.dataTransfer?.files);
                            }}
                            aria-label={photoRequirement === PHOTO_LEVELS.REQUIRED ? 'Upload required photos' : 'Upload photos'}
                        >
                            <p className="taskio-dropzoneSub">Drag & drop images or click to choose</p>
                            <input
                                ref={photoInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                style={{ display: 'none' }}
                                onChange={(e) => addPhotos(e.target.files)}
                            />

                            {photos.length > 0 && (
                                <div className="taskio-photoGrid" aria-label="Uploaded photo previews">
                                    {photos.map(p => (
                                        <div key={p.id} className="taskio-photoThumb">
                                            <img src={p.url} alt="Uploaded preview" />
                                            <button type="button" className="taskio-photoRemove" onClick={(e) => { e.stopPropagation(); removePhoto(p.id); }} aria-label="Remove photo">
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        {formErrors.photos && <p style={{ color: 'var(--warning-red, #DC3545)', fontSize: '12px', marginTop: '8px' }}>{formErrors.photos}</p>}
                    </div>
                </div>
            );
            case 2: return (
                <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                    <legend style={{ padding: 0 }}>
                        <h2 style={{ 
                            fontFamily: 'Poppins, sans-serif', 
                            marginBottom: '0',
                            fontSize: '22px'
                        }}>
                            Timing
                        </h2>
                    </legend>
                    <div style={{ marginBottom: '20px' }}>
                        <div className="taskio-fieldLabel" style={{ marginBottom: '8px' }}>How long will it take? *</div>
                        {durationOptions.map((option) => (
                            <div key={option.value}>
                                <label className={`taskio-radioCard ${formData.estimatedDuration === option.value ? 'taskio-radioCardActive' : ''}`}>
                                    <input type="radio" name="estimatedDuration" value={option.value} checked={formData.estimatedDuration === option.value} onChange={handleChange} style={{ marginRight: '8px' }} /> {option.label}
                                    <span style={{ display: 'block', fontSize: '13px', color: '#64748B', marginTop: '6px', marginLeft: '24px', lineHeight: 1.45 }}>{option.helper}</span>
                                </label>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                        <div className="taskio-fieldLabel" style={{ marginBottom: '8px' }}>When do you need it? *</div>
                        {urgencyOptions.map((option) => (
                            <div key={option.value}>
                                <label className={`taskio-radioCard ${formData.timeline === option.value ? 'taskio-radioCardActive' : ''}`}>
                                    <input type="radio" name="timeline" value={option.value} checked={formData.timeline === option.value} onChange={handleChange} style={{marginRight: '8px'}}/> {option.label}
                                    <span style={{ display: 'block', fontSize: '13px', color: '#64748B', marginTop: '6px', marginLeft: '24px', lineHeight: 1.45 }}>{option.helper}</span>
                                </label>
                            </div>
                        ))}
                    </div>
                    {formData.timeline === 'On a specific date' && (
                        <div style={{position: 'relative', marginTop: '10px'}}>
                            <div className="taskio-fieldLabel" style={{ marginBottom: '8px' }}>Specific date *</div>
                            <button type="button" onClick={() => setIsCalendarOpen(prev => !prev)} className="taskio-input" style={{ textAlign: 'left', cursor: 'pointer', color: formData.specificDate ? '#222' : '#999' }}>
                                {formData.specificDate ? new Date(formData.specificDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Select a date'}
                            </button>
                            {isCalendarOpen && <Calendar selectedDate={formData.specificDate} onDateSelect={handleDateSelect} onClose={() => setIsCalendarOpen(false)} />}
                        </div>
                    )}
                </fieldset>
            );
            case 3: return (
                <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                    <legend style={{ padding: 0 }}>
                        <h2 style={{ 
                            fontFamily: 'Poppins, sans-serif', 
                            marginBottom: '8px',
                            fontSize: '22px'
                        }}>
                            What's your budget range? *
                        </h2>
                        <p style={{ 
                            fontSize: '14px', 
                            color: '#666',
                            margin: '0 0 20px 0',
                            lineHeight: '1.5',
                            fontFamily: 'Inter, sans-serif'
                        }}>
                            Jobs currently listed on Taskio must stay under $300.
                        </p>
                    </legend>
                    {budgetOptions.map((o) => (
                        <div key={o.value}>
                            <label className={`taskio-radioCard ${formData.budget === o.value ? 'taskio-radioCardActive' : ''}`}>
                                <input type="radio" name="budget" value={o.value} checked={formData.budget === o.value} onChange={handleChange} style={{marginRight: '8px'}}/> {o.label}
                                <span style={{ display: 'block', fontSize: '13px', color: '#666', marginTop: '4px', marginLeft: '24px' }}>{o.helper}</span>
                            </label>
                        </div>
                    ))}
                </fieldset>
            );
            case 4: return (
                <div style={{ position: 'relative' }}>
                    <h2 
                        id={locationHeadingId} 
                        style={{ 
                            fontFamily: 'Poppins, sans-serif', 
                            marginBottom: '8px',
                            fontSize: '22px'
                        }}
                    >
                        Where is the task?
                    </h2>
                    <p style={{ 
                        fontSize: '14px', 
                        color: '#555',
                        margin: '0 0 16px 0',
                        lineHeight: '1.5',
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}>
                        <Lock aria-hidden="true" size={16} strokeWidth={2.2} />
                        <span>Just your suburb — we never share your street address until you choose an expert</span>
                    </p>
                    <p style={{ fontSize: '13px', color: '#666', margin: '0 0 12px 0', fontFamily: 'Inter, sans-serif' }}>
                        Inner Melbourne only for launch: Melbourne, Southbank, Docklands, South Yarra, Prahran, St Kilda, Richmond, and Carlton.
                    </p>
                    <div className="taskio-locationField">
                    <label className="taskio-fieldLabel taskio-fieldLabel--location" htmlFor={locationSelectId}>Choose your suburb *</label>
                    <select
                        id={locationSelectId}
                        className="taskio-input taskio-locationSelect"
                        value={formData.location ? toLocationValue(formData.location) : ''}
                        onChange={handleLocationChange}
                        required
                    >
                        <option value="">Select a supported suburb</option>
                        {melbournePilotLocations.map((item) => (
                            <option key={toLocationValue(item)} value={toLocationValue(item)}>
                                {toLocationLabel(item)}
                            </option>
                        ))}
                    </select>
                    {formData.location && (
                        <div className="taskio-locationMeta">
                            <strong className="taskio-locationMetaStrong">{toLocationLabel(formData.location)}</strong>
                            <span className="taskio-locationMetaHint">
                                Structured suburb, postcode, and map coordinates will be saved for matching.
                            </span>
                        </div>
                    )}
                    {formErrors.location && <p className="taskio-fieldError">{formErrors.location}</p>}
                    </div>

                    <div style={{ marginTop: '24px' }}>
                        <div className="taskio-fieldLabel" style={{ marginBottom: '8px' }}>Access details</div>
                        <div className="taskio-fieldLabel" style={{ marginBottom: '8px' }}>What type of property is this? *</div>
                        {siteAccessFieldOptions.propertyType.map((option) => (
                            <div key={option.value}>
                                <label className={`taskio-radioCard ${formData.propertyType === option.value ? 'taskio-radioCardActive' : ''}`}>
                                    <input type="radio" name="propertyType" value={option.value} checked={formData.propertyType === option.value} onChange={handleChange} style={{ marginRight: '8px' }} /> {option.label}
                                </label>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: '20px' }}>
                        <div className="taskio-fieldLabel" style={{ marginBottom: '8px' }}>Is there a lift available? *</div>
                        {siteAccessFieldOptions.liftAvailable.map((option) => (
                            <div key={option.value}>
                                <label className={`taskio-radioCard ${formData.liftAvailable === option.value ? 'taskio-radioCardActive' : ''}`}>
                                    <input type="radio" name="liftAvailable" value={option.value} checked={formData.liftAvailable === option.value} onChange={handleChange} style={{ marginRight: '8px' }} /> {option.label}
                                </label>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: '20px' }}>
                        <div className="taskio-fieldLabel" style={{ marginBottom: '8px' }}>How many stairs to access the job? *</div>
                        {siteAccessFieldOptions.stairs.map((option) => (
                            <div key={option.value}>
                                <label className={`taskio-radioCard ${formData.stairs === option.value ? 'taskio-radioCardActive' : ''}`}>
                                    <input type="radio" name="stairs" value={option.value} checked={formData.stairs === option.value} onChange={handleChange} style={{ marginRight: '8px' }} /> {option.label}
                                </label>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: '20px' }}>
                        <div className="taskio-fieldLabel" style={{ marginBottom: '8px' }}>Parking availability *</div>
                        {siteAccessFieldOptions.parking.map((option) => (
                            <div key={option.value}>
                                <label className={`taskio-radioCard ${formData.parking === option.value ? 'taskio-radioCardActive' : ''}`}>
                                    <input type="radio" name="parking" value={option.value} checked={formData.parking === option.value} onChange={handleChange} style={{ marginRight: '8px' }} /> {option.label}
                                </label>
                            </div>
                        ))}
                    </div>
                </div>
            );
            case 5:
                return (
                    <div className="taskio-stepFive">
                        <div style={{ marginBottom: '24px' }}>
                            <h2 style={{ 
                                fontFamily: 'Poppins, sans-serif', 
                                marginBottom: '8px',
                                fontSize: '22px'
                            }}>
                                Get quotes from local experts
                            </h2>
                            <p style={{ 
                                fontSize: '14px', 
                                color: '#666',
                                margin: '0',
                                lineHeight: '1.5',
                                fontFamily: 'Inter, sans-serif'
                            }}>
                                Enter your phone number to receive quotes and updates about your task.
                            </p>
                        </div>

                        <div className="taskio-stepFiveStack">
                            <div className="taskio-stepFiveField">
                                <label className="taskio-fieldLabel" htmlFor={phoneId}>Phone number *</label>
                                <input
                                    id={phoneId}
                                    className="taskio-input taskio-stepFiveInput"
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    onBlur={handleBlur}
                                    placeholder="04xx xxx xxx"
                                    required
                                    autoComplete="tel"
                                />
                                {formErrors.phone && <p style={{ color: 'var(--warning-red, #DC3545)', fontSize: '12px', margin: '6px 0 0' }}>{formErrors.phone}</p>}
                            </div>

                            <div className="taskio-stepFiveField">
                                <label className="taskio-fieldLabel" htmlFor={firstNameId}>First name (optional)</label>
                                <input
                                    id={firstNameId}
                                    className="taskio-input taskio-stepFiveInput"
                                    type="text"
                                    name="firstName"
                                    value={formData.firstName}
                                    onChange={handleChange}
                                    onBlur={handleBlur}
                                    placeholder="First name"
                                    autoComplete="given-name"
                                />
                            </div>
                        </div>

                        {otpRequested && (
                            <div className="taskio-stepFiveOtpBox">
                                <label className="taskio-fieldLabel" htmlFor={otpId}>Enter 6-digit code *</label>
                                <input
                                    id={otpId}
                                    className="taskio-input taskio-stepFiveInput"
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={otpCode}
                                    onChange={(e) => {
                                        const nextValue = String(e.target.value || '').replace(/\D/g, '').slice(0, 6);
                                        setOtpCode(nextValue);
                                        setFormErrors(prev => ({ ...prev, otp: '', submit: '' }));
                                        setPostSubmitBlocked(null);
                                    }}
                                    placeholder="123456"
                                    autoComplete="one-time-code"
                                />
                                {otpMessage && <p className="taskio-fieldHint" style={{ marginTop: '8px' }}>{otpMessage}</p>}
                                {formErrors.otp && <p style={{ color: 'var(--warning-red, #DC3545)', fontSize: '12px', margin: '6px 0 0' }}>{formErrors.otp}</p>}
                            </div>
                        )}

                        <div className="taskio-stepFiveLegal">
                            <div className="taskio-fieldLabel" style={{ marginBottom: '8px' }}>Terms & privacy *</div>
                            <LegalNotice
                                requireAcceptance
                                checked={acceptedLegal}
                                onChange={setAcceptedLegal}
                                compact
                                style={{ marginTop: 12 }}
                            />
                        </div>

                        <p className="taskio-fieldHint taskio-stepFiveReassurance">
                            We&apos;ll send a verification code to confirm your number. No spam.
                        </p>
                        <div id={recaptchaContainerId.current} />
                    </div>
                );
            default: return null;
        }
    };

    return (
        !user && !isPublicAcquisitionEnabled() ? (
        <div className="taskio-postJobPage">
            <PublicPageHeader homeTo="/" logoStyle={{ textDecoration: 'none' }} />
            <div className="public-page-shell" style={{ padding: '48px 24px' }}>
                <InviteOnlyNotice
                    title="Log in to post a task"
                    description="Posting a task during this private Melbourne launch requires an invited account. Guest phone signup is not open."
                />
            </div>
        </div>
        ) : (
        <div className="taskio-postJobPage">
            <PublicPageHeader homeTo={user ? "/dashboard" : "/"} logoStyle={{ textDecoration: 'none' }} />
            <div className="public-page-shell taskio-postTaskShell">
            <div className="taskio-postTaskLayout">
                <div className="taskio-summaryCol">
                    <TaskSummary
                        formData={formData}
                        categoryLabel={selectedTopLevelGroup?.label ?? null}
                    />
                </div>
                <div className="taskio-formCol">
                <div role="status" aria-live="polite" aria-atomic="true" style={visuallyHiddenStyle}>
                    {liveRegionMessage}
                </div>
                <div style={{ marginBottom: '30px' }}>
                    <h1 style={{ fontFamily: 'Poppins, sans-serif', marginBottom: '8px' }}>Post a Task</h1>
                    <p style={{ 
                        fontSize: '15px', 
                        color: '#666', 
                        margin: '0',
                        fontFamily: 'Inter, sans-serif'
                    }}>
                        Free to post • No obligation • Only pay if you accept a quote
                    </p>
                    <p style={{ fontSize: '13px', color: '#666', margin: '8px 0 0', fontFamily: 'Inter, sans-serif' }}>
                        Currently available for small indoor jobs across inner Melbourne only.
                    </p>
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <p>Step {currentStep} of {totalSteps}</p>
                    <div 
                        role="progressbar" 
                        aria-valuenow={currentStep} 
                        aria-valuemin="1" 
                        aria-valuemax={totalSteps}
                        aria-label={`Step ${currentStep} of ${totalSteps}`}
                        style={{ width: '100%', backgroundColor: '#E0E0E0', borderRadius: '4px' }}
                    >
                        <div style={{ width: `${(currentStep / totalSteps) * 100}%`, backgroundColor: '#14C5C5', height: '10px', borderRadius: '4px', transition: 'width 0.3s ease-in-out' }}></div>
                    </div>
                </div>
                <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
                    {/* Keyed wrapper ensures previous step content unmounts cleanly when navigating Back/Next */}
                    <div key={currentStep}>
                        {renderStep()}
                    </div>
                    {(postSubmitBlocked || formErrors.submit) && (
                        <div style={{ marginTop: '15px' }}>
                            {postSubmitBlocked?.kind === 'blocked_permission' && (
                                <InlineErrorCardWithNavLinks
                                    title={postSubmitBlocked.title}
                                    message={postSubmitBlocked.body}
                                    primaryLabel="Go to log in"
                                    primaryTo="/login"
                                    secondaryLabel="Back to home"
                                    secondaryTo="/"
                                />
                            )}
                            {postSubmitBlocked?.kind === 'blocked_generic' && (
                                <InlineErrorCardWithNavLinks
                                    title={postSubmitBlocked.title}
                                    message={postSubmitBlocked.body}
                                    primaryLabel="Back to home"
                                    primaryTo="/"
                                />
                            )}
                            {formErrors.submit && !postSubmitBlocked && (
                                <p style={{ color: 'var(--warning-red, #DC3545)', margin: 0 }}>{formErrors.submit}</p>
                            )}
                        </div>
                    )}
                    <div style={{ marginTop: '30px', display: 'flex', justifyContent: currentStep > 1 ? 'space-between' : 'flex-end' }}>
                        {currentStep > 1 && (<button type="button" onClick={prevStep} className="taskio-btnSecondary">Back</button>)}
                        {currentStep < totalSteps && (<button type="button" onClick={nextStep} className="taskio-btnPrimary" disabled={!stepValid || isSubmitting || photoUploadBusy}>{isSubmitting ? 'Submitting...' : 'Next'}</button>)}
                        {currentStep === totalSteps && (
                            <button type="submit" className="taskio-btnPrimary" disabled={!stepValid || isSubmitting || photoUploadBusy || otpBusy}>
                                {(isSubmitting || photoUploadBusy || otpBusy)
                                    ? (user ? 'Posting...' : (otpRequested ? 'Verifying...' : 'Sending code...'))
                                    : (user ? 'Post Task' : (otpRequested ? 'Verify & get quotes' : 'Get quotes'))}
                            </button>
                        )}
                    </div>
                </form>
                </div>
            </div>
        </div>
        </div>
        )
    );
}

export default JobPostingForm;
