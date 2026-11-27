import { z } from 'zod';
import { LOCALES, type Locale } from '../locale.ts';

/** A row of the public `locales` table, as read by the app before sign-in. */
export const LocaleRow = z.object({
  code: z.string().regex(/^[a-z]{2}$/),
  native_name: z.string().min(1),
  is_enabled: z.boolean(),
  sort_order: z.number().int(),
});
export type LocaleRow = z.infer<typeof LocaleRow>;

export const LocaleList = z.array(LocaleRow);

/**
 * Used when the app is offline on first launch. Mirrors the seeded `locales` rows; the
 * database list replaces it as soon as it loads.
 */
export const FALLBACK_LOCALES: readonly LocaleRow[] = [
  { code: 'ta', native_name: 'தமிழ்', is_enabled: true, sort_order: 1 },
  { code: 'si', native_name: 'සිංහල', is_enabled: true, sort_order: 2 },
  { code: 'en', native_name: 'English', is_enabled: false, sort_order: 3 },
];

/** True if the app ships translations for this code. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Languages the student can pick right now: enabled on the server AND translated in the app.
 * Anything else is shown as "coming soon".
 */
export function selectableLocales(rows: readonly LocaleRow[]): Locale[] {
  return [...rows]
    .sort((a, b) => a.sort_order - b.sort_order)
    .filter((r) => r.is_enabled)
    .map((r) => r.code)
    .filter(isLocale);
}
