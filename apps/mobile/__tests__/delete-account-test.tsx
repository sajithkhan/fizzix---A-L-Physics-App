/**
 * ST-57 · Delete my account (Screen 9, Settings)
 *
 * AC1 Settings › "கணக்கை நீக்கு" explains what is deleted and asks for my password to confirm.
 * AC2 Personal data is removed within 30 days. Payment records the law requires are kept
 *     separately, without study data.
 * AC3 An active Play subscription is not cancelled automatically; the screen links to Google
 *     Play's subscriptions page and says so.
 *
 * Server rules: supabase/tests/99_delete_account.test.sql and
 * supabase/functions/delete-account/delete-account.test.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { analytics } from '@/lib/analytics';
import { LOCALE_STORAGE_KEY } from '@/lib/locale-store';
import { ACCOUNT_COMPLETE_KEY } from '@/lib/session';
import ta from '@/i18n/ta.json';
import si from '@/i18n/si.json';
import { fakeBackend, type FakeBackendOptions } from '../test-utils/fake-backend';

async function openDelete(opts: FakeBackendOptions = {}, lng: 'ta' | 'si' = 'ta') {
  const backend = fakeBackend({ completed: true, ...opts });
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, lng);
  await AsyncStorage.setItem(ACCOUNT_COMPLETE_KEY, '1');
  const router = await renderRouter('src/app', { initialUrl: '/' });
  await screen.findByTestId('home-screen');
  await fireEvent.press(screen.getByTestId('home-settings'));
  await fireEvent.press(await screen.findByTestId('settings-delete-account'));
  await screen.findByTestId('delete-account-screen');
  return { router, ...backend };
}

let openURL: jest.SpyInstance;
beforeEach(async () => {
  await AsyncStorage.clear();
  analytics.reset();
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});
afterEach(() => openURL.mockRestore());

describe('ST-57 AC1: what is deleted, and password to confirm', () => {
  it('Settings opens the screen, which explains what goes and asks for the password', async () => {
    const { router } = await openDelete();
    expect(router.getPathname()).toBe('/delete-account');
    for (const text of [
      ta.deleteAccount.deleted1,
      ta.deleteAccount.deleted2,
      ta.deleteAccount.deleted3,
      ta.deleteAccount.kept1,
    ]) {
      expect(screen.getByText(text)).toBeOnTheScreen();
    }
    expect(screen.getByTestId('delete-password').props.secureTextEntry).toBe(true);
    expect(screen.getByTestId('delete-confirm')).toBeDisabled();
  });

  it('a wrong password deletes nothing and says so', async () => {
    const { router } = await openDelete({ deleteAccountErrorCode: 'invalid_credentials' });
    await fireEvent.changeText(screen.getByTestId('delete-password'), 'guess1234');
    await fireEvent.press(screen.getByTestId('delete-confirm'));
    expect(await screen.findByTestId('delete-password-status')).toHaveTextContent(
      ta.deleteAccount.errors.invalid_credentials,
    );
    expect(router.getPathname()).toBe('/delete-account');
  });

  it('the back button returns to Settings', async () => {
    const { router } = await openDelete();
    await fireEvent.press(screen.getByTestId('delete-back'));
    await waitFor(() => expect(router.getPathname()).toBe('/settings'));
  });
});

describe('ST-57 AC2: deleting', () => {
  it('with the password the account is deleted, this phone forgets it, login says so', async () => {
    const { router, calls } = await openDelete();
    await fireEvent.changeText(screen.getByTestId('delete-password'), 'physics26');
    await fireEvent.press(screen.getByTestId('delete-confirm'));
    await waitFor(() => expect(router.getPathname()).toBe('/login'));
    expect(calls.functions).toEqual([['delete-account', { password: 'physics26' }]]);
    expect(calls.signOut).toEqual([{ scope: 'local' }]);
    expect(await AsyncStorage.getItem(ACCOUNT_COMPLETE_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ta');
    expect(screen.getByTestId('login-deleted')).toHaveTextContent(ta.login.accountDeleted);
    expect(analytics.events()).toContainEqual({ name: 'account_deleted', props: {} });
  });

  it('says when the rest is gone (within 30 days) and what is kept', async () => {
    await openDelete();
    expect(screen.getByText(ta.deleteAccount.when)).toBeOnTheScreen();
    expect(screen.getByText(ta.deleteAccount.keptHeading)).toBeOnTheScreen();
  });

  it('offline: nothing happens and the student is told', async () => {
    await openDelete({ deleteAccountErrorCode: 'network' });
    await fireEvent.changeText(screen.getByTestId('delete-password'), 'physics26');
    await fireEvent.press(screen.getByTestId('delete-confirm'));
    expect(await screen.findByTestId('delete-error')).toHaveTextContent(
      ta.deleteAccount.errors.network,
    );
  });
});

describe('ST-57 AC3: Google Play subscription', () => {
  it('says the subscription is not cancelled and links to Google Play subscriptions', async () => {
    await openDelete();
    expect(screen.getByText(ta.deleteAccount.play)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('delete-play-link'));
    expect(openURL).toHaveBeenCalledWith(
      'https://play.google.com/store/account/subscriptions?package=lk.fizzix.app',
    );
  });
});

describe('ST-57 in Sinhala', () => {
  it('shows the screen in Sinhala', async () => {
    await openDelete({}, 'si');
    expect(screen.getByText(si.deleteAccount.play)).toBeOnTheScreen();
    expect(screen.getByTestId('delete-confirm')).toHaveTextContent(si.deleteAccount.confirm);
  });
});
