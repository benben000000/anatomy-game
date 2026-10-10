import {
  masteryBandFor,
  REVIEW_REASON_TEXT,
  REVIEW_WEIGHTS,
  RECENT_ATTEMPT_WINDOW,
  type MasteryBand,
  type ReviewEntry,
  type ReviewReason,
  type StudyProgress,
} from '@/domain/progress/progress';

/**
 * Review prioritisation.
 *
 * A documented weighted sum, not a claim of adaptive intelligence. Every weight
 * is named, and every entry carries a plain-language reason so the learner is
 * told why something is in their review list rather than being handed an
 * unexplained ordering. See docs/00-design-brief.md rule LD-12.
 */

export interface ReviewInput {
  readonly progress: readonly StudyProgress[];
  /** Structures eligible to be asked, resolved by the caller. */
  readonly eligibleStructureIds: ReadonlySet<string>;
  readonly now: number;
  readonly limit?: number;
}

/**
 * Priority contributions.
 *
 * neverSeen            1.0   nothing recorded at all
 * incorrectRecently    0.9   missed within the last few attempts
 * revealedRecently     0.8   revealed rather than selected
 * skippedLastAttempt   0.6   skipped most recently
 * dueForReview         0.5   scaled by how overdue, capped at 14 days
 * unassistedStreak    -0.4   relief for structures already coming reliably
 */
export function computeReviewPriority(
  record: StudyProgress,
  now: number,
): { readonly priority: number; readonly reasons: readonly ReviewReason[] } {
  const reasons: ReviewReason[] = [];
  let priority = 0;

  if (record.attempts === 0) {
    priority += REVIEW_WEIGHTS.neverSeen;
    reasons.push({ code: 'never_seen', text: REVIEW_REASON_TEXT['never_seen'] });
  }

  if (record.incorrect_attempts > 0) {
    priority += REVIEW_WEIGHTS.incorrectRecently;
    reasons.push({ code: 'incorrect_recently', text: REVIEW_REASON_TEXT['incorrect_recently'] });
  }

  if (record.revealed_attempts > 0) {
    priority += REVIEW_WEIGHTS.revealedRecently;
    reasons.push({ code: 'revealed_recently', text: REVIEW_REASON_TEXT['revealed_recently'] });
  }

  if (record.last_outcome === 'skipped') {
    priority += REVIEW_WEIGHTS.skippedLastAttempt;
    reasons.push({ code: 'skipped_last', text: REVIEW_REASON_TEXT['skipped_last'] });
  }

  if (record.next_review_at !== null && record.next_review_at <= now) {
    const daysOverdue = (now - record.next_review_at) / 86_400_000;
    priority += REVIEW_WEIGHTS.overdue * Math.min(1, Math.max(0, daysOverdue / 14));
    reasons.push({ code: 'due_for_review', text: REVIEW_REASON_TEXT['due_for_review'] });
  }

  if (record.correct_unassisted_streak > 0) {
    priority += REVIEW_WEIGHTS.unassistedStreakRelief * (Math.min(record.correct_unassisted_streak, 3) / 3);
    reasons.push({ code: 'recently_stable', text: REVIEW_REASON_TEXT['recently_stable'] });
  }

  return { priority: Math.max(0, priority), reasons };
}

export function buildReviewList(input: ReviewInput): readonly ReviewEntry[] {
  const limit = input.limit ?? 20;

  const entries: ReviewEntry[] = [];

  for (const record of input.progress) {
    if (!input.eligibleStructureIds.has(record.structure_id)) continue;

    const { priority, reasons } = computeReviewPriority(record, input.now);
    if (priority <= 0) continue;

    entries.push({
      structureId: record.structure_id,
      priority,
      reasons,
      band: bandFor(record.mastery_score),
      progress: record,
    });
  }

  return entries.sort((a, b) => b.priority - a.priority).slice(0, limit);
}

/** Structures currently improving, by movement in the scheduler box. */
export function improvingStructures(
  progress: readonly StudyProgress[],
  limit = 10,
): readonly StudyProgress[] {
  return progress
    .filter((record) => record.box >= 2 && record.correct_unassisted_streak > 0)
    .sort((a, b) => b.mastery_score - a.mastery_score)
    .slice(0, limit);
}

/**
 * Structures with progress but no activity in the recent window.
 *
 * `RECENT_ATTEMPT_WINDOW` is exported for the progress screen so the window is
 * stated to the learner rather than implied.
 */
export { RECENT_ATTEMPT_WINDOW };

function bandFor(score: number): MasteryBand {
  return masteryBandFor(score);
}
