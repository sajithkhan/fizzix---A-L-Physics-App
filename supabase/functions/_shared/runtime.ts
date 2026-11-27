/**
 * Real dependencies for Edge Functions: Supabase clients built from the function's
 * environment. The service role key exists only here (never in app or web code), and is used
 * only to call the service-role-only SQL functions and the Auth admin API.
 *
 * Environment (Supabase provides the first three; set the pepper with `supabase secrets set`):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, PASSWORD_PEPPER
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Deps, LogEntry, PublicDeps } from './handler.ts';
import { requirePepper } from './password.ts';

export interface Env {
  url: string;
  anonKey: string;
  serviceKey: string;
  pepper: string;
}

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function readEnv(): Env {
  return {
    url: required('SUPABASE_URL'),
    anonKey: required('SUPABASE_ANON_KEY'),
    serviceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    pepper: requirePepper(Deno.env.get('PASSWORD_PEPPER')),
  };
}

export function serviceClient(env: Env): SupabaseClient {
  return createClient(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** One JSON line per request: ids, status, code and timing only (see LogEntry). */
export function log(entry: LogEntry): void {
  console.log(JSON.stringify(entry));
}

export const publicDeps: PublicDeps = { log };

/** Deps for signed-in functions (_shared/handler.ts createHandler). */
export function userDeps(admin: SupabaseClient): Deps {
  return {
    async verifyToken(token) {
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return null;
      const phone = data.user.phone ? `+${data.user.phone.replace(/^\+/, '')}` : undefined;
      return phone ? { id: data.user.id, phone } : { id: data.user.id };
    },
    async rateLimit(userId, action, max, windowSeconds) {
      const { data, error } = await admin.rpc('edge_rate_limit', {
        p_user: userId,
        p_action: action,
        p_max: max,
        p_window_seconds: windowSeconds,
      });
      if (error) throw new Error('internal');
      return data === true;
    },
    async isPremium(userId) {
      const { data, error } = await admin.rpc('edge_is_premium', { p_user: userId });
      if (error) throw new Error('internal');
      return data === true;
    },
    log,
  };
}
