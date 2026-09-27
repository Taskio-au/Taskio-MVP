import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockNavigate = jest.fn();
const mockPost = jest.fn();
const mockSignInWithEmailAndPassword = jest.fn();
const mockSendEmailVerification = jest.fn();
const mockSignInWithPopup = jest.fn();
const mockUpdateProfile = jest.fn();
const mockUpsertUserProfileFromAuth = jest.fn();

jest.mock('react-router-dom', () => ({
  __esModule: true,
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => mockNavigate,
}), { virtual: true });

jest.mock('../api/createApiClient', () => ({
  createApiClient: () => ({
    post: (...args) => mockPost(...args),
  }),
}));

jest.mock('../firebase', () => ({
  auth: {},
  googleProvider: {},
}));

jest.mock('../config/publicAcquisitionConfig', () => ({
  isPublicAcquisitionEnabled: () => true,
  isExpertPublicSignupEnabled: () => true,
}));

jest.mock('./profile/GoogleBrand', () => ({
  GoogleActionButton: ({ children, ...props }) => <button type="button" {...props}>{children}</button>,
}));

jest.mock('../design/components/BrandLogo', () => () => <div>BrandLogo</div>);

jest.mock('./tradie-signup/BenefitsCard', () => () => <div>BenefitsCard</div>);

jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...args) => mockSignInWithEmailAndPassword(...args),
  sendEmailVerification: (...args) => mockSendEmailVerification(...args),
  signInWithPopup: (...args) => mockSignInWithPopup(...args),
  updateProfile: (...args) => mockUpdateProfile(...args),
}));

jest.mock('../utils/upsertUserProfileFromAuth', () => ({
  upsertUserProfileFromAuth: (...args) => mockUpsertUserProfileFromAuth(...args),
}));

const ExpertSignUpPage = require('./ExpertSignUpPage').default;

const VALID_PASSWORD = 'quiet harbour lamp 7';

function fillAccountStep(password = VALID_PASSWORD, confirmPassword = password) {
  fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Jane' } });
  fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Expert' } });
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'jane@example.com' } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: password } });
  fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: confirmPassword } });
}

async function reachPreferencesStep(password) {
  fillAccountStep(password);
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
  expect(await screen.findByRole('heading', { name: /set your work preferences/i })).toBeInTheDocument();
}

function choosePreferences() {
  fireEvent.click(screen.getByRole('checkbox', { name: /^melbourne cbd$/i }));
  fireEvent.click(screen.getByRole('checkbox', { name: /^shelves$/i }));
}

function apiError(status, data) {
  const error = new Error(`Request failed with status code ${status}`);
  error.response = { status, data };
  return error;
}

describe('ExpertSignUpPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPost.mockResolvedValue({ data: { uid: 'tradie-1' } });
    mockSignInWithEmailAndPassword.mockResolvedValue({
      user: {
        emailVerified: false,
        displayName: '',
      },
    });
    mockSignInWithPopup.mockResolvedValue({
      user: {
        email: 'google.expert@example.com',
        displayName: 'Jane Expert',
      },
    });
    mockSendEmailVerification.mockResolvedValue(undefined);
    mockUpdateProfile.mockResolvedValue(undefined);
  });

  it('blocks step one until account fields are complete', () => {
    render(<ExpertSignUpPage />);

    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(screen.getByText(/first name is required/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /create your expert account/i })).toBeInTheDocument();
  });

  it('shows grouped action-based expertise options on step two', async () => {
    render(<ExpertSignUpPage />);

    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Expert' } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: VALID_PASSWORD } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: VALID_PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(await screen.findByRole('heading', { name: /set your work preferences/i })).toBeInTheDocument();
    expect(screen.getByText(/mounting & installation/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^shelves$/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^mirrors$/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /service areas/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /areas of expertise/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^melbourne cbd$/i })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /^melbourne$/i })).not.toBeInTheDocument();
  });

  it('submits structured location and expertise, then shows the readiness prompt', async () => {
    render(<ExpertSignUpPage />);

    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Expert' } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: VALID_PASSWORD } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: VALID_PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(await screen.findByRole('heading', { name: /set your work preferences/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /^melbourne cbd$/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^carlton$/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^shelves$/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^tv mounting$/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /i agree to taskio/i }));
    fireEvent.click(screen.getByRole('button', { name: /create expert account/i }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith('/api/users/register', expect.objectContaining({
      role: 'tradie',
      primaryServiceSuburb: 'Melbourne',
      primaryServicePostcode: '3000',
      serviceAreas: ['Melbourne', 'Carlton'],
      expertise: ['mounting_shelves', 'mounting_tv'],
      serviceLocation: expect.objectContaining({
        suburb: 'Melbourne',
        postcode: '3000',
      }),
    }));
    expect(await screen.findByText(/verify your email to finish setup/i)).toBeInTheDocument();
    expect(screen.getAllByText(/add and verify your phone number/i).length).toBeGreaterThan(0);
  });

  it('offers Google as a secondary signup path and completes expert onboarding with the same preferences step', async () => {
    render(<ExpertSignUpPage />);

    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    await waitFor(() => expect(mockSignInWithPopup).toHaveBeenCalled());
    expect(await screen.findByRole('heading', { name: /set your work preferences/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /^richmond$/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^carlton$/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^shelves$/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^tv mounting$/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /i agree to taskio/i }));
    fireEvent.click(screen.getByRole('button', { name: /create expert account/i }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/users/register/expert-google', expect.objectContaining({
      firstName: 'Jane',
      lastName: 'Expert',
      primaryServiceSuburb: 'Richmond',
      primaryServicePostcode: '3121',
      serviceAreas: ['Richmond', 'Carlton'],
      expertise: ['mounting_shelves', 'mounting_tv'],
    })));
    expect(mockUpsertUserProfileFromAuth).not.toHaveBeenCalled();
    expect(await screen.findByText(/finish expert readiness/i)).toBeInTheDocument();
  });

  describe('password rules', () => {
    it('states the 12 character letter and number hint', () => {
      render(<ExpertSignUpPage />);
      expect(screen.getByLabelText(/^password$/i)).toHaveAttribute(
        'placeholder',
        'Use at least 12 characters, including a letter and a number.',
      );
      const guidance = screen.getByRole('status');
      expect(guidance).toHaveTextContent(
        'Use at least 12 characters, including a letter and a number. Avoid common or easy-to-guess passwords.',
      );
      expect(guidance).not.toHaveTextContent(/uppercase|symbol/i);
    });

    it('rejects an 11-character password on step one', () => {
      render(<ExpertSignUpPage />);
      fillAccountStep('BlueHouse27');
      fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

      expect(screen.getByText('Use at least 12 characters for your password.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /create your expert account/i })).toBeInTheDocument();
    });

    it('rejects letters without a number', () => {
      render(<ExpertSignUpPage />);
      fillAccountStep('quiet river table');
      fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

      expect(screen.getByText('Include at least one number.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /create your expert account/i })).toBeInTheDocument();
    });

    it('rejects numbers without a letter', () => {
      render(<ExpertSignUpPage />);
      fillAccountStep('123456789012');
      fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

      expect(screen.getByText('Include at least one letter.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /create your expert account/i })).toBeInTheDocument();
    });

    it.each(['password1234', 'password12345', 'taskio2026abc'])(
      'blocks the Weak password %p on step one with actionable guidance',
      (weakPassword) => {
        render(<ExpertSignUpPage />);
        fillAccountStep(weakPassword);
        const meter = screen.getByRole('status');
        expect(meter).toHaveTextContent('Password strength: Weak');
        expect(meter).toHaveTextContent('Choose a less predictable password.');

        fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
        expect(screen.getAllByRole('alert').map((alert) => alert.textContent))
          .toContain('Choose a less predictable password.');
        expect(screen.getByRole('heading', { name: /create your expert account/i })).toBeInTheDocument();
      },
    );

    it.each([
      ['bluehouse277', 'Fair'],
      ['BLUEHOUSE2026', 'Fair'],
      ['quiet river 7 table', 'Strong'],
      ['BlueHouse2026', 'Strong'],
    ])(
      'lets %p (%s) continue without a required symbol or required letter case',
      async (password, label) => {
        render(<ExpertSignUpPage />);
        fillAccountStep(password);
        expect(screen.getByRole('status')).toHaveTextContent(`Password strength: ${label}`);

        fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
        expect(await screen.findByRole('heading', { name: /set your work preferences/i })).toBeInTheDocument();
      },
    );

    it('rejects a password longer than 128 characters on step one', () => {
      render(<ExpertSignUpPage />);
      fillAccountStep(`quiet harbour ${'lamp'.repeat(30)}`);
      fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
      expect(screen.getByText('Use no more than 128 characters for your password.')).toBeInTheDocument();
    });

    it('updates a live, text-based strength label as the password changes', () => {
      render(<ExpertSignUpPage />);
      const password = screen.getByLabelText(/^password$/i);
      const meter = screen.getByRole('status');

      expect(meter).toHaveAttribute('aria-live', 'polite');
      expect(meter).toHaveAttribute('id', 'expert-password-strength');
      expect(password).toHaveAttribute('aria-describedby', expect.stringContaining('expert-password-strength'));
      expect(meter).toHaveTextContent(/use at least 12 characters, including a letter and a number/i);

      fireEvent.change(password, { target: { value: 'short' } });
      expect(meter).toHaveTextContent('Password strength: Weak');
      expect(meter).toHaveTextContent(/use at least 12 characters/i);

      fireEvent.change(password, { target: { value: 'bluehouse277' } });
      expect(meter).toHaveTextContent('Password strength: Fair');

      fireEvent.change(password, { target: { value: 'quiet harbour lamp 7' } });
      expect(meter).toHaveTextContent('Password strength: Strong');
    });
  });

  describe('terms gate', () => {
    it('keeps Create expert account disabled until Terms are accepted', async () => {
      render(<ExpertSignUpPage />);
      await reachPreferencesStep();
      choosePreferences();

      const createButton = screen.getByRole('button', { name: /create expert account/i });
      expect(createButton).toBeDisabled();
      expect(createButton).toHaveAttribute('aria-describedby', 'expert-create-account-hint');
      expect(screen.getByText(/accept the terms of use and privacy policy to create your account/i)).toBeInTheDocument();

      fireEvent.click(createButton);
      fireEvent.submit(createButton);
      expect(await screen.findByText(/correct the highlighted work preference fields/i)).toBeInTheDocument();
      expect(mockPost).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('checkbox', { name: /i agree to taskio/i }));
      expect(createButton).toBeEnabled();
      expect(createButton).not.toHaveAttribute('aria-describedby');
    });

    it('does not let Google signup create an Expert without Terms', async () => {
      render(<ExpertSignUpPage />);
      fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
      expect(await screen.findByRole('heading', { name: /set your work preferences/i })).toBeInTheDocument();
      choosePreferences();

      const createButton = screen.getByRole('button', { name: /create expert account/i });
      expect(createButton).toBeDisabled();
      fireEvent.click(createButton);
      fireEvent.submit(createButton);
      expect(mockPost).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('checkbox', { name: /i agree to taskio/i }));
      fireEvent.click(createButton);
      await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/users/register/expert-google', expect.any(Object)));
    });
  });

  describe('signup failure messages', () => {
    async function submitWithFailure(error) {
      mockPost.mockRejectedValueOnce(error);
      render(<ExpertSignUpPage />);
      await reachPreferencesStep();
      choosePreferences();
      fireEvent.click(screen.getByRole('checkbox', { name: /i agree to taskio/i }));
      fireEvent.click(screen.getByRole('button', { name: /create expert account/i }));
      await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    }

    it('shows a retryable message when the Auth service is unavailable (diagnosed local failure)', async () => {
      await submitWithFailure(apiError(503, {
        message: "We couldn't create your account right now. Please try again.",
        code: 'registration_unavailable',
      }));
      expect(await screen.findByText("We couldn't create your account right now. Please try again.")).toBeInTheDocument();
    });

    it('shows the same retryable message on a network failure', async () => {
      await submitWithFailure(new Error('Network Error'));
      expect(await screen.findByText("We couldn't create your account right now. Please try again.")).toBeInTheDocument();
    });

    it('shows the duplicate email message', async () => {
      await submitWithFailure(apiError(400, { message: 'server wording may change', code: 'auth/email-already-exists' }));
      expect(await screen.findByText('An account already exists with this email.')).toBeInTheDocument();
    });

    it('returns to the password field when the server rejects a short password', async () => {
      await submitWithFailure(apiError(400, { message: 'server wording may change', code: 'password_too_short' }));
      expect(await screen.findAllByText('Use at least 12 characters for your password.')).not.toHaveLength(0);
      expect(screen.getByRole('heading', { name: /create your expert account/i })).toBeInTheDocument();
    });

    it('returns to the password field when the server rejects a predictable password', async () => {
      await submitWithFailure(apiError(400, { message: 'server wording may change', code: 'password_too_weak' }));
      expect(await screen.findAllByText('Choose a less predictable password.')).not.toHaveLength(0);
      expect(screen.getByRole('heading', { name: /create your expert account/i })).toBeInTheDocument();
    });

    it('keeps a safe generic message for an unexpected failure without a message', async () => {
      await submitWithFailure(apiError(400, {}));
      expect(await screen.findByText('We could not create the account with those details.')).toBeInTheDocument();
    });
  });
});
