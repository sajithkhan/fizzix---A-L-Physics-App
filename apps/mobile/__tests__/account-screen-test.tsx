/**
 * ST-04 · Create my account (Screen 1b, step 2 of 2)
 *
 * AC1 Given I just verified my number, the account screen shows: name, username, password,
 *     confirm password, A/L exam year (2026 / 2027 / 2028), stream (Bio / Maths) and school
 *     (optional).
 * AC2 Password rules (8+ characters, letters and digits; decided 2026-11-27). The two password
 *     fields must match, with a clear message when they don't.
 * AC3 Username must be unique. It is the nickname shown in challenges; login uses the phone.
 * AC4 When I tap "பதிவு செய்", my account is created and I land on home, already signed in.
 *
 * Server rules are tested in supabase/tests/70_account.test.sql. Privacy and age (ST-58) are
 * covered in consent-screen-test.tsx.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { fakeBackend } from '../test-utils/fake-backend';
import { analytics } from '@/lib/analytics';
import { LOCALE_STORAGE_KEY } from '@/lib/locale-store';
import ta from '@/i18n/ta.json';
import si from '@/i18n/si.json';

async function open(lng: 'ta' | 'si' = 'ta') {
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, lng);
  const router = await renderRouter('src/app', { initialUrl: '/' });
  await screen.findByTestId('account-screen');
  return router;
}

async function fillValid(
  overrides: Partial<Record<'name' | 'username' | 'password' | 'confirm' | 'school', string>> = {},
) {
  const v = {
    name: 'Arjun Kumar',
    username: 'arjun_27',
    password: 'physics26',
    confirm: 'physics26',
    school: '',
    ...overrides,
  };
  await fireEvent.changeText(screen.getByTestId('account-name'), v.name);
  await fireEvent.changeText(screen.getByTestId('account-username'), v.username);
  await fireEvent.changeText(screen.getByTestId('account-password'), v.password);
  await fireEvent.changeText(screen.getByTestId('account-confirm'), v.confirm);
  await fireEvent.press(screen.getByTestId('account-year-2027'));
  await fireEvent.press(screen.getByTestId('account-stream-bio'));
  await fireEvent.press(screen.getByTestId('account-age-16_plus'));
  if (v.school) await fireEvent.changeText(screen.getByTestId('account-school'), v.school);
  await fireEvent.press(screen.getByTestId('account-privacy-accept'));
}

beforeEach(async () => {
  await AsyncStorage.clear();
  analytics.reset();
});

describe('ST-04 AC1: the account screen', () => {
  it('a verified student without an account lands here and sees every field', async () => {
    fakeBackend({});
    const router = await open();
    expect(router.getPathname()).toBe('/account-setup');
    expect(await screen.findByText(/77 000 0003/)).toBeOnTheScreen();
    for (const id of [
      'account-name',
      'account-username',
      'account-password',
      'account-confirm',
      'account-school',
    ]) {
      expect(screen.getByTestId(id)).toBeOnTheScreen();
    }
    for (const year of [2026, 2027, 2028])
      expect(screen.getByTestId(`account-year-${year}`)).toBeOnTheScreen();
    expect(screen.getByTestId('account-stream-bio')).toHaveTextContent(ta.account.streams.bio);
    expect(screen.getByTestId('account-stream-maths')).toHaveTextContent(ta.account.streams.maths);
  });

  it('exam years come from the server so the admin can change them', async () => {
    fakeBackend({ examYears: [2027, 2028, 2029] });
    await open();
    expect(await screen.findByTestId('account-year-2029')).toBeOnTheScreen();
    expect(screen.queryByTestId('account-year-2026')).toBeNull();
  });

  it('a finished account skips this screen and opens home', async () => {
    fakeBackend({ completed: true });
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, 'ta');
    const router = await renderRouter('src/app', { initialUrl: '/' });
    await waitFor(() => expect(router.getPathname()).toBe('/home'));
  });
});

describe('ST-04 AC2: password rules', () => {
  it.each([
    ['phys26', ta.account.errors.too_short],
    ['physicsss', ta.account.errors.needs_digit],
    ['12345678', ta.account.errors.needs_letter],
  ])('"%s" is refused with a clear message', async (pw, message) => {
    const { calls } = fakeBackend({});
    await open();
    await fillValid({ password: pw, confirm: pw });
    await fireEvent.press(screen.getByTestId('account-submit'));
    expect(screen.getByTestId('account-password-status')).toHaveTextContent(message);
    expect(calls.rpc.filter(([n]) => n === 'save_account_details')).toEqual([]);
  });

  it('shows when the two passwords do not match, and when they do', async () => {
    fakeBackend({});
    await open();
    await fillValid({ confirm: 'physics27' });
    await fireEvent.press(screen.getByTestId('account-submit'));
    expect(screen.getByTestId('account-confirm-status')).toHaveTextContent(
      ta.account.errors.mismatch,
    );

    await fireEvent.changeText(screen.getByTestId('account-confirm'), 'physics26');
    expect(screen.getByTestId('account-confirm-status')).toHaveTextContent(ta.account.match);
  });

  it('the eye button shows and hides the password', async () => {
    fakeBackend({});
    await open();
    expect(screen.getByTestId('account-password').props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByTestId('account-password-toggle'));
    expect(screen.getByTestId('account-password').props.secureTextEntry).toBe(false);
  });
});

describe('ST-04 AC3: unique username', () => {
  it('says when a username is taken', async () => {
    fakeBackend({ takenUsernames: ['Arjun_27'] });
    await open();
    await fireEvent.changeText(screen.getByTestId('account-username'), 'arjun_27');
    await waitFor(() =>
      expect(screen.getByTestId('account-username-status')).toHaveTextContent(
        ta.account.errors.username_taken,
      ),
    );
  });

  it('says when a username is free', async () => {
    fakeBackend({ takenUsernames: ['someone'] });
    await open();
    await fireEvent.changeText(screen.getByTestId('account-username'), 'arjun_27');
    await waitFor(() =>
      expect(screen.getByTestId('account-username-status')).toHaveTextContent(
        ta.account.usernameAvailable,
      ),
    );
  });

  it('if someone takes it at the last second, the server answer is shown on the field', async () => {
    fakeBackend({ saveError: { message: 'username_taken', code: '23505' } });
    const router = await open();
    await fillValid();
    await fireEvent.press(screen.getByTestId('account-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('account-username-status')).toHaveTextContent(
        ta.account.errors.username_taken,
      ),
    );
    expect(router.getPathname()).toBe('/account-setup');
  });

  it('a username in the wrong format is refused before calling the server', async () => {
    const { calls } = fakeBackend({});
    await open();
    await fillValid({ username: 'ar' });
    await fireEvent.press(screen.getByTestId('account-submit'));
    expect(screen.getByTestId('account-username-status')).toHaveTextContent(
      ta.account.errors.invalid_username,
    );
    expect(calls.rpc.filter(([n]) => n === 'save_account_details')).toEqual([]);
  });
});

describe('ST-04 AC4: create the account', () => {
  it('saves details, sets the password, completes the account and opens home', async () => {
    const { calls } = fakeBackend({});
    const router = await open();
    await fillValid({ school: 'Jaffna Hindu College' });
    await fireEvent.press(screen.getByTestId('account-submit'));

    await waitFor(() => expect(router.getPathname()).toBe('/home'));
    expect(calls.rpc.filter(([n]) => n !== 'username_available')).toEqual([
      [
        'save_account_details',
        {
          p_display_name: 'Arjun Kumar',
          p_username: 'arjun_27',
          p_exam_year: 2027,
          p_stream: 'bio',
          p_school: 'Jaffna Hindu College',
        },
      ],
      ['record_consent', { p_notice_version: '2026-11', p_age_band: '16_plus' }],
      ['complete_account', undefined],
    ]);
    expect(calls.updateUser).toEqual([{ password: 'physics26' }]);
    expect(screen.getByText(ta.home.title)).toBeOnTheScreen();
  });

  it('records account_created with exam year and stream only, never the name or username', async () => {
    fakeBackend({});
    const router = await open();
    await fillValid();
    await fireEvent.press(screen.getByTestId('account-submit'));
    await waitFor(() => expect(router.getPathname()).toBe('/home'));
    expect(analytics.events()).toContainEqual({
      name: 'account_created',
      props: { exam_year: 2027, stream: 'bio' },
    });
    expect(JSON.stringify(analytics.events())).not.toMatch(/Arjun|arjun_27|physics26/);
  });

  it('a weak password refused by the server is shown on the password field', async () => {
    fakeBackend({
      passwordError: {
        message: 'Password is known to be weak',
        code: 'weak_password',
        status: 422,
      },
    });
    await open();
    await fillValid();
    await fireEvent.press(screen.getByTestId('account-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('account-password-status')).toHaveTextContent(
        ta.account.errors.weak_password,
      ),
    );
  });

  it('a server error shows plain text, never raw details', async () => {
    fakeBackend({
      completeError: { message: 'relation "auth.users" does not exist', status: 500 },
    });
    await open();
    await fillValid();
    await fireEvent.press(screen.getByTestId('account-submit'));
    const shown = await screen.findByTestId('account-error');
    expect(shown).toHaveTextContent(ta.account.errors.internal);
    expect(shown).not.toHaveTextContent(/relation/);
  });

  it('missing exam year and stream are pointed out', async () => {
    fakeBackend({});
    await open();
    await fireEvent.changeText(screen.getByTestId('account-name'), 'Arjun');
    await fireEvent.press(screen.getByTestId('account-submit'));
    expect(screen.getByText(ta.account.errors.invalid_exam_year)).toBeOnTheScreen();
    expect(screen.getByText(ta.account.errors.invalid_stream)).toBeOnTheScreen();
  });
});

describe('ST-04 in Sinhala', () => {
  it('shows the screen in Sinhala', async () => {
    fakeBackend({});
    await open('si');
    expect(screen.getByText(si.account.title)).toBeOnTheScreen();
    expect(screen.getByTestId('account-submit')).toHaveTextContent(si.account.submit);
  });
});
