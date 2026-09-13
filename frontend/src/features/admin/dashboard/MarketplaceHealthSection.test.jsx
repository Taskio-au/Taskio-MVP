import React from 'react';
import { render, screen } from '@testing-library/react';
import MarketplaceHealthSection from './MarketplaceHealthSection';

const nowMs = Date.UTC(2026, 8, 13, 18, 0, 0);

function snapshot(overrides = {}) {
  return {
    range: '7d',
    rangeLabel: '7 days',
    scanComplete: true,
    truncated: false,
    quoteHealth: {
      quoteReadyJobs: 20,
      oneQuoteJobs: 18,
      twoQuoteJobs: 15,
      zeroQuoteJobs: 2,
      oneQuoteRate: 0.9,
      twoQuoteRate: 0.75,
      zeroQuoteRate: 0.1,
      medianFirstResponseMinutes: 34,
      within60MinutesJobs: 16,
      within60MinutesRate: 16 / 18,
      timingSampleCount: 18,
      oneQuoteTone: 'ON TARGET',
      zeroQuoteTone: 'ON TARGET',
      within60Tone: 'ON TARGET',
    },
    funnel: {
      stages: [
        { key: 'quoteReady', label: 'Quote-ready', count: 20, fromQuoteReady: { numerator: 20, denominator: 20, rate: 1 }, fromPrevious: { numerator: 20, denominator: 20, rate: 1 } },
        { key: 'oneQuote', label: '≥1 quote', count: 18, fromQuoteReady: { numerator: 18, denominator: 20, rate: 0.9 }, fromPrevious: { numerator: 18, denominator: 20, rate: 0.9 } },
        { key: 'released', label: 'Released', count: 9, fromQuoteReady: { numerator: 9, denominator: 20, rate: 0.45 }, fromPrevious: { numerator: 9, denominator: 10, rate: 0.9 } },
      ],
    },
    experts: [
      {
        uid: 'expert-a',
        displayName: 'Alex Expert',
        launchReady: true,
        invitations: 4,
        quotedJobs: 1,
        responseRate: 0.25,
        responseNumerator: 1,
        responseDenominator: 4,
        responseTimeAvailable: false,
        responseTimeMinutes: null,
        awarded: 0,
        completed: 0,
        lastActivityAtMs: nowMs - (3 * 60 * 60 * 1000),
      },
    ],
    ...overrides,
  };
}

describe('MarketplaceHealthSection', () => {
  it('shows METRICS DATA UNAVAILABLE on API error without fake zeros', () => {
    render(<MarketplaceHealthSection loadState="error" snapshot={null} />);
    expect(screen.getByText('METRICS DATA UNAVAILABLE')).toBeInTheDocument();
    expect(screen.queryByText('0 / 0')).not.toBeInTheDocument();
    expect(screen.queryByText('Quote coverage')).not.toBeInTheDocument();
  });

  it('shows METRICS DATA INCOMPLETE when the scan is truncated', () => {
    render(<MarketplaceHealthSection loadState="ok" snapshot={snapshot({ scanComplete: false, truncated: true })} />);
    expect(screen.getByText('METRICS DATA INCOMPLETE')).toBeInTheDocument();
  });

  it('renders counts, percentages, first-response, and funnel text', () => {
    render(<MarketplaceHealthSection loadState="ok" snapshot={snapshot()} nowMs={nowMs} />);
    expect(screen.getByText('18 / 20')).toBeInTheDocument();
    expect(screen.getByText('90% of quote-ready jobs received ≥1 quote')).toBeInTheDocument();
    expect(screen.getByText('15 / 20')).toBeInTheDocument();
    expect(screen.getByText('2 / 20')).toBeInTheDocument();
    expect(screen.getByText('median 34m')).toBeInTheDocument();
    expect(screen.getByText('16 / 18')).toBeInTheDocument();
    expect(screen.getByText('Quote-ready')).toBeInTheDocument();
    expect(screen.getByText('≥1 quote')).toBeInTheDocument();
    expect(screen.getByText('Released')).toBeInTheDocument();
    expect(screen.getByText(/Recent jobs may still be in progress/)).toBeInTheDocument();
    expect(screen.getByText(/Released means Taskio payment release/)).toBeInTheDocument();
  });

  it('renders Expert rows and does not invent a response-time metric', () => {
    render(<MarketplaceHealthSection loadState="ok" snapshot={snapshot()} nowMs={nowMs} />);
    expect(screen.getByText('Alex Expert')).toBeInTheDocument();
    expect(screen.getByText('1 / 4 · 25%')).toBeInTheDocument();
    expect(screen.getByText('Invitation timestamp unavailable')).toBeInTheDocument();
    expect(screen.queryByText('median 0m')).not.toBeInTheDocument();
  });

  it('keeps sample-size counts visible for 1 / 1', () => {
    render(
      <MarketplaceHealthSection
        loadState="ok"
        snapshot={snapshot({
          quoteHealth: {
            quoteReadyJobs: 1,
            oneQuoteJobs: 1,
            twoQuoteJobs: 1,
            zeroQuoteJobs: 0,
            oneQuoteRate: 1,
            twoQuoteRate: 1,
            zeroQuoteRate: 0,
            medianFirstResponseMinutes: 12,
            within60MinutesJobs: 1,
            within60MinutesRate: 1,
            timingSampleCount: 1,
          },
          funnel: {
            stages: [
              { key: 'quoteReady', label: 'Quote-ready', count: 1, fromQuoteReady: { numerator: 1, denominator: 1, rate: 1 }, fromPrevious: { numerator: 1, denominator: 1, rate: 1 } },
            ],
          },
          experts: [],
        })}
      />
    );
    expect(screen.getAllByText('1 / 1').length).toBeGreaterThan(0);
    expect(screen.getByText('100% of quote-ready jobs received ≥1 quote')).toBeInTheDocument();
  });
});
