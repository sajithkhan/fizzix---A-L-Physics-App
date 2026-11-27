import { z } from 'zod';

/**
 * ST-58 · privacy notice and age range. Mirrors `public.age_band`, `app_config.privacy_notice`
 * and `public.consent_status()` (supabase/migrations/20261128000001_consent.sql).
 */
export const AGE_BANDS = ['16_plus', 'under_16'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export function isAgeBand(value: unknown): value is AgeBand {
  return typeof value === 'string' && (AGE_BANDS as readonly string[]).includes(value);
}

/** Under 16 is a child under Sri Lanka's PDPA: a parent confirms before Premium or parent reports. */
export function needsParentConfirmation(band: AgeBand | null): boolean {
  return band === 'under_16';
}

export const PrivacyNotice = z.object({
  version: z.string().min(1).max(20),
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://'), 'https only'),
});
export type PrivacyNotice = z.infer<typeof PrivacyNotice>;

/** The `app_config.privacy_notice` value, or null if it is missing or not safe to open. */
export function parsePrivacyNotice(value: unknown): PrivacyNotice | null {
  const parsed = PrivacyNotice.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const ConsentStatus = z.object({
  current_version: z.string(),
  accepted: z.boolean(),
  age_band: z.enum(AGE_BANDS).nullable(),
  parent_confirmation_pending: z.boolean(),
});
export type ConsentStatus = z.infer<typeof ConsentStatus>;
