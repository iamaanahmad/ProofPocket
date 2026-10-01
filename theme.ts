/**
 * ProofPocket design tokens.
 *
 * Built following the three-tier approach from polished-ui-design:
 * primitives (raw palette + scales) -> semantic roles (what a value means)
 * -> component rules (how a specific element uses them). Screens should only
 * reference the semantic tier, so the whole app restyles from one place.
 *
 * Design intent: a serious money tool for gig workers in India.
 * One dominant colour (deep pine teal, trust and cash), exactly one accent
 * (brick red) reserved for missing pay, and a quiet warm-neutral scale.
 * No gradients, no glow, no decorative colour. Shapes, type and elevation
 * follow Material You so the app feels native on Android.
 */

// ---------- Tier 1: primitives ----------

export const pine = {
  50: '#EDF5F1',
  100: '#D9EBE2',
  200: '#B4D8C8',
  300: '#85BFA9',
  500: '#2E8C74',
  600: '#0E7563',
  700: '#0A5F52',
  800: '#0C463F',
  900: '#0A332E',
  950: '#062420',
} as const;

export const ink = {
  900: '#14201C',
  700: '#33443E',
  500: '#5A6B64',
  400: '#84938C',
  300: '#B9C4BE',
  200: '#DDE4E0',
  100: '#EDF1EE',
  50: '#F6F8F6',
} as const;

export const brick = {
  600: '#B3261E',
  700: '#8C1D18',
  100: '#F9E4E1',
  50: '#FDF0EE',
} as const;

export const spacing = [0, 4, 8, 12, 16, 24, 32, 48] as const;

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

// ---------- Tier 2: semantic roles ----------

export const color = {
  primary: pine[600],
  onPrimary: '#FFFFFF',
  primaryPressed: pine[700],
  primaryContainer: pine[100],
  onPrimaryContainer: pine[900],
  surfaceDark: pine[950],
  onSurfaceDark: '#FFFFFF',
  onSurfaceDarkMuted: pine[200],

  background: ink[50],
  surface: '#FFFFFF',
  surfaceVariant: ink[100],
  onSurface: ink[900],
  onSurfaceVariant: ink[500],
  onSurfaceFaint: ink[400],
  outline: ink[200],
  outlineStrong: ink[300],

  error: brick[600],
  onError: '#FFFFFF',
  errorContainer: brick[50],
  onErrorContainer: brick[700],
  errorOnDark: '#FFB4A6',

  scrim: 'rgba(6, 36, 32, 0.45)',
} as const;

// ---------- Typography (system font: Roboto on Android, native feel) ----------

export const type = {
  display: { fontSize: 44, lineHeight: 48, fontWeight: '800' as const, letterSpacing: -0.5 },
  timer: { fontSize: 56, lineHeight: 60, fontWeight: '800' as const, letterSpacing: 0.5 },
  headline: { fontSize: 26, lineHeight: 32, fontWeight: '800' as const, letterSpacing: -0.3 },
  title: { fontSize: 19, lineHeight: 25, fontWeight: '700' as const },
  titleSm: { fontSize: 16, lineHeight: 22, fontWeight: '700' as const },
  body: { fontSize: 15, lineHeight: 23, fontWeight: '400' as const },
  bodySm: { fontSize: 13.5, lineHeight: 20, fontWeight: '400' as const },
  label: { fontSize: 12.5, lineHeight: 17, fontWeight: '600' as const },
  overline: { fontSize: 11, lineHeight: 15, fontWeight: '700' as const, letterSpacing: 1.4 },
  button: { fontSize: 15.5, lineHeight: 21, fontWeight: '700' as const },
  tabular: { fontVariant: ['tabular-nums'] as Array<'tabular-nums'> },
} as const;

// ---------- Elevation (Android-style soft shadows) ----------

export const elevation = {
  0: {},
  1: {
    shadowColor: '#0A332E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  2: {
    shadowColor: '#0A332E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  3: {
    shadowColor: '#0A332E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;
