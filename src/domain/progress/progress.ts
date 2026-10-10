import { z } from 'zod';
import { viewIdSchema } from '@/domain/anatomy/ids';
import { answerOutcomeSchema } from '@/domain/learning/learning';

/**
 * Progress and review scheduling.
 *
 * The scheduling rules here are deliberately simple, documented and inspectable.
 * They are described to the learner in plain language. Nothing in this file is
 * described as adaptive, personalised, or AI-driven, because it is none of
 * those things — see docs/00-design-brief.md rule LD-12.
 */

export const viewPerformanceSchema = z.object({
  attempts: z.number().int().min(0),
  correct: z.number().int().min(0),
});
export type ViewPerformance = z.infer<typeof viewPerformanceSchema>;

export const questionTypePerformanceSchema = z.object({
  attempts: z.number().int().min(0),
  correct: z.number().int().min(0),
});
export type QuestionTypePerformance = z.infer<typeof questionTypePerformanceSchema>;

export const studyProgressSchema = z
  .object({
    profile_id: z.string().min(1),
    structure_id: z.string().min(1),

    attempts: z.number().int().min(0).default(0),
    correct_attempts: z.number().int().min(0).default(0),
    incorrect_attempts: z.number().int().min(0).default(0),
    skipped_attempts: z.number().int().min(0).default(0),
    assisted_attempts: z.number().int().min(0).default(0),
    revealed_attempts: z.number().int().min(0).default(0),

    last_seen_at: z.number().int().nonnegative().nullable().default(null),
    next_review_at: z.number().int().nonnegative().nullable().default(null),
    last_outcome: answerOutcomeSchema.nullable().default(null),

    box: z.number().int().min(1).max(5).default(1),
    correct_unassisted_streak: z.number().int().min(0).default(0),
    mastery_score: z.number().min(0).max(1).default(0),

    misconception_tags: z.array(z.string().min(2).max(60)).default([]),
    preferred_view_performance: z.record(viewIdSchema, viewPerformanceSchema).default({}),
    question_type_performance: z
      .record(z.string(), questionTypePerformanceSchema)
      .default({}),
    content_version: z.string().min(5),
    updated_at: z.number().int().nonnegative().default(0),
  })
  .superRefine((progress, ctx) => {
    const tallied =
      progress.correct_attempts +
      progress.incorrect_attempts +
      progress.skipped_attempts +
      progress.assisted_attempts +
      progress.revealed_attempts;
    if (tallied > progress.attempts) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['attempts'],
        message: `Outcome tallies (${tallied}) exceed total attempts (${progress.attempts}).`,
      });
    }
    if (progress.correct_unassisted_streak > progress.correct_attempts) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['correct_unassisted_streak'],
        message: 'Unassisted streak cannot exceed total correct attempts.',
      });
    }
  });

export type StudyProgress = z.infer<typeof studyProgressSchema>;

/* ------------------------------------------------------------------ *
 * Mastery bands
 *
 * The word "mastered" is never used. High priority requires several unassisted
 * successes across separate sessions; one correct answer is not mastery.
 * ------------------------------------------------------------------ */

export const MASTERY_BANDS = [
  { id: 'new', label: 'New', wording: 'Not seen yet' },
  { id: 'learning', label: 'Learning', wording: 'Seen a few times' },
  { id: 'consolidating', label: 'Consolidating', wording: 'Recalled correctly without hints, a few times' },
  { id: 'reliable', label: 'Reliable', wording: 'Recalled unassisted across several sessions' },
  { id: 'reliable_plus', label: 'Reliable', wording: 'Recalled unassisted repeatedly over time' },
] as const;

export type MasteryBandId = (typeof MASTERY_BANDS)[number]['id'];

export interface MasteryBand {
  readonly id: MasteryBandId;
  readonly label: string;
  readonly wording: string;
}

/** Unassisted successes required before the highest band is shown. */
export const UNASSISTED_SUCCESSES_REQUIRED = 3;

export function masteryBandFor(score: number): MasteryBand {
  if (score >= 1) return MASTERY_BANDS[4];
  if (score >= 0.67) return MASTERY_BANDS[3];
  if (score >= 0.34) return MASTERY_BANDS[2];
  if (score > 0) return MASTERY_BANDS[1];
  return MASTERY_BANDS[0];
}

/* ------------------------------------------------------------------ *
 * Scheduling
 * ------------------------------------------------------------------ */

export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;

/** Interval in milliseconds for each Leitner box. Index 0 is box 1. */
export const REVIEW_INTERVALS_MS: readonly number[] = [
  10 * MINUTE_MS, // box 1
  1 * DAY_MS, // box 2
  3 * DAY_MS, // box 3
  7 * DAY_MS, // box 4
  21 * DAY_MS, // box 5
];

export const REPEAT_INTERVAL_MS = 10 * MINUTE_MS;
export const MAX_BOX = 5;

/* ------------------------------------------------------------------ *
 * Review priority — a documented weighted sum, surfaced in plain language
 * ------------------------------------------------------------------ */

export const REVIEW_WEIGHTS = {
  neverSeen: 1.0,
  incorrectRecently: 0.9,
  revealedRecently: 0.8,
  skippedLastAttempt: 0.6,
  overdue: 0.5,
  unassistedStreakRelief: -0.4,
} as const;

export const RECENT_ATTEMPT_WINDOW = 5;

export type ReviewReasonCode =
  | 'never_seen'
  | 'incorrect_recently'
  | 'revealed_recently'
  | 'skipped_last'
  | 'due_for_review'
  | 'recently_stable';

export interface ReviewReason {
  readonly code: ReviewReasonCode;
  readonly text: string;
}

export interface ReviewEntry {
  readonly structureId: string;
  readonly priority: number;
  readonly reasons: readonly ReviewReason[];
  readonly band: MasteryBand;
  readonly progress: StudyProgress;
}

export const REVIEW_REASON_TEXT: Record<ReviewReasonCode, string> = {
  never_seen: 'Not seen yet.',
  incorrect_recently: 'You missed this in a recent session.',
  revealed_recently: 'You revealed this instead of selecting it.',
  skipped_last: 'You skipped this last time.',
  due_for_review: 'Due for another look.',
  recently_stable: 'Coming up for review.',
};
