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

/** Sri Lanka has no daylight saving: always UTC+05:30. */
const COLOMBO_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * When the next business day starts (midnight in Asia/Colombo). Daily limits and targets
 * reset then; the server uses the same rule (private.colombo_day_start).
 */
export function nextBusinessDayStart(at: Date = new Date()): Date {
  const local = at.getTime() + COLOMBO_OFFSET_MS;
  const day = 24 * 60 * 60 * 1000;
  const nextLocalMidnight = Math.floor(local / day) * day + day;
  return new Date(nextLocalMidnight - COLOMBO_OFFSET_MS);
}

/** Whole hours (rounded up, at least 1) until the daily reset, for "resets in N hours". */
export function hoursUntilReset(at: Date = new Date()): number {
  const ms = nextBusinessDayStart(at).getTime() - at.getTime();
  return Math.max(1, Math.ceil(ms / (60 * 60 * 1000)));
}
