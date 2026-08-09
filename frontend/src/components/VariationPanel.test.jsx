/**
 * VariationPanel — frontend eligibility and API submission tests
 *
 * Covers:
 *  - Form visible when IN_PROGRESS + in_escrow (accepted tradie)
 *  - Form hidden (info message) when FUNDED + in_escrow but work not started
 *  - Form hidden with "unlock" info when payment not secured
 *  - Read-only info shown when COMPLETED
 *  - Homeowner cannot submit new variations (no "Request Variation" button)
 *  - Panel returns null for unrelated users
 *  - submitVariation calls POST /api/jobs/:jobId/variations (not Firestore directly)
 *  - Success clears the form and closes it
 *  - Backend error message is surfaced to the user
 *  - TradieJobDetail status helpers: quoteable vs post-acceptance statuses
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — all jest.mock calls must be before any imports that use those modules
// ---------------------------------------------------------------------------
jest.mock('../firebase', () => ({
  auth: { currentUser: null },
  db: {},
  storage: {},
}));

// onSnapshot and all Firestore helpers are stubbed out.
// onSnapshot.mockReturnValue is configured in beforeEach.
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => 'collection-ref'),
  doc: jest.fn(() => ({ id: 'var-id-1' })),
  onSnapshot: jest.fn(),
  orderBy: jest.fn(() => 'orderby'),
  query: jest.fn(() => 'query-ref'),
  serverTimestamp: jest.fn(() => ({ _type: 'serverTimestamp' })),
  setDoc: jest.fn(() => Promise.resolve()),
  updateDoc: jest.fn(() => Promise.resolve()),
}));

jest.mock('firebase/storage', () => ({
  getDownloadURL: jest.fn(),
  ref: jest.fn(),
  uploadBytesResumable: jest.fn(),
}));

jest.mock('@stripe/stripe-js', () => ({
  loadStripe: jest.fn(() => Promise.resolve({
    redirectToCheckout: jest.fn(() => Promise.resolve({ error: null })),
  })),
}));

jest.mock('../utils/jobStateHelpers', () => ({
  canUseVariations: jest.fn(),
  isVariationReadOnly: jest.fn(),
  isPaymentSecured: jest.fn(),
}));

// Mock the API client used for variation creation.
// Implementation is configured per-test in beforeEach via mockReturnValue.
jest.mock('../api/createApiClient', () => ({
  createApiClient: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Access mocked modules
// ---------------------------------------------------------------------------
const firestoreMock = require('firebase/firestore');
const { canUseVariations, isVariationReadOnly, isPaymentSecured } = require('../utils/jobStateHelpers');
const { auth } = require('../firebase');
const { createApiClient } = require('../api/createApiClient');

// The unsubscribe function returned by onSnapshot must be a callable.
const MOCK_UNSUB = jest.fn();

// Per-test API post spy — recreated in resetMocks so each test gets a fresh mock.
let mockApiPost;

import VariationPanel from './VariationPanel';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TRADIE_UID = 'tradie-uid-1';
const HOMEOWNER_UID = 'homeowner-uid-1';

function inProgressJob(overrides = {}) {
  return {
    homeownerUid: HOMEOWNER_UID,
    acceptedTradieUid: TRADIE_UID,
    status: 'IN_PROGRESS',
    paymentState: 'in_escrow',
    progressStatus: 'work_started',
    ...overrides,
  };
}

function resetMocks() {
  canUseVariations.mockReturnValue(false);
  isVariationReadOnly.mockReturnValue(false);
  isPaymentSecured.mockReturnValue(false);
  // Ensure onSnapshot ALWAYS returns a callable unsubscribe function.
  firestoreMock.onSnapshot.mockReturnValue(MOCK_UNSUB);
  // Re-arm doc mock — CRA may clear implementations between describe blocks.
  firestoreMock.doc.mockReturnValue({ id: 'var-id-1' });
  auth.currentUser = { uid: TRADIE_UID, displayName: 'Expert User' };
  // Fresh post spy + configure createApiClient to return it.
  mockApiPost = jest.fn().mockResolvedValue({ data: { variationId: 'var-abc123' } });
  createApiClient.mockReturnValue({ post: mockApiPost });
}

// ---------------------------------------------------------------------------
// VariationPanel eligibility tests
// ---------------------------------------------------------------------------
describe('VariationPanel eligibility', () => {
  beforeEach(resetMocks);

  it('shows "Request Variation" button when IN_PROGRESS + in_escrow (accepted tradie)', () => {
    canUseVariations.mockReturnValue(true);
    isVariationReadOnly.mockReturnValue(false);
    isPaymentSecured.mockReturnValue(true);

    render(<VariationPanel jobId="job-1" job={inProgressJob()} />);

    expect(screen.getByRole('button', { name: /request variation/i })).toBeInTheDocument();
  });

  it('shows "Request Variation" button for FUNDED + in_escrow + progressStatus work_started (legacy fallback)', () => {
    // Mirrors: canUseVariations returns true via progressStatus fallback when
    // status is still FUNDED but the Expert has marked work started.
    // Firestore rules allow this via jobWorkStarted's progressStatus check.
    canUseVariations.mockReturnValue(true);
    isVariationReadOnly.mockReturnValue(false);
    isPaymentSecured.mockReturnValue(true);

    render(
      <VariationPanel
        jobId="job-1"
        job={inProgressJob({ status: 'FUNDED', progressStatus: 'work_started' })}
      />
    );

    expect(screen.getByRole('button', { name: /request variation/i })).toBeInTheDocument();
  });

  it('does NOT show "Request Variation" button when payment not secured', () => {
    canUseVariations.mockReturnValue(false);
    isVariationReadOnly.mockReturnValue(false);
    isPaymentSecured.mockReturnValue(false);

    render(<VariationPanel jobId="job-1" job={inProgressJob({ paymentState: 'pending_payment' })} />);

    expect(screen.queryByRole('button', { name: /request variation/i })).not.toBeInTheDocument();
    expect(screen.getByText(/variations unlock once payment is secured/i)).toBeInTheDocument();
  });

  it('does NOT show "Request Variation" button when FUNDED + in_escrow but no workStartedAt/progressStatus (locked)', () => {
    // Payment is secured but work has not started — form must be locked.
    // Firestore rule rejects this: jobWorkStarted() returns false.
    canUseVariations.mockReturnValue(false);
    isVariationReadOnly.mockReturnValue(false);
    isPaymentSecured.mockReturnValue(true);

    render(
      <VariationPanel
        jobId="job-1"
        job={inProgressJob({ status: 'FUNDED', progressStatus: null, workStartedAt: null })}
      />
    );

    expect(screen.queryByRole('button', { name: /request variation/i })).not.toBeInTheDocument();
    expect(screen.getByText(/variations will be available once work starts/i)).toBeInTheDocument();
  });

  it('shows "Variations will be available once work starts" when payment secured but work not started', () => {
    canUseVariations.mockReturnValue(false);
    isVariationReadOnly.mockReturnValue(false);
    isPaymentSecured.mockReturnValue(true);

    render(<VariationPanel jobId="job-1" job={inProgressJob({ status: 'FUNDED', progressStatus: null })} />);

    expect(screen.queryByRole('button', { name: /request variation/i })).not.toBeInTheDocument();
    expect(screen.getByText(/variations will be available once work starts/i)).toBeInTheDocument();
  });

  it('shows read-only history message when COMPLETED', () => {
    canUseVariations.mockReturnValue(false);
    isVariationReadOnly.mockReturnValue(true);
    isPaymentSecured.mockReturnValue(true);

    render(<VariationPanel jobId="job-1" job={inProgressJob({ status: 'COMPLETED' })} />);

    expect(screen.queryByRole('button', { name: /request variation/i })).not.toBeInTheDocument();
    expect(screen.getByText(/variation history is shown below/i)).toBeInTheDocument();
  });

  it('does NOT show "Request Variation" button for homeowner', () => {
    canUseVariations.mockReturnValue(true);
    isVariationReadOnly.mockReturnValue(false);
    isPaymentSecured.mockReturnValue(true);
    auth.currentUser = { uid: HOMEOWNER_UID, displayName: 'Home Owner' };

    render(<VariationPanel jobId="job-1" job={inProgressJob()} />);

    // Homeowner role — no creation button visible
    expect(screen.queryByRole('button', { name: /request variation/i })).not.toBeInTheDocument();
  });

  it('returns null when user is neither homeowner nor accepted tradie', () => {
    canUseVariations.mockReturnValue(false);
    isVariationReadOnly.mockReturnValue(false);
    isPaymentSecured.mockReturnValue(false);
    auth.currentUser = { uid: 'unrelated-user' };

    const { container } = render(<VariationPanel jobId="job-1" job={inProgressJob()} />);

    // enabled = false → component returns null
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// VariationPanel API submission tests
// ---------------------------------------------------------------------------
describe('VariationPanel — submitVariation calls backend API', () => {
  beforeEach(() => {
    resetMocks();
    canUseVariations.mockReturnValue(true);
    isVariationReadOnly.mockReturnValue(false);
    isPaymentSecured.mockReturnValue(true);
  });

  it('calls POST /api/jobs/:jobId/variations on submit (not Firestore setDoc)', async () => {
    render(<VariationPanel jobId="job-42" job={inProgressJob()} />);

    // Open the form
    fireEvent.click(screen.getByRole('button', { name: /request variation/i }));

    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText(/replace corroded valve/i), {
      target: { value: 'Replace corroded valve' },
    });
    fireEvent.change(screen.getByPlaceholderText(/what changed and why/i), {
      target: { value: 'The original valve is corroded beyond repair and needs replacement.' },
    });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /submit request/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/api/jobs/job-42/variations',
        expect.objectContaining({
          title: 'Replace corroded valve',
          description: expect.stringContaining('corroded'),
        })
      );
    });

    // Firestore setDoc should NOT have been called for the variation itself
    // (it may still be called by writeSystemMessage — that's acceptable)
    const setDocCalls = firestoreMock.setDoc.mock.calls;
    // None of the setDoc calls should have a payload with status: 'pending'
    const variationWrite = setDocCalls.find(
      ([, payload]) => payload && payload.status === 'pending'
    );
    expect(variationWrite).toBeUndefined();
  });

  it('clears the form and closes it after successful API call', async () => {
    render(<VariationPanel jobId="job-42" job={inProgressJob()} />);

    fireEvent.click(screen.getByRole('button', { name: /request variation/i }));

    fireEvent.change(screen.getByPlaceholderText(/replace corroded valve/i), {
      target: { value: 'Extra pipe run' },
    });
    fireEvent.change(screen.getByPlaceholderText(/what changed and why/i), {
      target: { value: 'Client requested an extra pipe run to the back garden.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /submit request/i }));

    // After success the form should close (button changes back to "Request Variation")
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /request variation/i })).toBeInTheDocument();
    });
    // The submit button should no longer be visible
    expect(screen.queryByRole('button', { name: /submit request/i })).not.toBeInTheDocument();
  });

  it('shows the backend error message when the API call fails', async () => {
    const axiosError = new Error('Variations are only available once payment is secured and work is in progress.');
    axiosError.response = {
      data: { message: 'Variations are only available once payment is secured and work is in progress.' },
    };
    mockApiPost.mockRejectedValueOnce(axiosError);

    render(<VariationPanel jobId="job-42" job={inProgressJob()} />);

    fireEvent.click(screen.getByRole('button', { name: /request variation/i }));

    fireEvent.change(screen.getByPlaceholderText(/replace corroded valve/i), {
      target: { value: 'Extra pipe run' },
    });
    fireEvent.change(screen.getByPlaceholderText(/what changed and why/i), {
      target: { value: 'Client requested an extra pipe run to the back garden.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /submit request/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/variations are only available once payment is secured and work is in progress/i)
      ).toBeInTheDocument();
    });
  });

  it('shows the "accepted Expert" error when backend returns 403', async () => {
    const axiosError = new Error('Only the accepted Expert can create a variation.');
    axiosError.response = {
      data: { message: 'Only the accepted Expert can create a variation.' },
    };
    mockApiPost.mockRejectedValueOnce(axiosError);

    render(<VariationPanel jobId="job-42" job={inProgressJob()} />);

    fireEvent.click(screen.getByRole('button', { name: /request variation/i }));
    fireEvent.change(screen.getByPlaceholderText(/replace corroded valve/i), {
      target: { value: 'Extra pipe run' },
    });
    fireEvent.change(screen.getByPlaceholderText(/what changed and why/i), {
      target: { value: 'Client requested an extra pipe run to the back garden.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit request/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/only the accepted expert can create a variation/i)
      ).toBeInTheDocument();
    });
  });

  it('shows generic fallback error when API response has no message', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('Network Error'));

    render(<VariationPanel jobId="job-42" job={inProgressJob()} />);

    fireEvent.click(screen.getByRole('button', { name: /request variation/i }));
    fireEvent.change(screen.getByPlaceholderText(/replace corroded valve/i), {
      target: { value: 'Extra pipe run' },
    });
    fireEvent.change(screen.getByPlaceholderText(/what changed and why/i), {
      target: { value: 'Client requested an extra pipe run to the back garden.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit request/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to create variation/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Status-set logic — pure helpers, no Firebase needed
// ---------------------------------------------------------------------------
describe('TradieJobDetail quote form visibility — status helpers', () => {
  const { JOB_STATUSES, normalizeStatus } = require('../constants/jobStatuses');
  const QUOTEABLE = new Set([JOB_STATUSES.OPEN, JOB_STATUSES.QUOTED, JOB_STATUSES.ASSIGNED]);

  it.each(['OPEN', 'QUOTED', 'ASSIGNED'])('shows quote form when status is %s', (status) => {
    expect(QUOTEABLE.has(normalizeStatus(status))).toBe(true);
  });

  it.each(['AWAITING_FUNDING', 'FUNDED', 'IN_PROGRESS', 'COMPLETED', 'PAID', 'CANCELLED'])(
    'hides quote form when status is %s',
    (status) => {
      expect(QUOTEABLE.has(normalizeStatus(status))).toBe(false);
    }
  );

  it('hides quote form for legacy lowercase in_progress', () => {
    expect(QUOTEABLE.has(normalizeStatus('in_progress'))).toBe(false);
  });

  it('hides quote form for legacy lowercase funded', () => {
    expect(QUOTEABLE.has(normalizeStatus('funded'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canUseVariations integration — tests the real helper (unmocked) to confirm
// parity with the tightened Firestore jobAllowsNewVariations() rule.
// ---------------------------------------------------------------------------
describe('canUseVariations — Firestore rules parity', () => {
  // Import the real helper (jest.mock at the top mocks jobStateHelpers for
  // the VariationPanel render tests, so we require the actual module here).
  const { canUseVariations: realCanUse } = jest.requireActual('../utils/jobStateHelpers');

  const job = (status, paymentState, extra = {}) => ({ status, paymentState, ...extra });

  it('FUNDED + in_escrow + no workStartedAt/progressStatus → locked (false)', () => {
    expect(realCanUse(job('FUNDED', 'in_escrow'))).toBe(false);
  });

  it('AWAITING_FUNDING + in_escrow + no workStartedAt/progressStatus → locked (false)', () => {
    expect(realCanUse(job('AWAITING_FUNDING', 'in_escrow'))).toBe(false);
  });

  it('IN_PROGRESS + in_escrow → allowed (true)', () => {
    expect(realCanUse(job('IN_PROGRESS', 'in_escrow'))).toBe(true);
  });

  it('FUNDED + in_escrow + progressStatus work_started → allowed / legacy fallback (true)', () => {
    expect(realCanUse(job('FUNDED', 'in_escrow', { progressStatus: 'work_started' }))).toBe(true);
  });

  it('FUNDED + in_escrow + workStartedAt exists → allowed / legacy fallback (true)', () => {
    expect(realCanUse(job('FUNDED', 'in_escrow', { workStartedAt: '2026-01-01T00:00:00Z' }))).toBe(true);
  });

  it('COMPLETED + in_escrow → read-only (false)', () => {
    expect(realCanUse(job('COMPLETED', 'in_escrow'))).toBe(false);
  });

  it('PAID + released → read-only (false)', () => {
    expect(realCanUse(job('PAID', 'released'))).toBe(false);
  });

  it('CANCELLED + anything → blocked (false)', () => {
    expect(realCanUse(job('CANCELLED', 'in_escrow'))).toBe(false);
  });

  it('DISPUTED + in_escrow → blocked (false)', () => {
    expect(realCanUse(job('DISPUTED', 'in_escrow'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Variation payment UI states (homeowner + tradie views)
// ---------------------------------------------------------------------------
describe('VariationPanel — variation payment UI states', () => {
  // Helper: configure onSnapshot to immediately fire callback with items
  function mockVariations(items) {
    firestoreMock.onSnapshot.mockImplementation((_query, successCb) => {
      successCb({ docs: items.map((v) => ({ id: v.id, data: () => ({ ...v }) })) });
      return MOCK_UNSUB;
    });
  }

  beforeEach(() => {
    resetMocks();
    canUseVariations.mockReturnValue(true);
    isVariationReadOnly.mockReturnValue(false);
    isPaymentSecured.mockReturnValue(true);
  });

  it('shows "Approve & pay variation" for homeowner with a pending paid variation', () => {
    auth.currentUser = { uid: HOMEOWNER_UID, displayName: 'Home Owner' };
    mockVariations([{ id: 'v1', status: 'pending', priceChangeCents: 5000, title: 'Extra', description: 'More work', createdByUid: TRADIE_UID }]);

    render(<VariationPanel jobId="job-1" job={inProgressJob()} />);

    expect(screen.getByRole('button', { name: /approve & pay variation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();
  });

  it('shows "Approve" (not "& pay") for homeowner with a free (zero-amount) pending variation', () => {
    auth.currentUser = { uid: HOMEOWNER_UID, displayName: 'Home Owner' };
    mockVariations([{ id: 'v1', status: 'pending', priceChangeCents: 0, title: 'Minor fix', description: 'No cost change', createdByUid: TRADIE_UID }]);

    render(<VariationPanel jobId="job-1" job={inProgressJob()} />);

    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
  });

  it('shows "Continue variation payment" for homeowner when awaiting_payment', () => {
    auth.currentUser = { uid: HOMEOWNER_UID, displayName: 'Home Owner' };
    mockVariations([{ id: 'v1', status: 'awaiting_payment', priceChangeCents: 5000, title: 'Extra', description: 'More work', createdByUid: TRADIE_UID }]);

    render(<VariationPanel jobId="job-1" job={inProgressJob()} />);

    expect(screen.getByRole('button', { name: /continue variation payment/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();
  });

  it('shows "Variation payment secured" badge for homeowner when approved + in_escrow', () => {
    auth.currentUser = { uid: HOMEOWNER_UID, displayName: 'Home Owner' };
    mockVariations([{ id: 'v1', status: 'approved', paymentState: 'in_escrow', priceChangeCents: 5000, title: 'Extra', description: 'More work', createdByUid: TRADIE_UID }]);

    render(<VariationPanel jobId="job-1" job={inProgressJob()} />);

    expect(screen.getByText(/your variation payment has been secured/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
  });

  it('shows "Approved" badge for homeowner when free variation approved (paymentState not in_escrow)', () => {
    auth.currentUser = { uid: HOMEOWNER_UID, displayName: 'Home Owner' };
    mockVariations([{ id: 'v1', status: 'approved', paymentState: 'not_required', priceChangeCents: 0, title: 'Minor', description: 'Small fix', createdByUid: TRADIE_UID }]);

    render(<VariationPanel jobId="job-1" job={inProgressJob()} />);

    // The badge text is "✓ Approved" — match it specifically
    expect(screen.getAllByText(/approved/i).length).toBeGreaterThanOrEqual(1);
    // Confirm no payment button is rendered
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
  });

  it('shows "Awaiting Client payment" notice for expert when variation is awaiting_payment', () => {
    auth.currentUser = { uid: TRADIE_UID, displayName: 'Expert' };
    mockVariations([{ id: 'v1', status: 'awaiting_payment', priceChangeCents: 5000, title: 'Extra', description: 'More', createdByUid: TRADIE_UID }]);

    render(<VariationPanel jobId="job-1" job={inProgressJob()} />);

    expect(screen.getByText(/awaiting client payment/i)).toBeInTheDocument();
  });

  it('shows "Variation payment secured" for expert when approved + in_escrow', () => {
    auth.currentUser = { uid: TRADIE_UID, displayName: 'Expert' };
    mockVariations([{ id: 'v1', status: 'approved', paymentState: 'in_escrow', priceChangeCents: 5000, title: 'Extra', description: 'More', createdByUid: TRADIE_UID }]);

    render(<VariationPanel jobId="job-1" job={inProgressJob()} />);

    expect(screen.getByText(/variation payment secured\. you can proceed/i)).toBeInTheDocument();
  });

  it('shows "Variation requested" status pill for pending variations', () => {
    auth.currentUser = { uid: HOMEOWNER_UID, displayName: 'Home Owner' };
    mockVariations([{ id: 'v1', status: 'pending', priceChangeCents: 5000, title: 'Extra', description: 'More', createdByUid: TRADIE_UID }]);

    render(<VariationPanel jobId="job-1" job={inProgressJob()} />);

    expect(screen.getByText('Variation requested')).toBeInTheDocument();
  });

  it('shows "Payment required" status pill for awaiting_payment variations', () => {
    auth.currentUser = { uid: HOMEOWNER_UID, displayName: 'Home Owner' };
    mockVariations([{ id: 'v1', status: 'awaiting_payment', priceChangeCents: 5000, title: 'Extra', description: 'More', createdByUid: TRADIE_UID }]);

    render(<VariationPanel jobId="job-1" job={inProgressJob()} />);

    expect(screen.getByText('Payment required')).toBeInTheDocument();
  });

  it('calls POST approve endpoint when "Approve & pay variation" clicked', async () => {
    auth.currentUser = { uid: HOMEOWNER_UID, displayName: 'Home Owner' };
    mockVariations([{ id: 'v1', status: 'pending', priceChangeCents: 5000, title: 'Extra', description: 'More', createdByUid: TRADIE_UID }]);
    // No sessionId — simulates free or Stripe disabled approve
    mockApiPost.mockResolvedValueOnce({ data: { status: 'approved' } });

    render(<VariationPanel jobId="job-1" job={inProgressJob()} />);

    fireEvent.click(screen.getByRole('button', { name: /approve & pay variation/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/jobs/job-1/variations/v1/approve');
    });
  });

  it('calls POST decline endpoint when "Decline" clicked', async () => {
    auth.currentUser = { uid: HOMEOWNER_UID, displayName: 'Home Owner' };
    mockVariations([{ id: 'v1', status: 'pending', priceChangeCents: 5000, title: 'Extra', description: 'More', createdByUid: TRADIE_UID }]);
    mockApiPost.mockResolvedValueOnce({ data: { status: 'declined' } });

    render(<VariationPanel jobId="job-1" job={inProgressJob()} />);

    fireEvent.click(screen.getByRole('button', { name: /decline/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/jobs/job-1/variations/v1/decline');
    });
  });

  it('calls POST checkout endpoint when "Continue variation payment" clicked', async () => {
    auth.currentUser = { uid: HOMEOWNER_UID, displayName: 'Home Owner' };
    mockVariations([{ id: 'v1', status: 'awaiting_payment', priceChangeCents: 5000, title: 'Extra', description: 'More', createdByUid: TRADIE_UID }]);
    mockApiPost.mockResolvedValueOnce({ data: { status: 'awaiting_payment', sessionId: undefined } });

    render(<VariationPanel jobId="job-1" job={inProgressJob()} />);

    fireEvent.click(screen.getByRole('button', { name: /continue variation payment/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/jobs/job-1/variations/v1/checkout');
    });
  });

  it('calls POST cancel endpoint when expert clicks "Cancel request"', async () => {
    auth.currentUser = { uid: TRADIE_UID, displayName: 'Expert' };
    mockVariations([{ id: 'v1', status: 'pending', priceChangeCents: 5000, title: 'Extra', description: 'More', createdByUid: TRADIE_UID }]);
    mockApiPost.mockResolvedValueOnce({ data: { status: 'cancelled' } });

    render(<VariationPanel jobId="job-1" job={inProgressJob()} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel request/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/jobs/job-1/variations/v1/cancel');
    });
  });

  it('shows error from backend when approve fails', async () => {
    auth.currentUser = { uid: HOMEOWNER_UID, displayName: 'Home Owner' };
    mockVariations([{ id: 'v1', status: 'pending', priceChangeCents: 5000, title: 'Extra', description: 'More', createdByUid: TRADIE_UID }]);
    const err = new Error('Failed to approve');
    err.response = { data: { message: 'Cannot approve variations for a task in its current state.' } };
    mockApiPost.mockRejectedValueOnce(err);

    render(<VariationPanel jobId="job-1" job={inProgressJob()} />);

    fireEvent.click(screen.getByRole('button', { name: /approve & pay variation/i }));

    await waitFor(() => {
      expect(screen.getByText(/cannot approve variations for a task in its current state/i)).toBeInTheDocument();
    });
  });

  it('calls onPendingVariationPayment(true) when awaiting_payment variation exists', () => {
    auth.currentUser = { uid: TRADIE_UID, displayName: 'Expert' };
    mockVariations([{ id: 'v1', status: 'awaiting_payment', priceChangeCents: 5000, title: 'Extra', description: 'More', createdByUid: TRADIE_UID }]);
    const onPending = jest.fn();

    render(<VariationPanel jobId="job-1" job={inProgressJob()} onPendingVariationPayment={onPending} />);

    expect(onPending).toHaveBeenCalledWith(true);
  });

  it('calls onPendingVariationPayment(false) when no awaiting_payment variation exists', () => {
    auth.currentUser = { uid: TRADIE_UID, displayName: 'Expert' };
    mockVariations([{ id: 'v1', status: 'approved', paymentState: 'in_escrow', priceChangeCents: 5000, title: 'Extra', description: 'More', createdByUid: TRADIE_UID }]);
    const onPending = jest.fn();

    render(<VariationPanel jobId="job-1" job={inProgressJob()} onPendingVariationPayment={onPending} />);

    expect(onPending).toHaveBeenCalledWith(false);
  });
});
