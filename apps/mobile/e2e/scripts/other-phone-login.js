// ST-06 helper: logs in to ${PHONE} from "another phone" (this script runs on the test
// machine, not on the emulator) through the login Edge Function. Saves the session so a
// later step can check it was signed out in turn.
const res = http.post(`${SUPABASE_URL}/functions/v1/login`, {
  headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: PHONE, password: PASSWORD }),
});
if (res.status !== 200) throw new Error(`other phone could not log in: HTTP ${res.status}`);
output.otherPhoneToken = json(res.body).access_token;
