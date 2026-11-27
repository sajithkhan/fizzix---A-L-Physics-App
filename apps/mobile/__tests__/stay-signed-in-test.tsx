/**
 * ST-05 · Stay signed in (Screen 1)
 *
 * AC1 Given I signed in once, when I close and reopen the app, then I go straight to home.
 * AC2 After logout, reinstall or a new phone, I sign in with my number and password. No OTP
 *     is sent.
 *
 * Where the session is kept is tested in secure-storage-test.ts. Logout lives on the home
 * placeholder until Settings (Screen 9) is built.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { analytics } from '@/lib/analytics';
import { LOCALE_STORAGE_KEY } from '@/lib/locale-store';
import { ACCOUNT_COMPLETE_KEY } from '@/lib/session';
import ta from '@/i18n/ta.json';
import si from '@/i18n/si.json';
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
  it('logging out ends the session on this phone and opens login', async () => {
    const { router, calls } = await reopen();
    await screen.findByTestId('home-screen');
    await AsyncStorage.setItem(ACCOUNT_COMPLETE_KEY, '1');
    await fireEvent.press(screen.getByTestId('home-logout'));
    await waitFor(() => expect(router.getPathname()).toBe('/login'));
    expect(calls.signOut).toEqual([{ scope: 'local' }]);
    expect(await AsyncStorage.getItem(ACCOUNT_COMPLETE_KEY)).toBeNull();
    expect(analytics.events()).toContainEqual({ name: 'logged_out', props: {} });
  });

  it('then the number and password sign in again, without any OTP', async () => {
    const { router, calls } = await reopen();
    await screen.findByTestId('home-screen');
    await fireEvent.press(screen.getByTestId('home-logout'));
    await screen.findByTestId('login-screen');
    await fireEvent.changeText(screen.getByTestId('login-phone'), '0770000003');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'physics26');
    await fireEvent.press(screen.getByTestId('login-submit'));
    await waitFor(() => expect(router.getPathname()).toBe('/home'));
    expect(calls.functions.map(([name]) => name)).toEqual(['login']);
  });

  it('if logging out fails (offline), the student stays signed in and is told why', async () => {
    const { router } = await reopen({ signOutError: true });
    await screen.findByTestId('home-screen');
    await fireEvent.press(screen.getByTestId('home-logout'));
    expect(await screen.findByTestId('home-logout-error')).toHaveTextContent(ta.home.logoutFailed);
    expect(router.getPathname()).toBe('/home');
  });
});

describe('ST-05 in Sinhala', () => {
  it('shows logout in Sinhala', async () => {
    await reopen({}, 'si');
    expect(await screen.findByTestId('home-logout')).toHaveTextContent(si.home.logout);
  });
});
