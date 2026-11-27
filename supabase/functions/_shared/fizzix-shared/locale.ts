/** Supported content and UI languages. The `locales` table is the source of truth at runtime. */
export const LOCALES = ['ta', 'si'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ta';

/** The business day (daily limits, targets, leagues) runs on Sri Lanka time. */
export const BUSINESS_TIME_ZONE = 'Asia/Colombo';

/** Returns the business date (YYYY-MM-DD) for an instant, in Asia/Colombo. */
export function businessDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/**
 * Masks a phone number for logs and support screens: keeps the country code and last
 * two digits only. Full numbers must never be logged.
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.length < 6) return '***';
  const cc = digits.startsWith('+') ? digits.slice(0, 3) : '';
  return `${cc}*******${digits.slice(-2)}`;
}
