import brand from '@/brand/brand.json';

/**
 * Colour tokens from the design canvas (Screen 0, light and dark). Brand colours come from
 * brand.json so a white-label build only swaps that file.
 */
export interface Palette {
  background: string;
  surface: string;
  surfaceBorder: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  accent: string;
  option: string;
  optionBorder: string;
  optionSelected: string;
  optionSelectedBorder: string;
  glyph: string;
  glyphText: string;
  radioOff: string;
  disabledBorder: string;
  disabledText: string;
  disabledGlyph: string;
  label: string;
  fieldLabel: string;
  inputBorder: string;
  inputBg: string;
  prefixBg: string;
  otpFilled: string;
  danger: string;
  dangerBg: string;
  success: string;
  /** Notices that need attention but are not errors (e.g. under-16 parent note). */
  warning: string;
}

export const palettes: { light: Palette; dark: Palette } = {
  light: {
    background: '#F5F7FB',
    surface: '#FFFFFF',
    surfaceBorder: '#E2E8F0',
    text: '#0F172A',
    textMuted: '#475569',
    primary: brand.colors.primary,
    onPrimary: '#FFFFFF',
    accent: brand.colors.primary,
    option: '#FFFFFF',
    optionBorder: '#CBD5E1',
    optionSelected: '#EEF2FF',
    optionSelectedBorder: brand.colors.primary,
    glyph: '#EEF2FF',
    glyphText: brand.colors.primary,
    radioOff: '#94A3B8',
    disabledBorder: '#CBD5E1',
    disabledText: '#64748B',
    disabledGlyph: '#F1F5F9',
    label: brand.colors.primary,
    fieldLabel: '#334155',
    inputBorder: '#CBD5E1',
    inputBg: '#FFFFFF',
    prefixBg: '#F8FAFC',
    otpFilled: '#94A3B8',
    danger: '#B91C1C',
    dangerBg: '#FEF2F2',
    success: '#15803D',
    warning: '#9A3412',
  },
  dark: {
    background: '#0B1220',
    surface: '#111A2E',
    surfaceBorder: '#24304A',
    text: '#E5E7EB',
    textMuted: '#94A3B8',
    primary: brand.colors.primaryDark,
    onPrimary: '#FFFFFF',
    accent: brand.colors.accentDark,
    option: '#111A2E',
    optionBorder: '#334155',
    optionSelected: '#1E2A4A',
    optionSelectedBorder: brand.colors.accentDark,
    glyph: '#1E2A4A',
    glyphText: '#93C5FD',
    radioOff: '#94A3B8',
    disabledBorder: '#334155',
    disabledText: '#94A3B8',
    disabledGlyph: '#1B2540',
    label: '#93C5FD',
    fieldLabel: '#CBD5E1',
    inputBorder: '#334155',
    inputBg: '#111A2E',
    prefixBg: '#162036',
    otpFilled: '#94A3B8',
    danger: '#F87171',
    dangerBg: '#2A1215',
    success: '#4ADE80',
    warning: '#FDBA74',
  },
};

export const radius = { xs: 10, sm: 12, md: 14, lg: 16, xl: 18, card: 20, pill: 99 } as const;
export const space = { xs: 6, sm: 10, md: 12, lg: 16, xl: 24 } as const;
