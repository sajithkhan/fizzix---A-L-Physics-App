/**
 * ST-54 · Log in with number and password (Screen 1)
 *
 * AC1 The login screen asks for phone number (+94) and password, with a show / hide eye.
 * AC2 Correct details take me to home. Wrong details show one message that does not say
 *     which field was wrong.
 * AC3 After 5 wrong tries, login is locked for 15 minutes for that number.
 * AC4 "புதிய மாணவரா? பதிவு செய்க" opens sign-up (ST-02).
 *
 * The lockout is enforced on the server: supabase/tests/90_login.test.sql and
 * supabase/functions/login/login.test.ts. Google sign-in is a separate follow-up.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { analytics } from '@/lib/analytics';
import { LOCALE_STORAGE_KEY } from '@/lib/locale-store';
import ta from '@/i18n/ta.json';
import si from '@/i18n/si.json';
import { fakeBackend, type FakeBackendOptions } from '../test-utils/fake-backend';

async function openLogin(opts: FakeBackendOptions = {}, lng: 'ta' | 'si' = 'ta') {
  const backend = fakeBackend({ signedOut: true, completed: true, ...opts });
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, lng);
  const router = await renderRouter('src/app', { initialUrl: '/' });
  await screen.findByTestId('login-screen');
  return { router, ...backend };
}

async function typeDetails(phone = '077 000 0001', password = 'physics26') {
  await fireEvent.changeText(screen.getByTestId('login-phone'), phone);
  await fireEvent.changeText(screen.getByTestId('login-password'), password);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  analytics.reset();
});

describe('ST-54 AC1: the login screen', () => {
  it('a signed-out student who already chose a language sees the login screen', async () => {
    const { router } = await openLogin();
    expect(router.getPathname()).toBe('/login');
    expect(screen.getByText('+94')).toBeOnTheScreen();
    expect(screen.getByTestId('login-phone')).toBeOnTheScreen();
    expect(screen.getByTestId('login-password')).toBeOnTheScreen();
    expect(screen.getByTestId('login-submit')).toHaveTextContent(ta.login.submit);
  });

  it('the eye button shows and hides the password', async () => {
    await openLogin();
    expect(screen.getByTestId('login-password').props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByTestId('login-password-toggle'));
    expect(screen.getByTestId('login-password').props.secureTextEntry).toBe(false);
  });

  it('the button waits until both fields are filled', async () => {
    await openLogin();
    expect(screen.getByTestId('login-submit')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('login-phone'), '0770000001');
    expect(screen.getByTestId('login-submit')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('login-password'), 'x');
    expect(screen.getByTestId('login-submit')).toBeEnabled();
  });
});

describe('ST-54 AC2: correct and wrong details', () => {
  it('correct details log in through the server and open home', async () => {
    const { router, calls } = await openLogin();
    await typeDetails();
    await fireEvent.press(screen.getByTestId('login-submit'));
    await waitFor(() => expect(router.getPathname()).toBe('/home'));
    expect(calls.functions).toEqual([['login', { phone: '+94770000001', password: 'physics26' }]]);
    expect(calls.setSession).toEqual([{ access_token: 'at', refresh_token: 'rt' }]);
    expect(analytics.events()).toContainEqual({ name: 'login_succeeded', props: {} });
  });

  it('a finished-account check still runs after login (new notice, unfinished sign-up)', async () => {
    const { router } = await openLogin({ completed: false });
    await typeDetails();
    await fireEvent.press(screen.getByTestId('login-submit'));
    await waitFor(() => expect(router.getPathname()).toBe('/account-setup'));
  });

  it('wrong details show one message that does not say which was wrong', async () => {
    const { router } = await openLogin({ loginErrorCode: 'invalid_credentials' });
    await typeDetails('0770000001', 'wrong123');
    await fireEvent.press(screen.getByTestId('login-submit'));
    const shown = await screen.findByTestId('login-error');
    expect(shown).toHaveTextContent(ta.login.errors.invalid_credentials);
    expect(router.getPathname()).toBe('/login');
    // The password is cleared so the next try starts fresh; the number stays.
    expect(screen.getByTestId('login-password').props.value).toBe('');
    expect(screen.getByTestId('login-phone').props.value).toBe('0770000001');
  });

  it('a number that is not a Sri Lankan mobile is caught before calling the server', async () => {
    const { calls } = await openLogin();
    await typeDetails('12345', 'physics26');
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(screen.getByTestId('login-error')).toHaveTextContent(
      ta.login.errors.phone_not_supported,
    );
    expect(calls.functions).toEqual([]);
  });

  it('offline shows the connection message', async () => {
    await openLogin({ loginErrorCode: 'network' });
    await typeDetails();
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByTestId('login-error')).toHaveTextContent(ta.login.errors.network);
  });

  it('records the failure reason only, never the number or password', async () => {
    await openLogin({ loginErrorCode: 'invalid_credentials' });
    await typeDetails('0770000001', 'wrong123');
    await fireEvent.press(screen.getByTestId('login-submit'));
    await screen.findByTestId('login-error');
    expect(analytics.events()).toEqual([
      { name: 'login_failed', props: { reason: 'invalid_credentials' } },
    ]);
  });
});

describe('ST-54 AC3: lockout', () => {
  it('a locked number is told to wait 15 minutes', async () => {
    await openLogin({ loginErrorCode: 'login_locked' });
    await typeDetails();
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      ta.login.errors.login_locked,
    );
  });

  it('too many tries from one network are told to wait', async () => {
    await openLogin({ loginErrorCode: 'rate_limited' });
    await typeDetails();
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      ta.login.errors.rate_limited,
    );
  });
});

describe('ST-54 AC4: new students', () => {
  it('"பதிவு செய்க" opens sign-up, and sign-up links back to login', async () => {
    const { router } = await openLogin();
    expect(screen.getByText(ta.login.newStudent)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('login-register-link'));
    await waitFor(() => expect(router.getPathname()).toBe('/register'));
    await fireEvent.press(screen.getByTestId('register-login-link'));
    await waitFor(() => expect(router.getPathname()).toBe('/login'));
  });
});

describe('ST-54 in Sinhala', () => {
  it('shows the login screen in Sinhala', async () => {
    await openLogin({ loginErrorCode: 'invalid_credentials' }, 'si');
    expect(screen.getByTestId('login-submit')).toHaveTextContent(si.login.submit);
    expect(screen.getByText(si.login.newStudent)).toBeOnTheScreen();
    await typeDetails();
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      si.login.errors.invalid_credentials,
    );
  });
});
