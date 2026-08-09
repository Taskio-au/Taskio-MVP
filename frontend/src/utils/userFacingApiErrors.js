/**
 * Maps API/auth errors to safe user-facing copy. Internal role keys (homeowner, tradie)
 * stay unchanged in app logic; this module only provides display strings and safe error text.
 */

const GENERIC_POST_JOB_TITLE = "We couldn't post your task";
const GENERIC_POST_JOB_BODY = 'Something went wrong. Please try again in a moment.';

const PERMISSION_TITLE = "We couldn't continue your task post";

/** User-visible label for a stored role key (UI only; does not change API payloads). */
export function roleLabelForUi(role) {
    if (role === 'tradie') return 'Expert';
    if (role === 'homeowner') return 'Client';
    if (role === 'admin') return 'Admin';
    return '';
}

function collectRawMessages(err) {
    const parts = [];
    const data = err?.response?.data;
    if (typeof data?.message === 'string' && data.message.trim()) parts.push(data.message.trim());
    if (typeof data?.error === 'string' && data.error.trim()) parts.push(data.error.trim());
    if (typeof err?.message === 'string' && err.message.trim()) parts.push(err.message.trim());
    return parts.join(' ');
}

/** True if the string looks like something we should never echo to end users. */
export function looksLikeInternalApiLeak(raw) {
    if (!raw || typeof raw !== 'string') return false;
    const s = raw.toLowerCase();
    return (
        /\/api\//.test(raw) ||
        /\bhomeowner\b/.test(s) ||
        /\btradie\b/.test(s) ||
        /\brequires role\b/.test(s) ||
        /re-login|re-register|ensure your account/i.test(s) ||
        /invalid[_ ]?token|jwt|bearer/i.test(s) ||
        /<[^>]+>/.test(raw) ||
        /\bstack trace\b|\bat\s+[\w.]+\(/i.test(s)
    );
}

function isPermissionOrAccountContext(status, rawLower) {
    if (status === 401 || status === 403) return true;
    if (!rawLower) return false;
    return (
        /\brequires role\b/.test(rawLower) ||
        /\bwrong role\b/.test(rawLower) ||
        /\bpermission denied\b/.test(rawLower) ||
        /\bforbidden\b/.test(rawLower) ||
        /\bnot authorized\b/.test(rawLower) ||
        /\bunauthorized\b/.test(rawLower) ||
        /\bhomeowner\b/.test(rawLower) ||
        /\btradie\b/.test(rawLower)
    );
}

function wrongRoleHint(status, rawLower) {
    if (status === 403) return true;
    return (
        /\brequires role\b/.test(rawLower) ||
        /\bhomeowner\b/.test(rawLower) ||
        /\btradie\b/.test(rawLower)
    );
}

/**
 * Normalizes errors from the post-job flow (create job, activate quote access).
 * @returns {{ kind: 'blocked_permission'|'blocked_generic'|'inline', title?: string, body: string, liveRegion: string }}
 */
export function getPostJobFlowErrorPresentation(err) {
    const status = err?.response?.status;
    const raw = collectRawMessages(err);
    const rawLower = raw.toLowerCase();

    if (isPermissionOrAccountContext(status, rawLower)) {
        const body = wrongRoleHint(status, rawLower)
            ? "This account can't post tasks. Please sign in with a Client account."
            : 'Please sign in to a Client account to post a task.';
        const liveRegion = `${PERMISSION_TITLE}. ${body}`;
        return {
            kind: 'blocked_permission',
            title: PERMISSION_TITLE,
            body,
            liveRegion,
        };
    }

    if (!raw || looksLikeInternalApiLeak(raw)) {
        const liveRegion = `${GENERIC_POST_JOB_TITLE}. ${GENERIC_POST_JOB_BODY}`;
        return {
            kind: 'blocked_generic',
            title: GENERIC_POST_JOB_TITLE,
            body: GENERIC_POST_JOB_BODY,
            liveRegion,
        };
    }

    const safe =
        raw.length <= 320 && !/[<>]/.test(raw) && !looksLikeInternalApiLeak(raw)
            ? raw
            : GENERIC_POST_JOB_BODY;

    if (safe === GENERIC_POST_JOB_BODY && raw.length > 0) {
        const liveRegion = `${GENERIC_POST_JOB_TITLE}. ${GENERIC_POST_JOB_BODY}`;
        return {
            kind: 'blocked_generic',
            title: GENERIC_POST_JOB_TITLE,
            body: GENERIC_POST_JOB_BODY,
            liveRegion,
        };
    }

    return {
        kind: 'inline',
        body: safe,
        liveRegion: safe,
    };
}
