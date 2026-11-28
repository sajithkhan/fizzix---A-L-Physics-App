import { callFunction } from '@/lib/functions';
import { forgetSessionOnThisPhone } from '@/lib/session';
import brand from '@/brand/brand.json';

export type DeleteAccountError =
  'invalid_credentials' | 'rate_limited' | 'session_expired' | 'network' | 'internal';

/** Google Play's own subscriptions page for this app (white-label: package from brand.json). */
export const PLAY_SUBSCRIPTIONS_URL = `https://play.google.com/store/account/subscriptions?package=${brand.androidPackage}`;

/** ST-57 · delete the account on the server, then forget the session on this phone. */
export async function deleteAccount(
  password: string,
): Promise<{ ok: true } | { ok: false; error: DeleteAccountError }> {
  const result = await callFunction<{ ok: true }>('delete-account', { password });
  if (!result.ok) {
    switch (result.code) {
      case 'invalid_credentials':
      case 'rate_limited':
      case 'network':
        return { ok: false, error: result.code };
      case 'not_authenticated':
      case 'signed_in_elsewhere':
        return { ok: false, error: 'session_expired' };
      default:
        return { ok: false, error: 'internal' };
    }
  }
  // The account no longer exists; drop what this phone still holds (tokens, cached state).
  await forgetSessionOnThisPhone();
  return { ok: true };
}
