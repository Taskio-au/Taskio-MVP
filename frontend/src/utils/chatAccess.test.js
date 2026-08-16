import { POST_RELEASE_CHAT_WINDOW_MS, isChatReadOnly } from './chatAccess';

describe('post-release chat access', () => {
  const releasedAtMs = 1_000_000;

  it('keeps COMPLETED chat writable because payment is not released yet', () => {
    expect(isChatReadOnly({ status: 'COMPLETED', chatFrozen: false }, releasedAtMs)).toBe(false);
    expect(isChatReadOnly({ status: 'completed', chatFrozen: false }, releasedAtMs)).toBe(false);
  });

  it('keeps paid chat writable for 30 days then makes it read-only', () => {
    const job = { status: 'PAID', releasedAtMs };
    expect(isChatReadOnly(job, releasedAtMs + POST_RELEASE_CHAT_WINDOW_MS - 1)).toBe(false);
    expect(isChatReadOnly(job, releasedAtMs + POST_RELEASE_CHAT_WINDOW_MS)).toBe(true);
  });

  it('honours an audited reopen window and always honours a freeze', () => {
    const nowMs = releasedAtMs + POST_RELEASE_CHAT_WINDOW_MS + 1;
    expect(isChatReadOnly({
      status: 'PAID', releasedAtMs, chatReopenedUntilMs: nowMs + 60_000,
    }, nowMs)).toBe(false);
    expect(isChatReadOnly({
      status: 'PAID', releasedAtMs, chatReopenedUntilMs: nowMs + 60_000, chatFrozen: true,
    }, nowMs)).toBe(true);
  });
});
