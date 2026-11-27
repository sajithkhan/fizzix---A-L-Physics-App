/**
 * Server-side password handling (ADR-0009).
 *
 * Supabase Auth never sees a student's real password. Edge Functions turn it into
 * `derivePassword(pepper, phone, password)` first, where the pepper is an Edge Function
 * secret. So someone who calls Supabase Auth directly (skipping our login lockout) cannot guess
 * passwords: they would have to guess a 256-bit HMAC.
 *
 * Phone numbers and IPs used as lockout keys are HMACs as well, so the database never holds
 * them in a form that can be reversed by trying every Sri Lankan number.
 */
import { passwordIssue, type PasswordIssue } from '@fizzix/shared';

const encoder = new TextEncoder();

/** The pepper must be long and random; refuse to run with a weak or missing one. */
export function requirePepper(value: string | undefined): string {
  if (!value || value.length < 32) throw new Error('PASSWORD_PEPPER missing or too short');
  return value;
}

async function hmac(pepper: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The password Supabase Auth stores for this student. `phone` is E.164 (+947…). The "Fz1-"
 * prefix keeps Auth's "letters and digits" rule satisfied and marks the scheme version.
 */
export async function derivePassword(
  pepper: string,
  phone: string,
  password: string,
): Promise<string> {
  return `Fz1-${base64url(await hmac(pepper, `fizzix-password:v1:${phone}:${password}`))}`;
}

/** 64-hex key for the lockout tables (`login_failures`, `login_ip_hits`). */
export async function lockoutKey(
  pepper: string,
  kind: 'number' | 'ip',
  value: string,
): Promise<string> {
  return hex(await hmac(pepper, `fizzix-lockout:${kind}:${value}`));
}

/** The sign-up password rules (8+ characters, letters and digits), checked on the server. */
export function serverPasswordIssue(password: string): PasswordIssue | null {
  return passwordIssue(password);
}
