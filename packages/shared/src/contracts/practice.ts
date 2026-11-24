import { z } from 'zod';

/** Matches the database limit on set size (`app_config.max_set_size`, checked again on the server). */
export const MAX_SET_SIZE = 50;
export const OPTION_COUNT = 5;

export const uuid = z.string().uuid();
export const optionNumber = z.number().int().min(1).max(OPTION_COUNT);
export const difficulty = z.union([z.literal(1), z.literal(2), z.literal(3)]);

// get_practice_set ---------------------------------------------------------------

export const GetPracticeSetRequest = z
  .object({
    unit_id: uuid,
    size: z.number().int().min(1).max(MAX_SET_SIZE).default(10),
  })
  .strict();

/**
 * A question as served to a student. Deliberately has no answer or explanation:
 * `.strict()` makes parsing fail if the server ever leaks extra fields.
 */
export const ServedItem = z
  .object({
    item_id: uuid,
    position: z.number().int().min(1).max(MAX_SET_SIZE),
    stem: z.string().min(1),
    options: z.array(z.string()).length(OPTION_COUNT),
    diagram_path: z.string().nullable(),
    difficulty,
  })
  .strict();

export const GetPracticeSetResponse = z
  .object({
    set_id: uuid,
    premium: z.boolean(),
    items: z.array(ServedItem).max(MAX_SET_SIZE),
  })
  .strict();

// submit_answer ------------------------------------------------------------------

export const SubmitAnswerRequest = z
  .object({
    item_id: uuid,
    selected: optionNumber,
  })
  .strict();

export const Explanation = z
  .object({
    steps: z.array(z.string()).optional(),
    theory: z.string().optional(),
    wrong_options: z.record(z.string(), z.string()).optional(),
    what_if: z.array(z.string()).optional(),
  })
  .passthrough();

export const SubmitAnswerResponse = z
  .object({
    is_correct: z.boolean(),
    correct_option: optionNumber,
    explanation: Explanation,
  })
  .strict();

// report_error -------------------------------------------------------------------

export const ErrorReason = z.enum(['wrong_answer', 'unclear_explanation', 'other']);

export const ReportErrorRequest = z
  .object({
    item_id: uuid,
    reason: ErrorReason,
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export type GetPracticeSetRequest = z.input<typeof GetPracticeSetRequest>;
export type GetPracticeSetResponse = z.infer<typeof GetPracticeSetResponse>;
export type ServedItem = z.infer<typeof ServedItem>;
export type SubmitAnswerRequest = z.infer<typeof SubmitAnswerRequest>;
export type SubmitAnswerResponse = z.infer<typeof SubmitAnswerResponse>;
export type ReportErrorRequest = z.infer<typeof ReportErrorRequest>;
