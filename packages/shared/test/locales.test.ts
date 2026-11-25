import { FALLBACK_LOCALES, LocaleList, isLocale, selectableLocales } from '../src/index.ts';

describe('locales', () => {
  it('fallback list matches the database contract', () => {
    expect(LocaleList.safeParse(FALLBACK_LOCALES).success).toBe(true);
  });

  it('only enabled, translated languages are selectable, in order', () => {
    expect(selectableLocales(FALLBACK_LOCALES)).toEqual(['ta', 'si']);
    expect(
      selectableLocales([
        { code: 'si', native_name: 'සිංහල', is_enabled: true, sort_order: 1 },
        { code: 'ta', native_name: 'தமிழ்', is_enabled: true, sort_order: 2 },
        { code: 'fr', native_name: 'Français', is_enabled: true, sort_order: 3 },
      ]),
    ).toEqual(['si', 'ta']);
  });

  it('a language enabled on the server but not translated in the app stays unselectable', () => {
    expect(isLocale('fr')).toBe(false);
  });
});
