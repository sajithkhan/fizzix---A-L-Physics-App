/**
 * ST-57 · delete my account, confirmed with my password (ADR-0014).
 *
 *   verify token (active session) → rate limit (5 tries / 15 min) → password matches
 *   (checked without signing in) → prepare_account_deletion (keep payment records without
 *   the student, audit) → delete the Auth user (profile and study data cascade)
 */
import { z } from 'zod';
import { AppError, type FunctionSpec } from '../_shared/handler.ts';
import { derivePassword } from '../_shared/password.ts';

export const DeleteAccountInput = z.object({ password: z.string().min(1).max(128) }).strict();
export const DeleteAccountOutput = z.object({ ok: z.literal(true) }).strict();

export interface DeleteAccountDeps {
  pepper: string;
  passwordMatches(userId: string, derived: string): Promise<boolean>;
  prepareDeletion(userId: string): Promise<void>;
  deleteAuthUser(userId: string): Promise<void>;
}

export function deleteAccountSpec(
  deps: DeleteAccountDeps,
): FunctionSpec<typeof DeleteAccountInput, typeof DeleteAccountOutput> {
  return {
    name: 'delete-account',
    input: DeleteAccountInput,
    output: DeleteAccountOutput,
    rateLimit: { max: 5, windowSeconds: 900 },
    async work(ctx, input) {
      const phone = ctx.user.phone;
      if (!phone) throw new AppError('not_authenticated');
      const derived = await derivePassword(deps.pepper, phone, input.password);
      if (!(await deps.passwordMatches(ctx.user.id, derived))) {
        throw new AppError('invalid_credentials');
      }
      await deps.prepareDeletion(ctx.user.id);
      await deps.deleteAuthUser(ctx.user.id);
      return { ok: true as const };
    },
  };
}
