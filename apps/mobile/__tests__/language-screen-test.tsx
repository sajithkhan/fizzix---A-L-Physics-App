/**
 * ST-01 · Choose app language (Screen 0)
 *
 * AC1 Given first launch, when the app opens, then the language screen shows Tamil and
 *     Sinhala, with English marked "விரைவில்" and disabled.
 * AC2 When I pick a language, then the preview text and the continue button switch to that
 *     language straight away.
 * AC3 The choice is saved to my profile and filters all questions, explanations and audio to
 *     that language. (Filtering is enforced on the server: supabase/tests/50_locales.test.sql.)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { getSupabase } from '@/lib/supabase';
import { analytics } from '@/lib/analytics';
import { LOCALE_STORAGE_KEY } from '@/lib/locale-store';
import ta from '@/i18n/ta.json';
import si from '@/i18n/si.json';

const mockedGetSupabase = getSupabase as jest.MockedFunction<typeof getSupabase>;

function fakeSupabase(opts: {
  locales?: unknown[];
  localesError?: boolean;
  userId?: string | null;
  onProfileUpdate?: (values: unknown, id: string) => void;
}) {
  return {
    from(table: string) {
      if (table === 'locales') {
        return {
          select: () => ({
            order: () =>
              Promise.resolve(
                opts.localesError
                  ? { data: null, error: { message: 'network' } }
                  : { data: opts.locales ?? [], error: null },
              ),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          update: (values: unknown) => ({
            eq: (_col: string, id: string) => {
              opts.onProfileUpdate?.(values, id);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      getSession: () =>
        Promise.resolve({
          data: { session: opts.userId ? { user: { id: opts.userId } } : null },
        }),
    },
  } as unknown as ReturnType<typeof getSupabase>;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockedGetSupabase.mockReturnValue(null);
  analytics.reset();
});

describe('ST-01 first launch', () => {
  it('AC1: opens on the language screen with Tamil and Sinhala, English disabled as coming soon', async () => {
    await renderRouter('src/app', { initialUrl: '/' });

    expect(await screen.findByTestId('language-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('language-option-ta')).toBeEnabled();
    expect(screen.getByTestId('language-option-si')).toBeEnabled();

    const english = screen.getByTestId('language-option-en');
    expect(english).toBeDisabled();
    expect(english).toHaveTextContent(/விரைவில்/);
  });

  it('AC1: Tamil is selected by default', async () => {
    await renderRouter('src/app', { initialUrl: '/language' });
    expect(await screen.findByTestId('language-option-ta')).toBeSelected();
    expect(screen.getByTestId('language-option-si')).not.toBeSelected();
  });

  it('shows the title in both languages so either student can read it', async () => {
    await renderRouter('src/app', { initialUrl: '/language' });
    expect(await screen.findByText(ta.language.title)).toBeOnTheScreen();
    expect(screen.getByText(si.language.title)).toBeOnTheScreen();
  });
});

describe('ST-01 picking a language', () => {
  it('AC2: picking Sinhala switches the preview and the continue button straight away', async () => {
    await renderRouter('src/app', { initialUrl: '/language' });
    expect(await screen.findByText(ta.language.previewText)).toBeOnTheScreen();
    expect(screen.getByTestId('language-continue')).toHaveTextContent(ta.language.continue);

    await fireEvent.press(screen.getByTestId('language-option-si'));

    expect(screen.getByTestId('language-option-si')).toBeSelected();
    expect(screen.getByText(si.language.previewText)).toBeOnTheScreen();
    expect(screen.getByTestId('language-continue')).toHaveTextContent(si.language.continue);
    expect(screen.queryByText(ta.language.previewText)).toBeNull();
  });

  it('AC1: pressing English does nothing', async () => {
    await renderRouter('src/app', { initialUrl: '/language' });
    await fireEvent.press(await screen.findByTestId('language-option-en'));
    expect(screen.getByTestId('language-option-ta')).toBeSelected();
  });

  it('AC3: continue saves the choice on the device and moves on', async () => {
    const router = await renderRouter('src/app', { initialUrl: '/language' });
    await fireEvent.press(await screen.findByTestId('language-option-si'));
    await fireEvent.press(screen.getByTestId('language-continue'));

    await waitFor(() => expect(router.getPathname()).toBe('/welcome'));
    expect(await AsyncStorage.getItem(LOCALE_STORAGE_KEY)).toBe('si');
    expect(screen.getByText(si.welcome.title)).toBeOnTheScreen();
  });

  it('AC3: when signed in, continue also saves the choice to the profile', async () => {
    const updates: Array<{ values: unknown; id: string }> = [];
    mockedGetSupabase.mockReturnValue(
      fakeSupabase({
        userId: 'user-1',
        onProfileUpdate: (values, id) => updates.push({ values, id }),
      }),
    );

    await renderRouter('src/app', { initialUrl: '/language' });
    await fireEvent.press(await screen.findByTestId('language-option-si'));
    await fireEvent.press(screen.getByTestId('language-continue'));

    await waitFor(() => expect(updates).toEqual([{ values: { locale_code: 'si' }, id: 'user-1' }]));
  });

  it('records a language_selected analytics event without personal data', async () => {
    await renderRouter('src/app', { initialUrl: '/language' });
    await fireEvent.press(await screen.findByTestId('language-option-si'));
    await fireEvent.press(screen.getByTestId('language-continue'));

    await waitFor(() =>
      expect(analytics.events()).toEqual([
        { name: 'language_selected', props: { locale: 'si', first_launch: true } },
      ]),
    );
  });
});

describe('ST-01 returning student', () => {
  it('skips the language screen once a language is saved', async () => {
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, 'si');
    const router = await renderRouter('src/app', { initialUrl: '/' });

    await waitFor(() => expect(router.getPathname()).toBe('/welcome'));
    expect(await screen.findByText(si.welcome.title)).toBeOnTheScreen();
  });

  it('ignores a corrupted saved value and asks again', async () => {
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, 'xx');
    await renderRouter('src/app', { initialUrl: '/' });
    expect(await screen.findByTestId('language-screen')).toBeOnTheScreen();
  });
});

describe('ST-01 language list from the server (white-label)', () => {
  it('uses the server list when it loads', async () => {
    mockedGetSupabase.mockReturnValue(
      fakeSupabase({
        locales: [
          { code: 'ta', native_name: 'தமிழ்', is_enabled: true, sort_order: 1 },
          { code: 'si', native_name: 'සිංහල', is_enabled: false, sort_order: 2 },
        ],
      }),
    );

    await renderRouter('src/app', { initialUrl: '/language' });
    await waitFor(() => expect(screen.getByTestId('language-option-si')).toBeDisabled());
    expect(screen.queryByTestId('language-option-en')).toBeNull();
  });

  it('offline: falls back to the built-in list without showing an error', async () => {
    mockedGetSupabase.mockReturnValue(fakeSupabase({ localesError: true }));

    await renderRouter('src/app', { initialUrl: '/language' });
    expect(await screen.findByTestId('language-option-ta')).toBeEnabled();
    expect(screen.getByTestId('language-option-si')).toBeEnabled();
    expect(screen.getByTestId('language-option-en')).toBeDisabled();
  });

  it('ignores a malformed server response and keeps the built-in list', async () => {
    mockedGetSupabase.mockReturnValue(fakeSupabase({ locales: [{ code: 'TAMIL' }] }));

    await renderRouter('src/app', { initialUrl: '/language' });
    expect(await screen.findByTestId('language-option-si')).toBeEnabled();
  });
});
