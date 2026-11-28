import { hoursUntilReset, nextBusinessDayStart } from '../src/index.ts';

describe('ST-59 daily reset time (Asia/Colombo midnight, used by daily limits)', () => {
  it('is the next midnight in Sri Lanka', () => {
    // 2026-11-28 17:30 in Colombo = 12:00 UTC
    const now = new Date('2026-11-28T12:00:00Z');
    expect(nextBusinessDayStart(now).toISOString()).toBe('2026-11-28T18:30:00.000Z');
  });

  it('just after midnight in Colombo it is the following midnight', () => {
    const now = new Date('2026-11-28T18:31:00Z'); // 00:01 on the 29th in Colombo
    expect(nextBusinessDayStart(now).toISOString()).toBe('2026-11-29T18:30:00.000Z');
  });

  it('exactly at midnight the reset is the next day (today has just started)', () => {
    const now = new Date('2026-11-28T18:30:00Z');
    expect(nextBusinessDayStart(now).toISOString()).toBe('2026-11-29T18:30:00.000Z');
  });

  it('hours until reset round up, never 0 before the reset', () => {
    expect(hoursUntilReset(new Date('2026-11-28T12:00:00Z'))).toBe(7); // 6.5 h → 7
    expect(hoursUntilReset(new Date('2026-11-28T18:29:30Z'))).toBe(1);
  });
});
