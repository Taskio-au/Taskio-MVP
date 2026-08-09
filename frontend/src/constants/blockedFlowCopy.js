/**
 * Shared copy for blocked / gated flows — consistent recovery story across the app.
 * Expert / Client wording in user-visible strings only.
 */

/** Client: durable account not ready (pay, chat) */
export const CLIENT_ACCOUNT_INCOMPLETE = {
  title: 'Finish account setup',
  body:
    'Verify your email or continue with Google so you can pay securely and use chat when payment is secured.',
  primaryCta: 'Continue setup',
  dismiss: 'Not now',
};

/** Client: /account/complete full-page flow */
export const CLIENT_ACCOUNT_COMPLETE_PAGE = {
  title: 'Finish account setup',
  subtitle:
    'Verify your email or continue with Google to unlock secure payments and chat for your tasks.',
};

/** Client: cannot view quotes (e.g. quote_access_required) */
export const CLIENT_QUOTES_LOCKED = {
  title: 'Verify your account to view quotes',
  bodyFallback:
    'We need a verified account before showing Expert quotes on this task. Finish the steps in Account settings.',
  primaryCta: 'Open Account settings',
  help: 'Help & Support',
};

/** Client: PaymentPage + checkout errors involving account */
export const CLIENT_PAYMENT_GATE = {
  titleAccount: 'Finish account setup to pay',
  titleGeneric: 'Payment couldn’t start',
  primaryCta: 'Continue setup',
  backToTask: 'Back to task',
  tryAgain: 'Try again',
};

/** Expert: quote readiness checklist */
export const EXPERT_QUOTE_READINESS = {
  title: 'Finish quote readiness',
  body: 'Finish the remaining steps on your profile to unlock quoting.',
  scoreLabel: 'Readiness',
  checklistHeading: 'Before you can quote',
  whyLabel: 'Why this matters',
  whyBody:
    'Clients expect Experts who are verified and ready to work — complete the checklist on your profile.',
  primaryCta: 'Open profile',
  checklistCta: 'View checklist',
};

/** Expert: all checklist items done except admin verification */
export const EXPERT_QUOTE_READINESS_PENDING_ADMIN = {
  title: 'Awaiting Expert verification',
  body:
    'You’ve finished your setup on Taskio. Quoting unlocks once our team has verified your Expert account — we’ll email you when that’s done.',
};

/** Expert: Stripe onboarding for quotes / payouts */
export const EXPERT_STRIPE_GATE = {
  title: 'Finish Stripe payout setup',
  body:
    'Connect Stripe so you can submit quotes. Payouts are processed after the Client approves the completed work.',
  primaryCtaContinue: 'Continue Stripe setup',
  primaryCtaStart: 'Start Stripe setup',
  secondaryRefresh: 'Refresh status',
};

/** Client: JobChatPanel when messaging blocked before account ready */
export const CLIENT_CHAT_ACCOUNT_GATE = {
  title: 'Finish account setup to use chat',
  body:
    'Verify your email or continue with Google. Chat unlocks when payment is secured and your account is ready.',
  primaryCta: 'Continue setup',
  help: 'Help & Support',
};

/** Client: Profile phone gate banner */
export const CLIENT_PHONE_GATE_BANNER = {
  title: 'Verify your phone number',
  primaryCta: 'Open Account settings',
  dismiss: 'Dismiss',
};
