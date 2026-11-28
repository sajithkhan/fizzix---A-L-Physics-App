// ST-54 · POST /functions/v1/login  { phone, password } → session (ADR-0009).
// Public (no JWT): config.toml sets verify_jwt = false for this function.
import { createPublicHandler } from '../_shared/handler.ts';
import { publicDeps, readEnv, serviceClient } from '../_shared/runtime.ts';
import { loginSpec } from './login.ts';
import { passwordGrant } from '../_shared/auth-grant.ts';

const env = readEnv();
const admin = serviceClient(env);

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
    passwordGrant: (phone, password) => passwordGrant(env, phone, password),
  }),
  publicDeps,
);

Deno.serve(handler);
