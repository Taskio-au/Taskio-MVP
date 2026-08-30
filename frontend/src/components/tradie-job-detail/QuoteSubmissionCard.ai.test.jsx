import React from 'react';
import { render, screen } from '@testing-library/react';
import QuoteSubmissionCard from './QuoteSubmissionCard';
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

test('hides the AI Quote Assistant when the backend reports fallback', () => {
  const eligibility = buildTaskExpertEligibilityView({
    canQuote: true,
    reasons: [],
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
      verified: true,
    },
  });

  render(
    <QuoteSubmissionCard
      styles={styles}
      revisionRequest={null}
      success=""
      myQuote={null}
      withdrawing={false}
      onWithdrawQuote={jest.fn()}
      stripeStatus={{ enabled: true, onboardingStatus: 'complete' }}
      onStartStripeOnboarding={jest.fn()}
      onRefreshStripeStatus={jest.fn()}
      refreshingStripe={false}
      eligibilityLoading={false}
      eligibility={eligibility}
      aiBusy={false}
      onRunAiQuoteAssistant={jest.fn()}
      aiError=""
      aiAssumptions={[]}
      aiAvailable={false}
      quoteData={{ amount: '', message: '' }}
      onQuoteChange={jest.fn()}
      aiSuggestedRange={null}
      error=""
      submitting={false}
      onQuoteSubmit={jest.fn((event) => event.preventDefault())}
      jobId="job-1"
    />
  );

  expect(screen.queryByText(/AI Quote Assistant/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Draft quote message/i })).not.toBeInTheDocument();
});
