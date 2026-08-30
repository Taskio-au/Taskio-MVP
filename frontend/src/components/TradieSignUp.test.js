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
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'hunter22' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'hunter22' } });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: /set your work preferences/i })).toBeInTheDocument());
    expect(screen.getByText(/mounting & installation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^shelves$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^mirrors$/i })).toBeInTheDocument();
  });

  it('submits structured location and expertise, then shows the readiness prompt', async () => {
    render(<ExpertSignUpPage />);

    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Expert' } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'hunter22' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'hunter22' } });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: /set your work preferences/i })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/primary service suburb/i), { target: { value: 'Richmond|3121' } });
    fireEvent.click(screen.getByRole('button', { name: /^shelves$/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /create expert account/i }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith('/api/users/register', expect.objectContaining({
      role: 'tradie',
      primaryServiceSuburb: 'Richmond',
      primaryServicePostcode: '3121',
      expertise: ['mounting_shelves'],
      serviceLocation: expect.objectContaining({
        suburb: 'Richmond',
        postcode: '3121',
      }),
    }));
    await waitFor(() => expect(screen.getByText(/verify your email to finish setup/i)).toBeInTheDocument());
    expect(screen.getAllByText(/add and verify your phone number/i).length).toBeGreaterThan(0);
  });

  it('offers Google as a secondary signup path and completes expert onboarding with the same preferences step', async () => {
    render(<ExpertSignUpPage />);

    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    await waitFor(() => expect(mockSignInWithPopup).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('heading', { name: /set your work preferences/i })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/primary service suburb/i), { target: { value: 'Richmond|3121' } });
    fireEvent.click(screen.getByRole('button', { name: /^shelves$/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /create expert account/i }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/users/register/expert-google', expect.objectContaining({
      firstName: 'Jane',
      lastName: 'Expert',
      primaryServiceSuburb: 'Richmond',
      primaryServicePostcode: '3121',
      expertise: ['mounting_shelves'],
    })));
    expect(mockUpsertUserProfileFromAuth).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/finish expert readiness/i)).toBeInTheDocument());
  });
});
