/**
 * Short relative / date strings for inbox and notification lists.
 * @param {import('firebase/firestore').Timestamp | { seconds?: number, _seconds?: number } | null | undefined} ts
 * @returns {string}
 */
export function formatRelativeTimeShort(ts) {
    if (!ts) return '—';
    const sec = typeof ts.seconds === 'number' ? ts.seconds : typeof ts._seconds === 'number' ? ts._seconds : null;
    if (sec == null) return '—';
    const ms = sec * 1000;
    const diff = Date.now() - ms;
    if (diff < 0) {
        return new Date(ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    }
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
