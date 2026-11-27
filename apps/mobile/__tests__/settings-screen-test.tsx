/**
 * ST-07 · Log out (Screen 9, Settings)
 *
 * AC1 When I tap "வெளியேறு", the app asks me to confirm and reminds me I can sign in again
 *     with my number and password.
 * AC2 On confirm, my session ends and I return to the language or login screen.
 *
 * This story adds the Settings screen with the profile card and logout. Other rows (theme,
 * language, password, Premium, delete account) arrive with their own stories.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { analytics } from '@/lib/analytics';
import { LOCALE_STORAGE_KEY } from '@/lib/locale-store';
import { ACCOUNT_COMPLETE_KEY } from '@/lib/session';
import ta from '@/i18n/ta.json';
import si from '@/i18n/si.json';
import { fakeBackend, type FakeBackendOptions } from '../test-utils/fake-backend';

async function openSettings(opts: FakeBackendOptions = {}, lng: 'ta' | 'si' = 'ta') {
  const backend = fakeBackend({ completed: true, ...opts });
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, lng);
  await AsyncStorage.setItem(ACCOUNT_COMPLETE_KEY, '1');
  const router = await renderRouter('src/app', { initialUrl: '/' });
  await screen.findByTestId('home-screen');
  await fireEvent.press(screen.getByTestId('home-settings'));
  await screen.findByTestId('settings-screen');
  return { router, ...backend };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  analytics.reset();
});

describe('ST-07 Settings screen', () => {
  it('home opens Settings, which shows who is signed in', async () => {
    const { router } = await openSettings();
    expect(router.getPathname()).toBe('/settings');
    expect(screen.getByText(ta.settings.title)).toBeOnTheScreen();
    expect(await screen.findByText('Arjun Kumar')).toBeOnTheScreen();
    expect(screen.getByText('+94 77 000 0003')).toBeOnTheScreen();
    expect(screen.getByText(`A/L 2027 · ${ta.account.streams.bio}`)).toBeOnTheScreen();
  });

  it('the logout row reminds that number and password sign in again', async () => {
    await openSettings();
    expect(screen.getByTestId('settings-logout')).toHaveTextContent(new RegExp(ta.settings.logout));
    expect(screen.getByText(ta.settings.logoutHint)).toBeOnTheScreen();
  });
});

describe('ST-07 AC1: confirm before logging out', () => {
  it('tapping logout asks to confirm, with the reminder', async () => {
    const { calls } = await openSettings();
    await fireEvent.press(screen.getByTestId('settings-logout'));
    const dialog = await screen.findByTestId('logout-confirm');
    expect(dialog).toBeOnTheScreen();
    expect(screen.getByText(ta.settings.confirmTitle)).toBeOnTheScreen();
    expect(screen.getByText(ta.settings.confirmBody)).toBeOnTheScreen();
    expect(calls.signOut).toEqual([]);
  });

  it('"இல்லை" closes the question and keeps the student signed in', async () => {
    const { router, calls } = await openSettings();
    await fireEvent.press(screen.getByTestId('settings-logout'));
    await fireEvent.press(await screen.findByTestId('logout-confirm-cancel'));
    await waitFor(() => expect(screen.queryByTestId('logout-confirm')).toBeNull());
    expect(router.getPathname()).toBe('/settings');
    expect(calls.signOut).toEqual([]);
    expect(analytics.events()).toContainEqual({ name: 'logout_cancelled', props: {} });
  });
});

describe('ST-07 AC2: confirmed logout', () => {
  it('ends the session on this phone and opens login', async () => {
    const { router, calls } = await openSettings();
    await fireEvent.press(screen.getByTestId('settings-logout'));
    await fireEvent.press(await screen.findByTestId('logout-confirm-ok'));
    await waitFor(() => expect(router.getPathname()).toBe('/login'));
    expect(calls.signOut).toEqual([{ scope: 'local' }]);
    expect(await AsyncStorage.getItem(ACCOUNT_COMPLETE_KEY)).toBeNull();
    expect(analytics.events()).toContainEqual({ name: 'logged_out', props: {} });
  });

  it('back from login cannot return to the signed-in screens', async () => {
    const { router } = await openSettings();
    await fireEvent.press(screen.getByTestId('settings-logout'));
    await fireEvent.press(await screen.findByTestId('logout-confirm-ok'));
    await waitFor(() => expect(router.getPathname()).toBe('/login'));
    // Only the login screen is left in the stack.
    type Nav = { routes?: Array<{ name: string; state?: Nav }> };
    const root = router.getRouterState() as Nav | undefined;
    const stack = root?.routes?.[0]?.state ?? root;
    expect(stack?.routes?.map((r) => r.name)).toEqual(['login']);
  });

  it('offline, the student stays signed in and is told why', async () => {
    const { router } = await openSettings({ signOutError: true });
    await fireEvent.press(screen.getByTestId('settings-logout'));
    await fireEvent.press(await screen.findByTestId('logout-confirm-ok'));
    expect(await screen.findByTestId('settings-logout-error')).toHaveTextContent(
      ta.settings.logoutFailed,
    );
    expect(router.getPathname()).toBe('/settings');
  });
});

describe('ST-07 in Sinhala', () => {
  it('shows Settings and the question in Sinhala', async () => {
    await openSettings({}, 'si');
    expect(screen.getByText(si.settings.title)).toBeOnTheScreen();
    expect(screen.getByText(si.settings.logoutHint)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('settings-logout'));
    expect(await screen.findByText(si.settings.confirmBody)).toBeOnTheScreen();
    expect(screen.getByTestId('logout-confirm-ok')).toHaveTextContent(si.settings.confirmOk);
  });
});
