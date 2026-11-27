/**
 * ST-05 · Stay signed in (Screen 1)
 *
 * AC1 Given I signed in once, when I close and reopen the app, then I go straight to home.
 * AC2 After logout, reinstall or a new phone, I sign in with my number and password. No OTP
 *     is sent.
 *
 * Where the session is kept is tested in secure-storage-test.ts; logout itself (ST-07) in
 * settings-screen-test.tsx.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { analytics } from '@/lib/analytics';
import { LOCALE_STORAGE_KEY } from '@/lib/locale-store';
import { fakeBackend, type FakeBackendOptions } from '../test-utils/fake-backend';

async function reopen(opts: FakeBackendOptions = {}, lng: 'ta' | 'si' = 'ta') {
  const backend = fakeBackend({ completed: true, ...opts });
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, lng);
  const router = await renderRouter('src/app', { initialUrl: '/' });
  return { router, ...backend };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  analytics.reset();
});

describe('ST-05 AC1: reopening the app', () => {
  it('a student who signed in before goes straight to home, with no login or OTP', async () => {
    const { router, calls } = await reopen();
    await waitFor(() => expect(router.getPathname()).toBe('/home'));
    expect(calls.functions).toEqual([]);
    expect(screen.queryByTestId('login-screen')).toBeNull();
    expect(screen.queryByTestId('register-screen')).toBeNull();
  });
});

describe('ST-05 AC2: after logout', () => {
  it('number and password sign in again, without any OTP', async () => {
    const { router, calls } = await reopen();
    await screen.findByTestId('home-screen');
    await fireEvent.press(screen.getByTestId('home-settings'));
    await fireEvent.press(await screen.findByTestId('settings-logout'));
    await fireEvent.press(await screen.findByTestId('logout-confirm-ok'));
    await screen.findByTestId('login-screen');
    await fireEvent.changeText(screen.getByTestId('login-phone'), '0770000003');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'physics26');
    await fireEvent.press(screen.getByTestId('login-submit'));
    await waitFor(() => expect(router.getPathname()).toBe('/home'));
    expect(calls.functions.map(([name]) => name)).toEqual(['login']);
  });
});
