import {
  collection,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';

const MAX_QUERY = 300;

/**
 * Marks all unread `message_received` notifications for a job as read.
 *
 * Cloud Functions create one notification per chat message (`message_${jobId}_${messageId}`).
 * Chat thread unread is cleared separately on `users/{uid}/chatThreads/{jobId}` — without
 * syncing here, the notification bell count stays stale until the user visits Notifications.
 */
export async function markMessageNotificationsReadForJob(db, userId, jobId) {
  if (!db || !userId || !jobId) {
    return { marked: 0 };
  }

  const jid = String(jobId).trim();
  if (!jid) return { marked: 0 };

  try {
    const q = query(
      collection(db, 'users', userId, 'notifications'),
      where('jobId', '==', jid),
      limit(MAX_QUERY)
    );
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    let marked = 0;

    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      if (data.type !== 'message_received') return;
      if (data.read === true) return;
      batch.update(docSnap.ref, {
        read: true,
        readAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      marked += 1;
    });

    if (marked > 0) {
      await batch.commit();
    }

    return { marked };
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[markMessageNotificationsReadForJob]', e);
    }
    return { marked: 0, error: e };
  }
}
