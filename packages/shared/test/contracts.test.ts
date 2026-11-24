import {
  GetPracticeSetRequest,
  GetPracticeSetResponse,
  ReportErrorRequest,
  SubmitAnswerRequest,
  SubmitAnswerResponse,
  toErrorCode,
  ERROR_CODES,
  ERROR_STATUS,
  businessDate,
  maskPhone,
} from '../src/index.ts';

const ID = '11111111-1111-4111-8111-111111111111';

const servedItem = {
  item_id: ID,
  position: 1,
  stem: 'A ball is thrown up at 20 m/s. Maximum height?',
  options: ['10 m', '20 m', '40 m', '2 m', '200 m'],
  diagram_path: null,
  difficulty: 1,
};

describe('GetPracticeSetRequest', () => {
  it('defaults size to 10', () => {
    expect(GetPracticeSetRequest.parse({ unit_id: ID }).size).toBe(10);
  });

  it.each([0, 51, 2.5])('rejects size %p', (size) => {
    expect(GetPracticeSetRequest.safeParse({ unit_id: ID, size }).success).toBe(false);
  });

  it('rejects unknown fields so clients cannot smuggle flags', () => {
    expect(GetPracticeSetRequest.safeParse({ unit_id: ID, premium: true }).success).toBe(false);
  });
});

describe('GetPracticeSetResponse', () => {
  it('accepts a served set without answers', () => {
    const parsed = GetPracticeSetResponse.parse({
      set_id: ID,
      premium: false,
      items: [servedItem],
    });
    expect(parsed.items).toHaveLength(1);
  });

  it('fails if an answer leaks into a served item', () => {
    const leaked = { ...servedItem, correct_option: 2 };
    expect(
      GetPracticeSetResponse.safeParse({ set_id: ID, premium: false, items: [leaked] }).success,
    ).toBe(false);
  });

  it('requires exactly five options', () => {
    const four = { ...servedItem, options: ['a', 'b', 'c', 'd'] };
    expect(
      GetPracticeSetResponse.safeParse({ set_id: ID, premium: false, items: [four] }).success,
    ).toBe(false);
  });
});

describe('SubmitAnswerRequest / Response', () => {
  it.each([0, 6, 1.5])('rejects option %p', (selected) => {
    expect(SubmitAnswerRequest.safeParse({ item_id: ID, selected }).success).toBe(false);
  });

  it('accepts a graded answer', () => {
    const r = SubmitAnswerResponse.parse({
      is_correct: false,
      correct_option: 2,
      explanation: { theory: 'v² = u² − 2gs' },
    });
    expect(r.correct_option).toBe(2);
  });
});

describe('ReportErrorRequest', () => {
  it('limits note length', () => {
    expect(
      ReportErrorRequest.safeParse({ item_id: ID, reason: 'other', note: 'x'.repeat(501) }).success,
    ).toBe(false);
  });
});

describe('error codes', () => {
  it('passes through known codes raised by SQL functions', () => {
    expect(toErrorCode({ message: 'daily_limit_reached' })).toBe('daily_limit_reached');
  });

  it('hides anything else behind internal', () => {
    expect(
      toErrorCode({ message: 'duplicate key value violates unique constraint "attempts_pkey"' }),
    ).toBe('internal');
    expect(toErrorCode(null)).toBe('internal');
  });

  it('gives every code an HTTP status', () => {
    for (const code of ERROR_CODES) expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
  });
});

describe('locale helpers', () => {
  it('uses the Colombo business day (UTC+5:30)', () => {
    expect(businessDate(new Date('2026-11-24T18:29:00Z'))).toBe('2026-11-24');
    expect(businessDate(new Date('2026-11-24T18:31:00Z'))).toBe('2026-11-25');
  });

  it('masks phone numbers', () => {
    expect(maskPhone('+94771234567')).toBe('+94*******67');
    expect(maskPhone('0771234567')).toBe('*******67');
    expect(maskPhone('123')).toBe('***');
  });
});
