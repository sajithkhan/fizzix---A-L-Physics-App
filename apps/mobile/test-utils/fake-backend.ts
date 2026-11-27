/**
 * An in-memory stand-in for the Supabase client, for component tests of the sign-up screens.
 * It records every RPC and password call so tests can assert exactly what reached the server.
 */
import { getSupabase } from '@/lib/supabase';

const mockedGetSupabase = getSupabase as jest.MockedFunction<typeof getSupabase>;

export type FakeError = { message: string; code?: string; status?: number } | null;

export const NOTICE = { version: '2026-11', url: 'https://example.lk/privacy' };

export interface FakeBackendOptions {
  completed?: boolean;
  takenUsernames?: string[];
  saveError?: FakeError;
  consentError?: FakeError;
  /** Error code the set-password Edge Function answers with. */
  passwordErrorCode?: string;
  /** Error code the login Edge Function answers with ('network' = unreachable). */
  loginErrorCode?: string;
  /** Start without a session (signed out). */
  signedOut?: boolean;
  /** Logging out fails as if offline. */
  signOutError?: boolean;
  completeError?: FakeError;
  examYears?: number[];
  notice?: { version: string; url: string } | null;
  /** Notice versions this student has accepted. */
  accepted?: string[];
  ageBand?: '16_plus' | 'under_16' | null;
}

export function fakeBackend(opts: FakeBackendOptions = {}) {
  const calls = {
    rpc: [] as Array<[string, unknown]>,
    functions: [] as Array<[string, unknown]>,
    setSession: [] as unknown[],
    signOut: [] as unknown[],
  };
  let completed = opts.completed ?? false;
  let notice = opts.notice === undefined ? NOTICE : opts.notice;
  const accepted = new Set(opts.accepted ?? (completed && notice ? [notice.version] : []));
  let ageBand = opts.ageBand ?? null;
  let signedIn = !opts.signedOut;

  const query = (table: string) => {
    let key: unknown = null;
    const chain = {
      select: () => chain,
      order: () => Promise.resolve({ data: [], error: null }),
      eq: (_col: string, value: unknown) => {
        key = value;
        return chain;
      },
      maybeSingle: () => {
        if (table === 'profiles') {
          return Promise.resolve({
            data: {
              account_completed_at: completed ? '2026-11-27T10:00:00Z' : null,
              age_band: ageBand,
              display_name: completed ? 'Arjun Kumar' : null,
              exam_year: completed ? 2027 : null,
              stream: completed ? 'bio' : null,
            },
            error: null,
          });
        }
        if (table === 'app_config' && key === 'exam_years') {
          return Promise.resolve({
            data: { value: opts.examYears ?? [2026, 2027, 2028] },
            error: null,
          });
        }
        if (table === 'app_config' && key === 'privacy_notice') {
          return Promise.resolve({ data: notice ? { value: notice } : null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
    return chain;
  };

  const client = {
    from: query,
    rpc: (name: string, args?: Record<string, unknown>) => {
      calls.rpc.push([name, args]);
      if (name === 'username_available') {
        const taken = (opts.takenUsernames ?? []).map((u) => u.toLowerCase());
        return Promise.resolve({
          data: !taken.includes(String(args?.p_username).toLowerCase()),
          error: null,
        });
      }
      if (name === 'save_account_details')
        return Promise.resolve({ data: null, error: opts.saveError ?? null });
      if (name === 'record_consent') {
        if (opts.consentError) return Promise.resolve({ data: null, error: opts.consentError });
        accepted.add(String(args?.p_notice_version));
        ageBand = args?.p_age_band as typeof ageBand;
        return Promise.resolve({ data: null, error: null });
      }
      if (name === 'consent_status') {
        const ok = notice ? accepted.has(notice.version) : false;
        return Promise.resolve({
          data: [
            {
              current_version: notice?.version ?? '',
              accepted: ok,
              age_band: ok ? ageBand : null,
              parent_confirmation_pending: ok && ageBand === 'under_16',
            },
          ],
          error: null,
        });
      }
      if (name === 'complete_account') {
        if (!opts.completeError) completed = true;
        return Promise.resolve({ data: null, error: opts.completeError ?? null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    auth: {
      getSession: () =>
        Promise.resolve({
          data: { session: signedIn ? { user: { id: 'u1', phone: '94770000003' } } : null },
        }),
      signOut: (args: unknown) => {
        calls.signOut.push(args);
        if (opts.signOutError) {
          return Promise.resolve({ error: { name: 'AuthRetryableFetchError', status: 0 } });
        }
        signedIn = false;
        return Promise.resolve({ error: null });
      },
      setSession: (args: unknown) => {
        calls.setSession.push(args);
        signedIn = true;
        return Promise.resolve({ data: {}, error: null });
      },
    },
    functions: {
      invoke: (name: string, options?: { body?: unknown }) => {
        calls.functions.push([name, options?.body]);
        const fail = (code: string, status = 400) =>
          Promise.resolve({
            data: null,
            error: {
              name: 'FunctionsHttpError',
              context: { status, json: () => Promise.resolve({ error: { code } }) },
            },
          });
        if (name === 'set-password') {
          if (opts.passwordErrorCode) return fail(opts.passwordErrorCode);
          return Promise.resolve({ data: { ok: true }, error: null });
        }
        if (name === 'login') {
          if (opts.loginErrorCode === 'network') {
            return Promise.resolve({ data: null, error: { name: 'FunctionsFetchError' } });
          }
          if (opts.loginErrorCode) return fail(opts.loginErrorCode, 401);
          return Promise.resolve({
            data: { access_token: 'at', refresh_token: 'rt', expires_in: 3600, expires_at: 1 },
            error: null,
          });
        }
        return fail('internal', 500);
      },
    },
  };
  mockedGetSupabase.mockReturnValue(client as unknown as ReturnType<typeof getSupabase>);
  return {
    calls,
    /** Simulates the admin publishing a new notice version. */
    publishNotice(version: string) {
      notice = { version, url: notice?.url ?? NOTICE.url };
    },
  };
}
