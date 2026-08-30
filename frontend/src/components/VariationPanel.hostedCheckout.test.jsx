import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('../firebase', () => ({
  auth: { currentUser: null },
  db: {},
  storage: {},
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => 'collection-ref'),
  doc: jest.fn(() => ({ id: 'var-id-1' })),
  onSnapshot: jest.fn(),
  orderBy: jest.fn(() => 'orderby'),
  query: jest.fn(() => 'query-ref'),
  serverTimestamp: jest.fn(),
  setDoc: jest.fn(() => Promise.resolve()),
}));

jest.mock('firebase/storage', () => ({
  getDownloadURL: jest.fn(),
  ref: jest.fn(),
  uploadBytesResumable: jest.fn(),
}));

jest.mock('../utils/jobStateHelpers', () => ({
  canUseVariations: jest.fn(),
  isVariationReadOnly: jest.fn(),
  isPaymentSecured: jest.fn(),
}));

const mockApiPost = jest.fn();
jest.mock('../api/createApiClient', () => ({
  createApiClient: () => ({ post: (...args) => mockApiPost(...args) }),
}));

const mockGoToCheckout = jest.fn();
jest.mock('../utils/stripeHostedCheckoutUrl', () => ({
  navigateToStripeHostedCheckout: (...args) => mockGoToCheckout(...args),
}));

const firestoreMock = require('firebase/firestore');
const { canUseVariations, isVariationReadOnly, isPaymentSecured } = require('../utils/jobStateHelpers');
const { auth } = require('../firebase');
import VariationPanel from './VariationPanel';

const HOMEOWNER_UID = 'home-uid-1';
const TRADIE_UID = 'tradie-uid-1';
const CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_abc';

describe('VariationPanel hosted Checkout URL', () => {
  beforeEach(() => {
    mockApiPost.mockReset();
    mockGoToCheckout.mockReset();
    canUseVariations.mockReturnValue(true);
    isVariationReadOnly.mockReturnValue(false);
    isPaymentSecured.mockReturnValue(true);
    firestoreMock.onSnapshot.mockImplementation((_query, successCb) => {
      successCb({
        docs: [{
          id: 'v1',
          data: () => ({
            status: 'pending',
            priceChangeCents: 5000,
            title: 'Extra',
            description: 'More work',
            createdByUid: TRADIE_UID,
          }),
        }],
      });
      return jest.fn();
    });
    auth.currentUser = { uid: HOMEOWNER_UID, displayName: 'Home Owner' };
  });

  it('navigates to the server-returned Checkout URL after paid approve', async () => {
    mockApiPost.mockResolvedValueOnce({
      data: {
        status: 'awaiting_payment',
        sessionId: 'cs_test_abc',
        checkoutUrl: CHECKOUT_URL,
      },
    });

    render(
      <VariationPanel
        jobId="job-1"
        job={{
          homeownerUid: HOMEOWNER_UID,
          acceptedTradieUid: TRADIE_UID,
          status: 'IN_PROGRESS',
          paymentState: 'in_escrow',
          progressStatus: 'work_started',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /approve & pay variation/i }));

    await waitFor(() => {
      expect(mockGoToCheckout).toHaveBeenCalledWith(CHECKOUT_URL);
    });
  });
});
