export const MARKETPLACE_RANGES = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'pilot', label: 'Pilot to date' },
];

export function formatFraction(numerator, denominator) {
  if (numerator == null || denominator == null) return '—';
  return `${numerator} / ${denominator}`;
}

export function formatPct(rate) {
  if (rate == null || !Number.isFinite(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}

export function formatMinutes(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  const value = Math.round(minutes);
  if (value < 60) return `${value}m`;
  const hours = Math.floor(value / 60);
  const rem = value % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

export function formatLastActive(ms, nowMs = Date.now()) {
  if (!ms) return '—';
  const delta = Math.max(0, nowMs - ms);
  const minutes = Math.round(delta / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function toneClass(tone) {
  if (tone === 'ON TARGET') return 'ok';
  if (tone === 'WATCH') return 'watch';
  if (tone === 'NEEDS ATTENTION') return 'alert';
  return 'muted';
}
