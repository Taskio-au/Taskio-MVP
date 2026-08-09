import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase';
import { createApiClient } from '../api/createApiClient';
import AppHeader from './AppHeader';
import PageMain from './ui/PageMain';
import { PageLoadingShell, PageErrorShell } from './ui/AsyncPageStates';
import { tradieDashboardStyles as styles } from '../styles/tradieDashboardStyles';

const api = createApiClient();

/** Compact ★/☆ star row — Unicode, not emoji. */
function StarRow({ rating, max = 5, size = 22 }) {
    const filled = Math.round(Math.min(Math.max(rating ?? 0, 0), max));
    return (
        <span
            aria-label={`${rating?.toFixed(1) ?? 0} out of ${max} stars`}
            style={styles.reviewsHeroStarRow}
        >
            {Array.from({ length: max }, (_, i) => (
                <span
                    key={i}
                    aria-hidden="true"
                    style={{ color: i < filled ? '#F59E0B' : '#D1D5DB', fontSize: size, lineHeight: 1 }}
                >
                    ★
                </span>
            ))}
        </span>
    );
}

function ReviewCardStars({ rating }) {
    const filled = Math.round(Math.min(Math.max(rating ?? 0, 0), 5));
    return (
        <span
            aria-label={`${Math.round(rating ?? 0)} out of 5 stars`}
            style={styles.reviewsPageCardStars}
        >
            {Array.from({ length: 5 }, (_, i) => (
                <span
                    key={i}
                    aria-hidden="true"
                    style={{ color: i < filled ? '#F59E0B' : '#D1D5DB', fontSize: 17, lineHeight: 1 }}
                >
                    ★
                </span>
            ))}
        </span>
    );
}

function formatDate(raw) {
    if (!raw) return '';
    try {
        return new Date(raw).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
        return '';
    }
}

export default function ExpertReviewsPage() {
    const navigate = useNavigate();
    const [user] = useAuthState(auth);

    const [reviews, setReviews] = useState([]);
    const [averageRating, setAverageRating] = useState(null);
    const [reviewCount, setReviewCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!user) { navigate('/'); return; }
        setLoading(true);
        setError('');
        try {
            const res = await api.get(`/api/tradies/${encodeURIComponent(user.uid)}/reviews?limit=50`);
            const d = res?.data || {};
            setReviews(Array.isArray(d.reviews) ? d.reviews : []);
            setAverageRating(d.averageRating ?? null);
            setReviewCount(d.reviewCount ?? d.count ?? 0);
        } catch (e) {
            setError(e?.response?.data?.message || 'Could not load reviews. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [user, navigate]);

    useEffect(() => { load(); }, [load]);

    if (loading) {
        return (
            <>
                <AppHeader userRole="tradie" userName={user?.displayName || ''} userEmail={user?.email || ''} />
                <PageLoadingShell message="Loading your reviews…" detail="Fetching your ratings and client feedback." />
            </>
        );
    }

    if (error) {
        return (
            <>
                <AppHeader userRole="tradie" userName={user?.displayName || ''} userEmail={user?.email || ''} />
                <PageErrorShell title="Couldn't load reviews" message={error} onRetry={load} retryLabel="Try again" />
            </>
        );
    }

    const hasReviews = reviewCount > 0;
    const latestDate = reviews.length > 0 ? reviews[0].createdAt : null;

    return (
        <>
            <style>{`
                @media (max-width: 600px) {
                    .reviews-page-container { padding: 20px 14px 48px !important; }
                    .reviews-hero-card { padding: 18px 16px !important; gap: 16px !important; }
                    .reviews-hero-avg { font-size: 40px !important; }
                    .reviews-meta-row { gap: 8px !important; }
                    .reviews-meta-chip { min-width: 0 !important; flex: 1 1 auto !important; padding: 10px 12px !important; }
                    .reviews-card-list { grid-template-columns: 1fr !important; }
                }
            `}</style>

            <AppHeader userRole="tradie" userName={user?.displayName || ''} userEmail={user?.email || ''} />
            <PageMain label="Reviews and ratings">
                <div style={styles.reviewsPageShell}>
                    <div
                        style={styles.reviewsPageContainer}
                        className="reviews-page-container"
                    >
                        {/* ── Page header ── */}
                        <div style={styles.reviewsPageHeaderSection}>
                            <h1 style={styles.reviewsPageHeading}>Reviews &amp; ratings</h1>
                            <p style={styles.reviewsPageSubtitle}>
                                Track client feedback from your completed Taskio jobs.
                            </p>
                        </div>

                        {/* ── Hero summary card ── */}
                        <div style={styles.reviewsHeroCard} className="reviews-hero-card">
                            {hasReviews ? (
                                <>
                                    <span
                                        style={styles.reviewsHeroAvgNumber}
                                        className="reviews-hero-avg"
                                        aria-label={`Average rating ${averageRating?.toFixed(1)}`}
                                    >
                                        {averageRating?.toFixed(1)}
                                    </span>
                                    <div style={styles.reviewsHeroRight}>
                                        <StarRow rating={averageRating} size={28} />
                                        <div style={styles.reviewsHeroLabel}>
                                            Based on {reviewCount} review{reviewCount !== 1 ? 's' : ''}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div>
                                    <p style={styles.reviewsHeroEmptyText}>No reviews yet</p>
                                    <p style={styles.reviewsHeroEmptyHint}>
                                        Once you complete paid tasks, client reviews will appear here.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* ── Metric chips — only when there are reviews ── */}
                        {hasReviews && (
                            <div style={styles.reviewsMetaRow} className="reviews-meta-row">
                                <div style={styles.reviewsMetaChip} className="reviews-meta-chip">
                                    <span style={styles.reviewsMetaChipLabel}>Avg rating</span>
                                    <span style={styles.reviewsMetaChipValue}>{averageRating?.toFixed(1)}</span>
                                </div>
                                <div style={styles.reviewsMetaChip} className="reviews-meta-chip">
                                    <span style={styles.reviewsMetaChipLabel}>Total reviews</span>
                                    <span style={styles.reviewsMetaChipValue}>{reviewCount}</span>
                                </div>
                                {latestDate && (
                                    <div style={styles.reviewsMetaChip} className="reviews-meta-chip">
                                        <span style={styles.reviewsMetaChipLabel}>Latest review</span>
                                        <span style={{ ...styles.reviewsMetaChipValue, fontSize: 13, paddingTop: 2 }}>
                                            {formatDate(latestDate)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Review list ── */}
                        <div style={styles.reviewsListSection}>
                            <div style={styles.reviewsListHeader}>
                                <h2 style={styles.reviewsListTitle}>Client reviews</h2>
                                {hasReviews && (
                                    <span style={styles.reviewsListCount}>
                                        {reviewCount} review{reviewCount !== 1 ? 's' : ''}
                                    </span>
                                )}
                            </div>

                            {!hasReviews ? (
                                <div style={styles.reviewsPageEmptyState}>
                                    <p style={styles.reviewsPageEmptyTitle}>No reviews yet</p>
                                    <p style={styles.reviewsPageEmptyText}>
                                        Once you complete paid tasks, client reviews will appear here.
                                    </p>
                                </div>
                            ) : (
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 400px), 1fr))',
                                        gap: '16px',
                                    }}
                                    className="reviews-card-list"
                                >
                                    {reviews.map((r) => (
                                        <div key={r.id} style={styles.reviewsPageCard}>
                                            <div style={styles.reviewsPageCardTopRow}>
                                                <ReviewCardStars rating={r.rating} />
                                                <span style={styles.reviewsPageCardDate}>
                                                    {formatDate(r.createdAt)}
                                                </span>
                                            </div>

                                            {r.text ? (
                                                <p style={styles.reviewsPageCardText}>{r.text}</p>
                                            ) : (
                                                <p style={styles.reviewsPageCardEmptyText}>
                                                    No written feedback provided.
                                                </p>
                                            )}

                                            <div>
                                                <span style={styles.reviewsVerifiedBadge} aria-label="Verified Taskio review">
                                                    ✓ Verified Taskio review
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </PageMain>
        </>
    );
}
