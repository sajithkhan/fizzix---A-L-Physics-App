/**
 * ST-58 · Agree to privacy and confirm age at sign-up (Screen 1b)
 *
 * AC1 The account screen shows a short privacy summary in my language, with a link to the full
 *     notice, and a required checkbox.
 * AC2 I pick an age range. Under 16 needs a parent's confirmation by SMS before Premium or
 *     parent reports are used.
 * AC3 The accepted notice version and time are saved in `consents`. A new notice version asks
 *     again at next login.
 *
 * Server rules (version check, timestamps, parent check) are tested in
 * supabase/tests/80_consent.test.sql. Parent SMS confirmation itself ships with the parent
 * stories; this story records the age range and tells the student what happens.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { analytics } from '@/lib/analytics';
import { LOCALE_STORAGE_KEY } from '@/lib/locale-store';
import ta from '@/i18n/ta.json';
import si from '@/i18n/si.json';
import { fakeBackend, NOTICE } from '../test-utils/fake-backend';

async function openAt(lng: 'ta' | 'si' = 'ta') {
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, lng);
  return renderRouter('src/app', { initialUrl: '/' });
}

async function fillAccount() {
  await fireEvent.changeText(screen.getByTestId('account-name'), 'Arjun Kumar');
  await fireEvent.changeText(screen.getByTestId('account-username'), 'arjun_27');
  await fireEvent.changeText(screen.getByTestId('account-password'), 'physics26');
  await fireEvent.changeText(screen.getByTestId('account-confirm'), 'physics26');
  await fireEvent.press(screen.getByTestId('account-year-2027'));
  await fireEvent.press(screen.getByTestId('account-stream-bio'));
}

const serverCalls = (calls: { rpc: Array<[string, unknown]> }) =>
  calls.rpc.filter(([n]) => n !== 'username_available' && n !== 'consent_status');

let openURL: jest.SpyInstance;

beforeEach(async () => {
  await AsyncStorage.clear();
  analytics.reset();
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});

afterEach(() => openURL.mockRestore());

describe('ST-58 AC1: privacy summary, link and required checkbox', () => {
  it('shows the summary, the link and an unticked checkbox in Tamil', async () => {
    fakeBackend({});
    await openAt();
    await screen.findByTestId('account-screen');
    expect(screen.getByText(ta.consent.summary)).toBeOnTheScreen();
    expect(screen.getByTestId('account-privacy-link')).toHaveTextContent(ta.consent.link);
    const box = screen.getByTestId('account-privacy-accept');
    expect(box).not.toBeChecked();
    await fireEvent.press(box);
    expect(box).toBeChecked();
  });

  it('the link opens the full notice the server names', async () => {
    fakeBackend({ notice: { version: '2026-11', url: 'https://school.example/privacy' } });
    await openAt();
    await screen.findByTestId('account-screen');
    await waitFor(() => expect(screen.getByTestId('account-privacy-link')).toBeEnabled());
    await fireEvent.press(screen.getByTestId('account-privacy-link'));
    expect(openURL).toHaveBeenCalledWith('https://school.example/privacy');
  });

  it('an unsafe link from the server is never opened', async () => {
    fakeBackend({ notice: { version: '2026-11', url: 'javascript:alert(1)' } });
    await openAt();
    await screen.findByTestId('account-screen');
    await fireEvent.press(screen.getByTestId('account-privacy-link'));
    expect(openURL).not.toHaveBeenCalled();
  });

  it('without the tick the account is not created and the student is told why', async () => {
    const { calls } = fakeBackend({});
    await openAt();
    await screen.findByTestId('account-screen');
    await fillAccount();
    await fireEvent.press(screen.getByTestId('account-age-16_plus'));
    await fireEvent.press(screen.getByTestId('account-submit'));
    expect(screen.getByTestId('account-privacy-error')).toHaveTextContent(
      ta.consent.errors.consent_missing,
    );
    expect(serverCalls(calls)).toEqual([]);
  });
});

describe('ST-58 AC2: age range', () => {
  it('offers 16 or over and under 16', async () => {
    fakeBackend({});
    await openAt();
    await screen.findByTestId('account-screen');
    expect(screen.getByTestId('account-age-16_plus')).toHaveTextContent(ta.consent.ages['16_plus']);
    expect(screen.getByTestId('account-age-under_16')).toHaveTextContent(ta.consent.ages.under_16);
  });

  it('an age range is required', async () => {
    const { calls } = fakeBackend({});
    await openAt();
    await screen.findByTestId('account-screen');
    await fillAccount();
    await fireEvent.press(screen.getByTestId('account-privacy-accept'));
    await fireEvent.press(screen.getByTestId('account-submit'));
    expect(screen.getByText(ta.consent.errors.invalid_age_band)).toBeOnTheScreen();
    expect(serverCalls(calls)).toEqual([]);
  });

  it('under 16 explains that a parent will confirm by SMS before Premium or parent reports', async () => {
    fakeBackend({});
    await openAt();
    await screen.findByTestId('account-screen');
    expect(screen.queryByTestId('account-age-parent-note')).toBeNull();
    await fireEvent.press(screen.getByTestId('account-age-under_16'));
    expect(screen.getByTestId('account-age-parent-note')).toHaveTextContent(ta.consent.parentNote);
    await fireEvent.press(screen.getByTestId('account-age-16_plus'));
    expect(screen.queryByTestId('account-age-parent-note')).toBeNull();
  });
});

describe('ST-58 AC3: consent is recorded and asked again for a new notice', () => {
  it('records the notice version and age range before completing the account', async () => {
    const { calls } = fakeBackend({});
    const router = await openAt();
    await screen.findByTestId('account-screen');
    await fillAccount();
    await fireEvent.press(screen.getByTestId('account-age-under_16'));
    await fireEvent.press(screen.getByTestId('account-privacy-accept'));
    await fireEvent.press(screen.getByTestId('account-submit'));
    await waitFor(() => expect(router.getPathname()).toBe('/home'));

    const names = serverCalls(calls).map(([n]) => n);
    expect(names).toEqual(['save_account_details', 'record_consent', 'complete_account']);
    expect(serverCalls(calls)[1]).toEqual([
      'record_consent',
      { p_notice_version: NOTICE.version, p_age_band: 'under_16' },
    ]);
    expect(analytics.events()).toContainEqual({
      name: 'consent_accepted',
      props: { notice_version: NOTICE.version, age_band: 'under_16' },
    });
  });

  it('if the notice changed while the student was filling in, they are asked to read it again', async () => {
    fakeBackend({ consentError: { message: 'notice_outdated', code: '22023' } });
    const router = await openAt();
    await screen.findByTestId('account-screen');
    await fillAccount();
    await fireEvent.press(screen.getByTestId('account-age-16_plus'));
    await fireEvent.press(screen.getByTestId('account-privacy-accept'));
    await fireEvent.press(screen.getByTestId('account-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('account-privacy-error')).toHaveTextContent(
        ta.consent.errors.notice_outdated,
      ),
    );
    expect(screen.getByTestId('account-privacy-accept')).not.toBeChecked();
    expect(router.getPathname()).toBe('/account-setup');
  });

  it('a finished account whose consent is for an old notice is asked again on open', async () => {
    const { calls } = fakeBackend({ completed: true, accepted: ['2026-01'], ageBand: '16_plus' });
    const router = await openAt();
    await waitFor(() => expect(router.getPathname()).toBe('/consent'));
    expect(screen.getByText(ta.consent.updatedTitle)).toBeOnTheScreen();
    // The age range already given is kept; the student only needs to tick and continue.
    expect(screen.getByTestId('consent-age-16_plus')).toBeChecked();

    await fireEvent.press(screen.getByTestId('consent-continue'));
    expect(screen.getByTestId('consent-privacy-error')).toHaveTextContent(
      ta.consent.errors.consent_missing,
    );

    await fireEvent.press(screen.getByTestId('consent-privacy-accept'));
    await fireEvent.press(screen.getByTestId('consent-continue'));
    await waitFor(() => expect(router.getPathname()).toBe('/home'));
    expect(calls.rpc).toContainEqual([
      'record_consent',
      { p_notice_version: NOTICE.version, p_age_band: '16_plus' },
    ]);
  });

  it('a finished account with current consent goes straight home', async () => {
    fakeBackend({ completed: true });
    const router = await openAt();
    await waitFor(() => expect(router.getPathname()).toBe('/home'));
  });

  it('offline at start-up, a finished account still opens home (asked again once online)', async () => {
    fakeBackend({ completed: true, accepted: ['2026-01'] });
    await AsyncStorage.setItem('fizzix.account_complete', '1');
    const { getSupabase } = jest.requireMock('@/lib/supabase') as {
      getSupabase: jest.Mock;
    };
    const client = getSupabase();
    client.rpc = () => Promise.reject(new TypeError('Network request failed'));
    const router = await openAt();
    await waitFor(() => expect(router.getPathname()).toBe('/home'));
  });
});

describe('ST-58 in Sinhala', () => {
  it('shows the summary, age ranges and checkbox in Sinhala', async () => {
    fakeBackend({});
    await openAt('si');
    await screen.findByTestId('account-screen');
    expect(screen.getByText(si.consent.summary)).toBeOnTheScreen();
    expect(screen.getByTestId('account-age-under_16')).toHaveTextContent(si.consent.ages.under_16);
    expect(screen.getByTestId('account-privacy-link')).toHaveTextContent(si.consent.link);
  });

  it('the re-ask screen is in Sinhala too', async () => {
    fakeBackend({ completed: true, accepted: ['2026-01'], ageBand: 'under_16' });
    const router = await openAt('si');
    await waitFor(() => expect(router.getPathname()).toBe('/consent'));
    expect(screen.getByText(si.consent.updatedTitle)).toBeOnTheScreen();
    expect(screen.getByTestId('consent-age-parent-note')).toHaveTextContent(si.consent.parentNote);
  });
});
