import React from 'react';
import { Link } from 'react-router-dom';
import PublicPageHeader from '../components/PublicPageHeader';
import InviteOnlyNotice from '../components/InviteOnlyNotice';
import { isPublicAcquisitionEnabled } from '../config/publicAcquisitionConfig';
import { ArrowRight, Briefcase, Home } from 'lucide-react';

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#F7F9FA',
    fontFamily: 'Inter, sans-serif',
  },
  container: {
    maxWidth: 880,
    margin: '0 auto',
    padding: '64px 24px',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    border: '1px solid #E5E7EB',
    boxShadow: '0 10px 32px rgba(17, 24, 39, 0.06)',
    padding: 32,
  },
  headerBlock: {
    marginBottom: 28,
  },
  title: {
    margin: 0,
    fontFamily: 'Poppins, sans-serif',
    fontSize: 32,
    fontWeight: 700,
    color: '#111827',
  },
  subtitle: {
    margin: '10px 0 0 0',
    fontSize: 16,
    lineHeight: 1.6,
    color: '#6B7280',
  },
  options: {
    display: 'grid',
    gap: 16,
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  },
  optionCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    padding: 24,
    borderRadius: 18,
    border: '1px solid #E5E7EB',
    backgroundColor: '#F9FAFB',
    textDecoration: 'none',
    color: '#111827',
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#ECFEFF',
    color: '#0F766E',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
  },
  optionCopy: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.6,
    color: '#6B7280',
  },
  optionAction: {
    marginTop: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    fontWeight: 700,
    color: '#14C5C5',
  },
  footer: {
    marginTop: 24,
    textAlign: 'center',
    fontSize: 14,
    color: '#6B7280',
  },
  footerLink: {
    color: '#14C5C5',
    textDecoration: 'none',
    fontWeight: 700,
  },
};

export default function GetStartedPage() {
  const publicAcquisition = isPublicAcquisitionEnabled();

  return (
    <div style={styles.page}>
      <PublicPageHeader homeTo="/" />
      <main style={styles.container}>
        {publicAcquisition ? (
          <div style={styles.card}>
            <div style={styles.headerBlock}>
              <h1 style={styles.title}>Get started with Taskio</h1>
              <p style={styles.subtitle}>Choose how you want to use Taskio today.</p>
            </div>

            <div style={styles.options}>
              <Link to="/post-job" style={styles.optionCard}>
                <div style={styles.optionIcon}>
                  <Home size={20} />
                </div>
                <h2 style={styles.optionTitle}>Post a task</h2>
                <p style={styles.optionCopy}>Get quotes for a small indoor job and create your account along the way.</p>
                <span style={styles.optionAction}>
                  Continue
                  <ArrowRight size={16} />
                </span>
              </Link>

              <Link to="/tradie/signup" style={styles.optionCard}>
                <div style={styles.optionIcon}>
                  <Briefcase size={20} />
                </div>
                <h2 style={styles.optionTitle}>Become an Expert</h2>
                <p style={styles.optionCopy}>Set up your expert profile and start quoting on suitable jobs.</p>
                <span style={styles.optionAction}>
                  Continue
                  <ArrowRight size={16} />
                </span>
              </Link>
            </div>

            <div style={styles.footer}>
              Already have an account? <Link to="/login" style={styles.footerLink}>Log in</Link>
            </div>
          </div>
        ) : (
          <InviteOnlyNotice
            title="Taskio is invite-only right now"
            description="If Taskio invited you as a Client or Expert, log in with that account. Public signup is closed for this private Melbourne launch."
          />
        )}
      </main>
    </div>
  );
}
