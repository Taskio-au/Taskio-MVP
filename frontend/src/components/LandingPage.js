import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { ArrowRight, BadgeCheck, CreditCard, MapPin, MessageSquareText, ShieldCheck, Sparkles } from 'lucide-react';
import { auth } from '../firebase';
import { isPublicAcquisitionEnabled } from '../config/publicAcquisitionConfig';
import { ANALYTICS_EVENTS, trackEvent } from '../config/analytics';
import {
  Button,
  Card,
  PageHeader,
} from '../design/components';
import { colors, spacing } from '../design/tokens';
import '../styles/publicPageHeader.css';
import PublicPageHeader from './PublicPageHeader';
import BrandLogo from '../design/components/BrandLogo';
import './LandingPage.css';

const heroImage = 'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80';

const trustBadges = [
  { label: 'Verified Experts', icon: <BadgeCheck size={18} strokeWidth={2.25} /> },
  { label: 'Pay when you approve', icon: <CreditCard size={18} strokeWidth={2.25} /> },
];

const featureCards = [
  {
    eyebrow: 'Simple',
    title: 'One flow for small indoor jobs',
    description: 'Post once, compare quotes from Experts—mounting, assembly, repairs, make-good.',
  },
  {
    eyebrow: 'Verified',
    title: 'Trusted local Experts',
    description: 'Clear briefs so Experts quote fairly—you choose who to book.',
  },
  {
    eyebrow: 'Protected',
    title: 'Pay when you approve',
    description: 'Pay through Taskio when the work meets your approval.',
  },
];

const services = [
  {
    name: 'Mounting',
    description: 'TV mounting, shelves, mirrors',
    image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Assembly',
    description: 'Flat-pack furniture, beds, desks, wardrobes',
    image: 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Small Fixture Repairs',
    description: 'Door hinge fix, cabinet alignment, handle replacement',
    image: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Hanging',
    description: 'Picture frames, artwork',
    image: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Curtains & Blinds',
    description: 'Curtain rods, blind installation, minor blind fixes',
    image: 'https://images.unsplash.com/photo-1599685315640-1f7f4f8f4e53?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Wall Fixes',
    description: 'Small holes, minor cosmetic wall repairs',
    image: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Silicone Touch-ups',
    description: 'Kitchen / bathroom edges',
    image: 'https://images.unsplash.com/photo-1584622650111-993a426c6a0d?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Make-Good',
    description: 'Apartment make-good',
    image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=900&q=80',
  },
];

const steps = [
  {
    title: 'Post',
    description: 'Share what matters once.',
    icon: <Sparkles size={18} />,
  },
  {
    title: 'Compare quotes',
    description: 'Expert replies in one thread.',
    icon: <MessageSquareText size={18} />,
  },
  {
    title: 'Pay when ready',
    description: 'Approve before payment is released.',
    icon: <ShieldCheck size={18} />,
  },
];

const realJobs = [
  {
    title: 'Install two floating shelves',
    suburb: 'Richmond, VIC',
    detail: '$180 accepted quote',
    status: 'Completed this week',
    image: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?auto=format&fit=crop&w=1200&q=80',
    featured: true,
  },
  {
    title: 'Curtain rod install',
    suburb: 'South Yarra, VIC',
    detail: '3 quotes in one afternoon',
    status: 'Booked with verified Expert',
  },
  {
    title: 'Furniture assembly',
    suburb: 'Carlton, VIC',
    detail: '$140 final price',
    status: 'Paid safely through Taskio',
  },
];

const testimonials = [
  {
    initials: 'SM',
    name: 'Sarah M.',
    role: 'Client',
    suburb: 'Southbank, VIC',
    context: 'Mounting & shelving',
    quote:
      'Calmer than the usual unstructured back-and-forth. I compared quotes properly and kept payment in Taskio.',
  },
  {
    initials: 'DR',
    name: 'Daniel R.',
    role: 'Expert',
    suburb: 'Prahran, VIC',
    context: 'Handyman · indoor jobs',
    quote: 'Clearer brief. The Client was ready to move—felt professional from the first message.',
  },
  {
    initials: 'PK',
    name: 'Priya K.',
    role: 'Client',
    suburb: 'Richmond, VIC',
    context: 'Repair with a scope change',
    quote:
      'When the scope changed mid-job, we still had the full thread in one place. That made it easier to sort out.',
  },
];

function LandingPage() {
  const navigate = useNavigate();
  const authState = useAuthState(auth) || [];
  const user = authState[0] || null;
  const homeHref = user ? '/dashboard' : '/';
  const publicAcquisition = isPublicAcquisitionEnabled();
  const expertEntry = publicAcquisition ? '/tradie/signup' : '/get-started';

  useEffect(() => {
    trackEvent(ANALYTICS_EVENTS.LANDING_VIEWED, { surface: 'landing' });
  }, []);

  const goLogin = (surface) => {
    trackEvent(ANALYTICS_EVENTS.LOGIN_CTA_CLICKED, { surface });
    navigate('/login');
  };

  return (
    <div className="landing-page">
      <PublicPageHeader
        homeTo={homeHref}
        actionsClassName="landing-nav"
        actions={
          <nav className="landing-nav" aria-label="Primary">
            {publicAcquisition ? (
              <Link className="landing-nav-link landing-nav-link--expert-secondary" to="/tradie/signup">
                Become an Expert
              </Link>
            ) : (
              <span className="landing-nav-link landing-nav-link--expert-secondary">Invite-only launch</span>
            )}
            <Button variant="secondary" onClick={() => goLogin('header')}>
              Log in
            </Button>
          </nav>
        }
      />

      <main className="landing-shell">
        <section className="landing-hero">
          <div className="landing-hero-grid">
            <div className="landing-hero-copy-wrap">
              <div className="landing-eyebrow">
                {publicAcquisition ? 'Inner Melbourne · indoor jobs' : 'Private early access · Inner Melbourne'}
              </div>
              <h1 className="landing-hero-title">Indoor help without the chase.</h1>
              <p className="landing-hero-copy">
                Quotes from verified Experts for indoor jobs—pay through Taskio when it's right.
                {publicAcquisition ? '' : ' This Melbourne launch is invite-only.'}
              </p>
              <div className="landing-hero-actions">
                {publicAcquisition ? (
                  <Button size="lg" variant="accent" onClick={() => navigate('/post-job')}>
                    Post your task for free
                  </Button>
                ) : (
                  <Button size="lg" variant="accent" onClick={() => goLogin('hero')}>
                    Log in if you were invited
                  </Button>
                )}
              </div>
              <p className="landing-hero-expert-path">
                {publicAcquisition ? (
                  <>
                    <Link className="landing-hero-expert-link" to="/tradie/signup">
                      Become an Expert
                    </Link>
                    <span className="landing-hero-expert-path-meta"> — inner Melbourne</span>
                  </>
                ) : (
                  <span className="landing-hero-expert-path-meta">Experts are invited and verified by Taskio.</span>
                )}
              </p>
              <div className="landing-hero-proof" aria-label="How Taskio protects Clients">
                {trustBadges.map((badge) => (
                  <div key={badge.label} className="landing-hero-proof-item">
                    <div className="landing-hero-proof-icon" aria-hidden>
                      {badge.icon}
                    </div>
                    <span className="landing-hero-proof-label">{badge.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="landing-hero-visual">
              <div className="landing-hero-visual-canvas">
                <img
                  className="landing-hero-image"
                  src={heroImage}
                  alt="Expert completing indoor work in a bright Melbourne home"
                />
                <div className="landing-hero-visual-scrim" aria-hidden />
                <div className="landing-hero-floating-note">
                  <span className="landing-hero-floating-kicker">Taskio</span>
                  <span className="landing-hero-floating-text">
                    Mounting, assembly, repairs, make-good—homes and apartments.
                  </span>
                </div>
                <Card className="landing-hero-job-card" padding={spacing.lg}>
                  <div className="landing-job-topline">Client view</div>
                  <h2 className="landing-job-title">Install floating shelves in living room</h2>
                  <div className="landing-job-meta">
                    <span>3 quotes received</span>
                    <span>$180 to $260</span>
                  </div>
                  <div className="landing-job-status-row">
                    <div className="landing-job-status">Verified Expert ready</div>
                    <div className="landing-job-location">
                      <MapPin size={14} />
                      <span>Richmond, VIC</span>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section landing-section-tight">
          <div className="landing-grid-3">
            {featureCards.map((item) => (
              <Card key={item.title} className="landing-feature-card">
                <div className="landing-chip landing-chip--feature">{item.eyebrow}</div>
                <h3 style={{ margin: 0, fontSize: 20, lineHeight: 1.25 }}>{item.title}</h3>
                <p style={{ margin: 0, lineHeight: 1.6, color: colors.textSubtle }}>{item.description}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="landing-section landing-section-categories">
          <PageHeader
            eyebrow="Taskio categories"
            title="Indoor jobs you can post"
            description="Each type uses the same flow—free to post, then quotes from Experts."
            style={{ marginBottom: spacing.xl }}
          />
          <div className="landing-grid-3 landing-categories-grid">
            {services.map((service) => (
              <Card
                key={service.name}
                as="button"
                type="button"
                className="landing-category-card"
                onClick={() => (publicAcquisition || user ? navigate('/post-job') : goLogin('category'))}
                padding={0}
                aria-label={`Post a task: ${service.name}`}
              >
                <img className="landing-category-image" src={service.image} alt="" loading="lazy" />
                <div className="landing-category-scrim" aria-hidden />
                <div className="landing-category-overlay">
                  <div className="landing-category-panel">
                    <h3 className="landing-category-title">{service.name}</h3>
                    <p className="landing-category-desc">{service.description}</p>
                    <div className="landing-category-cta">
                      <span>Post task</span>
                      <ArrowRight size={16} strokeWidth={2.25} aria-hidden />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className="landing-section">
          <PageHeader
            eyebrow="How it works"
            title="Three steps for Clients"
            description="Post, compare Expert quotes, pay when you approve."
            style={{ marginBottom: spacing.xl }}
          />
          <div className="landing-steps-flow">
            {steps.map((step, index) => (
              <Card key={step.title} className="landing-steps-card" tone="muted">
                <div className="landing-step-icon">{step.icon}</div>
                <div className="landing-step-index">{index + 1}</div>
                <h3 style={{ margin: 0, fontSize: 22 }}>{step.title}</h3>
                <p style={{ margin: 0, lineHeight: 1.6, color: colors.textSubtle }}>{step.description}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="landing-section">
          {false && (
          <PageHeader
            eyebrow="Illustrative examples"
            title="Inner Melbourne · indoor jobs"
            description="Real tasks from local homes—post yours next."
            style={{ marginBottom: spacing.xl }}
          />
          )}
          <PageHeader
            eyebrow="Illustrative examples"
            title="Inner Melbourne · indoor jobs"
            description="Illustrative examples only—Taskio has not launched and these are not real customer tasks."
            style={{ marginBottom: spacing.xl }}
          />
          <div className="landing-jobs-grid">
            {realJobs.map((job) => (
              <Card
                key={job.title}
                className={job.featured ? 'landing-job-showcase landing-job-showcase-featured' : 'landing-job-showcase'}
                padding={job.featured ? 0 : spacing.xl}
              >
                {job.featured ? (
                  <>
                    <img className="landing-job-showcase-image" src={job.image} alt={job.title} loading="lazy" />
                    <div className="landing-job-showcase-overlay">
                      <div className="landing-job-topline">Illustrative example</div>
                      <h3 className="landing-job-showcase-title">{job.title}</h3>
                      <div className="landing-job-showcase-meta">
                        <span>{job.suburb}</span>
                        <span>{job.detail}</span>
                      </div>
                      <div className="landing-job-showcase-status">{job.status}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="landing-job-topline">Illustrative example</div>
                    <h3 className="landing-job-showcase-title">{job.title}</h3>
                    <div className="landing-job-summary-line">{job.suburb}</div>
                    <div className="landing-job-summary-line">{job.detail}</div>
                    <div className="landing-job-showcase-status landing-job-showcase-status-light">{job.status}</div>
                  </>
                )}
              </Card>
            ))}
          </div>
        </section>

        {false && (
        <section className="landing-section landing-section-proof">
          <PageHeader
            eyebrow="People using Taskio"
            title="Clients and Experts in their own words"
            description="Inner Melbourne. Two Clients, one Expert—straightforward notes on real tasks."
            style={{ marginBottom: spacing.xl }}
          />
          <div className="landing-grid-3 landing-testimonials-grid">
            {testimonials.map((item) => (
              <Card key={item.name} className="landing-testimonial-card" tone="muted" padding={0}>
                <p className="landing-testimonial-context">{item.context}</p>
                <p className="landing-testimonial-quote">{item.quote}</p>
                <div className="landing-testimonial-footer">
                  <div className="landing-testimonial-initials" aria-hidden>
                    {item.initials}
                  </div>
                  <div className="landing-testimonial-attribution">
                    <div className="landing-testimonial-name">{item.name}</div>
                    <div className="landing-testimonial-role">{item.role}</div>
                    <div className="landing-testimonial-suburb">{item.suburb}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
        )}

        <section className="landing-cta-band">
          <div className="landing-grid-2 landing-cta-band-grid">
            <div>
              <div className="landing-chip" style={{ background: 'rgba(255,255,255,0.12)', color: '#FFFFFF' }}>
                Get quotes
              </div>
              <h2 style={{ margin: '14px 0 12px', fontSize: 38, lineHeight: 1.1 }}>
                Post free. Hear from verified Experts.
              </h2>
              <p style={{ marginBottom: 0, lineHeight: 1.6 }}>
                Quotes, payment, and messages—one place for small indoor jobs.
              </p>
            </div>
            <div className="landing-cta-actions">
              <div className="landing-cta-note">Free to post. Pay through Taskio when you approve.</div>
              <Button size="lg" variant="accent" onClick={() => (publicAcquisition || user ? navigate('/post-job') : goLogin('cta'))}>
                {publicAcquisition ? 'Post a task' : 'Log in'}
              </Button>
              {publicAcquisition ? (
                <Link className="landing-cta-expert-link" to="/tradie/signup">
                  Become an Expert
                </Link>
              ) : (
                <Link className="landing-cta-expert-link" to="/get-started">
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
                Indoor jobs, Expert quotes, payment through Taskio—when you approve.
              </p>
            </div>
            <nav className="landing-footer-nav" aria-label="Footer">
              <div className="landing-footer-links">
                {publicAcquisition ? <Link to="/post-job">Post a task</Link> : <Link to="/login">Post a task</Link>}
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
