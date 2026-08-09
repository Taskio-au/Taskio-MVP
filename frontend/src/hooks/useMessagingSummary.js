import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, query } from 'firebase/firestore';
import { db } from '../firebase';
import { normalizeChatThread, sortChatThreadsByLastMessageAt } from '../utils/chatThreads';

/** Calm copy for Firestore listener failures (inbox / thread list). */
function chatThreadsErrorMessage(err) {
  const code = String(err?.code || '');
  if (code === 'permission-denied') {
    return 'We couldn’t load your conversations. Check that you’re signed in, or try again in a moment.';
  }
  if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'resource-exhausted') {
    return 'We couldn’t reach Taskio. Check your connection and try again.';
  }
  return 'We couldn’t load your messages. Please try again.';
}

export function useChatThreads(user, maxItems = 100) {
  const [threads, setThreads] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  const retry = useCallback(() => {
    setRetryKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setThreads([]);
      setLoadError(null);
      return undefined;
    }

    setLoadError(null);

    const q = query(
      collection(db, 'users', user.uid, 'chatThreads'),
      limit(maxItems)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs
          .map((docSnap) => normalizeChatThread(docSnap.data() || {}, docSnap.id))
          .filter(Boolean);
        setThreads(sortChatThreadsByLastMessageAt(next));
        setLoadError(null);
      },
      (error) => {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn('[useChatThreads] Listener error:', error);
        }
        setThreads([]);
        setLoadError(chatThreadsErrorMessage(error));
      }
    );

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [maxItems, user?.uid, retryKey]);

  const unreadCount = useMemo(
    () => threads.reduce((sum, thread) => sum + Math.max(Number(thread?.unreadCount || 0), 0), 0),
    [threads]
  );

  const unreadByJobId = useMemo(
    () =>
      threads.reduce((acc, thread) => {
        const jobId = String(thread?.jobId || thread?.id || '').trim();
        if (!jobId) return acc;
        acc[jobId] = Math.max(Number(thread?.unreadCount || 0), 0);
        return acc;
      }, {}),
    [threads]
  );

  return { threads, unreadCount, unreadByJobId, loadError, retry };
}

/**
 * Live count of notification documents with read !== true under users/{uid}/notifications.
 * Chat uses `message_received` rows here plus chatThreads unread; opening a thread should
 * mark matching message notifications read via `markMessageNotificationsReadForJob` so this
 * stays aligned with the Messages workspace.
 */
export function useNotificationUnreadCount(user, maxItems = 100) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user?.uid) {
      setUnreadCount(0);
      return undefined;
    }

    const q = query(
      collection(db, 'users', user.uid, 'notifications'),
      limit(maxItems)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.reduce((sum, docSnap) => {
          const data = docSnap.data() || {};
          return sum + (data.read === true ? 0 : 1);
        }, 0);
        setUnreadCount(next);
      },
      (error) => {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[useNotificationUnreadCount] Falling back to 0 unread.', error);
        }
        setUnreadCount(0);
      }
    );

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [maxItems, user?.uid]);

  return unreadCount;
}

