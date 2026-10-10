import { PROFILE_STORAGE_KEY } from '@/config/storage-config';
import { getDatabase, isIndexedDbAvailable, type MuscleAtlasDatabase } from '@/services/storage/db';
import {
  studyProgressSchema,
  type StudyProgress,
  REVIEW_INTERVALS_MS,
  REPEAT_INTERVAL_MS,
  MAX_BOX,
  UNASSISTED_SUCCESSES_REQUIRED,
  masteryBandFor,
  type MasteryBand,
} from '@/domain/progress/progress';
import { isUnassistedSuccess, type AnswerOutcome } from '@/domain/learning/learning';
import { readValidated, storageUnavailableProblem, type StorageProblem } from '@/services/storage/corrupted-store-recovery';

/**
 * Local-only learner identity.
 *
 * Not an account. A random identifier stored on the device so that progress can
 * be separated if the storage format ever grows a multi-profile shape. No
 * personal data, no network, no sync.
 */
export function getOrCreateProfileId(): string {
  try {
    const existing = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (existing !== null && existing.length > 0) return existing;
    const created = `profile.${crypto.randomUUID()}`;
    window.localStorage.setItem(PROFILE_STORAGE_KEY, created);
    return created;
  } catch {
    // Storage blocked (private browsing). A stable in-memory id keeps the app
    // working for this session; progress simply will not persist.
    return 'profile.session-only';
  }
}

/**
 * Per-structure study progress.
 *
 * All browser storage is behind this repository. UI components never touch
 * IndexedDB.
 */
export class ProgressRepository {
  constructor(
    private readonly db: MuscleAtlasDatabase = getDatabase(),
    private readonly profileId: string = getOrCreateProfileId(),
  ) {}

  async get(structureId: string): Promise<StudyProgress | null> {
    try {
      const record = await this.db.progress.get(structureId);
      if (!record) return null;
      const parsed = studyProgressSchema.safeParse(record);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async getAll(): Promise<StudyProgress[]> {
    const outcome = await readValidated(this.db.progress, (value) => {
      const parsed = studyProgressSchema.safeParse(value);
      return parsed.success ? parsed.data : null;
    }, 'progress');
    return outcome.ok ? outcome.value : [];
  }

  async put(record: StudyProgress): Promise<void> {
    const parsed = studyProgressSchema.parse(record);
    await this.db.progress.put(parsed);
  }

  async clear(): Promise<void> {
    await this.db.progress.clear();
  }

  get storageProblem(): StorageProblem | null {
    return isIndexedDbAvailable() ? null : storageUnavailableProblem('study progress');
  }

  getProfileId(): string {
    return this.profileId;
  }
}

/* ------------------------------------------------------------------ *
 * Progress mutation
 *
 * Pure functions so scheduling can be tested without a database. These are the
 * transparent rules from docs/00-design-brief.md section 6.
 * ------------------------------------------------------------------ */

export interface ScheduleInput {
  readonly previous: StudyProgress | null;
  readonly structureId: string;
  /**
   * Required when `previous` is null, so the very first answer for a structure
   * produces a record that validates. Without it the first question of every
   * round would fail to save.
   */
  readonly profileId?: string;
  readonly outcome: AnswerOutcome;
  readonly now: number;
  readonly packVersion: string;
  readonly viewId?: string;
  readonly questionType?: string;
}

/**
 * Fold one answer outcome into a structure's progress.
 *
 * - Correct and unassisted  → advance a box, lengthen the interval
 * - Assisted               → stay in the same box, return soon
 * - Revealed or incorrect  → back to box 1, return soon
 * - Skipped                → recorded, schedule unchanged
 */
export function applyOutcomeToProgress(input: ScheduleInput): StudyProgress {
  const { previous, structureId, outcome, now, packVersion } = input;

  const base: StudyProgress = previous ?? {
    profile_id: input.profileId ?? '',
    structure_id: structureId,
    attempts: 0,
    correct_attempts: 0,
    incorrect_attempts: 0,
    skipped_attempts: 0,
    assisted_attempts: 0,
    revealed_attempts: 0,
    last_seen_at: null,
    next_review_at: null,
    last_outcome: null,
    box: 1,
    correct_unassisted_streak: 0,
    mastery_score: 0,
    misconception_tags: [],
    preferred_view_performance: {},
    question_type_performance: {},
    content_version: packVersion,
    updated_at: now,
  };

  const next: StudyProgress = {
    ...base,
    structure_id: structureId,
    attempts: base.attempts + 1,
    last_seen_at: now,
    last_outcome: outcome,
    content_version: packVersion,
    updated_at: now,
  };

  let box = base.box;
  let streak = base.correct_unassisted_streak;
  let nextReviewAt: number;

  switch (outcome) {
    case 'correct': {
      next.correct_attempts = base.correct_attempts + 1;
      // The interval comes from the box the structure is in *now*; only then
      // does it advance. So a first success returns in ten minutes rather than
      // jumping straight to a full day.
      nextReviewAt = now + (REVIEW_INTERVALS_MS[box - 1] ?? REPEAT_INTERVAL_MS);
      box = Math.min(MAX_BOX, box + 1);
      streak = base.correct_unassisted_streak + 1;
      break;
    }
    case 'assisted': {
      next.assisted_attempts = base.assisted_attempts + 1;
      // The learner got there, but not unaided. Re-encounter sooner.
      nextReviewAt = now + REPEAT_INTERVAL_MS;
      break;
    }
    case 'revealed': {
      next.revealed_attempts = base.revealed_attempts + 1;
      nextReviewAt = now + REPEAT_INTERVAL_MS;
      box = 1;
      break;
    }
    case 'incorrect': {
      next.incorrect_attempts = base.incorrect_attempts + 1;
      nextReviewAt = now + REPEAT_INTERVAL_MS;
      box = 1;
      break;
    }
    case 'skipped': {
      next.skipped_attempts = base.skipped_attempts + 1;
      // A skip is recorded but the schedule is left exactly as it was.
      nextReviewAt = base.next_review_at ?? now + REPEAT_INTERVAL_MS;
      break;
    }
    case 'abandoned': {
      // Session-level outcome. Nothing is written per structure.
      return base;
    }
  }

  return {
    ...next,
    box,
    correct_unassisted_streak: streak,
    mastery_score: Math.min(1, streak / UNASSISTED_SUCCESSES_REQUIRED),
    next_review_at: nextReviewAt,
    preferred_view_performance: input.viewId
      ? updateViewPerformance(base.preferred_view_performance, input.viewId, outcome)
      : base.preferred_view_performance,
    question_type_performance: input.questionType
      ? updateQuestionTypePerformance(
          base.question_type_performance,
          input.questionType,
          outcome,
        )
      : base.question_type_performance,
  };
}

function updateViewPerformance(
  previous: StudyProgress['preferred_view_performance'],
  viewId: string,
  outcome: AnswerOutcome,
): StudyProgress['preferred_view_performance'] {
  const record = previous as Record<string, { attempts: number; correct: number }>;
  const current = record[viewId] ?? { attempts: 0, correct: 0 };
  return {
    ...previous,
    [viewId]: {
      attempts: current.attempts + 1,
      correct: current.correct + (isUnassistedSuccess(outcome) ? 1 : 0),
    },
  } as StudyProgress['preferred_view_performance'];
}

function updateQuestionTypePerformance(
  previous: StudyProgress['question_type_performance'],
  questionType: string,
  outcome: AnswerOutcome,
): StudyProgress['question_type_performance'] {
  const current = previous[questionType] ?? { attempts: 0, correct: 0 };
  return {
    ...previous,
    [questionType]: {
      attempts: current.attempts + 1,
      correct: current.correct + (isUnassistedSuccess(outcome) ? 1 : 0),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Calculations
 * ------------------------------------------------------------------ */

export interface AccuracySummary {
  readonly attempts: number;
  readonly unassistedCorrect: number;
  readonly incorrect: number;
  readonly assisted: number;
  readonly revealed: number;
  readonly skipped: number;
  /** Unassisted correct as a share of graded attempts (excluding skips). */
  readonly accuracy: number;
  readonly structuresSeen: number;
  readonly structuresAtReliableBand: number;
}

export function summariseProgress(records: readonly StudyProgress[]): AccuracySummary {
  let attempts = 0;
  let unassistedCorrect = 0;
  let incorrect = 0;
  let assisted = 0;
  let revealed = 0;
  let skipped = 0;
  let structuresAtReliableBand = 0;

  for (const record of records) {
    attempts += record.attempts;
    unassistedCorrect += record.correct_attempts;
    incorrect += record.incorrect_attempts;
    assisted += record.assisted_attempts;
    revealed += record.revealed_attempts;
    skipped += record.skipped_attempts;
    if (masteryBandFor(record.mastery_score).id !== 'new') {
      structuresAtReliableBand += 1;
    }
  }

  // Skipped attempts are not graded, so they leave the denominator.
  const graded = unassistedCorrect + incorrect + assisted + revealed;
  const accuracy = graded === 0 ? 0 : unassistedCorrect / graded;

  return {
    attempts,
    unassistedCorrect,
    incorrect,
    assisted,
    revealed,
    skipped,
    accuracy,
    structuresSeen: records.length,
    structuresAtReliableBand,
  };
}

export function bandForProgress(progress: StudyProgress): MasteryBand {
  return masteryBandFor(progress.mastery_score);
}
