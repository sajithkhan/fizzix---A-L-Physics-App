// ST-54 · POST /functions/v1/login  { phone, password } → session (ADR-0009).
// Public (no JWT): config.toml sets verify_jwt = false for this function.
import { createPublicHandler } from '../_shared/handler.ts';
import { publicDeps, readEnv, serviceClient } from '../_shared/runtime.ts';
import { loginSpec, LoginOutput, type GrantResult } from './login.ts';

const env = readEnv();
const admin = serviceClient(env);

async function passwordGrant(phone: string, password: string): Promise<GrantResult> {
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

const handler = createPublicHandler(
  loginSpec({
    pepper: env.pepper,
    async guard(numberKey, ipKey) {
      const { data, error } = await admin.rpc('login_guard', {
        p_number_key: numberKey,
        p_ip_key: ipKey,
      });
      if (error || (data !== 'ok' && data !== 'locked' && data !== 'ip_limited')) {
        throw new Error('internal');
      }
      return data;
    },
    async result(numberKey, success) {
      const { data, error } = await admin.rpc('login_result', {
        p_number_key: numberKey,
        p_success: success,
      });
      if (error || (data !== 'ok' && data !== 'failed' && data !== 'locked')) {
        throw new Error('internal');
      }
      return data;
    },
    passwordGrant,
  }),
  publicDeps,
);

Deno.serve(handler);
