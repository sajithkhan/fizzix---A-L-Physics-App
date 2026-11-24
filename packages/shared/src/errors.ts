/**
 * Error codes the backend may return. Clients map these to translated messages
 * (`errors.<code>` in the ta/si translation files). Never show raw server text to users.
 */
export const ERROR_CODES = [
  'not_authenticated',
  'invalid_input',
  'invalid_size',
  'invalid_option',
  'unknown_unit',
  'locale_not_available',
  'unknown_item',
  'already_answered',
  'daily_limit_reached',
  'rate_limited',
  'premium_required',
  'answer_key_missing',
  'internal',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** HTTP status each code maps to when returned by an Edge Function. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  not_authenticated: 401,
  invalid_input: 400,
  invalid_size: 400,
  invalid_option: 400,
  unknown_unit: 404,
  locale_not_available: 400,
  unknown_item: 404,
  already_answered: 409,
  daily_limit_reached: 402,
  rate_limited: 429,
  premium_required: 402,
  answer_key_missing: 500,
  internal: 500,
};

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

/**
 * Maps a Postgres/PostgREST error to a safe error code. SQL functions raise the code
 * itself as the message, so anything else (constraint text, stack traces) becomes `internal`.
 */
export function toErrorCode(error: { message?: unknown } | null | undefined): ErrorCode {
  const message = error?.message;
  return isErrorCode(message) ? message : 'internal';
}

export interface ApiError {
  error: { code: ErrorCode };
}
