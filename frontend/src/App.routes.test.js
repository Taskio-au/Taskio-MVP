import React from 'react';
import { render, screen } from '@testing-library/react';

const mockRouter = { pathname: '/', search: '', hash: '', routes: [] };

jest.mock('react-router-dom', () => {
  const ReactActual = jest.requireActual('react');
  return {
    __esModule: true,
    BrowserRouter: ({ children }) => ReactActual.createElement(ReactActual.Fragment, null, children),
    Routes: ({ children }) => ReactActual.createElement(ReactActual.Fragment, null, children),
    Route: ({ path, element, children }) => {
      mockRouter.routes.push({ path, element });
      if (children) return ReactActual.createElement(ReactActual.Fragment, null, children);
      return path === mockRouter.pathname ? element : null;
    },
    Navigate: ({ to, replace }) => {
      const target = typeof to === 'string' ? to : `${to.pathname}${to.search || ''}${to.hash || ''}`;
      return ReactActual.createElement('div', null, `Redirect ${target}${replace ? ' (replace)' : ''}`);
    },
    useLocation: () => ({ pathname: mockRouter.pathname, search: mockRouter.search, hash: mockRouter.hash }),
  };
}, { virtual: true });

jest.mock('react-firebase-hooks/auth', () => ({
  __esModule: true,
  useAuthState: () => [null, false, null],
}), { virtual: true });

jest.mock('./firebase', () => ({ auth: {} }));
jest.mock('./e2e/authBypass', () => ({ getE2EAuthUser: () => null }));
jest.mock('./Login', () => () => <div>Login page</div>);
jest.mock('./components/LandingPage', () => () => <div>Landing page</div>);
jest.mock('./components/AdminRoute', () => ({ children }) => <>{children}</>);
jest.mock('./pages/AuthAction', () => () => null);
jest.mock('./pages/PrivacyPolicyPage', () => () => null);
jest.mock('./pages/TermsPage', () => () => null);
jest.mock('./pages/NotFoundPage', () => () => <div>Not found</div>);
jest.mock('./pages/GetStartedPage', () => () => null);
jest.mock('./components/RouteMetadata', () => () => null);
jest.mock('./components/ExpertSignUpRoute', () => () => <div>Expert signup form</div>);

const App = require('./App').default;

function renderAt(pathname, search = '') {
  mockRouter.pathname = pathname;
  mockRouter.search = search;
  mockRouter.routes = [];
  return render(<App />);
}

describe('Expert signup routes', () => {
  it('renders the Expert signup flow at the canonical /expert/signup path', async () => {
    renderAt('/expert/signup');
    expect(await screen.findByText('Expert signup form')).toBeInTheDocument();
  });

  it('redirects the legacy /tradie/signup path to /expert/signup and keeps the query string', async () => {
    renderAt('/tradie/signup', '?utm_source=recruit');
    expect(await screen.findByText('Redirect /expert/signup?utm_source=recruit (replace)')).toBeInTheDocument();
    expect(screen.queryByText('Expert signup form')).not.toBeInTheDocument();
  });

  it('mounts the signup implementation from exactly one route', async () => {
    renderAt('/expert/signup');
    await screen.findByText('Expert signup form');
    const signupPaths = mockRouter.routes.filter((route) => route.path === '/expert/signup');
    const legacyRoutes = mockRouter.routes.filter((route) => route.path === '/tradie/signup');
    expect(signupPaths).toHaveLength(1);
    expect(legacyRoutes).toHaveLength(1);
    expect(signupPaths[0].element.type).not.toBe(legacyRoutes[0].element.type);
  });
});
