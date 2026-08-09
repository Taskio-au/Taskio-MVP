import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function TradieReviewsSection({ reviewSummary, reviews, styles }) {
  const navigate = useNavigate();
  const count = reviewSummary?.reviewCount ?? 0;

  return (
    <section style={styles.reviewsSection} aria-labelledby="tradie-reviews-heading">
      <div style={styles.sectionHeader}>
        <h2 id="tradie-reviews-heading" style={styles.sectionTitle}>Recent Reviews</h2>
        {count > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={styles.sectionCount}>
              {count} review{count !== 1 ? 's' : ''}
            </div>
            <button
              type="button"
              style={styles.dashboardSectionLink}
              onClick={() => navigate('/tradie/reviews')}
              aria-label="View all reviews and ratings"
            >
              View all
            </button>
          </div>
        )}
      </div>

      {count === 0 ? (
        <div style={{
          ...styles.emptyState,
          padding: '32px 24px',
          textAlign: 'left',
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            No reviews yet
          </div>
          <div style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.55 }}>
            Completed paid tasks can receive client reviews.
          </div>
        </div>
      ) : (
        <div style={styles.reviewGrid}>
          {reviews.slice(0, 3).map((r) => (
            <div key={r.id} style={styles.reviewCard}>
              <div style={styles.reviewHeader}>
                <div
                  style={styles.ratingStars}
                  aria-label={`${Math.floor(r.rating)} out of 5 stars`}
                >
                  {Array.from({ length: 5 }, (_, i) => (
                    <span
                      key={i}
                      aria-hidden="true"
                      style={{ color: i < Math.round(r.rating) ? '#F59E0B' : '#D1D5DB', fontSize: 16 }}
                    >
                      ★
                    </span>
                  ))}
                </div>
                <div style={styles.reviewDate}>
                  {r.createdAt
                    ? new Date(r.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
                    : ''}
                </div>
              </div>
              {r.text ? (
                <p style={styles.reviewText}>
                  {r.text.length > 120 ? `${r.text.substring(0, 120)}\u2026` : r.text}
                </p>
              ) : (
                <p style={styles.reviewTextEmpty}>No written feedback provided.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
