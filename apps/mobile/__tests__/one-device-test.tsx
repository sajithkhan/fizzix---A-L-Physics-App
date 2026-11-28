/**
 * ST-06 · One active device per account (Screen 1)
 *
 * AC1 When I sign in on a new phone, the old phone is signed out on its next request.
 * AC2 The old phone shows a short message explaining why it was signed out.
 *
 * The server side (newest sign-in wins, refresh refused, RPCs refused) is tested in
 * supabase/tests/97_one_device.test.sql; Edge Functions in _shared/handler.test.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type AppStateStatus } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { analytics } from '@/lib/analytics';
import { LOCALE_STORAGE_KEY } from '@/lib/locale-store';
import { ACCOUNT_COMPLETE_KEY } from '@/lib/session';
import ta from '@/i18n/ta.json';
import si from '@/i18n/si.json';
import { fakeBackend, type FakeBackendOptions } from '../test-utils/fake-backend';

let appStateListener: ((s: AppStateStatus) => void) | null = null;

beforeEach(async () => {
  await AsyncStorage.clear();
  analytics.reset();
  appStateListener = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (s: AppStateStatus) => void;
    return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => jest.restoreAllMocks());

async function open(opts: FakeBackendOptions = {}, lng: 'ta' | 'si' = 'ta') {
  const backend = fakeBackend({ completed: true, ...opts });
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, lng);
  await AsyncStorage.setItem(ACCOUNT_COMPLETE_KEY, '1');
  const router = await renderRouter('src/app', { initialUrl: '/' });
  return { router, ...backend };
}

describe('ST-06 AC1+AC2: opening the app after a sign-in elsewhere', () => {
  it('the old phone is signed out and told why', async () => {
    const { router, calls } = await open({ sessionActive: false });
    await waitFor(() => expect(router.getPathname()).toBe('/login'));
    expect(screen.getByTestId('login-elsewhere')).toHaveTextContent(ta.login.signedOutElsewhere);
    expect(calls.rpc).toContainEqual(['session_status', undefined]);
    expect(calls.signOut).toEqual([{ scope: 'local' }]);
    expect(await AsyncStorage.getItem(ACCOUNT_COMPLETE_KEY)).toBeNull();
  });

  it('when Auth refuses to refresh the old session, the same message is shown', async () => {
    const { router } = await open({ refreshRefused: true });
    await waitFor(() => expect(router.getPathname()).toBe('/login'));
    expect(screen.getByTestId('login-elsewhere')).toBeOnTheScreen();
  });

  it('the active phone opens home as usual', async () => {
    const { router } = await open();
    await waitFor(() => expect(router.getPathname()).toBe('/home'));
    expect(screen.queryByTestId('login-elsewhere')).toBeNull();
  });

  it('a normal logout does not show the message', async () => {
    const { router } = await open();
    await screen.findByTestId('home-screen');
    await fireEvent.press(screen.getByTestId('home-settings'));
    await fireEvent.press(await screen.findByTestId('settings-logout'));
    await fireEvent.press(await screen.findByTestId('logout-confirm-ok'));
    await waitFor(() => expect(router.getPathname()).toBe('/login'));
    expect(screen.queryByTestId('login-elsewhere')).toBeNull();
  });
});

describe('ST-06 AC1: coming back to the app', () => {
  it('returning to the app checks again and signs out if another phone signed in', async () => {
    const backend = await open();
    await screen.findByTestId('home-screen');

    // Another phone signs in while this one is in the background.
    const { calls } = fakeBackend({ completed: true, sessionActive: false });
    await act(async () => {
      appStateListener?.('background');
      appStateListener?.('active');
    });
    await waitFor(() => expect(backend.router.getPathname()).toBe('/login'));
    expect(screen.getByTestId('login-elsewhere')).toHaveTextContent(ta.login.signedOutElsewhere);
    expect(calls.signOut).toEqual([{ scope: 'local' }]);
    expect(analytics.events()).toContainEqual({ name: 'signed_out_elsewhere', props: {} });
  });

  it('returning while still the active phone changes nothing', async () => {
    const { router } = await open();
    await screen.findByTestId('home-screen');
    await act(async () => {
      appStateListener?.('active');
    });
    expect(router.getPathname()).toBe('/home');
  });
});

describe('ST-06 in Sinhala', () => {
  it('explains the sign-out in Sinhala', async () => {
    await open({ sessionActive: false }, 'si');
    expect(await screen.findByTestId('login-elsewhere')).toHaveTextContent(
      si.login.signedOutElsewhere,
    );
  });
});
