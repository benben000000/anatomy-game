import { z } from 'zod';
import { viewIdSchema } from '@/domain/anatomy/ids';
import { structureTypeSchema } from '@/domain/content/content-status';
import type { contentStatusSchema } from '@/domain/content/content-status';

/**
 * Learning domain: outcomes, questions, sessions.
 *
 * This module contains no muscle names and no React. It must remain usable by
 * a future skeletal-system content pack, a future canvas board, and a future 3D
 * board without modification.
 */

/* ------------------------------------------------------------------ *
 * Hints and prompt formats
 *
 * Declared first because `answerRecordSchema` references them.
 * ------------------------------------------------------------------ */

export const hintLevelSchema = z.enum(['region', 'approximate_area', 'reveal']);
export type HintLevel = z.infer<typeof hintLevelSchema>;

export const HINT_LEVEL_ORDER: readonly HintLevel[] = ['region', 'approximate_area', 'reveal'];

export const questionTemplatePromptSchema = z.enum([
  'locate_named_structure',
  'identify_highlighted_structure',
  'which_structure_performs_action',
  'select_correct_label',
  'compare_nearby_structures',
  'type_structure_name',
  'identify_body_region',
  'identify_origin_insertion',
  'identify_innervation',
  'layer_comparison',
]);
export type QuestionPromptFormat = z.infer<typeof questionTemplatePromptSchema>;

/* ------------------------------------------------------------------ *
 * Outcomes
 * ------------------------------------------------------------------ */

export const answerOutcomeSchema = z.enum([
  'correct', // correct and unassisted
  'incorrect',
  'skipped',
  'revealed', // answer was shown by a reveal hint
  'assisted', // correct after a non-revealing hint
  'abandoned', // session ended before an answer was committed
]);
export type AnswerOutcome = z.infer<typeof answerOutcomeSchema>;

/** Outcomes that count as an unassisted success for scheduling purposes. */
export const UNASSISTED_SUCCESS: readonly AnswerOutcome[] = ['correct'];

/** Outcomes that mean the learner did not recall the target unaided. */
export const NEEDS_REVIEW_OUTCOMES: readonly AnswerOutcome[] = [
  'incorrect',
  'revealed',
  'assisted',
  'skipped',
];

export const answerRecordSchema = z.object({
  question_id: z.string().min(1),
  structure_id: z.string().min(1),
  selected_structure_id: z.string().min(1).nullable(),
  outcome: answerOutcomeSchema,
  hints_used: z.array(z.enum(['region', 'approximate_area', 'reveal'])).default([]),
  elapsed_ms: z.number().int().nonnegative(),
  view_id: viewIdSchema,
  region_ids: z.array(z.string().min(1)).default([]),
  question_type: questionTemplatePromptSchema,
  pack_version: z.string().min(5),
  recorded_at: z.number().int().nonnegative(),
});
export type AnswerRecord = z.infer<typeof answerRecordSchema>;

/* ------------------------------------------------------------------ *
 * Hint policy
 * ------------------------------------------------------------------ */

/** Hints are unlimited and free. See docs/00-design-brief.md rule LD-8. */
export const HINT_POLICY = {
  unlimited: true,
  cost: 'none',
  levels: HINT_LEVEL_ORDER,
} as const;

/** Level 3 reveals the answer, so it is never counted as a success. */
export const REVEALING_HINT_LEVEL: HintLevel = 'reveal';

/* ------------------------------------------------------------------ *
 * Question templates
 * ------------------------------------------------------------------ */

export const questionTemplateSchema = z.object({
  template_id: z.string().min(1),
  mode: z.enum(['explore', 'identify', 'learn_then_test', 'review', 'timed_challenge']),
  prompt_format: questionTemplatePromptSchema,
  expected_answer_type: z.enum(['structure_id', 'text']),
  valid_structure_types: z.array(structureTypeSchema).min(1),
  required_visual_representation: z.enum(['any_selectable', 'svg_only']),
  difficulty_range: z.tuple([
    z.enum(['introductory', 'intermediate', 'advanced']),
    z.enum(['introductory', 'intermediate', 'advanced']),
  ]),
  allowed_views: z.array(viewIdSchema).min(1),
  distractor_rules: z.object({
    mode: z.enum(['none', 'spatial_neighbours', 'same_region', 'confusable_pairs']),
    max_confusability_risk: z.number().min(0).max(1).default(0),
  }),
  hint_policy: z.object({
    levels: z.array(hintLevelSchema).default([...HINT_LEVEL_ORDER]),
    unlimited: z.literal(true).default(true),
    cost: z.literal('none').default('none'),
  }),
  explanation_policy: z.enum([
    'function_summary',
    'location_summary',
    'distinction_note',
    'combined',
  ]),
  /** Only `locate_named_structure` ships in v1. Others are architecture. */
  implemented: z.boolean().default(false),
});
export type QuestionTemplate = z.infer<typeof questionTemplateSchema>;

export const questionTemplatesFileSchema = z.object({
  $schema: z.string().optional(),
  system_id: z.string().min(1),
  content_version: z.string().min(5),
  templates: z.array(questionTemplateSchema),
});

/* ------------------------------------------------------------------ *
 * Questions and pools
 * ------------------------------------------------------------------ */

export const quizModeSchema = z.enum([
  'identify',
  'learn_then_test',
  'review',
  'timed_challenge',
]);
export type QuizMode = z.infer<typeof quizModeSchema>;

export const viewFilterSchema = z.enum(['anterior', 'posterior', 'mixed']);
export type ViewFilter = z.infer<typeof viewFilterSchema>;

export const questionSchema = z.object({
  question_id: z.string().min(1),
  structure_id: z.string().min(1),
  /** The view the target must be located in for this question. */
  view_id: viewIdSchema,
  region_ids: z.array(z.string().min(1)).min(1),
  difficulty_tier: z.enum(['introductory', 'intermediate', 'advanced']),
  prompt_format: questionTemplatePromptSchema,
  pack_version: z.string().min(5),
});
export type Question = z.infer<typeof questionSchema>;

export interface EligibilityCriteria {
  readonly systemId: string;
  readonly viewFilter: ViewFilter;
  readonly regionIds: readonly string[];
  readonly difficultyTiers: readonly string[];
  readonly availableStructureIds: ReadonlySet<string>;
  /** Structures the learner must not see again in this round. */
  readonly excludeStructureIds?: ReadonlySet<string>;
}

/* ------------------------------------------------------------------ *
 * Sessions
 * ------------------------------------------------------------------ */

export const roundSizeSchema = z.number().int().min(1).max(200);

export const quizSessionConfigSchema = z.object({
  mode: quizModeSchema,
  view_filter: viewFilterSchema.default('anterior'),
  region_ids: z.array(z.string().min(1)).default([]),
  difficulty_tiers: z
    .array(z.enum(['introductory', 'intermediate', 'advanced']))
    .default([]),
  target_size: roundSizeSchema,
  /** Structures the learner chose explicitly (Learn Then Test). */
  focus_structure_ids: z.array(z.string().min(1)).default([]),
  /** Seconds per question; only for the optional timed challenge. */
  time_limit_seconds: z.number().int().positive().nullable().default(null),
});
export type QuizSessionConfig = z.infer<typeof quizSessionConfigSchema>;

export const quizSessionSchema = z.object({
  session_id: z.string().min(1),
  profile_id: z.string().min(1),
  config: quizSessionConfigSchema,
  pool_structure_ids: z.array(z.string().min(1)).min(1),
  queue: z.array(z.string().min(1)).default([]),
  records: z.array(answerRecordSchema).default([]),
  current_question_id: z.string().min(1).nullable().default(null),
  status: z.enum(['in_progress', 'completed', 'abandoned']),
  started_at: z.number().int().nonnegative(),
  ended_at: z.number().int().nonnegative().nullable().default(null),
  pack_version: z.string().min(5),
  schema_version: z.literal(1).default(1),
});
export type QuizSession = z.infer<typeof quizSessionSchema>;

/** Outcomes that leave a session incomplete. */
export const INCOMPLETE_OUTCOMES: readonly AnswerOutcome[] = ['skipped', 'abandoned'];

export function isUnassistedSuccess(outcome: AnswerOutcome): boolean {
  return UNASSISTED_SUCCESS.includes(outcome);
}

export function needsReview(outcome: AnswerOutcome): boolean {
  return NEEDS_REVIEW_OUTCOMES.includes(outcome);
}

export const CONTENT_STATUSES_FOR_QUESTIONS: readonly z.infer<typeof contentStatusSchema>[] = [
  'published',
];
