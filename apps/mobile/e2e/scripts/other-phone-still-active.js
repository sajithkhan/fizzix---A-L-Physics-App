// ST-06 helper: asks whether the "other phone" session from other-phone-login.js is still
// the account's active one. Fails the flow unless the answer is ${EXPECT}.
const res = http.post(`${SUPABASE_URL}/rest/v1/rpc/session_status`, {
  headers: {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${output.otherPhoneToken}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
});
if (res.status !== 200) throw new Error(`session_status failed: HTTP ${res.status}`);
const active = json(res.body) === true;
if (String(active) !== EXPECT) throw new Error(`other phone active=${active}, expected ${EXPECT}`);
