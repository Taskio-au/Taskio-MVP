import React from 'react';
import { render, screen } from '@testing-library/react';
import AppErrorBoundary from './AppErrorBoundary';

jest.mock('../design/components/BrandLogo', () => function MockBrandLogo() {
  return <div>Taskio</div>;
});

function BrokenWidget() {
  throw new Error('boom');
}

describe('AppErrorBoundary', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('shows a branded fallback and recovery actions', () => {
    render(
      <AppErrorBoundary>
        <BrokenWidget />
      </AppErrorBoundary>
    );

    expect(screen.getByRole('heading', { name: /taskio hit an unexpected error/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload app/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go home/i })).toBeInTheDocument();
  });
});
