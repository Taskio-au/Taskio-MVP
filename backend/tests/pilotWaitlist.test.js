'use strict';

const {
  CONSENT_VERSION,
  normalizeWaitlistEmail,
  normalizeWaitlistSource,
  normalizeWaitlistSuburb,
  waitlistDocId,
} = require('../src/services/pilotWaitlistService');

describe('pilot waitlist helpers', () => {
  it('normalizes email, suburb, and source', () => {
    expect(normalizeWaitlistEmail('  Home@Example.com ')).toBe('home@example.com');
    expect(normalizeWaitlistEmail('not-an-email')).toBe('');
    expect(normalizeWaitlistSuburb(`  South   Yarra  ${'x'.repeat(200)}`).length).toBe(80);
    expect(normalizeWaitlistSource('dashboard')).toBe('dashboard');
    expect(normalizeWaitlistSource('admin')).toBe('waitlist');
  });

  it('uses a deterministic document id for the same normalized email', () => {
    expect(waitlistDocId('home@example.com')).toBe(waitlistDocId('home@example.com'));
    expect(waitlistDocId('home@example.com')).not.toBe(waitlistDocId('other@example.com'));
    expect(CONSENT_VERSION).toBe('pilot-waitlist-contact-v1');
  });
});
