/**
 * ST-59 · Loading, offline, empty, error and limit states
 *
 * AC1 Loading uses skeleton placeholders, not blank screens; anything over 10 s offers a retry.
 * AC2 Offline shows a banner; downloaded sets and audio keep working; answers sync later.
 *     (The banner is here; the offline answer queue and downloads ship with ST-15 / ST-24.)
 * AC3 Empty states say what to do next, with a button.
 * AC4 Errors use plain words and a next step, never codes (see also i18n-test.ts).
 * AC5 Daily-limit and paywall states explain the limit and when it resets.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { render } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
import type { ReactNode } from 'react';
import { createI18n } from '@/i18n';
import { LOCALE_STORAGE_KEY } from '@/lib/locale-store';
import { ACCOUNT_COMPLETE_KEY } from '@/lib/session';
import { EmptyState } from '@/components/empty-state';
import { ErrorMessage } from '@/components/error-message';
import { LimitState } from '@/components/limit-state';
import { ScreenSkeleton } from '@/components/skeleton';
import ta from '@/i18n/ta.json';
import si from '@/i18n/si.json';
import { fakeBackend } from '../test-utils/fake-backend';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const netinfo = require('@react-native-community/netinfo') as {
  __setState(s: { isConnected?: boolean | null; isInternetReachable?: boolean | null }): void;
};

async function inLanguage(lng: 'ta' | 'si', node: ReactNode) {
  const i18n = createI18n();
  await i18n.changeLanguage(lng);
  return render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  netinfo.__setState({ isConnected: true, isInternetReachable: true });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AC1 loading', () => {
  it('the skeleton is announced as loading, not a blank screen', async () => {
    await inLanguage('ta', <ScreenSkeleton />);
    const skeleton = screen.getByTestId('screen-skeleton');
    expect(skeleton).toHaveAccessibleName(ta.common.loading);
    expect(skeleton).toHaveProp('accessibilityState', { busy: true });
  });

  it('the entry screen shows a skeleton, then a retry after 10 s; retry tries again', async () => {
    jest.useFakeTimers();
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, 'ta');
    await AsyncStorage.setItem(ACCOUNT_COMPLETE_KEY, '1');
    const backend = fakeBackend({ completed: true });
    let release: () => void = () => {};
    const stalled = new Promise<void>((resolve) => (release = resolve));
    const auth = backend.client.auth as { getSession(): Promise<unknown> };
    const realGet = auth.getSession.bind(auth);
    const getSession = jest.spyOn(auth, 'getSession').mockImplementation(async () => {
      await stalled;
      return realGet();
    });

    await renderRouter('src/app', { initialUrl: '/' });
    expect(await screen.findByTestId('screen-skeleton')).toBeOnTheScreen();
    expect(screen.queryByTestId('entry-slow')).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(9_000);
    });
    expect(screen.queryByTestId('entry-slow')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(1_500);
    });
    expect(screen.getByTestId('entry-slow')).toHaveTextContent(ta.states.slow);

    const callsBefore = getSession.mock.calls.length;
    await fireEvent.press(screen.getByTestId('entry-slow-action'));
    expect(screen.queryByTestId('entry-slow')).toBeNull();
    expect(getSession.mock.calls.length).toBeGreaterThan(callsBefore);

    await act(async () => {
      release();
    });
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
  });
});

describe('AC2 offline', () => {
  it('shows a banner while offline and hides it when back online', async () => {
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, 'ta');
    fakeBackend({ completed: true });
    await AsyncStorage.setItem(ACCOUNT_COMPLETE_KEY, '1');
    await renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('home-screen');
    expect(screen.queryByTestId('offline-banner')).toBeNull();

    await act(async () => netinfo.__setState({ isConnected: false }));
    expect(screen.getByTestId('offline-banner')).toHaveTextContent(ta.common.offline);

    await act(async () => netinfo.__setState({ isConnected: true }));
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  it('connected but no internet also counts as offline', async () => {
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, 'si');
    await renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('language-screen').catch(() => undefined);
    await act(async () => netinfo.__setState({ isConnected: true, isInternetReachable: false }));
    expect(screen.getByTestId('offline-banner')).toHaveTextContent(si.common.offline);
  });
});

describe('AC3 empty states', () => {
  it('say what to do next, with a button', async () => {
    const onAction = jest.fn();
    await inLanguage(
      'ta',
      <EmptyState testID="empty" title="T" body="B" actionLabel="Go" onAction={onAction} />,
    );
    expect(screen.getByRole('header')).toHaveTextContent('T');
    expect(screen.getByText('B')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('empty-action'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('AC4 errors', () => {
  it('offer a next step when one is given', async () => {
    const onAction = jest.fn();
    await inLanguage(
      'si',
      <ErrorMessage
        testID="err"
        message={si.states.slow}
        actionLabel={si.states.retry}
        onAction={onAction}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(si.states.slow);
    await fireEvent.press(screen.getByRole('button', { name: si.states.retry }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('AC5 limit and paywall', () => {
  // 21:15 Sri Lanka time (15:45 UTC): the free allowance comes back at midnight, in 3 hours.
  const now = new Date('2026-11-28T15:45:00Z');

  it.each([
    ['ta', ta],
    ['si', si],
  ] as const)('%s: daily limit says the limit and when it resets', async (lng, strings) => {
    const onUpgrade = jest.fn();
    await inLanguage(
      lng,
      <LimitState testID="limit" kind="daily_limit" limit={10} now={now} onUpgrade={onUpgrade} />,
    );
    expect(screen.getByRole('header')).toHaveTextContent(strings.states.daily_limit.title);
    const body = strings.states.daily_limit.body
      .replace('{{limit}}', '10')
      .replace('{{hours}}', '3');
    expect(screen.getByText(body)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('limit-upgrade'));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('paywall explains what Premium opens', async () => {
    await inLanguage(
      'ta',
      <LimitState testID="pay" kind="premium_required" onUpgrade={() => {}} />,
    );
    expect(screen.getByRole('header')).toHaveTextContent(ta.states.premium_required.title);
    expect(screen.getByText(ta.states.premium_required.body)).toBeOnTheScreen();
    expect(screen.getByTestId('pay-upgrade')).toHaveTextContent(ta.states.upgrade);
  });
});
