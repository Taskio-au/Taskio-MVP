import React from 'react';
import { act, render } from '@testing-library/react';
import RouteMetadata from './RouteMetadata';

let mockPathname = '/';
jest.mock('react-router-dom', () => ({
  __esModule: true,
  useLocation: () => ({ pathname: mockPathname }),
}), { virtual: true });

test('sets route-specific canonical and Open Graph metadata', () => {
  jest.useFakeTimers();
  mockPathname = '/post-job';
  render(<><RouteMetadata /><main>Form</main></>);
  act(() => jest.runOnlyPendingTimers());
  expect(document.title).toBe('Post a Task | Taskio');
  expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', 'https://taskio.com.au/post-job');
  expect(document.querySelector('meta[property="og:title"]')).toHaveAttribute('content', 'Post a Task | Taskio');
  expect(document.querySelector('main')).toHaveAttribute('id', 'main-content');
  jest.useRealTimers();
});

test('marks account routes noindex', () => {
  mockPathname = '/dashboard';
  render(<RouteMetadata />);
  expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
});
