import { normalizeChatThread, resolveThreadJobId, sortChatThreadsByLastMessageAt } from './chatThreads';

describe('chatThreads helpers', () => {
  it('falls back to the document id when jobId is missing', () => {
    expect(resolveThreadJobId({ id: 'job-123' })).toBe('job-123');
    expect(normalizeChatThread({ unreadCount: 2 }, 'job-123')).toMatchObject({
      jobId: 'job-123',
      unreadCount: 2,
    });
  });

  it('drops malformed thread rows without any usable id', () => {
    expect(normalizeChatThread({ unreadCount: 1 }, '')).toBeNull();
  });

  it('sorts newest valid timestamps first and keeps missing timestamps last', () => {
    const sorted = sortChatThreadsByLastMessageAt([
      normalizeChatThread({ jobId: 'a', lastMessageAt: null }, 'a'),
      normalizeChatThread({ jobId: 'b', lastMessageAt: { seconds: 50 } }, 'b'),
      normalizeChatThread({ jobId: 'c', lastMessageAt: { seconds: 100 } }, 'c'),
    ].filter(Boolean));

    expect(sorted.map((item) => item.jobId)).toEqual(['c', 'b', 'a']);
  });
});

