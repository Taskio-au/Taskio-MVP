export function getTimestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  return 0;
}

export function resolveThreadJobId(thread) {
  return String(thread?.jobId || thread?.id || '').trim();
}

export function normalizeChatThread(thread, fallbackId = '') {
  const jobId = resolveThreadJobId({ ...thread, id: fallbackId });
  if (!jobId) return null;

  return {
    id: String(fallbackId || thread?.id || jobId).trim(),
    ...thread,
    jobId,
    unreadCount: Math.max(Number(thread?.unreadCount || 0), 0),
    lastMessageText: String(thread?.lastMessageText || '').trim(),
    otherParticipantName: String(thread?.otherParticipantName || '').trim(),
    lastMessageAt: thread?.lastMessageAt || null,
    __lastMessageAtMs: getTimestampMillis(thread?.lastMessageAt),
  };
}

export function sortChatThreadsByLastMessageAt(items) {
  return [...items].sort((a, b) => {
    const diff = Number(b?.__lastMessageAtMs || 0) - Number(a?.__lastMessageAtMs || 0);
    if (diff !== 0) return diff;
    return String(a?.jobId || '').localeCompare(String(b?.jobId || ''));
  });
}

