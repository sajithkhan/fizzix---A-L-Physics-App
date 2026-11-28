// ST-55 · POST /functions/v1/reset-password  { password } → { ok } (ADR-0011).
// Signed-in with the session the reset OTP just created.
import { createHandler } from '../_shared/handler.ts';
import { readEnv, serviceClient, userDeps } from '../_shared/runtime.ts';
import { resetPasswordSpec } from './reset-password.ts';

const env = readEnv();
const admin = serviceClient(env);

Deno.serve(
  createHandler(
    resetPasswordSpec({
      pepper: env.pepper,
      nowSeconds: () => Math.floor(Date.now() / 1000),
      async resetAllowed(userId) {
        const { data, error } = await admin.rpc('reset_allowed', { p_user: userId });
        if (error) throw new Error('internal');
        return data === true;
      },
      async setAuthPassword(userId, password) {
        const { error } = await admin.auth.admin.updateUserById(userId, { password });
        if (!error) return 'ok';
        return error.code === 'weak_password' ? 'weak' : 'error';
      },
      async resetFinished(userId) {
        const { error } = await admin.rpc('reset_finished', { p_user: userId });
        if (error) throw new Error('internal');
      },
      async clearLoginLock(numberKey) {
        const { error } = await admin.rpc('login_result', {
          p_number_key: numberKey,
          p_success: true,
        });
        if (error) throw new Error('internal');
      },
      async signOutEverywhere(accessToken) {
        // Supabase Auth keeps other sessions alive after a password change, so end them
        // here (AC3). Retry once; if it still fails, report an error rather than success.
        let { error } = await admin.auth.admin.signOut(accessToken, 'global');
        if (error) ({ error } = await admin.auth.admin.signOut(accessToken, 'global'));
        if (error) throw new Error('internal');
      },
    }),
    userDeps(admin),
  ),
);
