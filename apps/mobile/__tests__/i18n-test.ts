/**
 * Definition of Done: every user-facing string exists in Tamil and Sinhala.
 * Fails if a key is added to one language and forgotten in the other.
 */
import ta from '@/i18n/ta.json';
import si from '@/i18n/si.json';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') acc[path] = value;
    else Object.assign(acc, flatten(value, path));
    return acc;
  }, {});
}

const taFlat = flatten(ta as Tree);
const siFlat = flatten(si as Tree);

describe('translations', () => {
  it('Tamil and Sinhala have exactly the same keys', () => {
    expect(Object.keys(siFlat).sort()).toEqual(Object.keys(taFlat).sort());
  });

  it.each(Object.entries({ ta: taFlat, si: siFlat }))('%s has no empty strings', (_lng, flat) => {
    for (const [key, value] of Object.entries(flat)) {
      expect({ key, empty: value.trim() === '' }).toEqual({ key, empty: false });
    }
  });

  it('interpolation placeholders match between languages', () => {
    const vars = (s: string) => (s.match(/{{\s*\w+\s*}}/g) ?? []).sort();
    for (const key of Object.keys(taFlat)) {
      expect({ key, vars: vars(siFlat[key] ?? '') }).toEqual({
        key,
        vars: vars(taFlat[key] ?? ''),
      });
    }
  });
});
