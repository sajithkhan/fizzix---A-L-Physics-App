import { createContext, useContext } from 'react';
import type { Locale } from '@fizzix/shared';

export interface LocaleState {
  /** Language saved on this device, or null on first launch. */
  saved: Locale | null;
  setSaved(locale: Locale): void;
}

export const LocaleContext = createContext<LocaleState | null>(null);

export function useLocaleState(): LocaleState {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocaleState must be used inside the root layout');
  return value;
}
