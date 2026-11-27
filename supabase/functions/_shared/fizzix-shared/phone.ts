/**
 * Sri Lankan mobile numbers. The server (private.send_sms_hook) applies the same rule;
 * this copy only gives the student instant feedback.
 */
const SL_MOBILE = /^\+947\d{8}$/;

/**
 * Turns what a student types into E.164 (+947XXXXXXXX), or null if it is not a Sri Lankan
 * mobile number. Accepts "0771234567", "771234567", "+94 77 123 4567", "0094771234567".
 */
export function normalizeSlMobile(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(digits)) return null;
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('0094')) digits = digits.slice(4);
  else if (digits.startsWith('94')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  const e164 = `+94${digits}`;
  return SL_MOBILE.test(e164) ? e164 : null;
}

/** "+94771234567" → "77 123 4567" for display next to the fixed "+94" box. */
export function formatSlMobileLocal(e164: string): string {
  const local = e164.replace(/^\+94/, '');
  return local.replace(/^(\d{2})(\d{3})(\d{4})$/, '$1 $2 $3');
}
