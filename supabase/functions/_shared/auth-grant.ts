/**
 * Supabase Auth password sign-in (`grant_type=password`) with an already derived password
 * (ADR-0009). Used by login (ST-54) and change-password (ST-56).
 */
import { LoginOutput, type GrantResult } from '../login/login.ts';
import type { Env } from './runtime.ts';

export async function passwordGrant(
  env: Env,
  phone: string,
  password: string,
): Promise<GrantResult> {
  try {
    const res = await fetch(`${env.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: env.anonKey, 'content-type': 'application/json' },
      // Auth stores phone numbers without the leading '+'.
      body: JSON.stringify({ phone: phone.replace(/^\+/, ''), password }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok) {
      const session = LoginOutput.safeParse({
        access_token: body?.access_token,
        refresh_token: body?.refresh_token,
        expires_in: body?.expires_in,
        expires_at: body?.expires_at,
      });
      return session.success ? { kind: 'ok', session: session.data } : { kind: 'error' };
    }
    if (res.status === 400 && body?.error_code === 'invalid_credentials')
      return { kind: 'invalid' };
    return { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}
