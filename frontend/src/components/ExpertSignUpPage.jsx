import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, MapPin, ShieldCheck } from 'lucide-react';
import { sendEmailVerification, signInWithEmailAndPassword, signInWithPopup, updateProfile } from 'firebase/auth';
import { createApiClient } from '../api/createApiClient';
import { auth, googleProvider } from '../firebase';
import { expertCategoryOrder, phase1ExpertiseCatalog } from '../shared/expertiseCatalog';
import { getCanonicalJobTypeLabel } from '../constants/taskTaxonomy';
import { melbournePilotLocations } from '../shared/auLocations';
import BrandLogo from '../design/components/BrandLogo';
import BenefitsCard from './tradie-signup/BenefitsCard';
import LegalNotice from './LegalNotice';
import { GoogleActionButton } from './profile/GoogleBrand';

const api = createApiClient();

function toLocationValue(location) {
  return `${location.suburb}|${location.postcode}`;
}

function buildServiceLocation(location) {
  if (!location) return null;
  return {
    label: location.label,
    suburb: location.suburb,
    state: location.state,
    postcode: location.postcode,
    country: 'AU',
  };
}

function isValidEmail(value) {
  return /\S+@\S+\.\S+/.test(String(value || '').trim());
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function splitFullName(value) {
  const parts = normalizeName(value).split(' ').filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : '',
  };
}

function groupExpertiseOptions(items) {
  const order = Array.isArray(expertCategoryOrder) && expertCategoryOrder.length > 0
    ? expertCategoryOrder
    : [...new Set(items.map((item) => item.expertCategory || item.category))];

  return order
    .map((title) => ({
      title,
      items: items.filter((item) => (item.expertCategory || item.category) === title),
    }))
    .filter((group) => group.items.length > 0);
}

export default function ExpertSignUpPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    serviceLocation: null,
    primaryServiceSuburb: '',
    primaryServicePostcode: '',
    expertise: [],
  });
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
  const [createdAccountEmail, setCreatedAccountEmail] = useState('');
  const [signupMethod, setSignupMethod] = useState('email');

  const groupedExpertise = useMemo(() => groupExpertiseOptions(phase1ExpertiseCatalog), []);
  const selectedLocationValue = formData.serviceLocation ? toLocationValue(formData.serviceLocation) : '';
  const selectedCount = formData.expertise.length;

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLocationChange = (event) => {
    const nextLocation = melbournePilotLocations.find((item) => toLocationValue(item) === event.target.value) || null;
    setFormData((prev) => ({
      ...prev,
      serviceLocation: buildServiceLocation(nextLocation),
      primaryServiceSuburb: nextLocation?.suburb || '',
      primaryServicePostcode: nextLocation?.postcode || '',
    }));
  };

  const handleExpertiseToggle = (key) => {
    setFormData((prev) => {
      const exists = prev.expertise.includes(key);
      return {
        ...prev,
        expertise: exists ? prev.expertise.filter((item) => item !== key) : [...prev.expertise, key],
      };
    });
  };

  const validateAccountStep = () => {
    const firstName = normalizeName(formData.firstName);
    const lastName = normalizeName(formData.lastName);
    const email = String(formData.email || '').trim().toLowerCase();
    const password = String(formData.password || '');
    const confirmPassword = String(formData.confirmPassword || '');

    if (!firstName) return 'First name is required.';
    if (!lastName) return 'Last name is required.';
    if (!email || !isValidEmail(email)) return 'Enter a valid email address.';
    if (signupMethod !== 'google') {
      if (password.length < 8) return 'Password must be at least 8 characters.';
      if (password !== confirmPassword) return 'Passwords do not match. Please re-enter them.';
    }

    setFormData((prev) => ({
      ...prev,
      firstName,
      lastName,
      email,
    }));
    return '';
  };

  const validatePreferencesStep = () => {
    if (!formData.serviceLocation?.postcode) return 'Choose your primary service suburb.';
    if (formData.expertise.length === 0) return 'Select at least one type of job.';
    if (!acceptedLegal) return 'Please accept the Terms of Use and Privacy Policy to continue.';
    return '';
  };

  const handleGoogleSignUp = async () => {
    setError('');
    setLoading(true);
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      const googleEmail = String(credential?.user?.email || '').trim().toLowerCase();
      if (!googleEmail) {
        setError('We could not read an email from your Google account. Please use email signup instead.');
        return;
      }
      const googleName = splitFullName(credential?.user?.displayName || '');
      setFormData((prev) => ({
        ...prev,
        firstName: prev.firstName || googleName.firstName,
        lastName: prev.lastName || googleName.lastName,
        email: googleEmail,
        password: '',
        confirmPassword: '',
      }));
      setSignupMethod('google');
      setCurrentStep(2);
    } catch (err) {
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('Google signup was cancelled.');
      } else if (err?.code === 'auth/account-exists-with-different-credential') {
        setError('This email already uses another sign-in method. Please log in instead.');
      } else {
        setError('We could not continue with Google. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = (event) => {
    event.preventDefault();
    setError('');
    const nextError = validateAccountStep();
    if (nextError) {
      setError(nextError);
      return;
    }
    setCurrentStep(2);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const accountError = validateAccountStep();
    if (accountError) {
      setCurrentStep(1);
      setError(accountError);
      return;
    }

    const preferencesError = validatePreferencesStep();
    if (preferencesError) {
      setError(preferencesError);
      return;
    }

    setLoading(true);
    try {
      if (signupMethod === 'google') {
        await api.post('/api/users/register/expert-google', {
          firstName: formData.firstName,
          lastName: formData.lastName,
          serviceLocation: formData.serviceLocation,
          primaryServiceSuburb: formData.primaryServiceSuburb,
          primaryServicePostcode: formData.primaryServicePostcode,
          expertise: formData.expertise,
        });
      } else {
        await api.post('/api/users/register', {
          role: 'tradie',
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          password: formData.password,
          serviceLocation: formData.serviceLocation,
          primaryServiceSuburb: formData.primaryServiceSuburb,
          primaryServicePostcode: formData.primaryServicePostcode,
          expertise: formData.expertise,
        });

        try {
          const credential = await signInWithEmailAndPassword(auth, formData.email, formData.password);
          const fullName = `${formData.firstName} ${formData.lastName}`.trim();
          if (credential?.user && fullName && !credential.user.displayName) {
            await updateProfile(credential.user, { displayName: fullName });
          }
          if (credential?.user && credential.user.emailVerified === false) {
            await sendEmailVerification(credential.user);
          }
        } catch (_) {
          // Non-blocking. The account already exists at this point.
        }
      }

      setCreatedAccountEmail(formData.email);
      setSignupComplete(true);
    } catch (err) {
      const errorMessage = err?.response?.data?.message;
      const errorCode = err?.response?.data?.code || err?.code;

      if (errorCode === 'auth/email-already-exists' || /already exists|already registered|already in use/i.test(errorMessage || '')) {
        setError('This email is already registered. Please log in or use a different email.');
      } else if (errorMessage) {
        setError(errorMessage);
      } else {
        setError('Registration failed. Please try again or contact support if the problem persists.');
      }
    } finally {
      setLoading(false);
    }
  };

  const renderStepIndicator = () => (
    <div style={styles.stepIndicator}>
      {[1, 2].map((step) => {
        const isActive = currentStep === step;
        const isComplete = currentStep > step;
        return (
          <div key={step} style={styles.stepIndicatorItem}>
            <div
              style={{
                ...styles.stepIndicatorBadge,
                ...(isActive ? styles.stepIndicatorBadgeActive : {}),
                ...(isComplete ? styles.stepIndicatorBadgeComplete : {}),
              }}
            >
              {step}
            </div>
            <div style={styles.stepIndicatorText}>
              {step === 1 ? 'Create account' : 'Work preferences'}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderAccountStep = () => (
    <>
      <div style={styles.sectionHeader}>
        <div style={styles.sectionEyebrow}>Step 1</div>
        <h2 style={styles.sectionTitle}>Create your expert account</h2>
        <p style={styles.sectionDescription}>Start with the basics.</p>
      </div>

      <div style={styles.inputRow} className="expert-signup-inputRow">
        <div style={styles.inputWrapper}>
          <label style={styles.label} htmlFor="expert-first-name">First name</label>
          <input
            id="expert-first-name"
            name="firstName"
            type="text"
            value={formData.firstName}
            onChange={handleFieldChange}
            placeholder="John"
            style={styles.input}
            autoComplete="given-name"
          />
        </div>
        <div style={styles.inputWrapper}>
          <label style={styles.label} htmlFor="expert-last-name">Last name</label>
          <input
            id="expert-last-name"
            name="lastName"
            type="text"
            value={formData.lastName}
            onChange={handleFieldChange}
            placeholder="Smith"
            style={styles.input}
            autoComplete="family-name"
          />
        </div>
      </div>

      <div style={styles.inputWrapper}>
        <label style={styles.label} htmlFor="expert-email">Email address</label>
        <input
          id="expert-email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleFieldChange}
          placeholder="you@example.com"
          style={styles.input}
          autoComplete="email"
          disabled={signupMethod === 'google'}
        />
      </div>

      {signupMethod === 'google' ? (
        <div style={styles.googleConnectedNote}>
          <CheckCircle2 size={16} />
          <span>Google connected. You can finish your profile details in the next step.</span>
        </div>
      ) : (
        <>
          <div style={styles.inputWrapper}>
            <label style={styles.label} htmlFor="expert-password">Password</label>
            <div style={styles.passwordWrap}>
              <input
                id="expert-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleFieldChange}
                placeholder="Minimum 8 characters"
                style={{ ...styles.input, ...styles.passwordInput }}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                style={styles.passwordToggle}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div style={styles.inputWrapper}>
            <label style={styles.label} htmlFor="expert-confirm-password">Confirm password</label>
            <div style={styles.passwordWrap}>
              <input
                id="expert-confirm-password"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={handleFieldChange}
                placeholder="Re-enter your password"
                style={{ ...styles.input, ...styles.passwordInput }}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                style={styles.passwordToggle}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        </>
      )}

      <div style={styles.actionsRow}>
        <button type="button" onClick={handleContinue} style={styles.primaryButton}>
          Continue
          <ChevronRight size={18} />
        </button>
      </div>

      {signupMethod !== 'google' ? (
        <>
          <div style={styles.dividerRow}>
            <div style={styles.dividerLine} />
            <span style={styles.dividerText}>or</span>
            <div style={styles.dividerLine} />
          </div>
          <GoogleActionButton
            style={styles.googleButton}
            onClick={handleGoogleSignUp}
            disabled={loading}
          >
            {loading ? 'Please wait...' : 'Continue with Google'}
          </GoogleActionButton>
        </>
      ) : null}
    </>
  );

  const renderPreferencesStep = () => (
    <>
      <div style={styles.sectionHeader}>
        <div style={styles.sectionEyebrow}>Step 2</div>
        <h2 style={styles.sectionTitle}>Set your work preferences</h2>
        <p style={styles.sectionDescription}>Choose your suburb and the jobs you want.</p>
      </div>

      <div style={styles.inputWrapper}>
        <label style={styles.label} htmlFor="expert-service-location">Primary service suburb</label>
        <div style={styles.selectWrap}>
          <MapPin size={16} style={styles.selectIcon} />
          <select
            id="expert-service-location"
            value={selectedLocationValue}
            onChange={handleLocationChange}
            style={styles.select}
          >
            <option value="">Choose a suburb and postcode</option>
            {melbournePilotLocations.map((location) => (
              <option key={toLocationValue(location)} value={toLocationValue(location)}>
                {location.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={styles.expertiseSection}>
        <div style={styles.expertiseHeader}>
          <div>
            <label style={styles.label}>What jobs do you want to get hired for?</label>
          </div>
          {selectedCount > 0 ? <div style={styles.selectionBadge}>{selectedCount} selected</div> : null}
        </div>

        {groupedExpertise.map((group) => (
          <div key={group.title} style={styles.expertiseGroup}>
            <h3 style={styles.expertiseGroupTitle}>{group.title}</h3>
            <div style={styles.expertiseGrid} className="expert-signup-expertiseGrid">
              {group.items.map((option) => {
                const isSelected = formData.expertise.includes(option.key);
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => handleExpertiseToggle(option.key)}
                    style={{
                      ...styles.expertiseChip,
                      ...(isSelected ? styles.expertiseChipSelected : {}),
                    }}
                  >
                    <span>{getCanonicalJobTypeLabel(option.key) || option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={styles.readinessNote}>
        <ShieldCheck size={16} />
        <span>Add your phone after signup for verification and payouts.</span>
      </div>

      <LegalNotice
        requireAcceptance
        checked={acceptedLegal}
        onChange={setAcceptedLegal}
        style={{ marginTop: 8 }}
      />

      <div style={styles.actionsRow}>
        <button type="button" onClick={() => setCurrentStep(1)} style={styles.secondaryButton}>
          <ChevronLeft size={18} />
          Back
        </button>
        <button type="submit" disabled={loading} style={{ ...styles.primaryButton, ...(loading ? styles.primaryButtonDisabled : {}) }}>
          {loading ? 'Creating expert account...' : 'Create expert account'}
        </button>
      </div>
    </>
  );

  const renderSuccessState = () => (
    <div style={styles.successState}>
      <div style={styles.successIconWrap}>
        <CheckCircle2 size={24} />
      </div>
      <div style={styles.sectionEyebrow}>Account created</div>
      <h2 style={styles.successTitle}>{signupMethod === 'google' ? 'Finish expert readiness' : 'Verify your email to finish setup'}</h2>
      <p style={styles.successCopy}>
        {signupMethod === 'google'
          ? <>You&apos;re signed in as <strong>{createdAccountEmail}</strong>. Add your phone next, then complete expert verification when prompted.</>
          : <>Your Expert account for <strong>{createdAccountEmail}</strong> is ready. Verify your email, then add your phone to keep moving.</>}
      </p>
      <div style={styles.successChecklist}>
        {signupMethod === 'google' ? null : (
          <div style={styles.successChecklistItem}>1. Verify your email address.</div>
        )}
        <div style={styles.successChecklistItem}>{signupMethod === 'google' ? '1.' : '2.'} Add and verify your phone number.</div>
        <div style={styles.successChecklistItem}>{signupMethod === 'google' ? '2.' : '3.'} Complete expert verification and payout setup when prompted.</div>
      </div>
      <div style={styles.actionsRow}>
        <button type="button" style={styles.primaryButton} onClick={() => navigate('/tradie/dashboard')}>
          Go to dashboard
        </button>
        <button type="button" style={styles.secondaryButton} onClick={() => navigate('/login')}>
          Back to login
        </button>
      </div>
    </div>
  );

  return (
    <div style={styles.page}>
      <style>{`
        @media (max-width: 980px) {
          .expert-signup-layout {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 720px) {
          .expert-signup-inputRow,
          .expert-signup-expertiseGrid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <BrandLogo to="/" style={styles.logoLink} />
          <div style={styles.headerRight}>
            <span style={styles.headerText}>Already have an account?</span>
            <Link to="/login" style={styles.loginButton}>
              Log In
            </Link>
          </div>
        </div>
      </header>

      <main style={styles.container} className="expert-signup-layout">
        <div style={styles.formCard}>
          <div style={styles.cardHeader}>
            <h1 style={styles.title}>Become a Taskio Expert</h1>
            <p style={styles.subtitle}>Set up your expert profile in two clear steps.</p>
            {!signupComplete ? renderStepIndicator() : null}
          </div>

          {!signupComplete ? (
            <form onSubmit={handleSubmit} style={styles.form}>
              {error ? (
                <div style={styles.errorBanner}>
                  <AlertTriangle size={18} />
                  <span>{error}</span>
                </div>
              ) : null}
              {currentStep === 1 ? renderAccountStep() : renderPreferencesStep()}
            </form>
          ) : renderSuccessState()}

          <div style={styles.footer}>
            <p style={styles.footerText}>
              Already have an account? <Link to="/login" style={styles.footerLink}>Log In</Link>
            </p>
          </div>
        </div>

        <BenefitsCard styles={styles} />
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#F7F9FA',
    fontFamily: 'Inter, sans-serif',
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderBottom: '1px solid #E5E7EB',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  headerContent: {
    maxWidth: 1240,
    margin: '0 auto',
    padding: '18px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  logoLink: {
    textDecoration: 'none',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  headerText: {
    fontSize: 14,
    color: '#6B7280',
  },
  loginButton: {
    color: '#14C5C5',
    fontWeight: 700,
    textDecoration: 'none',
  },
  container: {
    maxWidth: 1240,
    margin: '0 auto',
    padding: '40px 24px 56px',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 0.8fr)',
    gap: 24,
    alignItems: 'start',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    border: '1px solid #E5E7EB',
    boxShadow: '0 12px 36px rgba(17, 24, 39, 0.08)',
    padding: 32,
  },
  cardHeader: {
    marginBottom: 28,
    display: 'grid',
    gap: 12,
  },
  title: {
    margin: 0,
    fontFamily: 'Poppins, sans-serif',
    fontSize: 34,
    lineHeight: 1.15,
    color: '#111827',
  },
  subtitle: {
    margin: 0,
    fontSize: 16,
    lineHeight: 1.6,
    color: '#6B7280',
    maxWidth: 620,
  },
  stepIndicator: {
    display: 'flex',
    gap: 18,
    flexWrap: 'wrap',
    marginTop: 6,
  },
  stepIndicatorItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  stepIndicatorBadge: {
    width: 30,
    height: 30,
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    border: '1px solid #E5E7EB',
  },
  stepIndicatorBadgeActive: {
    color: '#FFFFFF',
    backgroundColor: '#14C5C5',
    borderColor: '#14C5C5',
  },
  stepIndicatorBadgeComplete: {
    color: '#0F766E',
    backgroundColor: '#ECFEFF',
    borderColor: '#99F6E4',
  },
  stepIndicatorText: {
    fontSize: 13,
    fontWeight: 700,
    color: '#374151',
  },
  form: {
    display: 'grid',
    gap: 24,
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 16px',
    borderRadius: 14,
    border: '1px solid #FECACA',
    backgroundColor: '#FEF2F2',
    color: '#B91C1C',
    fontSize: 14,
    fontWeight: 600,
  },
  sectionHeader: {
    display: 'grid',
    gap: 8,
  },
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#0F766E',
  },
  sectionTitle: {
    margin: 0,
    fontFamily: 'Poppins, sans-serif',
    fontSize: 28,
    lineHeight: 1.2,
    color: '#111827',
  },
  sectionDescription: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.5,
    color: '#6B7280',
    maxWidth: 620,
  },
  sectionDescriptionSmall: {
    margin: '6px 0 0 0',
    fontSize: 14,
    lineHeight: 1.6,
    color: '#6B7280',
  },
  inputRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 16,
  },
  inputWrapper: {
    display: 'grid',
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: 700,
    color: '#374151',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: 14,
    border: '1px solid #D1D5DB',
    backgroundColor: '#FFFFFF',
    padding: '14px 16px',
    fontSize: 15,
    color: '#111827',
    outline: 'none',
  },
  passwordWrap: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 84,
  },
  passwordToggle: {
    position: 'absolute',
    top: '50%',
    right: 10,
    transform: 'translateY(-50%)',
    border: 'none',
    background: 'transparent',
    color: '#6B7280',
    fontWeight: 700,
    cursor: 'pointer',
    padding: 8,
  },
  selectWrap: {
    position: 'relative',
  },
  selectIcon: {
    position: 'absolute',
    top: '50%',
    left: 14,
    transform: 'translateY(-50%)',
    color: '#6B7280',
    pointerEvents: 'none',
  },
  select: {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: 14,
    border: '1px solid #D1D5DB',
    backgroundColor: '#FFFFFF',
    padding: '14px 16px 14px 42px',
    fontSize: 15,
    color: '#111827',
    appearance: 'none',
  },
  helperText: {
    fontSize: 13,
    lineHeight: 1.6,
    color: '#6B7280',
  },
  googleConnectedNote: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 16px',
    borderRadius: 14,
    backgroundColor: '#F0FDFA',
    border: '1px solid #99F6E4',
    color: '#0F766E',
    fontSize: 14,
    fontWeight: 600,
  },
  dividerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  googleButton: {
    width: '100%',
    boxShadow: '0 2px 10px rgba(17, 24, 39, 0.06)',
  },
  expertiseSection: {
    display: 'grid',
    gap: 18,
  },
  expertiseHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  selectionBadge: {
    borderRadius: 999,
    backgroundColor: '#ECFEFF',
    color: '#0F766E',
    border: '1px solid #A5F3FC',
    fontSize: 12,
    fontWeight: 800,
    padding: '7px 12px',
    whiteSpace: 'nowrap',
  },
  expertiseGroup: {
    display: 'grid',
    gap: 12,
  },
  expertiseGroupTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 800,
    color: '#111827',
  },
  expertiseGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 12,
  },
  expertiseChip: {
    borderRadius: 16,
    border: '1px solid #D1D5DB',
    backgroundColor: '#FFFFFF',
    color: '#111827',
    textAlign: 'left',
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.5,
    padding: '14px 16px',
    cursor: 'pointer',
  },
  expertiseChipSelected: {
    borderColor: '#14C5C5',
    backgroundColor: '#ECFEFF',
    color: '#0F766E',
    boxShadow: '0 0 0 1px rgba(20, 197, 197, 0.2)',
  },
  readinessNote: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '14px 16px',
    borderRadius: 14,
    backgroundColor: '#F9FAFB',
    border: '1px solid #E5E7EB',
    color: '#4B5563',
    fontSize: 14,
    lineHeight: 1.6,
  },
  actionsRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  primaryButton: {
    border: 'none',
    borderRadius: 14,
    backgroundColor: '#14C5C5',
    color: '#FFFFFF',
    padding: '15px 22px',
    fontSize: 15,
    fontWeight: 800,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    cursor: 'pointer',
    boxShadow: '0 10px 24px rgba(20, 197, 197, 0.24)',
  },
  primaryButtonDisabled: {
    backgroundColor: '#9CA3AF',
    boxShadow: 'none',
    cursor: 'not-allowed',
  },
  secondaryButton: {
    border: '1px solid #D1D5DB',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    color: '#374151',
    padding: '15px 22px',
    fontSize: 15,
    fontWeight: 800,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    cursor: 'pointer',
  },
  successState: {
    display: 'grid',
    gap: 16,
  },
  successIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    color: '#059669',
    border: '1px solid #A7F3D0',
  },
  successTitle: {
    margin: 0,
    fontFamily: 'Poppins, sans-serif',
    fontSize: 28,
    lineHeight: 1.25,
    color: '#111827',
  },
  successCopy: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.7,
    color: '#4B5563',
  },
  successChecklist: {
    display: 'grid',
    gap: 10,
    backgroundColor: '#F9FAFB',
    border: '1px solid #E5E7EB',
    borderRadius: 16,
    padding: 18,
  },
  successChecklistItem: {
    fontSize: 14,
    lineHeight: 1.6,
    color: '#374151',
  },
  footer: {
    marginTop: 28,
    paddingTop: 24,
    borderTop: '1px solid #E5E7EB',
  },
  footerText: {
    margin: 0,
    fontSize: 14,
    color: '#6B7280',
  },
  footerLink: {
    color: '#14C5C5',
    fontWeight: 700,
    textDecoration: 'none',
  },
  infoCard: {
    position: 'sticky',
    top: 96,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    border: '1px solid #E5E7EB',
    boxShadow: '0 12px 36px rgba(17, 24, 39, 0.08)',
    padding: 28,
  },
  infoTitle: {
    margin: '0 0 20px 0',
    fontFamily: 'Poppins, sans-serif',
    fontSize: 24,
    color: '#111827',
  },
  infoList: {
    display: 'grid',
    gap: 18,
  },
  infoItem: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: 14,
    alignItems: 'start',
  },
  infoBulletWrapper: {
    paddingTop: 2,
  },
  infoBullet: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#ECFEFF',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoItemTitle: {
    fontSize: 15,
    fontWeight: 800,
    color: '#111827',
    marginBottom: 4,
  },
  infoItemText: {
    fontSize: 14,
    lineHeight: 1.6,
    color: '#6B7280',
  },
};
