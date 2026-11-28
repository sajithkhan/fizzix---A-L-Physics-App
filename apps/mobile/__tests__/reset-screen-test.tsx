/**
 * ST-55 · Reset a forgotten password (Screen 1c)
 *
 * AC1 "Password மறந்துவிட்டீர்களா?" opens the reset screen: number, OTP, new password, confirm.
 * AC2 The OTP goes only to a number that has an account. Resend after 45 seconds, at most 3
 *     times per hour.
 * AC3 After saving, all my other sessions are signed out and I log in with the new password.
 *
 * Server rules: supabase/tests/95_password_reset.test.sql and the reset-request /
 * reset-password Edge Function tests.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { analytics } from '@/lib/analytics';
import { LOCALE_STORAGE_KEY } from '@/lib/locale-store';
import ta from '@/i18n/ta.json';
import si from '@/i18n/si.json';
import { fakeBackend, type FakeBackendOptions } from '../test-utils/fake-backend';

async function openReset(opts: FakeBackendOptions = {}, lng: 'ta' | 'si' = 'ta') {
  const backend = fakeBackend({ signedOut: true, completed: true, ...opts });
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, lng);
  const router = await renderRouter('src/app', { initialUrl: '/' });
  await screen.findByTestId('login-screen');
  await fireEvent.press(screen.getByTestId('login-forgot'));
  await screen.findByTestId('reset-screen');
  return { router, ...backend };
}

async function askForOtp(phone = '077 111 1111') {
  await fireEvent.changeText(screen.getByTestId('reset-phone'), phone);
  await fireEvent.press(screen.getByTestId('reset-send-otp'));
}

async function fillNew(code = '123456', password = 'newphys27', confirm = password) {
  await fireEvent.changeText(await screen.findByTestId('reset-otp'), code);
  await fireEvent.changeText(screen.getByTestId('reset-password'), password);
  await fireEvent.changeText(screen.getByTestId('reset-confirm'), confirm);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  analytics.reset();
  jest.useRealTimers();
});

describe('ST-55 AC1: the reset screen', () => {
  it('login links to it, and it asks for the number first', async () => {
    const { router } = await openReset();
    expect(router.getPathname()).toBe('/reset');
    expect(screen.getByText(ta.reset.title)).toBeOnTheScreen();
    expect(screen.getByText(ta.reset.intro)).toBeOnTheScreen();
    expect(screen.getByTestId('reset-phone')).toBeOnTheScreen();
  });

  it('after the OTP is sent it shows OTP, new password and confirm', async () => {
    const { calls } = await openReset();
    await askForOtp();
    expect(await screen.findByTestId('reset-otp')).toBeOnTheScreen();
    expect(screen.getByTestId('reset-password')).toBeOnTheScreen();
    expect(screen.getByTestId('reset-confirm')).toBeOnTheScreen();
    expect(calls.functions).toEqual([['reset-request', { phone: '+94771111111' }]]);
  });

  it('the back button returns to login', async () => {
    const { router } = await openReset();
    await fireEvent.press(screen.getByTestId('reset-back'));
    await waitFor(() => expect(router.getPathname()).toBe('/login'));
  });
});

describe('ST-55 AC2: only numbers with an account, resend limits', () => {
  it('a number without an account is told to register, and no OTP step opens', async () => {
    await openReset({ resetRequestErrorCode: 'not_registered' });
    await askForOtp('0779999999');
    expect(await screen.findByTestId('reset-error')).toHaveTextContent(
      ta.reset.errors.not_registered,
    );
    expect(screen.queryByTestId('reset-otp')).toBeNull();
  });

  it('a number that is not a Sri Lankan mobile is caught before calling the server', async () => {
    const { calls } = await openReset();
    await askForOtp('12345');
    expect(screen.getByTestId('reset-error')).toHaveTextContent(
      ta.reset.errors.phone_not_supported,
    );
    expect(calls.functions).toEqual([]);
  });

  it('resend waits 45 seconds', async () => {
    jest.useFakeTimers();
    const { calls } = await openReset();
    await askForOtp();
    await screen.findByTestId('reset-otp');
    expect(screen.getByTestId('reset-resend')).toBeDisabled();
    expect(screen.getByTestId('reset-resend')).toHaveTextContent(/0:45/);
    await act(async () => {
      jest.advanceTimersByTime(45_000);
    });
    expect(screen.getByTestId('reset-resend')).toBeEnabled();
    await fireEvent.press(screen.getByTestId('reset-resend'));
    expect(calls.functions.map(([n]) => n)).toEqual(['reset-request', 'reset-request']);
  });

  it('more than 3 OTPs an hour is explained', async () => {
    await openReset({ resetRequestErrorCode: 'otp_rate_limited' });
    await askForOtp();
    expect(await screen.findByTestId('reset-error')).toHaveTextContent(
      ta.reset.errors.otp_rate_limited,
    );
  });
});

describe('ST-55 AC3: saving the new password', () => {
  it('checks the OTP, saves through the server, signs out and opens login with a note', async () => {
    const { router, calls } = await openReset();
    await askForOtp();
    await fillNew();
    await fireEvent.press(screen.getByTestId('reset-save'));
    await waitFor(() => expect(router.getPathname()).toBe('/login'));
    expect(calls.verifyOtp).toEqual([{ phone: '+94771111111', token: '123456', type: 'sms' }]);
    expect(calls.functions).toContainEqual(['reset-password', { password: 'newphys27' }]);
    expect(calls.signOut).toEqual([{ scope: 'local' }]);
    expect(screen.getByTestId('login-reset-done')).toHaveTextContent(ta.login.resetDone);
    expect(analytics.events()).toContainEqual({ name: 'password_reset', props: {} });
  });

  it('then the new password logs in', async () => {
    const { router, calls } = await openReset();
    await askForOtp();
    await fillNew();
    await fireEvent.press(screen.getByTestId('reset-save'));
    await screen.findByTestId('login-reset-done');
    await fireEvent.changeText(screen.getByTestId('login-phone'), '0771111111');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'newphys27');
    await fireEvent.press(screen.getByTestId('login-submit'));
    await waitFor(() => expect(router.getPathname()).toBe('/home'));
    expect(calls.functions).toContainEqual([
      'login',
      { phone: '+94771111111', password: 'newphys27' },
    ]);
  });

  it('a wrong OTP is shown and nothing is saved', async () => {
    const { calls } = await openReset();
    await askForOtp();
    await fillNew('999999');
    await fireEvent.press(screen.getByTestId('reset-save'));
    expect(await screen.findByTestId('reset-error')).toHaveTextContent(ta.reset.errors.otp_invalid);
    expect(calls.functions.map(([n]) => n)).toEqual(['reset-request']);
  });

  it('password rules and the match are checked before anything is sent', async () => {
    const { calls } = await openReset();
    await askForOtp();
    await fillNew('123456', 'short1');
    await fireEvent.press(screen.getByTestId('reset-save'));
    expect(screen.getByTestId('reset-password-status')).toHaveTextContent(
      ta.reset.errors.too_short,
    );
    await fillNew('123456', 'newphys27', 'newphys28');
    await fireEvent.press(screen.getByTestId('reset-save'));
    expect(screen.getByTestId('reset-confirm-status')).toHaveTextContent(ta.reset.errors.mismatch);
    expect(calls.verifyOtp).toEqual([]);
  });

  it('if the 10-minute window closed, the student is asked to start again', async () => {
    await openReset({ resetPasswordErrorCode: 'reset_not_allowed' });
    await askForOtp();
    await fillNew();
    await fireEvent.press(screen.getByTestId('reset-save'));
    expect(await screen.findByTestId('reset-error')).toHaveTextContent(
      ta.reset.errors.reset_not_allowed,
    );
    expect(screen.getByTestId('reset-phone')).toBeOnTheScreen();
  });

  it('leaving after the OTP was checked does not leave the student signed in', async () => {
    const { router, calls } = await openReset({ resetPasswordErrorCode: 'weak_password' });
    await askForOtp();
    await fillNew();
    await fireEvent.press(screen.getByTestId('reset-save'));
    await screen.findByTestId('reset-password-status');
    await fireEvent.press(screen.getByTestId('reset-back'));
    await waitFor(() => expect(router.getPathname()).toBe('/login'));
    expect(calls.signOut).toEqual([{ scope: 'local' }]);
  });
});

describe('ST-55 in Sinhala', () => {
  it('shows the reset screen in Sinhala', async () => {
    await openReset({}, 'si');
    expect(screen.getByText(si.reset.title)).toBeOnTheScreen();
    expect(screen.getByTestId('reset-send-otp')).toHaveTextContent(si.reset.sendOtp);
  });
});
