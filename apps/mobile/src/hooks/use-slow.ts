import { useEffect, useState } from 'react';

/** ST-59 · anything still loading after this long offers a retry. */
export const SLOW_AFTER_MS = 10_000;

/** True once `loading` has been true for `ms` without finishing. Resets when `key` changes. */
export function useSlow(loading: boolean, key: unknown = 0, ms = SLOW_AFTER_MS): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!loading) return;
    const timer = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(timer);
  }, [loading, key, ms]);
  return slow;
}
