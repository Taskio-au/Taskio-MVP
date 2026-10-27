import React from 'react';
import { render, screen, within } from '@testing-library/react';

jest.mock('react-router-dom', () => ({
  __esModule: true,
  MemoryRouter: ({ children }) => <div>{children}</div>,
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => jest.fn(),
}), { virtual: true });

const { MemoryRouter } = jest.requireMock('react-router-dom');

jest.mock('../firebase', () => ({
  auth: {},
}));

jest.mock('react-firebase-hooks/auth', () => ({
  __esModule: true,
  useAuthState: jest.fn(() => [null, false, null]),
}), { virtual: true });

const CLOSED_STATUS = {
  loadState: 'ok',
  status: { homeownerPosting: 'CLOSED', canPost: false, waitlistAvailable: true },
  refresh: jest.fn(),
};

const mockPilotStatus = { value: CLOSED_STATUS };

jest.mock('../hooks/usePublicPilotStatus', () => ({
  __esModule: true,
  default: () => mockPilotStatus.value,
}));

const mockPublicAcquisition = { enabled: false };
jest.mock('../config/publicAcquisitionConfig', () => ({
  isExpertPublicSignupEnabled: () => mockPublicAcquisition.enabled,
  isPublicAcquisitionEnabled: () => mockPublicAcquisition.enabled,
}));

const LandingPage = require('./LandingPage').default;

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
}

describe('LandingPage', () => {
  afterEach(() => {
    mockPilotStatus.value = CLOSED_STATUS;
    mockPublicAcquisition.enabled = false;
  });

  it('renders the headline, Phase 1 jobs and value pillars', () => {
    renderLanding();

    expect(screen.getByRole('heading', { level: 1, name: /small indoor jobs, sorted/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /join waitlist/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /how taskio works/i })).toHaveAttribute('href', '#how-taskio-works');
    expect(screen.getAllByRole('link', { name: /join expert waitlist/i }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^experts invited$/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/checked by taskio/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: /small jobs deserve a clear process/i })).toBeInTheDocument();
    expect(screen.getByText(/your brief, quotes, messages and payment stay organised/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /clearer job details/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /suitable experts, checked by taskio/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /a simple quote-to-payment flow/i })).toBeInTheDocument();
    expect(screen.getByText(/indoor jobs you can post/i)).toBeInTheDocument();
    expect(screen.getAllByText(/inner melbourne/i).length).toBeGreaterThan(0);
    [
      'Mounting',
      'Furniture assembly',
      'Minor repairs',
      'Picture hanging',
      'Curtains & blinds',
      'Wall patching',
      'Silicone touch-ups',
      'Apartment make-good',
    ].forEach((name) => {
      expect(screen.getByRole('button', { name: `Join waitlist for ${name}` })).toBeInTheDocument();
    });
    expect(screen.queryByText(/garden care/i)).not.toBeInTheDocument();
  });

  it('keeps Cleaning and out-of-scope trades off the page', () => {
    const { container } = renderLanding();
    const text = container.textContent;

    expect(text).not.toMatch(/clean/i);
    expect(text).not.toMatch(/electric/i);
    expect(text).not.toMatch(/plumb/i);
    expect(text).not.toMatch(/renovat/i);
  });

  it('shows the five-step flow without instant matching or response promises', () => {
    renderLanding();

    expect(screen.getByRole('heading', { name: /from brief to approved job/i })).toBeInTheDocument();
    const stepHeadings = within(screen.getByRole('list', { name: /step by step/i }))
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(stepHeadings).toEqual([
      'Tell us about the job',
      'Receive quotes',
      'Choose your Expert',
      'Pay through Taskio',
      'Approve the work',
    ]);
    expect(screen.getByText(/number of quotes and response times vary by job/i)).toBeInTheDocument();
    expect(screen.queryByText(/instant/i)).not.toBeInTheDocument();
  });

  it('labels sample product data as illustrative', () => {
    renderLanding();

    expect(screen.getByText('Illustrative preview')).toBeInTheDocument();
    expect(screen.getByText('Sample job')).toBeInTheDocument();
    expect(screen.getByText(/illustrative preview of the taskio client view/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /clients and experts in their own words/i })).not.toBeInTheDocument();
  });

  it('discloses the Client service fee in the agreed wording', () => {
    renderLanding();

    expect(screen.getByRole('heading', { name: /taskio service fee/i })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Clients pay a 5% Taskio service fee, with a minimum of A$4.99 and a maximum of A$19.99 per booking.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("Expert fees are deducted from the Expert's quote and are not added again to your booking.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/gst/i)).not.toBeInTheDocument();
  });

  it('describes payment without unsupported trust or protection claims', () => {
    const { container } = renderLanding();
    const text = container.textContent;

    expect(screen.getByRole('heading', { name: /pay through taskio/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /approve the work/i })).toBeInTheDocument();
    expect(screen.getAllByText(/released to the expert after you approve/i).length).toBeGreaterThan(0);
    [
      /payment sits with taskio/i,
      /escrow/i,
      /guarantee/i,
      /money[- ]back/i,
      /insured/i,
      /insurance/i,
      /police[- ]check/i,
      /background[- ]check/i,
      /licensed/i,
      /trusted by/i,
      /#1/,
      /revolution/i,
      /stress-free/i,
      /\d+\s*(reviews|ratings|stars)/i,
    ].forEach((pattern) => {
      expect(text).not.toMatch(pattern);
    });
  });

  it('explains closed homeowner posting and Expert waitlist', () => {
    renderLanding();

    expect(
      screen.getByRole('heading', { name: /private early access in inner melbourne/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/homeowner posting closed — join the waitlist/i)).toBeInTheDocument();
    expect(screen.getByText(/preparing for its melbourne pilot/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /join expert waitlist/i }).length).toBeGreaterThan(0);
  });

  it('keeps public acquisition closed in every landing call to action', () => {
    renderLanding();

    expect(screen.getAllByText('Join waitlist').length).toBeGreaterThan(0);
    expect(screen.queryByText('Post task')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /post (a|your) task/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^post a task$/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).not.toContain('/post-job');
    expect(
      screen.getByRole('button', { name: /join waitlist for mounting/i })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /join expert waitlist/i }).length).toBeGreaterThan(0);
  });

  it('keeps public routes unchanged', () => {
    renderLanding();

    const footer = screen.getByRole('navigation', { name: /footer/i });
    expect(within(footer).getByRole('link', { name: 'Join waitlist' })).toHaveAttribute('href', '/waitlist');
    expect(within(footer).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(within(footer).getByRole('link', { name: 'Join Expert waitlist' })).toHaveAttribute('href', '/expert-waitlist');
    expect(within(footer).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(within(footer).getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
    const header = screen.getByRole('navigation', { name: /primary/i });
    expect(within(header).getByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Join waitlist' })).toBeInTheDocument();
    expect(within(header).getByRole('link', { name: /how it works/i })).toHaveAttribute('href', '#how-taskio-works');
  });

  it('disables the homeowner CTA while availability is loading', () => {
    mockPilotStatus.value = {
      loadState: 'loading',
      status: { homeownerPosting: 'CLOSED', canPost: false, waitlistAvailable: true },
      refresh: jest.fn(),
    };
    renderLanding();

    const loadingCtas = screen.getAllByRole('button', { name: /checking availability/i });
    expect(loadingCtas.length).toBeGreaterThan(0);
    loadingCtas.forEach((cta) => expect(cta).toBeDisabled());
    const header = screen.getByRole('navigation', { name: /primary/i });
    expect(within(header).queryByRole('button', { name: /join waitlist|post a task|checking/i })).not.toBeInTheDocument();
  });

  it('lets a new homeowner post when OPEN even if Expert public signup is off', () => {
    mockPilotStatus.value = {
      loadState: 'ok',
      status: { homeownerPosting: 'OPEN', canPost: true, waitlistAvailable: false },
      refresh: jest.fn(),
    };
    renderLanding();

    expect(screen.getByRole('button', { name: /post your task for free/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log in if invited/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^join waitlist$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/preparing for its melbourne pilot/i)).not.toBeInTheDocument();
    expect(screen.getByText(/sign up or log in, no invitation/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /join expert waitlist/i }).length).toBeGreaterThan(0);
  });

  it('shows Post a task when posting is OPEN and public acquisition is enabled', () => {
    mockPublicAcquisition.enabled = true;
    mockPilotStatus.value = {
      loadState: 'ok',
      status: { homeownerPosting: 'OPEN', canPost: true, waitlistAvailable: false },
      refresh: jest.fn(),
    };
    renderLanding();

    expect(screen.getByRole('button', { name: /post your task for free/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /post a task$/i }).length).toBeGreaterThan(0);
    const header = screen.getByRole('navigation', { name: /primary/i });
    expect(within(header).getByRole('button', { name: 'Post a task' })).toBeInTheDocument();
  });

  it('shows pause copy and a waitlist CTA when posting is PAUSED', () => {
    mockPilotStatus.value = {
      loadState: 'ok',
      status: { homeownerPosting: 'PAUSED', canPost: false, waitlistAvailable: true },
      refresh: jest.fn(),
    };
    renderLanding();

    expect(screen.getByText(/temporarily pausing new job posts/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /join waitlist/i }).length).toBeGreaterThan(0);
  });

  it('lets a new Expert apply when Expert onboarding is OPEN even if homeowner posting is CLOSED', () => {
    mockPilotStatus.value = {
      loadState: 'ok',
      status: {
        homeownerPosting: 'CLOSED',
        canPost: false,
        waitlistAvailable: true,
        expertOnboarding: 'OPEN',
        canExpertApply: true,
        expertWaitlistAvailable: false,
      },
      refresh: jest.fn(),
    };
    renderLanding();

    const expertLinks = screen.getAllByRole('link', { name: /become an expert/i });
    expect(expertLinks.length).toBeGreaterThan(1);
    expertLinks.forEach((link) => expect(link).toHaveAttribute('href', '/expert/signup'));
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).not.toContain('/tradie/signup');
    expect(screen.queryByRole('link', { name: /join expert waitlist/i })).not.toBeInTheDocument();
    expect(screen.getByText(/taskio is recruiting experts for inner melbourne/i)).toBeInTheDocument();
    expect(screen.getByText(/taskio reviews them before marketplace access/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /join waitlist/i }).length).toBeGreaterThan(0);
  });

  it('fails Expert applications closed when public status cannot be loaded', () => {
    mockPilotStatus.value = {
      loadState: 'error',
      status: { homeownerPosting: 'CLOSED', canPost: false, waitlistAvailable: true },
      refresh: jest.fn(),
    };
    renderLanding();

    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /join waitlist/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /join expert waitlist/i })[0]).toHaveAttribute('href', '/expert-waitlist');
  });
});
