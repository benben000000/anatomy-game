import { describe, expect, it } from 'vitest';
import {
  buildReviewList,
  computeReviewPriority,
  improvingStructures,
} from '@/features/learning/study-scheduler/ReviewPriority';
import { applyOutcomeToProgress, summariseProgress, bandForProgress } from '@/features/progress/repositories/ProgressRepository';
import { studyProgressSchema, type StudyProgress } from '@/domain/progress/progress';

const NOW = 1_700_000_000_000;

function progress(overrides: Partial<StudyProgress> = {}): StudyProgress {
  return studyProgressSchema.parse({
    profile_id: 'profile.test',
    structure_id: 'muscular.test',
    attempts: 0,
    content_version: '1.0.0',
    ...overrides,
  });
}

describe('applyOutcomeToProgress', () => {
  it('starts a fresh record on the first attempt', () => {
    const next = applyOutcomeToProgress({
      previous: null,
      profileId: 'profile.test',
      structureId: 'muscular.biceps_brachii',
      outcome: 'correct',
      now: NOW,
      packVersion: '1.0.0',
    });

    expect(next.structure_id).toBe('muscular.biceps_brachii');
    expect(next.attempts).toBe(1);
    expect(next.correct_attempts).toBe(1);
    expect(next.box).toBe(2);
  });

  it('lengthens the interval after each unassisted success', () => {
    let state = progress();
    const intervals: number[] = [];

    for (let i = 0; i < 5; i += 1) {
      state = applyOutcomeToProgress({
        previous: state,
        structureId: state.structure_id,
        outcome: 'correct',
        now: NOW,
        packVersion: '1.0.0',
      });
      intervals.push((state.next_review_at ?? 0) - NOW);
    }

    // Ten minutes, one day, three days, seven days, then capped at twenty-one.
    expect(intervals).toEqual([
      10 * 60_000,
      86_400_000,
      3 * 86_400_000,
      7 * 86_400_000,
      21 * 86_400_000,
    ]);
  });

  it('caps the box at five so intervals cannot grow without bound', () => {
    let state = progress({ attempts: 5, correct_attempts: 5, correct_unassisted_streak: 5, box: 5, mastery_score: 1 });
    state = applyOutcomeToProgress({
      previous: state,
      structureId: state.structure_id,
      outcome: 'correct',
      now: NOW,
      packVersion: '1.0.0',
    });
    expect(state.box).toBe(5);
  });

  it('brings an assisted answer back sooner without demoting it as far as a miss', () => {
    const previous = progress({ box: 4, attempts: 4, correct_attempts: 4 });
    const next = applyOutcomeToProgress({
      previous,
      structureId: previous.structure_id,
      outcome: 'assisted',
      now: NOW,
      packVersion: '1.0.0',
    });

    expect(next.assisted_attempts).toBe(1);
    expect(next.correct_attempts).toBe(4);
    // The box is held, not lowered, but the structure returns soon.
    expect(next.box).toBe(4);
    expect((next.next_review_at ?? 0) - NOW).toBe(10 * 60_000);
  });

  it('sends a revealed answer back to the first box', () => {
    const previous = progress({ box: 4, attempts: 4, correct_attempts: 4 });
    const next = applyOutcomeToProgress({
      previous,
      structureId: previous.structure_id,
      outcome: 'revealed',
      now: NOW,
      packVersion: '1.0.0',
    });

    expect(next.revealed_attempts).toBe(1);
    expect(next.box).toBe(1);
    expect(next.next_review_at).toBe(NOW + 10 * 60_000);
  });

  it('sends an incorrect answer back to the first box', () => {
    const previous = progress({ box: 5, attempts: 5, correct_attempts: 5 });
    const next = applyOutcomeToProgress({
      previous,
      structureId: previous.structure_id,
      outcome: 'incorrect',
      now: NOW,
      packVersion: '1.0.0',
    });
    expect(next.box).toBe(1);
    expect(next.incorrect_attempts).toBe(1);
  });

  it('records a skip without changing the schedule', () => {
    const previous = progress({ box: 3, attempts: 3, next_review_at: NOW + 500_000 });
    const next = applyOutcomeToProgress({
      previous,
      structureId: previous.structure_id,
      outcome: 'skipped',
      now: NOW,
      packVersion: '1.0.0',
    });

    expect(next.skipped_attempts).toBe(1);
    expect(next.box).toBe(3);
    expect(next.next_review_at).toBe(previous.next_review_at);
  });

  it('changes nothing on abandon', () => {
    const previous = progress({ box: 3, attempts: 3 });
    const next = applyOutcomeToProgress({
      previous,
      structureId: previous.structure_id,
      outcome: 'abandoned',
      now: NOW,
      packVersion: '1.0.0',
    });
    expect(next).toBe(previous);
  });

  it('never reaches the top band from a single success', () => {
    const next = applyOutcomeToProgress({
      previous: null,
      profileId: 'profile.test',
      structureId: 'muscular.test',
      outcome: 'correct',
      now: NOW,
      packVersion: '1.0.0',
    });

    expect(next.mastery_score).toBeLessThan(1);
    expect(bandForProgress(next).id).not.toBe('reliable_plus');
    expect(bandForProgress(next).wording).not.toContain('mastered');
  });

  it('reaches the top band only after several unassisted successes', () => {
    let state = progress();
    for (let i = 0; i < 3; i += 1) {
      state = applyOutcomeToProgress({
        previous: state,
        structureId: state.structure_id,
        outcome: 'correct',
        now: NOW,
        packVersion: '1.0.0',
      });
    }
    expect(state.mastery_score).toBe(1);
    expect(bandForProgress(state).id).toBe('reliable_plus');
  });

  it('tracks per-view performance separately', () => {
    const state = applyOutcomeToProgress({
      previous: null,
      profileId: 'profile.test',
      structureId: 'muscular.test',
      outcome: 'correct',
      now: NOW,
      packVersion: '1.0.0',
      viewId: 'anterior',
      questionType: 'locate_named_structure',
    });

    const viewPerformance = state.preferred_view_performance as Record<string, unknown>;
    expect(viewPerformance['anterior']).toEqual({ attempts: 1, correct: 1 });
    expect(state.question_type_performance['locate_named_structure']).toEqual({
      attempts: 1,
      correct: 1,
    });
  });
});

describe('computeReviewPriority', () => {
  it('puts a never-seen structure above a recently stable one', () => {
    const neverSeen = computeReviewPriority(progress(), NOW);
    const stable = computeReviewPriority(
      progress({
        attempts: 5,
        correct_attempts: 5,
        correct_unassisted_streak: 5,
        box: 5,
        mastery_score: 1,
        next_review_at: NOW + 20 * 86_400_000,
      }),
      NOW,
    );

    expect(neverSeen.priority).toBeGreaterThan(stable.priority);
    expect(neverSeen.reasons.map((r) => r.code)).toContain('never_seen');
  });

  it('explains itself in plain language for every contribution', () => {
    const result = computeReviewPriority(
      progress({ attempts: 3, incorrect_attempts: 1, revealed_attempts: 1, last_outcome: 'skipped' }),
      NOW,
    );

    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
    for (const reason of result.reasons) {
      expect(reason.text.length).toBeGreaterThan(5);
      expect(reason.text.endsWith('.')).toBe(true);
    }
  });

  it('raises priority as a structure becomes overdue, up to a cap', () => {
    const base = progress({ attempts: 1, next_review_at: NOW });
    const slightlyOverdue = { ...base, next_review_at: NOW - 2 * 86_400_000 };
    const veryOverdue = { ...base, next_review_at: NOW - 100 * 86_400_000 };

    const a = computeReviewPriority(slightlyOverdue, NOW).priority;
    const b = computeReviewPriority(veryOverdue, NOW).priority;

    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThanOrEqual(1 + 0.5);
  });

  it('never produces a negative priority', () => {
    const result = computeReviewPriority(
      progress({
        attempts: 10,
        correct_attempts: 10,
        correct_unassisted_streak: 10,
        next_review_at: NOW + 30 * 86_400_000,
      }),
      NOW,
    );
    expect(result.priority).toBeGreaterThanOrEqual(0);
  });
});

describe('buildReviewList', () => {
  it('excludes structures that are not eligible to be asked', () => {
    const list = buildReviewList({
      progress: [progress({ structure_id: 'muscular.eligible' }), progress({ structure_id: 'muscular.not_eligible' })],
      eligibleStructureIds: new Set(['muscular.eligible']),
      now: NOW,
    });

    expect(list.map((entry) => entry.structureId)).toEqual(['muscular.eligible']);
  });

  it('orders by priority, most pressing first', () => {
    const list = buildReviewList({
      progress: [
        progress({ structure_id: 'muscular.stable', attempts: 5, correct_attempts: 5, correct_unassisted_streak: 3 }),
        progress({ structure_id: 'muscular.missed', attempts: 2, incorrect_attempts: 1 }),
        progress({ structure_id: 'muscular.never' }),
      ],
      eligibleStructureIds: new Set(['muscular.stable', 'muscular.missed', 'muscular.never']),
      now: NOW,
    });

    expect(list.map((entry) => entry.structureId)).toEqual(['muscular.never', 'muscular.missed']);
  });

  it('leaves out structures that need no review', () => {
    // Reliable, unassisted, and not due: there is nothing to bring back.
    const list = buildReviewList({
      progress: [
        progress({
          structure_id: 'muscular.settled',
          attempts: 5,
          correct_attempts: 5,
          correct_unassisted_streak: 5,
          box: 5,
          mastery_score: 1,
          next_review_at: NOW + 20 * 86_400_000,
        }),
      ],
      eligibleStructureIds: new Set(['muscular.settled']),
      now: NOW,
    });

    expect(list).toHaveLength(0);
  });

  it('does not claim mastery for a single correct answer', () => {
    const afterOne = applyOutcomeToProgress({
      previous: null,
      profileId: 'profile.test',
      structureId: 'muscular.one_off',
      outcome: 'correct',
      now: NOW,
      packVersion: '1.0.0',
    });

    expect(afterOne.mastery_score).toBeLessThan(1);
    expect(bandForProgress(afterOne).id).not.toBe('reliable_plus');
    expect(bandForProgress(afterOne).wording.toLowerCase()).not.toContain('master');
  });

  it('respects the limit', () => {
    const list = buildReviewList({
      progress: Array.from({ length: 30 }, (_, i) => progress({ structure_id: `muscular.s${i}` })),
      eligibleStructureIds: new Set(Array.from({ length: 30 }, (_, i) => `muscular.s${i}`)),
      now: NOW,
      limit: 5,
    });
    expect(list).toHaveLength(5);
  });
});

describe('improvingStructures', () => {
  it('lists structures that have moved up a box with an unassisted streak', () => {
    const improving = [
      progress({
        structure_id: 'muscular.a',
        attempts: 2,
        box: 2,
        correct_attempts: 2,
        correct_unassisted_streak: 2,
      }),
    ];
    expect(improvingStructures(improving).map((r) => r.structure_id)).toEqual(['muscular.a']);
  });

  it('ignores structures still in the first box', () => {
    expect(
      improvingStructures([
        progress({ attempts: 1, box: 1, correct_attempts: 1, correct_unassisted_streak: 1 }),
      ]),
    ).toHaveLength(0);
  });
});

describe('summariseProgress', () => {
  it('handles zero attempts without dividing by zero', () => {
    const summary = summariseProgress([]);
    expect(summary.accuracy).toBe(0);
    expect(summary.attempts).toBe(0);
    expect(summary.structuresSeen).toBe(0);
  });

  it('excludes skips from graded attempts', () => {
    const summary = summariseProgress([
      progress({ attempts: 3, correct_attempts: 1, incorrect_attempts: 1, skipped_attempts: 1 }),
    ]);
    expect(summary.accuracy).toBe(0.5);
    expect(summary.skipped).toBe(1);
  });

  it('counts a structure only once as seen', () => {
    const summary = summariseProgress([progress(), progress()]);
    expect(summary.structuresSeen).toBe(2);
  });
});
