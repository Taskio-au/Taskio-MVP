import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import BrandLogo from '../design/components/BrandLogo';

export default function JobPostSuccessPage() {
  const navigate = useNavigate();
  const { jobId } = useParams();

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <BrandLogo to="/dashboard" style={{ textDecoration: 'none' }} />
      </div>
      <div style={styles.card}>
        <div style={styles.badge}>Task posted</div>
        <h1 style={styles.title}>Your job is live</h1>
        <p style={styles.subtitle}>
          Local experts can now review your task and send quotes.
        </p>
        <button
          type="button"
          style={styles.primaryButton}
          onClick={() => navigate(`/job/${jobId}`)}
        >
          View quotes
        </button>
        <button
          type="button"
          style={styles.secondaryButton}
          onClick={() => navigate('/dashboard')}
        >
          Go to dashboard
        </button>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#F7F9FA',
    padding: '28px 16px',
    fontFamily: 'Inter, sans-serif',
  },
  header: {
    maxWidth: 960,
    margin: '0 auto 24px',
  },
  card: {
    maxWidth: 560,
    margin: '0 auto',
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: 20,
    padding: '36px 28px',
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
    textAlign: 'center',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 12px',
    borderRadius: 999,
    background: '#ECFDF5',
    border: '1px solid #A7F3D0',
    color: '#047857',
    fontWeight: 700,
    fontSize: 12,
    marginBottom: 14,
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: 32,
    lineHeight: 1.15,
    margin: '0 0 10px',
    color: '#111827',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 1.6,
    color: '#4B5563',
    margin: '0 0 24px',
  },
  primaryButton: {
    width: '100%',
    height: 46,
    borderRadius: 12,
    border: 'none',
    background: '#14C5C5',
    color: '#FFFFFF',
    fontWeight: 800,
    fontSize: 15,
    cursor: 'pointer',
    marginBottom: 10,
  },
  secondaryButton: {
    width: '100%',
    height: 46,
    borderRadius: 12,
    border: '1px solid #D1D5DB',
    background: '#FFFFFF',
    color: '#374151',
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
  },
};
