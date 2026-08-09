export const colors = {
  primary: '#14C5C5',
  primaryHover: '#0EA5A5',
  accent: '#FF9100',
  accentHover: '#EA7A00',
  text: '#111827',
  textMuted: '#4B5563',
  textSubtle: '#6B7280',
  border: '#D1D5DB',
  borderStrong: '#9CA3AF',
  surface: '#FFFFFF',
  surfaceMuted: '#F9FAFB',
  page: '#F7F9FA',
  success: '#198754',
  successSoft: '#ECFDF5',
  warning: '#B45309',
  warningSoft: '#FFF7ED',
  danger: '#DC3545',
  dangerSoft: '#FEF2F2',
  info: '#2563EB',
  infoSoft: '#EFF6FF',
  overlay: 'rgba(15, 23, 42, 0.52)',
  shadowTint: 'rgba(15, 23, 42, 0.12)',
};

export const radii = {
  sm: 8,
  md: 10,
  lg: 14,
  xl: 18,
  pill: 999,
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
};

export const shadows = {
  sm: '0 1px 2px rgba(15, 23, 42, 0.06)',
  md: '0 10px 24px rgba(15, 23, 42, 0.10)',
  lg: '0 18px 42px rgba(15, 23, 42, 0.16)',
  modal: '0 18px 42px rgba(15, 23, 42, 0.22)',
};

export const typography = {
  fontFamilyBase: "'Inter', sans-serif",
  fontFamilyHeading: "'Poppins', sans-serif",
  sizeXs: 12,
  sizeSm: 14,
  sizeMd: 16,
  sizeLg: 18,
  sizeXl: 24,
  size2xl: 32,
  sizeHero: 56,
  weightMedium: 500,
  weightSemibold: 600,
  weightBold: 700,
  weightBlack: 900,
};

export const controls = {
  heightSm: 36,
  heightMd: 42,
  heightLg: 48,
};

export const transitions = {
  default: '180ms ease',
};

export const statusTones = {
  open: { background: colors.infoSoft, border: '#BFDBFE', text: '#1D4ED8' },
  assigned: { background: colors.successSoft, border: '#A7F3D0', text: '#065F46' },
  awaiting_funding: { background: '#FFF3E0', border: '#FBD38D', text: '#B45309' },
  in_progress: { background: colors.infoSoft, border: '#93C5FD', text: '#1D4ED8' },
  awaiting_approval: { background: colors.warningSoft, border: '#FED7AA', text: '#9A3412' },
  completed: { background: colors.successSoft, border: '#A7F3D0', text: '#047857' },
  disputed: { background: '#FFF1F2', border: '#FECDD3', text: '#9F1239' },
  cancelled: { background: colors.dangerSoft, border: '#FECACA', text: '#B91C1C' },
  default: { background: colors.surfaceMuted, border: '#E5E7EB', text: colors.textSubtle },
};
