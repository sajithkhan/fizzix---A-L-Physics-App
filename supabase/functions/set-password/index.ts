// ST-04 · POST /functions/v1/set-password  { password } → session (ADR-0009).
// Signed-in (OTP session from ST-02); the gateway and the handler both verify the token.
import { createHandler } from '../_shared/handler.ts';
import { readEnv, serviceClient, userDeps } from '../_shared/runtime.ts';
import { passwordGrant } from '../_shared/auth-grant.ts';
import { setPasswordSpec } from './set-password.ts';

const env = readEnv();
const admin = serviceClient(env);

const handler = createHandler(
  setPasswordSpec({
    pepper: env.pepper,
    async accountCompleted(userId) {
      const { data, error } = await admin.rpc('edge_account_completed', { p_user: userId });
      if (error) throw new Error('internal');
      return data === true;
    },
    async setAuthPassword(userId, password) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (!error) return 'ok';
      return error.code === 'weak_password' ? 'weak' : 'error';
    },
    passwordGrant: (phone, password) => passwordGrant(env, phone, password),
  }),
  userDeps(admin),
);

Deno.serve(handler);
