import { detectChatFlags, highestSeverity, severityScore } from './chatFlags';

describe('chatFlags messaging edge cases', () => {
  it('flags off-platform payment/contact keywords with appropriate types', () => {
    const flags = detectChatFlags('Let us do bank transfer via PayID and whatsapp me after.');
    const types = flags.map((f) => f.type);
    expect(types).toContain('off_platform_payment');
    expect(types).toContain('off_platform_contact');
  });

  it('flags email and phone in a message', () => {
    const flags = detectChatFlags('Email me at tradie@example.com or call +61 412 345 678.');
    const types = flags.map((f) => f.type);
    expect(types).toContain('email_address');
    expect(types).toContain('phone_number');
    expect(highestSeverity(flags)).toBe('HIGH');
  });

  it('does not flag short numeric strings as phone numbers', () => {
    const flags = detectChatFlags('My quote is 250 and timeline is 2 weeks.');
    const types = flags.map((f) => f.type);
    expect(types).not.toContain('phone_number');
  });

  it('de-duplicates repeated rule hits by type', () => {
    const flags = detectChatFlags('cash only please, pay cash today');
    const cashFlags = flags.filter((f) => f.type === 'cash_request');
    expect(cashFlags).toHaveLength(1);
  });

  it('returns LOW severity for empty/no flags and supports score helper', () => {
    expect(highestSeverity([])).toBe('LOW');
    expect(severityScore('LOW')).toBe(1);
    expect(severityScore('MED')).toBe(2);
    expect(severityScore('HIGH')).toBe(3);
    expect(severityScore('unknown')).toBe(0);
  });
});
