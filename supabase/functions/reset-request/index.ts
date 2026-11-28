// ST-55 · POST /functions/v1/reset-request  { phone } → { ok } (ADR-0011).
// Public (no JWT): config.toml sets verify_jwt = false for this function.
import { createPublicHandler } from '../_shared/handler.ts';
import { publicDeps, readEnv, serviceClient } from '../_shared/runtime.ts';
import { resetRequestSpec, type SendOtpResult } from './reset-request.ts';

const env = readEnv();
const admin = serviceClient(env);

async function sendOtp(phone: string): Promise<SendOtpResult> {
  try {
    const res = await fetch(`${env.url}/auth/v1/otp`, {
      method: 'POST',
      headers: { apikey: env.anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ phone, create_user: false }),
    });
    if (res.ok) return 'ok';
    const text = await res.text().catch(() => '');
    // Our SMS hook answers with its code as the message (see send_sms_hook).
    if (text.includes('otp_rate_limited')) return 'otp_rate_limited';
    if (text.includes('sms_unavailable')) return 'sms_unavailable';
    if (res.status === 429 || text.includes('over_sms_send_rate_limit')) return 'otp_resend_wait';
    return 'error';
  } catch {
    return 'error';
  }
}

Deno.serve(
  createPublicHandler(
    resetRequestSpec({
      pepper: env.pepper,
      async resetRequest(phone, ipKey) {
        const { data, error } = await admin.rpc('reset_request', {
          p_phone: phone,
          p_ip_key: ipKey,
        });
        if (error || typeof data !== 'string') throw new Error('internal');
        return data;
      },
      sendOtp,
    }),
    publicDeps,
  ),
);
