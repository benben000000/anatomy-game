import { describe, expect, it } from 'vitest';
import { evaluateAnswer, summariseSession, buildSession, orderQueue } from './AnswerEvaluator';import {
  quizSessionSchema,
  REVEALING_HINT_LEVEL,
  type Question,
  type QuizSessionConfig,
} from '@/domain/learning/learning';
import { viewIdSchema } from '@/domain/anatomy/ids';

const question: Question = {
  question_id: 'session.test.q1',
  structure_id: 'muscular.biceps_brachii',
  view_id: viewIdSchema.parse('anterior'),
  region_ids: ['region.upper_limb.arm'],
  difficulty_tier: 'introductory',
  prompt_format: 'locate_named_structure',
  pack_version: '1.0.0',
};

const baseInput = {
  question,
  elapsedMs: 4200,
  packVersion: '1.0.0',
  now: 1_700_000_000_000,
  regionIds: ['region.upper_limb.arm'],
  revealHintLevel: REVEALING_HINT_LEVEL,
} as const;

describe('AnswerEvaluator', () => {
  it('records an unassisted correct answer as correct', () => {
    const result = evaluateAnswer({
      ...baseInput,
      selectedStructureId: 'muscular.biceps_brachii',
      hintsUsed: [],
    });

    expect(result.outcome).toBe('correct');
    expect(result.isUnassisted).toBe(true);
    expect(result.record.selected_structure_id).toBe('muscular.biceps_brachii');
    expect(result.record.structure_id).toBe('muscular.biceps_brachii');
  });

  it('compares structure identifiers, never display names', () => {
    // A different structure id that happens to be visually or nominally similar
    // must be recorded as incorrect.
    const result = evaluateAnswer({
      ...baseInput,
      selectedStructureId: 'muscular.triceps_brachii',
      hintsUsed: [],
    });

    expect(result.outcome).toBe('incorrect');
    expect(result.record.selected_structure_id).toBe('muscular.triceps_brachii');
    // The correct target is preserved so feedback can name it.
    expect(result.record.structure_id).toBe('muscular.biceps_brachii');
  });

  it('records a correct answer after a non-revealing hint as assisted, not correct', () => {
    const result = evaluateAnswer({
      ...baseInput,
      selectedStructureId: 'muscular.biceps_brachii',
      hintsUsed: ['region'],
    });

    expect(result.outcome).toBe('assisted');
    expect(result.isUnassisted).toBe(false);
  });

  it('never counts a revealed answer as correct, even when the target was selected', () => {
    const result = evaluateAnswer({
      ...baseInput,
      selectedStructureId: 'muscular.biceps_brachii',
      hintsUsed: ['region', 'approximate_area', 'reveal'],
    });

    expect(result.outcome).toBe('revealed');
    expect(result.isUnassisted).toBe(false);
  });

  it('records no selection as skipped rather than incorrect', () => {
    const result = evaluateAnswer({ ...baseInput, selectedStructureId: null, hintsUsed: [] });
    expect(result.outcome).toBe('skipped');
    expect(result.record.selected_structure_id).toBeNull();
  });

  it('rejects a negative elapsed time rather than storing it', () => {
    const result = evaluateAnswer({
      ...baseInput,
      selectedStructureId: null,
      hintsUsed: [],
      elapsedMs: -50,
    });
    expect(result.record.elapsed_ms).toBe(0);
  });

  it('carries the hint order onto the record', () => {
    const result = evaluateAnswer({
      ...baseInput,
      selectedStructureId: null,
      hintsUsed: ['region', 'approximate_area'],
    });
    expect(result.record.hints_used).toEqual(['region', 'approximate_area']);
  });
});

describe('summariseSession', () => {
  const config: QuizSessionConfig = quizSessionSchema.shape.config.parse({
    mode: 'identify',
    target_size: 5,
  });

  it('excludes skipped questions from the accuracy denominator', () => {
    const session = buildSession({
      sessionId: 'session.test',
      profileId: 'profile.test',
      mode: 'identify',
      config,
      poolStructureIds: ['a.b', 'c.d', 'e.f'],
      packVersion: '1.0.0',
      now: 0,
      rng: () => 0.5,
    });

    session.records.push(
      record({ question_id: 'q1', outcome: 'correct' }),
      record({ question_id: 'q2', outcome: 'incorrect' }),
      record({ question_id: 'q3', outcome: 'skipped' }),
    );

    const summary = summariseSession(session);
    // 1 correct of 2 graded; the skip does not count against the learner.
    expect(summary.accuracy).toBe(0.5);
    expect(summary.skipped).toBe(1);
    expect(summary.total).toBe(3);
  });

  it('reports zero accuracy rather than NaN when nothing was graded', () => {
    const session = buildSession({
      sessionId: 'session.test',
      profileId: 'profile.test',
      mode: 'identify',
      config,
      poolStructureIds: ['a.b'],
      packVersion: '1.0.0',
      now: 0,
    });

    expect(summariseSession(session).accuracy).toBe(0);
  });

  it('collects every non-correct structure into the review list', () => {
    const session = buildSession({
      sessionId: 'session.test',
      profileId: 'profile.test',
      mode: 'identify',
      config,
      poolStructureIds: ['a.b', 'c.d', 'e.f'],
      packVersion: '1.0.0',
      now: 0,
    });

    session.records.push(
      record({ question_id: 'q1', structure_id: 'a.b', outcome: 'correct' }),
      record({ question_id: 'q2', structure_id: 'c.d', outcome: 'incorrect' }),
      record({ question_id: 'q3', structure_id: 'e.f', outcome: 'revealed' }),
    );

    expect([...summariseSession(session).reviewTargets].sort()).toEqual(['c.d', 'e.f']);
  });

  it('measures duration from start to end, never negative', () => {
    const session = buildSession({
      sessionId: 'session.test',
      profileId: 'profile.test',
      mode: 'identify',
      config,
      poolStructureIds: ['a.b'],
      packVersion: '1.0.0',
      now: 1000,
    });
    session.ended_at = 4000;

    expect(summariseSession(session).durationMs).toBe(3000);
  });
});

describe('orderQueue', () => {
  it('never places the same structure twice in a row', () => {
    const input = ['a.b', 'a.b', 'a.b', 'c.d', 'c.d', 'e.f'];
    for (let seed = 0; seed < 25; seed += 1) {
      const ordered = orderQueue(input, seededRandom(seed));
      for (let i = 1; i < ordered.length; i += 1) {
        expect(ordered[i]).not.toBe(ordered[i - 1]);
      }
    }
  });

  it('holds for every arrangement of a heavily duplicated pool', () => {
    const input = ['a.b', 'a.b', 'c.d', 'c.d', 'c.d', 'a.b', 'e.f', 'e.f'];
    for (let seed = 0; seed < 50; seed += 1) {
      const ordered = orderQueue(input, seededRandom(seed));
      for (let i = 1; i < ordered.length; i += 1) {
        expect(ordered[i], `seed ${seed}: ${ordered.join(',')}`).not.toBe(ordered[i - 1]);
      }
    }
  });

  it('keeps every structure in the queue', () => {
    const input = ['a.b', 'c.d', 'e.f', 'g.h'];
    const ordered = orderQueue(input, seededRandom(3));
    expect([...ordered].sort()).toEqual([...input].sort());
  });

  it('returns an empty queue for an empty pool', () => {
    expect(orderQueue([], seededRandom(1))).toEqual([]);
  });

  it('degrades honestly when repeats are unavoidable', () => {
    // One structure fills more than half the queue, so no valid ordering exists.
    const ordered = orderQueue(['a.b', 'a.b', 'a.b', 'c.d'], seededRandom(1));
    expect(ordered).toHaveLength(4);
  });
});

function record(overrides: {
  question_id: string;
  structure_id?: string;
  outcome: 'correct' | 'incorrect' | 'skipped' | 'revealed' | 'assisted';
}) {
  return {
    question_id: overrides.question_id,
    structure_id: overrides.structure_id ?? 'muscular.biceps_brachii',
    selected_structure_id:
      overrides.outcome === 'skipped' ? null : (overrides.structure_id ?? 'muscular.biceps_brachii'),
    outcome: overrides.outcome,
    hints_used: [],
    elapsed_ms: 1000,
    view_id: viewIdSchema.parse('anterior'),
    region_ids: [],
    question_type: 'locate_named_structure' as const,
    pack_version: '1.0.0',
    recorded_at: 0,
  };
}

function seededRandom(seed: number): () => number {
  let state = seed * 9301 + 49297;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}
