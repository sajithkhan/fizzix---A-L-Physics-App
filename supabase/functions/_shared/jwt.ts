/**
 * The `amr` claim of a token that Auth has just verified (getUser), e.g.
 * [{ method: 'otp', timestamp: 1764300000 }]. Undefined if missing or malformed.
 */
export function tokenAmr(token: string): Array<{ method: string; timestamp: number }> | undefined {
  try {
    const part = token.split('.')[1] ?? '';
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    const amr = json?.amr;
    if (!Array.isArray(amr)) return undefined;
    return amr
      .filter((a) => typeof a?.method === 'string' && typeof a?.timestamp === 'number')
      .map((a) => ({ method: a.method as string, timestamp: a.timestamp as number }));
  } catch {
    return undefined;
  }
}

/** True if the session was authenticated by an OTP within the last `maxAgeSeconds`. */
export function hasFreshOtp(
  amr: Array<{ method: string; timestamp: number }> | undefined,
  nowSeconds: number,
  maxAgeSeconds: number,
): boolean {
  return (amr ?? []).some(
    (a) =>
      a.method === 'otp' &&
      nowSeconds - a.timestamp >= -60 &&
      nowSeconds - a.timestamp <= maxAgeSeconds,
  );
}
