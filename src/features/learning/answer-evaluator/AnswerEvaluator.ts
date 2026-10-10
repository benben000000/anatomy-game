import {
  answerOutcomeSchema,
  quizSessionSchema,
  type AnswerOutcome,
  type AnswerRecord,
  type HintLevel,
  type Question,
  type QuizMode,
  type QuizSession,
  type QuizSessionConfig,
  type ViewFilter,
} from '@/domain/learning/learning';
import { LEARNING_CONFIG } from '@/config/learning-config';

/**
 * Answer evaluation.
 *
 * This is the only place that decides whether an answer was right. It compares
 * stable structure identifiers and knows nothing about SVG, canvas, 3D, or which
 * renderer produced the selection. The board reports; this decides.
 */

export interface EvaluationInput {
  readonly question: Question;
  readonly selectedStructureId: string | null;
  readonly hintsUsed: readonly HintLevel[];
  readonly elapsedMs: number;
  readonly packVersion: string;
  readonly now: number;
  /** Region ids of the question, carried onto the record for review. */
  readonly regionIds: readonly string[];
  readonly revealHintLevel: HintLevel;
}

export interface EvaluationResult {
  readonly record: AnswerRecord;
  readonly outcome: AnswerOutcome;
  readonly isUnassisted: boolean;
}

/**
 * Outcome rules.
 *
 * - Selecting the target with no hints is `correct`.
 * - Selecting the target after a non-revealing hint is `assisted`.
 * - Revealing the answer is `revealed`, whatever else happened.
 * - Selecting something else is `incorrect`.
 * - No selection is `skipped`.
 *
 * A revealed answer can never be `correct`, so a reveal can never be counted as
 * an unassisted success (design brief rule LD-8).
 */
export function evaluateAnswer(input: EvaluationInput): EvaluationResult {
  const revealed = input.hintsUsed.includes(input.revealHintLevel);
  const selected = input.selectedStructureId;

  let outcome: AnswerOutcome;
  if (selected === null) {
    outcome = 'skipped';
  } else if (revealed) {
    outcome = 'revealed';
  } else if (selected === input.question.structure_id) {
    outcome = input.hintsUsed.length > 0 ? 'assisted' : 'correct';
  } else {
    outcome = 'incorrect';
  }

  const record: AnswerRecord = {
    question_id: input.question.question_id,
    structure_id: input.question.structure_id,
    selected_structure_id: selected,
    outcome: answerOutcomeSchema.parse(outcome),
    hints_used: [...input.hintsUsed],
    elapsed_ms: Math.max(0, Math.round(input.elapsedMs)),
    view_id: input.question.view_id,
    region_ids: [...input.regionIds],
    question_type: input.question.prompt_format,
    pack_version: input.packVersion,
    recorded_at: input.now,
  };

  return { record, outcome, isUnassisted: outcome === 'correct' };
}

/* ------------------------------------------------------------------ *
 * Results
 * ------------------------------------------------------------------ */

export interface SessionSummary {
  readonly sessionId: string;
  readonly total: number;
  readonly correct: number;
  readonly incorrect: number;
  readonly assisted: number;
  readonly revealed: number;
  readonly skipped: number;
  /** Unassisted correct as a share of graded attempts. Skips do not count. */
  readonly accuracy: number;
  readonly durationMs: number;
  readonly reviewTargets: readonly string[];
}

export function summariseSession(session: QuizSession): SessionSummary {
  const counts: Record<string, number> = {
    correct: 0,
    incorrect: 0,
    assisted: 0,
    revealed: 0,
    skipped: 0,
  };

  const reviewTargets = new Set<string>();

  for (const record of session.records) {
    const key: string = record.outcome;
    if (key in counts) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
    if (record.outcome !== 'correct') reviewTargets.add(record.structure_id);
  }

  const correct = counts['correct'] ?? 0;
  const incorrect = counts['incorrect'] ?? 0;
  const assisted = counts['assisted'] ?? 0;
  const revealed = counts['revealed'] ?? 0;
  const skipped = counts['skipped'] ?? 0;

  const graded = correct + incorrect + assisted + revealed;
  const endedAt = session.ended_at ?? session.started_at;

  return {
    sessionId: session.session_id,
    total: session.records.length,
    correct,
    incorrect,
    assisted,
    revealed,
    skipped,
    accuracy: graded === 0 ? 0 : correct / graded,
    durationMs: Math.max(0, endedAt - session.started_at),
    reviewTargets: [...reviewTargets],
  };
}

/* ------------------------------------------------------------------ *
 * Session construction
 * ------------------------------------------------------------------ */

export interface BuildSessionInput {
  readonly sessionId: string;
  readonly profileId: string;
  readonly mode: QuizMode;
  readonly config: QuizSessionConfig;
  readonly poolStructureIds: readonly string[];
  readonly packVersion: string;
  readonly now: number;
  /** Deterministic ordering for tests; omit for random. */
  readonly rng?: (() => number) | undefined;
}
export function buildSession(input: BuildSessionInput): QuizSession {
  const queue = orderQueue(input.poolStructureIds, input.rng);
  const target = LEARNING_CONFIG.preventImmediateRepeat ? input.config.target_size : queue.length;

  return quizSessionSchema.parse({
    session_id: input.sessionId,
    profile_id: input.profileId,
    config: {
      ...input.config,
      target_size: Math.min(target, queue.length),
    },
    pool_structure_ids: [...input.poolStructureIds],
    queue,
    records: [],
    current_question_id: null,
    status: 'in_progress',
    started_at: input.now,
    ended_at: null,
    pack_version: input.packVersion,
    schema_version: 1,
  });
}

/**
 * Shuffle without immediate repeats.
 *
 * Rule LD-5: the same structure must not appear twice in a row in standard
 * practice. Review mode may repeat intentionally, so it builds its pool
 * elsewhere and does not come through here.
 *
 * A naive "swap the duplicate forward" fix is not sufficient — it can create a
 * new adjacent duplicate at the swap position. This instead places the most
 * frequent structures into alternating slots, which produces an arrangement
 * with no two adjacent equal entries whenever that is possible at all, i.e.
 * whenever no structure occupies more than half the queue rounded up.
 */
export function orderQueue(structureIds: readonly string[], rng: (() => number) | undefined): string[] {
  const random = rng ?? Math.random;

  const counts = new Map<string, number>();
  for (const id of structureIds) counts.set(id, (counts.get(id) ?? 0) + 1);

  const groups = [...counts.entries()].map(([id, count]) => ({ id, count }));

  // Randomise the order of equally frequent groups so rounds differ between
  // sessions, then sort by frequency. Array.prototype.sort is stable, so the
  // randomised order survives for ties.
  for (let i = groups.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = groups[i];
    const b = groups[j];
    if (a === undefined || b === undefined) continue;
    groups[i] = b;
    groups[j] = a;
  }
  groups.sort((a, b) => b.count - a.count);

  const length = structureIds.length;
  if (length === 0) return [];

  const largest = groups[0]?.count ?? 0;
  if (largest > Math.ceil(length / 2)) {
    // Repeats are unavoidable: one structure fills more than half the queue.
    // Emit it plainly rather than pretending the constraint was met.
    return structureIds.flatMap(() => groups.map((group) => group.id)).slice(0, length);
  }

  // Even slots first, then odd slots.
  const slots: number[] = [];
  for (let i = 0; i < length; i += 2) slots.push(i);
  for (let i = 1; i < length; i += 2) slots.push(i);

  const result = new Array<string>(length);
  let cursor = 0;
  for (const group of groups) {
    for (let i = 0; i < group.count; i += 1) {
      const slot = slots[cursor];
      if (slot === undefined) break;
      result[slot] = group.id;
      cursor += 1;
    }
  }

  return result;
}

/** How a view filter maps onto a concrete view for a question. */
export function viewForFilter(viewFilter: ViewFilter, structureViews: readonly string[]): string {
  if (viewFilter !== 'mixed') return viewFilter;
  const [first] = structureViews;
  return first ?? 'anterior';
}
