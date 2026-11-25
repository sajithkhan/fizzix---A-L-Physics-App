/**
 * ST-02 · Register with phone number and OTP (Screen 1a, step 1 of 2)
 *
 * AC1 Given a valid Sri Lankan number (+94), when I tap "OTP அனுப்பு", then a 6-digit code
 *     arrives by SMS.
 * AC2 When I enter the correct code, then my number is verified, becomes my login ID, and I
 *     go to account creation (ST-04).
 * AC3 A wrong code shows an error. I can resend after 45 seconds, at most 3 times per hour.
 *
 * Server-side rules (Sri Lankan mobile only, already registered, 3 per hour) are tested in
 * supabase/tests/60_sms_hook.test.sql; here we test that the app sends the right request and
 * shows each server answer in the student's language.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { getSupabase } from '@/lib/supabase';
import { analytics } from '@/lib/analytics';
import { LOCALE_STORAGE_KEY } from '@/lib/locale-store';
import ta from '@/i18n/ta.json';
import si from '@/i18n/si.json';

const mockedGetSupabase = getSupabase as jest.MockedFunction<typeof getSupabase>;

type AuthError = { message: string; code?: string; status?: number; name?: string };

function fakeAuth(opts: { sendError?: AuthError; verifyError?: AuthError; session?: boolean }) {
  const calls = { send: [] as unknown[], verify: [] as unknown[] };
  const client = {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: opts.session ? { user: { id: 'u1' } } : null } }),
      signInWithOtp: (args: unknown) => {
        calls.send.push(args);
        return Promise.resolve({ data: {}, error: opts.sendError ?? null });
      },
      verifyOtp: (args: unknown) => {
        calls.verify.push(args);
        return Promise.resolve(
          opts.verifyError
            ? { data: { session: null }, error: opts.verifyError }
            : { data: { session: { user: { id: 'u1' } } }, error: null },
        );
      },
    },
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
    }),
  };
  mockedGetSupabase.mockReturnValue(client as unknown as ReturnType<typeof getSupabase>);
  return calls;
}

async function openRegister(lng: 'ta' | 'si' = 'ta') {
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, lng);
  const router = await renderRouter('src/app', { initialUrl: '/' });
  await screen.findByTestId('register-screen');
  return router;
}

async function sendOtpTo(number: string) {
  await fireEvent.changeText(screen.getByTestId('register-phone'), number);
  await fireEvent.press(screen.getByTestId('register-send-otp'));
}

async function enterCode(code: string) {
  await fireEvent.changeText(await screen.findByTestId('register-otp'), code);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  analytics.reset();
  jest.useRealTimers();
});

describe('ST-02 entry', () => {
  it('a new student who picked a language lands on registration (step 1 of 2)', async () => {
    fakeAuth({});
    const router = await openRegister();
    expect(router.getPathname()).toBe('/register');
    expect(screen.getByText(ta.register.title)).toBeOnTheScreen();
    expect(screen.getByText(ta.register.step)).toBeOnTheScreen();
  });

  it('a student who verified but has not created an account resumes at account creation', async () => {
    fakeAuth({ session: true });
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, 'ta');
    const router = await renderRouter('src/app', { initialUrl: '/' });
    await waitFor(() => expect(router.getPathname()).toBe('/account-setup'));
  });
});

describe('ST-02 AC1: send OTP', () => {
  it('sends the number in +94 format and shows the code boxes', async () => {
    const calls = fakeAuth({});
    await openRegister();
    await sendOtpTo('077 123 4567');

    await waitFor(() =>
      expect(calls.send).toEqual([
        { phone: '+94771234567', options: { shouldCreateUser: true, channel: 'sms' } },
      ]),
    );
    expect(await screen.findByTestId('register-otp')).toBeOnTheScreen();
    expect(screen.getByText(ta.register.otpLabel)).toBeOnTheScreen();
  });

  it('does not call the server for a number that is not a Sri Lankan mobile', async () => {
    const calls = fakeAuth({});
    await openRegister();
    await sendOtpTo('011 234 5678');

    expect(screen.getByTestId('register-error')).toHaveTextContent(
      ta.register.errors.phone_not_supported,
    );
    expect(calls.send).toEqual([]);
  });

  it.each([
    ['phone_not_supported', { message: 'phone_not_supported', status: 400 }],
    ['already_registered', { message: 'already_registered', status: 409 }],
    ['otp_rate_limited', { message: 'otp_rate_limited', status: 429 }],
    ['sms_unavailable', { message: 'sms_unavailable', status: 503 }],
    [
      'otp_resend_wait',
      { message: 'For security purposes…', code: 'over_sms_send_rate_limit', status: 429 },
    ],
    ['network', { message: 'Failed to fetch', name: 'AuthRetryableFetchError', status: 0 }],
    ['internal', { message: 'relation "auth.users" does not exist', status: 500 }],
  ] as const)('server answer %s is shown in plain Tamil, never raw text', async (code, error) => {
    fakeAuth({ sendError: error });
    await openRegister();
    await sendOtpTo('0771234567');

    const shown = await screen.findByTestId('register-error');
    expect(shown).toHaveTextContent(ta.register.errors[code]);
    expect(shown).not.toHaveTextContent(error.message);
    expect(screen.queryByTestId('register-otp')).toBeNull();
  });

  it('records otp_requested without the phone number', async () => {
    fakeAuth({});
    await openRegister();
    await sendOtpTo('0771234567');
    await screen.findByTestId('register-otp');

    expect(analytics.events()).toEqual([{ name: 'otp_requested', props: { resend: false } }]);
    expect(JSON.stringify(analytics.events())).not.toContain('771234567');
  });
});

describe('ST-02 AC2: verify', () => {
  it('the correct code verifies the number and goes to account creation', async () => {
    const calls = fakeAuth({});
    const router = await openRegister();
    await sendOtpTo('0771234567');
    await enterCode('123456');
    await fireEvent.press(screen.getByTestId('register-verify'));

    await waitFor(() => expect(router.getPathname()).toBe('/account-setup'));
    expect(calls.verify).toEqual([{ phone: '+94771234567', token: '123456', type: 'sms' }]);
    expect(analytics.events().map((e) => e.name)).toEqual(['otp_requested', 'otp_verified']);
  });

  it('verify stays disabled until all 6 digits are entered, and ignores non-digits', async () => {
    fakeAuth({});
    await openRegister();
    await sendOtpTo('0771234567');
    await enterCode('12a4');
    expect(screen.getByTestId('register-otp').props.value).toBe('124');
    expect(screen.getByTestId('register-verify')).toBeDisabled();
    await enterCode('123456');
    expect(screen.getByTestId('register-verify')).toBeEnabled();
  });
});

describe('ST-02 AC3: wrong code and resend', () => {
  it('a wrong code shows an error and stays on the screen', async () => {
    fakeAuth({
      verifyError: { message: 'Token has expired or is invalid', code: 'otp_expired', status: 403 },
    });
    const router = await openRegister();
    await sendOtpTo('0771234567');
    await enterCode('000000');
    await fireEvent.press(screen.getByTestId('register-verify'));

    expect(await screen.findByTestId('register-error')).toHaveTextContent(
      ta.register.errors.otp_invalid,
    );
    expect(router.getPathname()).toBe('/register');
  });

  it('resend unlocks after 45 seconds', async () => {
    jest.useFakeTimers();
    const calls = fakeAuth({});
    await openRegister();
    await sendOtpTo('0771234567');
    await screen.findByTestId('register-otp');

    expect(screen.getByTestId('register-resend')).toBeDisabled();
    expect(screen.getByTestId('register-resend')).toHaveTextContent(/0:45/);

    await act(async () => {
      jest.advanceTimersByTime(44_000);
    });
    expect(screen.getByTestId('register-resend')).toBeDisabled();
    expect(screen.getByTestId('register-resend')).toHaveTextContent(/0:01/);

    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    expect(screen.getByTestId('register-resend')).toBeEnabled();

    await fireEvent.press(screen.getByTestId('register-resend'));
    await waitFor(() => expect(calls.send).toHaveLength(2));
    expect(analytics.events().at(-1)).toEqual({ name: 'otp_requested', props: { resend: true } });
  });

  it('"change number" goes back to the number field', async () => {
    fakeAuth({});
    await openRegister();
    await sendOtpTo('0771234567');
    await fireEvent.press(await screen.findByTestId('register-change-number'));
    expect(screen.queryByTestId('register-otp')).toBeNull();
    expect(screen.getByTestId('register-phone').props.value).toBe('0771234567');
  });
});

describe('ST-02 in Sinhala', () => {
  it('shows the screen and errors in Sinhala', async () => {
    fakeAuth({ sendError: { message: 'otp_rate_limited', status: 429 } });
    await openRegister('si');
    expect(screen.getByText(si.register.title)).toBeOnTheScreen();
    await sendOtpTo('0771234567');
    expect(await screen.findByTestId('register-error')).toHaveTextContent(
      si.register.errors.otp_rate_limited,
    );
  });
});
