import {
  AGE_BANDS,
  ConsentStatus,
  isAgeBand,
  parsePrivacyNotice,
  needsParentConfirmation,
} from '../src/index.ts';

describe('ST-58 consent contracts', () => {
  it('offers exactly the two age ranges the database knows', () => {
    expect(AGE_BANDS).toEqual(['16_plus', 'under_16']);
    expect(isAgeBand('under_16')).toBe(true);
    expect(isAgeBand('18_plus')).toBe(false);
    expect(isAgeBand(null)).toBe(false);
  });

  it('only under 16 needs a parent to confirm', () => {
    expect(needsParentConfirmation('under_16')).toBe(true);
    expect(needsParentConfirmation('16_plus')).toBe(false);
    expect(needsParentConfirmation(null)).toBe(false);
  });

  it('reads the privacy notice config and accepts only an https link', () => {
    expect(parsePrivacyNotice({ version: '2026-11', url: 'https://example.lk/privacy' })).toEqual({
      version: '2026-11',
      url: 'https://example.lk/privacy',
    });
    expect(parsePrivacyNotice({ version: '2026-11', url: 'http://example.lk/privacy' })).toBeNull();
    expect(parsePrivacyNotice({ version: '2026-11', url: 'javascript:alert(1)' })).toBeNull();
    expect(parsePrivacyNotice({ version: '', url: 'https://example.lk/privacy' })).toBeNull();
    expect(parsePrivacyNotice({ version: 'x'.repeat(21), url: 'https://e.lk' })).toBeNull();
    expect(parsePrivacyNotice(null)).toBeNull();
  });

  it('parses the consent_status() row', () => {
    const row = {
      current_version: '2026-11',
      accepted: true,
      age_band: 'under_16',
      parent_confirmation_pending: true,
    };
    expect(ConsentStatus.parse(row)).toEqual(row);
    expect(ConsentStatus.safeParse({ ...row, age_band: null }).success).toBe(true);
    expect(ConsentStatus.safeParse({ ...row, accepted: 'yes' }).success).toBe(false);
  });
});
