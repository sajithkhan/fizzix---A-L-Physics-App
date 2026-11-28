// ST-57 · POST /functions/v1/delete-account  { password } → { ok } (ADR-0014).
// Signed-in; the handler also checks this phone is the account's active one (ST-06).
import { createHandler, stageError } from '../_shared/handler.ts';
import { readEnv, serviceClient, userDeps } from '../_shared/runtime.ts';
import { deleteAccountSpec } from './delete-account.ts';

const env = readEnv();
const admin = serviceClient(env);

Deno.serve(
  createHandler(
    deleteAccountSpec({
      pepper: env.pepper,
      async passwordMatches(userId, derived) {
        const { data, error } = await admin.rpc('edge_password_matches', {
          p_user: userId,
          p_password: derived,
        });
        if (error) throw stageError('password_matches', error.code);
        return data === true;
      },
      async prepareDeletion(userId) {
        const { error } = await admin.rpc('prepare_account_deletion', { p_user: userId });
        if (error) throw stageError('prepare_deletion', error.code);
      },
      async deleteAuthUser(userId) {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) throw stageError('delete_user', error.code ?? String(error.status ?? ''));
      },
    }),
    userDeps(admin),
  ),
);
