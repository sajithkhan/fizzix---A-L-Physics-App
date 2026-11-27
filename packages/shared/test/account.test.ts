import { isValidName, isValidUsername, passwordIssue } from '../src/index.ts';

describe('passwordIssue (8+ characters, letters and digits)', () => {
  it.each([
    ['phys26', 'too_short'],
    ['physicsss', 'needs_digit'],
    ['12345678', 'needs_letter'],
    ['physics26', null],
    ['Arjun_2027!', null],
  ])('%s → %s', (pw, issue) => {
    expect(passwordIssue(pw)).toBe(issue);
  });
});

describe('isValidUsername', () => {
  it.each(['arjun_27', 'ABC', 'a_b_c_d_e_f_g_h_i_j_'])('accepts %s', (u) =>
    expect(isValidUsername(u)).toBe(true),
  );
  it.each(['ar', 'arjun 27', 'அர்ஜுன்', 'a'.repeat(21), 'arjun-27'])('rejects %s', (u) =>
    expect(isValidUsername(u)).toBe(false),
  );
});

describe('isValidName', () => {
  it('accepts Tamil and Sinhala names', () => {
    expect(isValidName('அர்ஜுன் குமார்')).toBe(true);
    expect(isValidName('නිමල් පෙරේරා')).toBe(true);
  });
  it('rejects blank and over-long names', () => {
    expect(isValidName('   ')).toBe(false);
    expect(isValidName('a'.repeat(61))).toBe(false);
  });
});
