import React, { useState } from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import QuoteSubmissionCard, { FEE_ESTIMATE_DEBOUNCE_MS } from './QuoteSubmissionCard';
import { buildTaskExpertEligibilityView } from '../../utils/taskExpertEligibility';

jest.mock('react-router-dom', () => ({
  __esModule: true,
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}), { virtual: true });

const styles = {
  quoteCard: {},
  sectionTitle: {},
  successMessage: {},
  quotedBanner: {},
  withdrawButton: {},
  revisionBanner: {},
  onboardingWarning: {},
  onboardingButton: {},
  onboardingButtonSecondary: {},
  eligibilityPanel: {},
  completeProfileButton: {},
  progressBar: {},
  progressFill: {},
  checklistTitle: {},
  checklist: {},
  checklistItem: {},
  checkIcon: {},
  crossIcon: {},
  checklistTextDone: {},
  checklistTextMissing: {},
  eligibilityNote: {},
  aiBox: {},
  aiButton: {},
  aiDisclaimer: {},
  label: {},
  input: {},
  helperText: {},
  textarea: {},
  errorMessage: {},
  submitButton: {},
};

const eligibleChecklist = {
  emailVerified: true,
  phoneVerified: true,
  serviceLocationPresent: true,
  dobPresent: true,
  is18PlusConfirmed: true,
  businessTypeSet: true,
  abnRequired: false,
  abnPresent: false,
  abnVerified: false,
  profileCompleted: true,
  stripeOnboardingComplete: true,
  verified: true,
};

function renderCard(overrides = {}) {
  const eligibility = buildTaskExpertEligibilityView({
    canQuote: false,
    reasons: ['PROFILE_INCOMPLETE'],
    checklist: {
      emailVerified: false,
      phoneVerified: true,
      serviceLocationPresent: false,
      dobPresent: false,
      is18PlusConfirmed: false,
      businessTypeSet: false,
      abnRequired: true,
      abnPresent: false,
      abnVerified: false,
      profileCompleted: false,
      stripeOnboardingComplete: false,
      verified: false,
    },
  });

  return render(
    <QuoteSubmissionCard
      styles={styles}
      revisionRequest={null}
      success=""
      myQuote={null}
      withdrawing={false}
      onWithdrawQuote={jest.fn()}
      stripeStatus={{ enabled: true, onboardingStatus: 'pending' }}
      onStartStripeOnboarding={jest.fn()}
      onRefreshStripeStatus={jest.fn()}
      refreshingStripe={false}
      eligibilityLoading={false}
      eligibility={eligibility}
      aiBusy={false}
      onRunAiQuoteAssistant={jest.fn()}
      aiError=""
      aiAssumptions={[]}
      quoteData={{ amount: '', message: '' }}
      onQuoteChange={jest.fn()}
      aiSuggestedRange={null}
      error=""
      submitting={false}
      onQuoteSubmit={jest.fn((event) => event.preventDefault())}
      jobId={null}
      foundingExpertFeeProfile={null}
      fetchFeeEstimate={null}
      {...overrides}
    />
  );
}

describe('QuoteSubmissionCard', () => {
  it('renders the full backend-driven quote readiness checklist', () => {
    renderCard();

    expect(screen.getByText(/finish quote readiness/i)).toBeInTheDocument();
    expect(screen.getByText(/add service location/i)).toBeInTheDocument();
    expect(screen.getByText(/confirm date of birth \(18\+\)/i)).toBeInTheDocument();
    expect(screen.getByText(/select business type/i)).toBeInTheDocument();
    expect(screen.getByText(/add and verify abn/i)).toBeInTheDocument();
    expect(screen.getByText(/complete expert profile/i)).toBeInTheDocument();
    expect(screen.getByText(/complete stripe payout setup/i)).toBeInTheDocument();
    expect(screen.getByText(/pass admin verification/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh status/i })).toBeInTheDocument();
    expect(screen.getByText(/clients expect experts who are verified/i)).toBeInTheDocument();
  });

  it('shows verification-pending copy when only admin verification remains', () => {
    const eligibility = buildTaskExpertEligibilityView({
      canQuote: false,
      reasons: ['UNVERIFIED'],
      checklist: {
        emailVerified: true,
        phoneVerified: true,
        serviceLocationPresent: true,
        dobPresent: true,
        is18PlusConfirmed: true,
        businessTypeSet: true,
        abnRequired: false,
        abnPresent: false,
        abnVerified: false,
        profileCompleted: true,
        stripeOnboardingComplete: true,
        verified: false,
      },
    });

    renderCard({ eligibility });

    expect(screen.getByText(/awaiting expert verification/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /open profile/i })).not.toBeInTheDocument();
    expect(screen.getByText(/what happens next/i)).toBeInTheDocument();
    expect(screen.getByText(/quoting unlocks once our team has verified/i)).toBeInTheDocument();
  });

  it('uses client-facing success copy after quote submission', () => {
    renderCard({ success: 'done' });

    expect(screen.getByText(/quote submitted successfully/i)).toBeInTheDocument();
    expect(screen.getByText(/the client will review your quote/i)).toBeInTheDocument();
  });

  it('renders the AI Quote Assistant with wording-only copy and no price language', () => {
    renderCard({
      eligibility: buildTaskExpertEligibilityView({ canQuote: true, reasons: [], checklist: eligibleChecklist }),
    });

    expect(screen.getByText(/AI Quote Assistant/i)).toBeInTheDocument();
    expect(screen.getByText(/Draft a clear message based on the task details/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Draft quote message/i })).toBeInTheDocument();
    expect(screen.getAllByText(/You choose the final price/i).length).toBeGreaterThanOrEqual(1);
    // Old copy must not appear
    expect(screen.queryByText(/Generate Quote Draft/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Draft a quote amount/i)).not.toBeInTheDocument();
    // No user-visible "tradie" text
    expect(screen.queryByText(/tradie/i)).not.toBeInTheDocument();
  });

  it('does not render an AI suggested price range even when prop is provided', () => {
    renderCard({
      aiSuggestedRange: { low: 200, high: 400 },
      eligibility: buildTaskExpertEligibilityView({ canQuote: true, reasons: [], checklist: eligibleChecklist }),
    });

    expect(screen.queryByText(/Suggested range from AI/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$200/)).not.toBeInTheDocument();
  });

  it('renders the quote message helper text and short placeholder for Phase 2 UX', () => {
    renderCard({
      eligibility: buildTaskExpertEligibilityView({ canQuote: true, reasons: [], checklist: eligibleChecklist }),
    });

    expect(screen.getByText(/Include what.s covered, any exclusions, timing/i)).toBeInTheDocument();
    expect(screen.getByText(/Example: Include scope, inclusions, exclusions, and timing/i)).toBeInTheDocument();
    const textarea = screen.getByRole('textbox', { name: /message to client/i });
    expect(textarea.placeholder).toBe('Write your quote message to the client\u2026');
  });
});

const estimate0 = {
  grossAmountCents: 15000,
  taskioFeeCents: 0,
  expertReceivesCents: 15000,
  expertFeeBps: 0,
  stage: 'founding_first_three',
  benefitLabel: 'Founding Expert offer',
  estimateOnly: true,
  finalisedWhen: 'client_funds_task',
  copy: {},
};

const estimate75 = {
  grossAmountCents: 15000,
  taskioFeeCents: 1125,
  expertReceivesCents: 13875,
  expertFeeBps: 750,
  stage: 'founding_reduced',
  benefitLabel: 'Reduced Founding Expert fee',
  estimateOnly: true,
  finalisedWhen: 'client_funds_task',
  copy: {},
};

const estimateStd = {
  grossAmountCents: 15000,
  taskioFeeCents: 1500,
  expertReceivesCents: 13500,
  expertFeeBps: 1000,
  stage: 'standard_launch',
  benefitLabel: 'Standard launch fee',
  estimateOnly: true,
  finalisedWhen: 'client_funds_task',
  copy: {},
};

function renderEligibleFeeHarness({
  fetchFeeEstimate,
  foundingExpertFeeProfile,
} = {}) {
  const eligibility = buildTaskExpertEligibilityView({
    canQuote: true,
    reasons: [],
    checklist: eligibleChecklist,
  });

  function Harness() {
    const [quoteData, setQuoteData] = useState({
      amount: '',
      message: 'Test quote message with scope and timing details.',
    });

    return (
      <QuoteSubmissionCard
        styles={styles}
        revisionRequest={null}
        success=""
        myQuote={null}
        withdrawing={false}
        onWithdrawQuote={jest.fn()}
        stripeStatus={{ enabled: false, onboardingStatus: 'completed' }}
        onStartStripeOnboarding={jest.fn()}
        onRefreshStripeStatus={jest.fn()}
        refreshingStripe={false}
        eligibilityLoading={false}
        eligibility={eligibility}
        aiBusy={false}
        onRunAiQuoteAssistant={jest.fn()}
        aiError=""
        aiAssumptions={[]}
        quoteData={quoteData}
        onQuoteChange={(e) =>
          setQuoteData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
        }
        aiSuggestedRange={null}
        error=""
        submitting={false}
        onQuoteSubmit={(e) => e.preventDefault()}
        jobId="job-q-1"
        foundingExpertFeeProfile={foundingExpertFeeProfile ?? null}
        fetchFeeEstimate={fetchFeeEstimate}
      />
    );
  }

  return render(<Harness />);
}

describe('QuoteSubmissionCard fee visibility', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('shows Taskio fee and You receive for Founding Expert 0%', async () => {
    const fetchFeeEstimate = jest.fn(() => Promise.resolve(estimate0));
    renderEligibleFeeHarness({
      fetchFeeEstimate,
      foundingExpertFeeProfile: {
        badgeLabel: 'Founding Expert',
        enrolled: true,
        zeroFeeSlotsRemaining: 2,
      },
    });

    fireEvent.change(screen.getByPlaceholderText(/e\.g\., 450/i), {
      target: { name: 'amount', value: '150' },
    });

    await act(async () => {
      jest.advanceTimersByTime(FEE_ESTIMATE_DEBOUNCE_MS);
    });

    await waitFor(() => {
      expect(fetchFeeEstimate).toHaveBeenCalledWith({
        grossAmountCents: 15000,
        jobId: 'job-q-1',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('quote-fee-estimate-block')).toHaveTextContent(/Taskio fee:/);
      expect(screen.getByTestId('quote-fee-estimate-block')).toHaveTextContent(/Founding Expert offer/);
      expect(screen.getByTestId('quote-fee-estimate-block')).toHaveTextContent(/You receive:/);
      expect(screen.getByTestId('quote-fee-estimate-block')).toHaveTextContent(/Founding Expert/);
      expect(screen.getByText(/0% Taskio fee on your first 3 funded tasks\. 2 remaining\./)).toBeInTheDocument();
    });
  });

  it('shows reduced Founding Expert fee label for 7.5%', async () => {
    const fetchFeeEstimate = jest.fn(() => Promise.resolve(estimate75));
    renderEligibleFeeHarness({
      fetchFeeEstimate,
      foundingExpertFeeProfile: {
        reducedFeeEndsAtMs: new Date(Date.UTC(2030, 5, 1)).getTime(),
        badgeLabel: 'Founding Expert',
        enrolled: true,
      },
    });

    fireEvent.change(screen.getByPlaceholderText(/e\.g\., 450/i), {
      target: { name: 'amount', value: '150' },
    });

    await act(async () => {
      jest.advanceTimersByTime(FEE_ESTIMATE_DEBOUNCE_MS);
    });

    await waitFor(() => {
      expect(screen.getByTestId('quote-fee-estimate-block')).toHaveTextContent(/Reduced Founding Expert fee/);
      expect(screen.getByTestId('quote-fee-estimate-block')).toHaveTextContent(/Reduced fee active until/i);
    });
  });

  it('shows Standard launch fee for 10%', async () => {
    const fetchFeeEstimate = jest.fn(() => Promise.resolve(estimateStd));
    renderEligibleFeeHarness({ fetchFeeEstimate });

    fireEvent.change(screen.getByPlaceholderText(/e\.g\., 450/i), {
      target: { name: 'amount', value: '150' },
    });

    await act(async () => {
      jest.advanceTimersByTime(FEE_ESTIMATE_DEBOUNCE_MS);
    });

    await waitFor(() => {
      expect(screen.getByTestId('quote-fee-estimate-block')).toHaveTextContent(/Standard launch fee/);
    });

    expect(screen.queryByText(/Founding Expert/)).not.toBeInTheDocument();
  });

  it('calls fee estimate after amount changes debounce', async () => {
    const fetchFeeEstimate = jest.fn(() => Promise.resolve(estimateStd));
    renderEligibleFeeHarness({ fetchFeeEstimate });

    fireEvent.change(screen.getByPlaceholderText(/e\.g\., 450/i), {
      target: { name: 'amount', value: '150' },
    });

    await act(async () => {
      jest.advanceTimersByTime(FEE_ESTIMATE_DEBOUNCE_MS - 50);
    });
    expect(fetchFeeEstimate).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(50);
    });

    await waitFor(() => {
      expect(fetchFeeEstimate).toHaveBeenCalledTimes(1);
    });
  });

  it('does not surface fee estimate block when amount is cleared', async () => {
    const fetchFeeEstimate = jest.fn(() => Promise.resolve(estimateStd));
    renderEligibleFeeHarness({ fetchFeeEstimate });
    const input = screen.getByPlaceholderText(/e\.g\., 450/i);

    fireEvent.change(input, { target: { name: 'amount', value: '150' } });
    await act(async () => {
      jest.advanceTimersByTime(FEE_ESTIMATE_DEBOUNCE_MS);
    });
    await waitFor(() => expect(fetchFeeEstimate).toHaveBeenCalled());

    fireEvent.change(input, { target: { name: 'amount', value: '' } });
    await act(async () => {
      jest.advanceTimersByTime(FEE_ESTIMATE_DEBOUNCE_MS);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('quote-fee-estimate-block')).not.toBeInTheDocument();
    });
  });

  it('estimate API failure does not block submission', async () => {
    const fetchFeeEstimate = jest.fn(() => Promise.reject(new Error('network')));
    renderEligibleFeeHarness({ fetchFeeEstimate });

    fireEvent.change(screen.getByPlaceholderText(/e\.g\., 450/i), {
      target: { name: 'amount', value: '150' },
    });

    await act(async () => {
      jest.advanceTimersByTime(FEE_ESTIMATE_DEBOUNCE_MS);
    });

    await waitFor(() => {
      expect(screen.getByText(/Fee estimate unavailable/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /submit quote/i })).not.toBeDisabled();
  });

  it('fee block copy avoids escrow, tradie, and homeowner', async () => {
    const fetchFeeEstimate = jest.fn(() => Promise.resolve(estimateStd));
    renderEligibleFeeHarness({ fetchFeeEstimate });

    fireEvent.change(screen.getByPlaceholderText(/e\.g\., 450/i), {
      target: { name: 'amount', value: '150' },
    });

    await act(async () => {
      jest.advanceTimersByTime(FEE_ESTIMATE_DEBOUNCE_MS);
    });

    await waitFor(() => {
      const txt = screen.getByTestId('quote-fee-estimate-block').textContent.toLowerCase();
      expect(txt).not.toContain('escrow');
      expect(txt).not.toContain('tradie');
      expect(txt).not.toContain('homeowner');
    });
  });

  it('shows estimate unavailable copy when estimate fetcher missing', async () => {
    const eligibility = buildTaskExpertEligibilityView({
      canQuote: true,
      reasons: [],
      checklist: eligibleChecklist,
    });

    render(
      <QuoteSubmissionCard
        styles={styles}
        revisionRequest={null}
        success=""
        myQuote={null}
        withdrawing={false}
        onWithdrawQuote={jest.fn()}
        stripeStatus={{ enabled: false, onboardingStatus: 'completed' }}
        onStartStripeOnboarding={jest.fn()}
        onRefreshStripeStatus={jest.fn()}
        refreshingStripe={false}
        eligibilityLoading={false}
        eligibility={eligibility}
        aiBusy={false}
        onRunAiQuoteAssistant={jest.fn()}
        aiError=""
        aiAssumptions={[]}
        quoteData={{ amount: '200', message: 'ok' }}
        onQuoteChange={jest.fn()}
        aiSuggestedRange={null}
        error=""
        submitting={false}
        onQuoteSubmit={(e) => e.preventDefault()}
        jobId={null}
        foundingExpertFeeProfile={null}
        fetchFeeEstimate={null}
      />
    );

    expect(screen.getByTestId('quote-fee-estimate-block')).toHaveTextContent(/fee estimate unavailable/i);
  });
});
