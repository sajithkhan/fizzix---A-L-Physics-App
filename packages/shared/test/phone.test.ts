import { formatSlMobileLocal, normalizeSlMobile } from '../src/index.ts';

describe('normalizeSlMobile', () => {
  it.each([
    ['0771234567', '+94771234567'],
    ['771234567', '+94771234567'],
    ['77 123 4567', '+94771234567'],
    ['+94 77 123 4567', '+94771234567'],
    ['94771234567', '+94771234567'],
    ['0094771234567', '+94771234567'],
    ['070-123-4567', '+94701234567'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeSlMobile(input)).toBe(expected);
  });

  it.each([
    ['0112345678', 'landline'],
    ['077123456', 'too short'],
    ['07712345678', 'too long'],
    ['+14155550123', 'foreign'],
    ['07712a4567', 'letters'],
    ['', 'empty'],
  ])('rejects %s (%s)', (input) => {
    expect(normalizeSlMobile(input)).toBeNull();
  });
});

describe('formatSlMobileLocal', () => {
  it('groups digits for display', () => {
    expect(formatSlMobileLocal('+94771234567')).toBe('77 123 4567');
  });
});
