import { useColorScheme } from 'react-native';
import { palettes, type Palette } from './tokens';

/**
 * Follows the phone's light/dark setting. The in-app switch (light / dark / follow phone)
 * arrives with its own story and will feed this hook.
 */
export function useTheme(): { scheme: 'light' | 'dark'; colors: Palette } {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { scheme, colors: palettes[scheme] };
}

export { palettes, radius, space } from './tokens';
export type { Palette } from './tokens';
