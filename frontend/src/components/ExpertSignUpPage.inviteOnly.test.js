import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('react-router-dom', () => ({
  __esModule: true,
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock('../api/createApiClient', () => ({
  createApiClient: () => ({ post: jest.fn() }),
}));

jest.mock('../firebase', () => ({
  auth: {},
  googleProvider: {},
}));

jest.mock('./profile/GoogleBrand', () => ({
  GoogleActionButton: ({ children, ...props }) => <button type="button" {...props}>{children}</button>,
}));

jest.mock('../design/components/BrandLogo', () => () => <div>BrandLogo</div>);

jest.mock('./tradie-signup/BenefitsCard', () => () => <div>BenefitsCard</div>);

jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: jest.fn(),
  sendEmailVerification: jest.fn(),
  signInWithPopup: jest.fn(),
  updateProfile: jest.fn(),
}));

const ExpertSignUpRoute = require('./ExpertSignUpRoute').default;

test('invite-only private launch hides the expert signup form', () => {
  render(<ExpertSignUpRoute />);

  expect(screen.getByRole('heading', { name: /expert signup is invite-only/i })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /become a taskio expert/i })).not.toBeInTheDocument();
});
