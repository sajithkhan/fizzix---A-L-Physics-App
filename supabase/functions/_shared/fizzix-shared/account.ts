/**
 * Sign-up rules (ST-04). The server enforces the same rules (public.save_account_details and
 * Supabase Auth's password policy in supabase/config.toml); these copies give instant feedback.
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
export const NAME_MAX = 60;
export const SCHOOL_MAX = 120;
export const PASSWORD_MIN = 8;

export type PasswordIssue = 'too_short' | 'needs_letter' | 'needs_digit';

/** Returns the first rule the password breaks, or null if it is acceptable. */
export function passwordIssue(password: string): PasswordIssue | null {
  if (password.length < PASSWORD_MIN) return 'too_short';
  if (!/[A-Za-z]/.test(password)) return 'needs_letter';
  if (!/\d/.test(password)) return 'needs_digit';
  return null;
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= NAME_MAX;
}
