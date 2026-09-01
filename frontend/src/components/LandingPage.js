import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { ArrowRight } from 'lucide-react';
import { auth } from '../firebase';
import { isPublicAcquisitionEnabled } from '../config/publicAcquisitionConfig';
import { ANALYTICS_EVENTS, trackEvent, trackEventOnce } from '../config/analytics';
import { Button } from '../design/components';
import '../styles/publicPageHeader.css';
import PublicPageHeader from './PublicPageHeader';
import BrandLogo from '../design/components/BrandLogo';
import LandingHeroPreview from './landing/LandingHeroPreview';
import LandingJourney from './landing/LandingJourney';
import {
  LANDING_EXAMPLES,
  LANDING_LAUNCH_FACTS,
  LANDING_PILLARS,
  LANDING_PROOF,
  LANDING_SERVICES,
} from './landing/landingMedia';
import './LandingPage.css';

// Taskio orange stays the action colour; charcoal label keeps CTA text at AA contrast.
const ACCENT_CTA_TEXT = { color: '#111827' };

function SectionHead({ eyebrow, title, description, id }) {
  return (
    <div className="landing-section-head">
      <p className="landing-eyebrow landing-eyebrow--section">{eyebrow}</p>
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
  const publicAcquisition = isPublicAcquisitionEnabled();
  const expertEntry = publicAcquisition ? '/tradie/signup' : '/get-started';
  trackEventOnce(ANALYTICS_EVENTS.LANDING_VIEWED, 'session', { surface: 'landing' });

  const goLogin = (surface) => {
    trackEvent(ANALYTICS_EVENTS.LOGIN_CTA_CLICKED, { surface });
    navigate('/login');
  };

  // Public signup is closed during private launch, so unauthenticated visitors are
  // routed to login and every landing CTA says so rather than implying open posting.
  const canPostDirectly = publicAcquisition || Boolean(user);

  const goPostOrLogin = (surface) => {
    if (canPostDirectly) {
      navigate('/post-job');
      return;
    }
    goLogin(surface);
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
        brandAddon={
          publicAcquisition ? null : (
            <span className="landing-nav-status">
              <span className="landing-nav-status-dot" aria-hidden />
              Invite-only
            </span>
          )
        }
        actions={
          <nav className="landing-nav" aria-label="Primary">
            {publicAcquisition ? (
              <Link className="landing-nav-link" to="/tradie/signup">
                Become an Expert
              </Link>
            ) : null}
            <Button variant="secondary" onClick={() => goLogin('header')}>
              Log in
            </Button>
          </nav>
        }
      />

      <main className="landing-shell">
        <section className="landing-hero" aria-labelledby="landing-hero-title">
          <div className="landing-hero-grid">
            <div className="landing-hero-copy-wrap">
              <p className="landing-eyebrow">
                {publicAcquisition
                  ? 'Inner Melbourne · indoor jobs'
                  : 'Private early access · Inner Melbourne'}
              </p>
              <h1 className="landing-hero-title" id="landing-hero-title">
                Small indoor jobs, sorted.
              </h1>
              <p className="landing-hero-copy">
                Post once. Compare quotes from verified Experts. Pay securely through Taskio when you
                approve the completed job.
                {publicAcquisition ? '' : ' Access is invite-only while Taskio is in private early access.'}
              </p>
              <div className="landing-hero-actions">
                {publicAcquisition ? (
                  <Button
                    size="lg"
                    variant="accent"
                    style={ACCENT_CTA_TEXT}
                    onClick={() => navigate('/post-job')}
                  >
                    Post your task for free
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    variant="accent"
                    style={ACCENT_CTA_TEXT}
                    onClick={() => goLogin('hero')}
                  >
                    Log in if invited
                  </Button>
                )}
                <a className="landing-btn-ghost" href="#how-taskio-works">
                  How Taskio works
                </a>
              </div>
              <p className="landing-hero-note">
                {publicAcquisition ? (
                  <>
                    <Link className="landing-inline-link" to="/tradie/signup">
                      Become an Expert
                    </Link>
                    <span> — inner Melbourne</span>
                  </>
                ) : (
                  'Experts are invited and verified by Taskio.'
                )}
              </p>
            </div>

            <div className="landing-hero-visual">
              <LandingHeroPreview />
            </div>
          </div>
        </section>

        <section className="landing-proof" aria-label="What Taskio gives you">
          <ul className="landing-proof-list">
            {LANDING_PROOF.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.label} className="landing-proof-item">
                  <Icon size={18} strokeWidth={2.25} aria-hidden />
                  <span className="landing-proof-label">{item.label}</span>
                  <span className="landing-proof-detail">{item.detail}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="landing-section" aria-labelledby="landing-services-title">
          <SectionHead
            id="landing-services-title"
            eyebrow="Phase 1 categories"
            title="Indoor jobs you can post"
            description="Small indoor work only, with the same brief-and-quote flow for every category."
          />
          <div className="landing-services-grid">
            {LANDING_SERVICES.map((service) => (
              <button
                key={service.name}
                type="button"
                className="landing-service"
                onClick={() => goPostOrLogin('category')}
                aria-label={
                  canPostDirectly
                    ? `Post a task: ${service.name}`
                    : `Log in to post a ${service.name} task`
                }
              >
                <img
                  className="landing-service-photo"
                  src={service.image}
                  alt=""
                  width={800}
                  height={1000}
                  loading="lazy"
                  decoding="async"
                />
                <span className="landing-service-scrim" aria-hidden />
                <span className="landing-service-body">
                  <span className="landing-service-name">{service.name}</span>
                  <span className="landing-service-desc">{service.description}</span>
                  <span className="landing-service-cta">
                    {canPostDirectly ? 'Post task' : 'Log in to post'}
                    <ArrowRight size={15} strokeWidth={2.5} aria-hidden />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="landing-section" id="how-taskio-works" aria-labelledby="landing-journey-title">
          <SectionHead
            id="landing-journey-title"
            eyebrow="How Taskio works"
            title="One path from brief to approval"
            description="Illustrative product views of the three stages every Taskio job follows."
          />
          <LandingJourney />
        </section>

        <section className="landing-section" aria-labelledby="landing-why-title">
          <SectionHead
            id="landing-why-title"
            eyebrow="Why Taskio"
            title="One place. Clear from start to finish."
            description="Your brief, quotes, messages and payment stay organised in Taskio."
          />
          <ul className="landing-pillars">
            {LANDING_PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <li key={pillar.title} className="landing-pillar">
                  <span className="landing-pillar-icon" aria-hidden>
                    <Icon size={18} strokeWidth={2.25} />
                  </span>
                  <h3 className="landing-pillar-title">{pillar.title}</h3>
                  <p className="landing-pillar-copy">{pillar.description}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="landing-launch" aria-labelledby="landing-launch-title">
          <div className="landing-launch-grid">
            <div>
              <p className="landing-eyebrow landing-eyebrow--section">Melbourne private launch</p>
              <h2 className="landing-launch-title" id="landing-launch-title">
                Private early access in Inner Melbourne
              </h2>
              <p className="landing-launch-copy">
                We&apos;re starting with a carefully selected set of indoor jobs and verified Experts,
                so every part of the Taskio experience can be properly supported.
              </p>
              <Link className="landing-inline-link" to="/get-started">
                How invite-only access works
              </Link>
            </div>
            <dl className="landing-launch-facts">
              {LANDING_LAUNCH_FACTS.map((fact) => (
                <div key={fact.label} className="landing-launch-fact">
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="landing-examples-title">
          <SectionHead
            id="landing-examples-title"
            eyebrow="Illustrative examples"
            title="The kind of jobs Taskio is for"
            description="Examples only. Taskio has not launched publicly and these are not real customer tasks."
          />
          <ul className="landing-examples">
            {LANDING_EXAMPLES.map((job) => (
              <li key={job.title} className="landing-example">
                <img
                  className="landing-example-photo"
                  src={job.image}
                  alt={job.alt}
                  width={900}
                  height={675}
                  loading="lazy"
                  decoding="async"
                />
                <span className="landing-example-scrim" aria-hidden />
                <div className="landing-example-body">
                  <span className="landing-example-tag">Illustrative example</span>
                  <h3 className="landing-example-title">{job.title}</h3>
                  <p className="landing-example-meta">
                    <span>{job.suburb}</span>
                    <span className="landing-example-detail">{job.detail}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-close" aria-labelledby="landing-close-title">
          <div className="landing-close-grid">
            <div>
              <p className="landing-eyebrow landing-eyebrow--dark">
                {publicAcquisition ? 'Get quotes' : 'Invite-only'}
              </p>
              <h2 className="landing-close-title" id="landing-close-title">
                {publicAcquisition
                  ? 'Post a task. Hear from verified Experts.'
                  : 'Got an invitation? Your next small job starts here.'}
              </h2>
              <p className="landing-close-copy">
                Brief, quotes, messages and payment stay in one place for small indoor jobs.
              </p>
            </div>
            <div className="landing-close-actions">
              <Button
                className="landing-close-cta"
                size="lg"
                variant="accent"
                style={ACCENT_CTA_TEXT}
                onClick={() => goPostOrLogin('cta')}
              >
                {publicAcquisition ? 'Post a task' : 'Log in'}
              </Button>
              {publicAcquisition ? (
                <Link className="landing-close-link" to="/tradie/signup">
                  Become an Expert
                </Link>
              ) : (
                <Link className="landing-close-link" to="/get-started">
                  How invite-only access works
                </Link>
              )}
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
                Indoor jobs, verified Experts, pay when you approve.
              </p>
            </div>
            <nav className="landing-footer-nav" aria-label="Footer">
              <div className="landing-footer-links">
                {publicAcquisition ? <Link to="/post-job">Post a task</Link> : null}
                <Link to="/login">Log in</Link>
                <Link to={expertEntry} className="landing-footer-expert-link">
                  {publicAcquisition ? 'Become an Expert' : 'Expert access'}
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
