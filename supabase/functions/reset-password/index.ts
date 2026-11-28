// ST-55 · POST /functions/v1/reset-password  { password } → { ok } (ADR-0011).
// Signed-in with the session the reset OTP just created.
import { createHandler, stageError } from '../_shared/handler.ts';
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
        if (error) throw stageError('reset_allowed', error.code);
        return data === true;
      },
      async setAuthPassword(userId, password) {
        const { error } = await admin.auth.admin.updateUserById(userId, { password });
        if (!error) return 'ok';
        return error.code === 'weak_password' ? 'weak' : 'error';
      },
      async resetFinished(userId) {
        const { error } = await admin.rpc('reset_finished', { p_user: userId });
        if (error) throw stageError('reset_finished', error.code);
      },
      async clearLoginLock(numberKey) {
        const { error } = await admin.rpc('login_result', {
          p_number_key: numberKey,
          p_success: true,
        });
        if (error) throw stageError('clear_login_lock', error.code);
      },
      async signOutEverywhere(accessToken) {
        // End every session (AC3). Auth may already have ended them when the password
        // changed, and then answers the sign-out with an error. So on an error, check: if
        // this session no longer works, sign-out is done; if it still works, fail.
        const { error } = await admin.auth.admin.signOut(accessToken, 'global');
        if (!error) return;
        const { data, error: check } = await admin.auth.getUser(accessToken);
        if (check || !data.user) return;
        throw stageError('sign_out', error.code ?? String(error.status ?? ''));
      },
    }),
    userDeps(admin),
  ),
);
