// ST-56 · POST /functions/v1/change-password  { current, password } → session (ADR-0013).
// Signed-in; the handler also checks this phone is the account's active one (ST-06).
import { createHandler, stageError } from '../_shared/handler.ts';
import { readEnv, serviceClient, userDeps } from '../_shared/runtime.ts';
import { passwordGrant } from '../_shared/auth-grant.ts';
import { changePasswordSpec } from './change-password.ts';

const env = readEnv();
const admin = serviceClient(env);

Deno.serve(
  createHandler(
    changePasswordSpec({
      pepper: env.pepper,
      async passwordMatches(userId, derived) {
        const { data, error } = await admin.rpc('edge_password_matches', {
          p_user: userId,
          p_password: derived,
        });
        if (error) throw stageError('password_matches', error.code);
        return data === true;
      },
      async setAuthPassword(userId, password) {
        const { error } = await admin.auth.admin.updateUserById(userId, { password });
        if (!error) return 'ok';
        return error.code === 'weak_password' ? 'weak' : 'error';
      },
      async clearLoginLock(numberKey) {
        const { error } = await admin.rpc('login_result', {
          p_number_key: numberKey,
          p_success: true,
        });
        if (error) throw stageError('clear_login_lock', error.code);
      },
      passwordGrant: (phone, password) => passwordGrant(env, phone, password),
    }),
    userDeps(admin),
  ),
);
