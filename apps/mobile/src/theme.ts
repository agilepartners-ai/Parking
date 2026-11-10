import { useColorScheme } from 'react-native';

export const palette = {
  light: {
    bg: '#F4F6F5',
    card: '#FFFFFF',
    text: '#0E1A15',
    muted: '#5E6B65',
    border: '#E1E6E3',
    brand: '#0B8F5A',
    brandText: '#FFFFFF',
    brandSoft: '#E3F5EC',
    danger: '#C93B3B',
    dangerSoft: '#FBE9E9',
    warn: '#B26A00',
    warnSoft: '#FFF2DC',
    info: '#1F5FBF',
    infoSoft: '#E6EFFC',
    inputBg: '#FFFFFF',
  },
  dark: {
    bg: '#0B0F0D',
    card: '#151B18',
    text: '#EAF1ED',
    muted: '#93A29A',
    border: '#26302B',
    brand: '#2BBF85',
    brandText: '#04130C',
    brandSoft: '#12261D',
    danger: '#F27373',
    dangerSoft: '#2C1616',
    warn: '#F0B44C',
    warnSoft: '#2B2210',
    info: '#7AA8F0',
    infoSoft: '#142033',
    inputBg: '#0F1512',
  },
};

export type Theme = typeof palette.light;

export function useTheme(): Theme & { dark: boolean } {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  return { ...(dark ? palette.dark : palette.light), dark };
}

export const radius = { sm: 10, md: 14, lg: 20 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
