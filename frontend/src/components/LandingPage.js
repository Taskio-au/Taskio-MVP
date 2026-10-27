import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { ArrowRight, Check, Info } from 'lucide-react';
import { auth } from '../firebase';
import usePublicPilotStatus from '../hooks/usePublicPilotStatus';
import { publicPilotPostingCopy } from '../constants/pilotPostingCopy';
import { resolveExpertOnboarding } from '../utils/expertOnboardingEntry';
import { ANALYTICS_EVENTS, trackEvent, trackEventOnce } from '../config/analytics';
import { Button } from '../design/components';
import '../styles/publicPageHeader.css';
import PublicPageHeader from './PublicPageHeader';
import BrandLogo from '../design/components/BrandLogo';
import LandingHeroPreview from './landing/LandingHeroPreview';
import LandingJourney from './landing/LandingJourney';
import {
  LANDING_FEE,
  LANDING_HERO_JOBS,
  LANDING_PILLARS,
  LANDING_SERVICES,
  LANDING_TRUST,
  landingLaunchFacts,
} from './landing/landingMedia';
import './LandingPage.css';

// Taskio orange stays the action colour; charcoal label keeps CTA text at AA contrast.
// Poppins 600 is a loaded weight, so CTA labels render crisp instead of synthetic bold.
const ACCENT_CTA_STYLE = { color: '#222222', fontFamily: 'var(--font-heading)', fontWeight: 600 };
const SECONDARY_CTA_STYLE = { fontFamily: 'var(--font-heading)', fontWeight: 600 };

function SectionHead({ eyebrow, title, description, id, align = 'start' }) {
  return (
    <div className={`landing-section-head landing-section-head--${align}`}>
      <p className="landing-eyebrow">{eyebrow}</p>
      <h2 className="landing-section-title" id={id}>
        {title}
      </h2>
      {description ? <p className="landing-section-copy">{description}</p> : null}
    </div>
  );
}

function LandingPage() {
  const navigate = useNavigate();
  const authState = useAuthState(auth) || [];
  const user = authState[0] || null;
  const homeHref = user ? '/dashboard' : '/';
  const { loadState: postingLoadState, status: postingStatus } = usePublicPilotStatus();
  const expert = resolveExpertOnboarding({ loadState: postingLoadState, status: postingStatus });
  const expertEntry = expert.path;
  trackEventOnce(ANALYTICS_EVENTS.LANDING_VIEWED, 'session', { surface: 'landing' });

  const goLogin = (surface) => {
    trackEvent(ANALYTICS_EVENTS.LOGIN_CTA_CLICKED, { surface });
    navigate('/login');
  };

  const postingOpen = postingLoadState === 'ok' && postingStatus.canPost === true;
  const showWaitlist = !postingOpen && postingLoadState !== 'loading';
  const homeownerCtaLabel = postingLoadState === 'loading'
    ? 'Checking availability…'
    : showWaitlist
      ? 'Join waitlist'
      : 'Post a task';

  const goHomeownerCta = (surface) => {
    if (postingLoadState === 'loading') return;
    if (showWaitlist) {
      navigate('/waitlist');
      return;
    }
    navigate('/post-job');
  };

  useEffect(() => {
    const id = window.location.hash.replace(/^#/, '');
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: 'auto', block: 'start' });
  }, []);

  return (
    <div className="landing-page">
      <PublicPageHeader
        homeTo={homeHref}
        brandAddon={null}
        actions={
          <nav className="landing-nav" aria-label="Primary">
            <a className="landing-nav-link landing-nav-link--wide" href="#how-taskio-works">
              How it works
            </a>
            <Link className="landing-nav-link landing-nav-link--expert" to={expertEntry}>
              {expert.shortLabel}
            </Link>
            <Button
              className="landing-nav-login"
              variant="secondary"
              size="sm"
              style={SECONDARY_CTA_STYLE}
              onClick={() => goLogin('header')}
            >
              Log in
            </Button>
            {postingLoadState === 'loading' ? null : (
              <Button
                className="landing-nav-cta"
                variant="accent"
                size="sm"
                style={ACCENT_CTA_STYLE}
                onClick={() => goHomeownerCta('header')}
              >
                {homeownerCtaLabel}
              </Button>
            )}
          </nav>
        }
      />

      <main className="landing-main">
        <section className="landing-hero" aria-labelledby="landing-hero-title">
          <div className="landing-shell landing-hero-grid">
            <div className="landing-hero-copy-wrap">
              <p className="landing-hero-eyebrow">
                <span className="landing-hero-eyebrow-dot" aria-hidden />
                {postingOpen
                  ? 'Inner Melbourne · indoor jobs'
                  : 'Melbourne pilot · Inner Melbourne'}
              </p>
              <h1 className="landing-hero-title" id="landing-hero-title">
                Small indoor jobs, <span className="landing-hero-title-accent">sorted.</span>
              </h1>
              <p className="landing-hero-copy">
                Describe the job once, compare clearer quotes from Experts checked by Taskio, and pay
                through Taskio. Payment is released to the Expert after you approve the completed job.
              </p>
              <ul className="landing-hero-jobs" aria-label="Example jobs">
                {LANDING_HERO_JOBS.map((job) => (
                  <li key={job} className="landing-hero-job">
                    <Check size={14} strokeWidth={2.5} aria-hidden />
                    {job}
                  </li>
                ))}
              </ul>
              <div className="landing-hero-actions">
                <Button
                  className="landing-hero-cta"
                  size="lg"
                  variant="accent"
                  style={ACCENT_CTA_STYLE}
                  disabled={postingLoadState === 'loading'}
                  onClick={() => goHomeownerCta('hero')}
                >
                  {homeownerCtaLabel === 'Post a task' ? 'Post your task for free' : homeownerCtaLabel}
                  {postingLoadState === 'loading' ? null : <ArrowRight size={18} strokeWidth={2.25} aria-hidden />}
                </Button>
                <a className="landing-btn-ghost" href="#how-taskio-works">
                  How Taskio works
                </a>
              </div>
              {postingOpen ? null : (
                <p className="landing-hero-status">
                  <Info size={16} strokeWidth={2.25} aria-hidden />
                  <span>{publicPilotPostingCopy(postingStatus.homeownerPosting, postingLoadState)}</span>
                </p>
              )}
              <p className="landing-hero-note">
                <span>Handyperson in Inner Melbourne?</span>{' '}
                <Link className="landing-inline-link" to={expertEntry}>
                  {expert.shortLabel}
                  <ArrowRight size={14} strokeWidth={2.25} aria-hidden />
                </Link>
              </p>
            </div>

            <div className="landing-hero-visual">
              <LandingHeroPreview />
            </div>
          </div>
        </section>

        <section className="landing-band landing-band--white" aria-labelledby="landing-why-title">
          <div className="landing-shell">
            <SectionHead
              id="landing-why-title"
              eyebrow="Why Taskio"
              title="Small jobs deserve a clear process"
              description="Your brief, quotes, messages and payment stay organised in one place."
            />
            <ul className="landing-pillars">
              {LANDING_PILLARS.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <li key={pillar.title} className="landing-card landing-pillar">
                    <span className="landing-icon-tile" aria-hidden>
                      <Icon size={20} strokeWidth={2} />
                    </span>
                    <h3 className="landing-card-title">{pillar.title}</h3>
                    <p className="landing-card-copy">{pillar.description}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section
          className="landing-band landing-band--cloud"
          id="how-taskio-works"
          aria-labelledby="landing-journey-title"
        >
          <div className="landing-shell">
            <SectionHead
              id="landing-journey-title"
              eyebrow="How Taskio works"
              title="From brief to approved job"
              description="The same five steps for every job. The number of quotes and response times vary by job."
            />
            <LandingJourney />
          </div>
        </section>

        <section
          className="landing-band landing-band--white"
          id="services"
          aria-labelledby="landing-services-title"
        >
          <div className="landing-shell">
            <SectionHead
              id="landing-services-title"
              eyebrow="Phase 1 jobs"
              title="Indoor jobs you can post"
              description="Small indoor work around the home, with the same brief-and-quote flow for every job."
            />
            <div className="landing-services-grid">
              {LANDING_SERVICES.map((service) => {
                const Icon = service.icon;
                return (
                  <button
                    key={service.name}
                    type="button"
                    className="landing-card landing-service"
                    onClick={() => goHomeownerCta('category')}
                    aria-label={
                      showWaitlist
                        ? `Join waitlist for ${service.name}`
                        : `Post a task: ${service.name}`
                    }
                  >
                    <span className="landing-service-media">
                      <img
                        className="landing-service-photo"
                        src={service.image}
                        alt=""
                        width={800}
                        height={1000}
                        loading="lazy"
                        decoding="async"
                        onError={(event) => { event.currentTarget.hidden = true; }}
                      />
                      <span className="landing-service-icon" aria-hidden>
                        <Icon size={16} strokeWidth={2} />
                      </span>
                    </span>
                    <span className="landing-service-body">
                      <span className="landing-service-name">{service.name}</span>
                      <span className="landing-service-desc">{service.description}</span>
                      <span className="landing-service-cta">
                        {showWaitlist ? 'Join waitlist' : 'Post task'}
                        <ArrowRight size={15} strokeWidth={2.25} aria-hidden />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="landing-band landing-band--tint" aria-labelledby="landing-trust-title">
          <div className="landing-shell landing-trust-grid">
            <div>
              <SectionHead
                id="landing-trust-title"
                eyebrow="Payments and checks"
                title="Clear on checks and payment"
                description="What Taskio does today during the Melbourne pilot."
              />
              <ul className="landing-trust-list">
                {LANDING_TRUST.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.title} className="landing-trust-item">
                      <span className="landing-icon-tile landing-icon-tile--sm" aria-hidden>
                        <Icon size={18} strokeWidth={2} />
                      </span>
                      <span>
                        <span className="landing-trust-title">{item.title}</span>
                        <span className="landing-trust-copy">{item.description}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="landing-card landing-fee">
              <h3 className="landing-fee-title">Taskio service fee</h3>
              <p className="landing-fee-figure">
                <span className="landing-fee-rate">5%</span>
                <span className="landing-fee-range">
                  <span>Minimum A$4.99</span>
                  <span>Maximum A$19.99</span>
                  <span>per booking</span>
                </span>
              </p>
              <p className="landing-fee-summary">{LANDING_FEE.summary}</p>
              <ul className="landing-fee-notes">
                <li>{LANDING_FEE.expertNote}</li>
                <li>{LANDING_FEE.totalNote}</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="landing-band landing-band--white" aria-labelledby="landing-launch-title">
          <div className="landing-shell">
            <div className="landing-card landing-launch">
              <div>
                <p className="landing-eyebrow">Melbourne pilot</p>
                <h2 className="landing-launch-title" id="landing-launch-title">
                  {postingOpen
                    ? 'Supported homeowner posting in Inner Melbourne'
                    : 'Private early access in Inner Melbourne'}
                </h2>
                <p className="landing-launch-copy">
                  {postingOpen
                    ? 'Homeowners can create an account and post a supported indoor job. Experts apply separately and remain marketplace-ineligible until Taskio verifies them.'
                    : expert.canApply
                      ? 'Homeowner posting is closed while Taskio prepares the Melbourne pilot. Taskio is recruiting Experts for Inner Melbourne; applicants complete onboarding and Taskio reviews them before marketplace access.'
                      : 'Homeowner posting is closed while Taskio prepares the Melbourne pilot. Experts can register interest and Taskio will share when onboarding is available.'}
                </p>
                <Link className="landing-inline-link" to={expertEntry}>
                  {expert.shortLabel}
                  <ArrowRight size={14} strokeWidth={2.25} aria-hidden />
                </Link>
              </div>
              <dl className="landing-launch-facts">
                {landingLaunchFacts({ postingOpen, canExpertApply: expert.canApply }).map((fact) => (
                  <div key={fact.label} className="landing-launch-fact">
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section className="landing-close" aria-labelledby="landing-close-title">
          <div className="landing-shell landing-close-grid">
            <div>
              <p className="landing-eyebrow landing-eyebrow--on-brand">
                {postingOpen ? 'Get quotes' : 'Melbourne pilot'}
              </p>
              <h2 className="landing-close-title" id="landing-close-title">
                {postingOpen
                  ? 'Post your small indoor job today'
                  : 'Join the waitlist for homeowner posting'}
              </h2>
              <p className="landing-close-copy">
                {postingOpen
                  ? 'Describe the job once and compare quotes from Experts checked by Taskio.'
                  : "We'll let you know when you can post small indoor jobs in Inner Melbourne."}
              </p>
            </div>
            <div className="landing-close-actions">
              <Button
                className="landing-close-cta"
                size="lg"
                variant="accent"
                style={ACCENT_CTA_STYLE}
                disabled={postingLoadState === 'loading'}
                onClick={() => goHomeownerCta('cta')}
              >
                {homeownerCtaLabel}
              </Button>
              <Link className="landing-close-link" to={expertEntry}>
                {expert.shortLabel}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-shell landing-footer-shell">
          <div className="landing-footer-top">
            <div className="landing-footer-brand">
              <BrandLogo to={homeHref} compact />
              <p className="landing-footer-tagline">
                Small indoor jobs in Inner Melbourne. Experts checked by Taskio, paid after you approve.
              </p>
            </div>
            <nav className="landing-footer-nav" aria-label="Footer">
              <div className="landing-footer-links">
                {postingOpen ? <Link to="/post-job">Post a task</Link> : null}
                {showWaitlist ? <Link to="/waitlist">Join waitlist</Link> : null}
                <Link to="/login">Log in</Link>
                <Link to={expertEntry} className="landing-footer-expert-link">
                  {expert.shortLabel}
                </Link>
                <Link to="/privacy">Privacy</Link>
                <Link to="/terms">Terms</Link>
              </div>
            </nav>
          </div>
          <div className="landing-footer-divider" aria-hidden />
          <div className="landing-footer-bottom">
            <p className="landing-footer-copyright">
              © {new Date().getFullYear()} Taskio. All rights reserved.
            </p>
            <a
              className="landing-footer-instagram"
              href="https://www.instagram.com/Taskio_au/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Taskio on Instagram (opens in new tab)"
            >
              <svg
                className="landing-footer-instagram-icon"
                width={18}
                height={18}
                viewBox="0 0 24 24"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
