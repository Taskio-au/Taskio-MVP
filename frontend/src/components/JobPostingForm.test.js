import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-router-dom', () => ({
  __esModule: true,
  MemoryRouter: ({ children }) => <div>{children}</div>,
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => jest.fn(),
}), { virtual: true });

const { MemoryRouter } = jest.requireMock('react-router-dom');

const mockApiPost = jest.fn();

jest.mock('../api/createApiClient', () => ({
  createApiClient: () => ({
    post: mockApiPost,
  }),
}));

jest.mock('../firebase', () => ({
  auth: {
    currentUser: null,
    onAuthStateChanged: jest.fn(() => () => {}),
  },
  storage: {},
}));

jest.mock('firebase/auth', () => ({}));

jest.mock('firebase/storage', () => ({
  getDownloadURL: jest.fn(),
  ref: jest.fn(),
  uploadBytesResumable: jest.fn(),
}));

jest.mock('../services/phoneVerification', () => ({
  normalizeAuMobileToE164: jest.fn((value) => {
    const raw = String(value || '').trim();
    if (!raw) throw new Error('Phone is required.');
    return '+61412345678';
  }),
  createInvisibleRecaptcha: jest.fn(() => ({ clear: jest.fn() })),
  requestPhoneOtpForSignIn: jest.fn(),
  confirmPhoneOtpForSignIn: jest.fn(),
}));

const JobPostingForm = require('./JobPostingForm').default;

function renderForm() {
  return render(
    <MemoryRouter>
      <JobPostingForm />
    </MemoryRouter>
  );
}

function fillStepOne({ category, jobType, description }) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(category, 'i') }));
  fireEvent.click(screen.getByLabelText(new RegExp(jobType, 'i')));
  fireEvent.change(screen.getByLabelText(/description/i), { target: { value: description } });
}

describe('JobPostingForm', () => {
  beforeEach(() => {
    mockApiPost.mockReset();
    sessionStorage.clear();
  });

  it('shows none, recommended, and required photo states based on the selected job', () => {
    renderForm();

    expect(screen.queryByText(/step 1: choose a category/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/step 2:/i)).not.toBeInTheDocument();
    expect(screen.getByText(/small indoor jobs only\. no electrical, plumbing, gas, or waterproofing\./i)).toBeInTheDocument();

    fillStepOne({
      category: 'Hanging',
      jobType: 'Picture frames',
      description: 'Need two frames hung straight in the hallway.',
    });

    expect(screen.getByText(/photos \(optional\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/faster, more accurate quotes/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /mounting/i }));
    fireEvent.click(screen.getByLabelText(/tv mounting/i));

    expect(screen.getByText(/add a photo for faster, more accurate quotes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /make-good/i }));
    fireEvent.click(screen.getByLabelText(/apartment make-good/i));

    expect(screen.getByText(/please upload at least 1 photo so experts can quote this job/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('keeps the AI action tidy-only and shows phone-first account creation only on step 5', () => {
    renderForm();

    expect(screen.getByRole('button', { name: /tidy description/i })).toBeInTheDocument();
    expect(screen.queryByText(/draft from my title/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ask me follow-up questions/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/keeps your wording tidy without adding new details or changing the scope/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/I agree to Taskio/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/phone number/i)).not.toBeInTheDocument();

    fillStepOne({
      category: 'Hanging',
      jobType: 'Picture frames',
      description: 'Need two frames hung straight in the hallway.',
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.click(screen.getByLabelText(/under 1 hour/i));
    fireEvent.click(screen.getByLabelText(/flexible/i));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.click(screen.getByLabelText(/under \$150/i));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.change(screen.getByLabelText(/choose your suburb/i), { target: { value: 'Richmond|3121' } });
    fireEvent.click(screen.getByLabelText(/apartment \/ unit/i));
    fireEvent.click(screen.getByLabelText(/^yes$/i));
    fireEvent.click(screen.getByLabelText(/no stairs \(ground floor\)/i));
    fireEvent.click(screen.getByLabelText(/easy parking nearby/i));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText(/get quotes from local experts/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/first name \(optional\)/i)).toBeInTheDocument();
    expect(screen.getByText(/I agree to Taskio/i)).toBeInTheDocument();
    expect(screen.getByText(/terms & privacy \*/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue with google/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue with facebook/i })).not.toBeInTheDocument();
  });

  it('requires property type before Step 4 can continue', () => {
    renderForm();

    fillStepOne({
      category: 'Hanging',
      jobType: 'Picture frames',
      description: 'Need two frames hung straight in the hallway.',
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.click(screen.getByLabelText(/under 1 hour/i));
    fireEvent.click(screen.getByLabelText(/flexible/i));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.click(screen.getByLabelText(/under \$150/i));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.change(screen.getByLabelText(/choose your suburb/i), { target: { value: 'Richmond|3121' } });
    fireEvent.click(screen.getByLabelText(/^yes$/i));
    fireEvent.click(screen.getByLabelText(/no stairs \(ground floor\)/i));
    fireEvent.click(screen.getByLabelText(/easy parking nearby/i));

    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('supports multiple quantity items and a custom item in one primary category', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /mounting/i }));
    fireEvent.click(screen.getByLabelText(/tv mounting/i));
    fireEvent.click(screen.getByLabelText(/^shelves/i));
    fireEvent.change(screen.getByLabelText(/shelves quantity/i), { target: { value: '3' } });
    fireEvent.click(screen.getByLabelText(/something else within this category/i));
    fireEvent.change(screen.getByLabelText(/custom task item description/i), {
      target: { value: 'Small wall-mounted planters' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /^description \*/i }), {
      target: { value: 'Install all listed items on internal walls in the living room.' },
    });

    expect(screen.getByText(/3 x Shelves/)).toBeInTheDocument();
    expect(screen.getByText(/Small wall-mounted planters/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
  });

  it('blocks custom item text that is outside the Phase 1 scope before submission', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /assembly/i }));
    fireEvent.click(screen.getByLabelText(/something else within this category/i));
    fireEvent.change(screen.getByLabelText(/custom task item description/i), {
      target: { value: 'Electrical cabinet work' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /^description \*/i }), {
      target: { value: 'Please complete the listed work in the study.' },
    });

    expect(screen.getByText(/outside our current scope/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('requires a photo for a custom-only Apartment Make-Good brief', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /make-good/i }));
    fireEvent.click(screen.getByLabelText(/something else within this category/i));
    fireEvent.change(screen.getByLabelText(/custom task item description/i), {
      target: { value: 'Small cosmetic move-out fixes' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /^description \*/i }), {
      target: { value: 'Please complete the listed cosmetic fixes before handover.' },
    });

    expect(screen.getByText(/please upload at least 1 photo so experts can quote this job/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('applies mirror size and photo rules to custom mirror work', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /mounting/i }));
    fireEvent.click(screen.getByLabelText(/something else within this category/i));
    fireEvent.change(screen.getByLabelText(/custom task item description/i), {
      target: { value: 'Mount a mirror above the console' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /^description \*/i }), {
      target: { value: 'Install the listed item securely on an internal wall.' },
    });

    expect(screen.getByText(/mirror size \*/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/large or heavy mirror/i));
    expect(screen.getByText(/please upload at least 1 photo so experts can quote this job/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });
});
