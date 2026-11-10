import { useColorScheme } from 'react-native';

/**
 * ParkPay design tokens. Forest green brand on a tinted "bone" neutral, one accent only.
 * Radius scale: field 12, button 14, card 18, sheet 28. Spacing on a 4 px grid.
 */
export const palette = {
  light: {
    bg: '#F2F4F1',
    card: '#FFFFFF',
    text: '#0D1B14',
    muted: '#5B6A62',
    border: '#E1E6E2',
    brand: '#0A7F52',
    brandText: '#FFFFFF',
    brandSoft: '#E1F3EA',
    danger: '#C23A3A',
    dangerSoft: '#FBE9E9',
    warn: '#9A5B00',
    warnSoft: '#FFF1D9',
    info: '#1F5FBF',
    infoSoft: '#E6EFFC',
    inputBg: '#FFFFFF',
    hero: '#0D1B14',
    heroText: '#F2F7F4',
    heroMuted: '#9DB3A8',
    skeleton: '#E3E8E4',
    shadow: '#0D1B14',
  },
  dark: {
    bg: '#0A0F0C',
    card: '#131A16',
    text: '#EAF1ED',
    muted: '#93A29A',
    border: '#24302A',
    brand: '#2BBF85',
    brandText: '#04130C',
    brandSoft: '#12261D',
    danger: '#F27373',
    dangerSoft: '#2C1616',
    warn: '#F0B44C',
    warnSoft: '#2B2210',
    info: '#7AA8F0',
    infoSoft: '#142033',
    inputBg: '#0E1411',
    hero: '#16251D',
    heroText: '#F2F7F4',
    heroMuted: '#9DB3A8',
    skeleton: '#1C2621',
    shadow: '#000000',
  },
};

export type Theme = typeof palette.light;

export function useTheme(): Theme & { dark: boolean } {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  return { ...(dark ? palette.dark : palette.light), dark };
}

export const radius = { field: 12, button: 14, card: 18, sheet: 28, pill: 99, sm: 10, md: 14, lg: 18 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const type = {
  display: { fontSize: 44, fontWeight: '800' as const, letterSpacing: -1.2 },
  title: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.6 },
  heading: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.3 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 21 },
  small: { fontSize: 13, fontWeight: '500' as const, lineHeight: 18 },
  micro: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.2 },
};
