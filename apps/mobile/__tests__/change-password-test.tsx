/**
 * ST-56 · Change my password (Screen 9, Settings)
 *
 * AC1 Settings › "Password மாற்று" asks for the current password and a new one twice.
 * AC2 No OTP is needed when I know my current password.
 *
 * Server rules: supabase/tests/98_change_password.test.sql and
 * supabase/functions/change-password/change-password.test.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { analytics } from '@/lib/analytics';
import { LOCALE_STORAGE_KEY } from '@/lib/locale-store';
import { ACCOUNT_COMPLETE_KEY } from '@/lib/session';
import ta from '@/i18n/ta.json';
import si from '@/i18n/si.json';
import { fakeBackend, type FakeBackendOptions } from '../test-utils/fake-backend';

async function openChange(opts: FakeBackendOptions = {}, lng: 'ta' | 'si' = 'ta') {
  const backend = fakeBackend({ completed: true, ...opts });
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, lng);
  await AsyncStorage.setItem(ACCOUNT_COMPLETE_KEY, '1');
  const router = await renderRouter('src/app', { initialUrl: '/' });
  await screen.findByTestId('home-screen');
  await fireEvent.press(screen.getByTestId('home-settings'));
  await fireEvent.press(await screen.findByTestId('settings-change-password'));
  await screen.findByTestId('change-password-screen');
  return { router, ...backend };
}

async function fill(current = 'physics26', password = 'newphys27', confirm = password) {
  await fireEvent.changeText(screen.getByTestId('change-current'), current);
  await fireEvent.changeText(screen.getByTestId('change-password'), password);
  await fireEvent.changeText(screen.getByTestId('change-confirm'), confirm);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  analytics.reset();
});

describe('ST-56 AC1: the change-password screen', () => {
  it('Settings opens it, and it asks for the current password and the new one twice', async () => {
    const { router } = await openChange();
    expect(router.getPathname()).toBe('/change-password');
    expect(screen.getByText(ta.changePassword.title)).toBeOnTheScreen();
    for (const id of ['change-current', 'change-password', 'change-confirm']) {
      expect(screen.getByTestId(id).props.secureTextEntry).toBe(true);
    }
    expect(screen.getByTestId('change-current-toggle')).toBeOnTheScreen();
  });

  it('the new password rules and the match are checked before anything is sent', async () => {
    const { calls } = await openChange();
    await fill('physics26', 'short1');
    await fireEvent.press(screen.getByTestId('change-save'));
    expect(screen.getByTestId('change-password-status')).toHaveTextContent(
      ta.changePassword.errors.too_short,
    );
    await fill('physics26', 'newphys27', 'newphys28');
    await fireEvent.press(screen.getByTestId('change-save'));
    expect(screen.getByTestId('change-confirm-status')).toHaveTextContent(
      ta.changePassword.errors.mismatch,
    );
    expect(calls.functions).toEqual([]);
  });

  it('the back button returns to Settings', async () => {
    const { router } = await openChange();
    await fireEvent.press(screen.getByTestId('change-back'));
    await waitFor(() => expect(router.getPathname()).toBe('/settings'));
  });
});

describe('ST-56 AC2: no OTP with the current password', () => {
  it('saves through the server, keeps this phone signed in with the new session, no OTP', async () => {
    const { router, calls } = await openChange();
    await fill();
    await fireEvent.press(screen.getByTestId('change-save'));
    expect(await screen.findByTestId('change-done')).toHaveTextContent(ta.changePassword.done);
    expect(calls.functions).toEqual([
      ['change-password', { current: 'physics26', password: 'newphys27' }],
    ]);
    expect(calls.verifyOtp).toEqual([]);
    expect(calls.setSession).toEqual([{ access_token: 'at2', refresh_token: 'rt2' }]);
    expect(calls.signOut).toEqual([]);
    expect(analytics.events()).toContainEqual({ name: 'password_changed', props: {} });

    await fireEvent.press(screen.getByTestId('change-done-button'));
    await waitFor(() => expect(router.getPathname()).toBe('/settings'));
  });

  it('a wrong current password is shown on that field', async () => {
    await openChange({ changePasswordErrorCode: 'invalid_credentials' });
    await fill('guess1234');
    await fireEvent.press(screen.getByTestId('change-save'));
    expect(await screen.findByTestId('change-current-status')).toHaveTextContent(
      ta.changePassword.errors.invalid_credentials,
    );
    expect(screen.getByTestId('change-current').props.value).toBe('');
  });

  it('the same password again is refused with a clear message', async () => {
    await openChange({ changePasswordErrorCode: 'password_unchanged' });
    await fill('physics26', 'physics26');
    await fireEvent.press(screen.getByTestId('change-save'));
    expect(await screen.findByTestId('change-password-status')).toHaveTextContent(
      ta.changePassword.errors.password_unchanged,
    );
  });

  it('too many tries are explained', async () => {
    await openChange({ changePasswordErrorCode: 'rate_limited' });
    await fill();
    await fireEvent.press(screen.getByTestId('change-save'));
    expect(await screen.findByTestId('change-error')).toHaveTextContent(
      ta.changePassword.errors.rate_limited,
    );
  });

  it('never records the passwords', async () => {
    await openChange({ changePasswordErrorCode: 'invalid_credentials' });
    await fill('guess1234', 'newphys27');
    await fireEvent.press(screen.getByTestId('change-save'));
    await screen.findByTestId('change-current-status');
    expect(JSON.stringify(analytics.events())).not.toMatch(/guess1234|newphys27/);
  });
});

describe('ST-56 in Sinhala', () => {
  it('shows the screen in Sinhala', async () => {
    await openChange({}, 'si');
    expect(screen.getByText(si.changePassword.intro)).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: si.changePassword.title })).toBeOnTheScreen();
    expect(screen.getByTestId('change-save')).toHaveTextContent(si.changePassword.save);
  });
});
