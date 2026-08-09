import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase';
import { createApiClient } from '../api/createApiClient';
import { buildTaskExpertChecklistItems, isExpertQuoteReadinessAwaitingAdminOnly } from '../utils/taskExpertEligibility';
import { useChatThreads } from './useMessagingSummary';

const api = createApiClient();

/**
 * Shared data loading and account actions for expert Dashboard + Tasks pages.
 */
export function useExpertDashboardData() {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [stripeStatus, setStripeStatus] = useState({ enabled: false, onboardingStatus: 'pending', loading: true });
    const [reviews, setReviews] = useState([]);
    const [reviewSummary, setReviewSummary] = useState({ averageRating: null, reviewCount: 0 });
    const [stripeBannerDismissed, setStripeBannerDismissed] = useState(false);
    const [me, setMe] = useState(null);
    const [meApiUnreachable, setMeApiUnreachable] = useState(false);
    const lastGoodMeRef = useRef(null);
    const [checklistOpen, setChecklistOpen] = useState(false);
    const [deletionCancelling, setDeletionCancelling] = useState(false);
    const [refreshingStripe, setRefreshingStripe] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const [user] = useAuthState(auth);
    const { unreadByJobId } = useChatThreads(user, 100);

    const fetchDashboardData = useCallback(async ({ forceStripeRefresh = false, preserveLoading = false } = {}) => {
        if (!user) {
            navigate('/');
            return;
        }

        if (!preserveLoading) {
            setLoading(true);
        }

        try {
            setError('');
            const token = await user.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            const stripePath = forceStripeRefresh ? '/api/tradie/stripe/status?refresh=true' : '/api/tradie/stripe/status';

            const [stripeRes, jobsRes, reviewsRes] = await Promise.allSettled([
                api.get(stripePath, config),
                api.get('/api/tradie/jobs', config),
                api.get(`/api/tradies/${encodeURIComponent(user.uid)}/reviews?limit=20`),
            ]);

            try {
                const meRes = await api.get('/api/me', config);
                const payload = meRes.data || null;
                if (payload) lastGoodMeRef.current = payload;
                setMe(payload ?? lastGoodMeRef.current);
                setMeApiUnreachable(false);
            } catch (meErr) {
                // eslint-disable-next-line no-console
                console.error('GET /api/me failed:', meErr);
                setMeApiUnreachable(true);
                setMe(lastGoodMeRef.current);
            }

            if (stripeRes.status === 'fulfilled') {
                setStripeStatus({ loading: false, ...(stripeRes.value.data || {}) });
            } else {
                console.error('Stripe status fetch failed:', stripeRes.reason);
                setStripeStatus({ enabled: false, onboardingStatus: 'pending', loading: false });
            }

            if (jobsRes.status === 'fulfilled') {
                setJobs(jobsRes.value.data);
            } else {
                const status = jobsRes.reason?.response?.status;
                const msg = jobsRes.reason?.response?.data?.message;
                setError(msg || (status ? `Failed to load tasks (HTTP ${status}).` : 'Could not load task invitations. Please try again later.'));
            }

            if (reviewsRes.status === 'fulfilled') {
                const data = reviewsRes.value.data || {};
                setReviews(Array.isArray(data.reviews) ? data.reviews : []);
                setReviewSummary({ averageRating: data.averageRating ?? null, reviewCount: data.reviewCount ?? data.count ?? 0 });
            } else {
                setReviews([]);
                setReviewSummary({ averageRating: null, reviewCount: 0 });
            }
            return true;
        } catch (err) {
            console.error('Error fetching expert dashboard:', err);
            setError(err?.response?.data?.message || 'Could not load task invitations. Please try again later.');
            return false;
        } finally {
            setLoading(false);
        }
    }, [navigate, user]);

    useEffect(() => {
        const params = new URLSearchParams(location.search || '');
        const stripeQuery = String(params.get('stripe') || '').trim();
        const shouldForceStripeRefresh = stripeQuery === 'return' || stripeQuery === 'refresh';
        let active = true;

        const run = async () => {
            const refreshed = await fetchDashboardData({ forceStripeRefresh: shouldForceStripeRefresh });
            if (!active || !shouldForceStripeRefresh || refreshed !== true) {
                return;
            }
            const nextParams = new URLSearchParams(location.search || '');
            nextParams.delete('stripe');
            const nextSearch = nextParams.toString();
            navigate(nextSearch ? `${location.pathname}?${nextSearch}` : location.pathname, { replace: true });
        };

        run();

        const intervalMs = 30000;
        const t = setInterval(() => {
            if (!auth.currentUser) return;
            fetchDashboardData({ preserveLoading: true });
        }, intervalMs);

        const onFocus = () => {
            if (auth.currentUser) fetchDashboardData({ preserveLoading: true });
        };
        window.addEventListener('focus', onFocus);

        return () => {
            active = false;
            clearInterval(t);
            window.removeEventListener('focus', onFocus);
        };
    }, [fetchDashboardData, location.pathname, location.search, navigate]);

    const canQuote = useMemo(() => {
        if (!me?.eligibility) return false;
        return me.eligibility?.canQuote === true;
    }, [me]);

    const pendingDeletion = me?.profile?.status === 'pending_deletion';

    const authEmailVerified = user?.emailVerified === true;
    const eligibilityChecklist = useMemo(
        () =>
            buildTaskExpertChecklistItems(me?.eligibility?.checklist, {
                authEmailVerified,
            }),
        [me?.eligibility?.checklist, authEmailVerified]
    );

    const quoteReadinessAwaitingAdminOnly = useMemo(
        () => isExpertQuoteReadinessAwaitingAdminOnly(eligibilityChecklist),
        [eligibilityChecklist]
    );

    const cancelDeletion = async () => {
        setError('');
        setDeletionCancelling(true);
        try {
            const u = auth.currentUser;
            if (!u) return navigate('/');
            const token = await u.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await api.post('/api/me/deletion/cancel', {}, config);
            try {
                const refreshed = await api.get('/api/me', config);
                const payload = refreshed.data || null;
                if (payload) lastGoodMeRef.current = payload;
                setMe(payload ?? lastGoodMeRef.current);
                setMeApiUnreachable(false);
            } catch (meErr) {
                // eslint-disable-next-line no-console
                console.error('GET /api/me failed after cancellation:', meErr);
                setMeApiUnreachable(true);
                setMe(lastGoodMeRef.current);
            }
        } catch (e) {
            setError(e?.response?.data?.message || 'Failed to cancel deletion.');
        } finally {
            setDeletionCancelling(false);
        }
    };

    const startStripeOnboarding = async () => {
        setError('');
        try {
            const u = auth.currentUser;
            if (!u) return navigate('/');
            const token = await u.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            const res = await api.post('/api/tradie/stripe/onboarding-link', {}, config);
            const url = res?.data?.url;
            if (!url) throw new Error('Missing onboarding URL');
            window.location.assign(url);
        } catch (e) {
            setError(e?.response?.data?.message || e?.message || 'Failed to start Stripe onboarding.');
        }
    };

    return {
        user,
        jobs,
        loading,
        error,
        stripeStatus,
        reviews,
        reviewSummary,
        me,
        meApiUnreachable,
        canQuote,
        pendingDeletion,
        eligibilityChecklist,
        quoteReadinessAwaitingAdminOnly,
        fetchDashboardData,
        startStripeOnboarding,
        cancelDeletion,
        refreshingStripe,
        setRefreshingStripe,
        stripeBannerDismissed,
        setStripeBannerDismissed,
        checklistOpen,
        setChecklistOpen,
        deletionCancelling,
        unreadByJobId,
    };
}
