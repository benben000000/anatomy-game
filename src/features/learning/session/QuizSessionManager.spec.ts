import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { QuizSessionManager } from './QuizSessionManager';
import { ProgressRepository } from '@/features/progress/repositories/ProgressRepository';
import { SessionRepository } from '@/features/progress/repositories/SessionRepository';
import { MuscleAtlasDatabase, resetDatabaseInstance } from '@/services/storage/db';
import { STORAGE_CONFIG } from '@/config/storage-config';
import { getContentRepository } from '@/features/content/repository/ContentRepository';
import { resolveBuildFlags } from '@/config/build-flags';
import { applyOutcomeToProgress } from '@/features/progress/repositories/ProgressRepository';
import { studyProgressSchema } from '@/domain/progress/progress';
import { quizSessionSchema, type QuizSessionConfig } from '@/domain/learning/learning';
import { sourceIdSchema, viewIdSchema } from '@/domain/anatomy/ids';

/**
 * Session flow.
 *
 * These exercise the real content pack and a real (in-memory) database. Nothing
 * here knows which renderer produced a selection, which is the point: the
 * manager is handed structure identifiers exactly as a board, a keyboard list or
 * a future 3D renderer would hand them.
 */

const FLAGS = resolveBuildFlags({
  VITE_ALLOW_DRAFT_CONTENT: 'true',
  VITE_PROVISIONAL_ART: 'true',
});

const SYSTEM_ID = 'muscular';

async function freshRepositories() {
  resetDatabaseInstance();
  await Dexie.delete(STORAGE_CONFIG.databaseName);
  const database = new MuscleAtlasDatabase();
  await database.open();
  return {
    database,
    progress: new ProgressRepository(database, 'profile.test'),
    sessions: new SessionRepository(database),
  };
}

function config(overrides: Partial<QuizSessionConfig> = {}): QuizSessionConfig {
  return quizSessionSchema.shape.config.parse({
    mode: 'identify',
    view_filter: 'anterior',
    target_size: 5,
    ...overrides,
  });
}

/** Deterministic clock so elapsed times and schedules are testable. */
function fixedClock(start = 1_700_000_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('QuizSessionManager', () => {
  let repositories: Awaited<ReturnType<typeof freshRepositories>>;
  let clock: ReturnType<typeof fixedClock>;

  beforeEach(async () => {
    repositories = await freshRepositories();
    clock = fixedClock();
  });

  function makeManager() {
    return new QuizSessionManager(
      getContentRepository(FLAGS),
      repositories.progress,
      repositories.sessions,
      SYSTEM_ID,
      FLAGS.ALLOW_DRAFT_CONTENT,
      clock.now,
    );
  }

  /**
   * Publishes the whole pack so a round can actually be built.
   *
   * The shipped pack is intentionally unpublished, so this is the only way to
   * drive a full round. It stands in for the state the project will be in once a
   * reviewer has signed off — and it uses fake, clearly-labelled sources, so it
   * must never be used as a source of truth about the content itself.
   */
  function publishPack(repository: ReturnType<typeof getContentRepository>): void {
    for (const structure of repository.all.structures) {
      structure.content_status = 'published';
      structure.medical_review_status = 'approved';
      structure.source_references = [sourceIdSchema.parse('source.test')];
    }
    for (const mapping of repository.all.mappings) {
      mapping.visual_status = 'approved';
      mapping.license_reference = 'commissioned_owned';
    }
  }

  it('refuses to ask anything while no content is published', async () => {
    const manager = makeManager();
    const result = await manager.start({
      mode: 'identify',
      config: config(),
      profileId: 'profile.test',
      allowDraftContent: FLAGS.ALLOW_DRAFT_CONTENT,
    });

    expect(result.emptyReason).not.toBeNull();
    expect(result.questions).toHaveLength(0);
    expect(result.emptyReason).toContain('awaiting review');
  });

  it('refuses to ask draft content even when draft content is allowed in the build', async () => {
    // ALLOW_DRAFT_CONTENT permits preview, but a structure with no source
    // reference must still never be asked: that is the safety property.
    const manager = makeManager();
    const result = await manager.start({
      mode: 'identify',
      config: config(),
      profileId: 'profile.test',
      allowDraftContent: true,
    });

    expect(result.questions).toHaveLength(0);
  });

  it('builds a full round once content is published', async () => {
    publishPack(getContentRepository(FLAGS));
    const manager = makeManager();

    const result = await manager.start({
      mode: 'identify',
      config: config({ target_size: 5 }),
      profileId: 'profile.test',
      allowDraftContent: FLAGS.ALLOW_DRAFT_CONTENT,
      rng: () => 0.42,
    });

    expect(result.emptyReason).toBeNull();
    expect(result.questions).toHaveLength(5);
    expect(result.questions.map((q) => q.structure_id)).toHaveLength(
      new Set(result.questions.map((q) => q.structure_id)).size,
    );
  });

  it('runs a complete round and records an outcome per question', async () => {
    publishPack(getContentRepository(FLAGS));
    const manager = makeManager();

    await manager.start({
      mode: 'identify',
      config: config({ target_size: 5 }),
      profileId: 'profile.test',
      allowDraftContent: FLAGS.ALLOW_DRAFT_CONTENT,
      rng: () => 0.42,
    });

    for (let i = 0; i < 5; i += 1) {
      const question = await manager.next();
      expect(question).not.toBeNull();
      clock.advance(1500);
      await manager.answer(question!.structure_id);
    }

    const next = await manager.next();
    expect(next).toBeNull();

    const summary = manager.summary();
    expect(summary?.total).toBe(5);
    expect(summary?.correct).toBe(5);
    expect(summary?.accuracy).toBe(1);
    expect(summary?.reviewTargets).toHaveLength(0);
  });

  it('records a miss as incorrect and keeps both identifiers', async () => {
    publishPack(getContentRepository(FLAGS));
    const manager = makeManager();

    await manager.start({
      mode: 'identify',
      config: config({ target_size: 3 }),
      profileId: 'profile.test',
      allowDraftContent: FLAGS.ALLOW_DRAFT_CONTENT,
      rng: () => 0.42,
    });

    const question = (await manager.next())!;
    const wrongStructure = question.structure_id === 'muscular.frontalis'
      ? 'muscular.rectus_abdominis'
      : 'muscular.frontalis';

    const outcome = await manager.answer(wrongStructure);
    expect(outcome).toBe('incorrect');

    const stored = await repositories.progress.get(question.structure_id);
    expect(stored?.incorrect_attempts).toBe(1);
    expect(manager.summary()?.reviewTargets).toContain(question.structure_id);
  });

  it('records a hint-then-correct answer as assisted and brings it back sooner', async () => {
    publishPack(getContentRepository(FLAGS));
    const manager = makeManager();

    await manager.start({
      mode: 'identify',
      config: config({ target_size: 3 }),
      profileId: 'profile.test',
      allowDraftContent: FLAGS.ALLOW_DRAFT_CONTENT,
      rng: () => 0.42,
    });

    const question = (await manager.next())!;
    expect(manager.useHint()).toBe('region');
    const outcome = await manager.answer(question.structure_id);
    expect(outcome).toBe('assisted');

    const stored = await repositories.progress.get(question.structure_id);
    expect(stored?.assisted_attempts).toBe(1);
    expect(stored?.correct_attempts).toBe(0);
    expect((stored?.next_review_at ?? 0) - clock.now()).toBeLessThanOrEqual(10 * 60_000);
  });

  it('records a reveal as revealed, never as correct', async () => {
    publishPack(getContentRepository(FLAGS));
    const manager = makeManager();

    await manager.start({
      mode: 'identify',
      config: config({ target_size: 3 }),
      profileId: 'profile.test',
      allowDraftContent: FLAGS.ALLOW_DRAFT_CONTENT,
      rng: () => 0.42,
    });

    const question = (await manager.next())!;
    manager.useHint();
    manager.useHint();
    expect(manager.useHint()).toBe('reveal');
    expect(manager.hintAvailable).toBe(false);

    const outcome = await manager.answer(question.structure_id);
    expect(outcome).toBe('revealed');

    const stored = await repositories.progress.get(question.structure_id);
    expect(stored?.revealed_attempts).toBe(1);
    expect(stored?.correct_attempts).toBe(0);
  });

  it('records a skip without penalising the learner', async () => {
    publishPack(getContentRepository(FLAGS));
    const manager = makeManager();

    await manager.start({
      mode: 'identify',
      config: config({ target_size: 3 }),
      profileId: 'profile.test',
      allowDraftContent: FLAGS.ALLOW_DRAFT_CONTENT,
      rng: () => 0.42,
    });

    const question = (await manager.next())!;
    expect(await manager.answer(null)).toBe('skipped');

    const stored = await repositories.progress.get(question.structure_id);
    expect(stored?.skipped_attempts).toBe(1);
    expect(stored?.incorrect_attempts).toBe(0);
    expect(stored?.attempts).toBe(1);
  });

  it('refuses to record an answer with no active question', async () => {
    publishPack(getContentRepository(FLAGS));
    const manager = makeManager();
    await expect(manager.answer('muscular.frontalis')).rejects.toThrow();
  });

  it('never repeats the same structure twice in a row', async () => {
    publishPack(getContentRepository(FLAGS));
    const manager = makeManager();

    await manager.start({
      mode: 'identify',
      config: config({ target_size: 8 }),
      profileId: 'profile.test',
      allowDraftContent: FLAGS.ALLOW_DRAFT_CONTENT,
      rng: () => 0.31,
    });

    const asked: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const question = await manager.next();
      if (question === null) break;
      asked.push(question.structure_id);
      await manager.answer(question.structure_id);
    }

    for (let i = 1; i < asked.length; i += 1) {
      expect(asked[i]).not.toBe(asked[i - 1]);
    }
  });

  it('persists the round after every answer so an interruption loses nothing', async () => {
    publishPack(getContentRepository(FLAGS));
    const manager = makeManager();

    await manager.start({
      mode: 'identify',
      config: config({ target_size: 5 }),
      profileId: 'profile.test',
      allowDraftContent: FLAGS.ALLOW_DRAFT_CONTENT,
      rng: () => 0.42,
    });

    const first = (await manager.next())!;
    await manager.answer(first.structure_id);

    const stored = await repositories.sessions.getActive();
    expect(stored).not.toBeNull();
    expect(stored?.records).toHaveLength(1);
    expect(stored?.status).toBe('in_progress');
  });

  it('restores an interrupted round and resumes at the next question', async () => {
    publishPack(getContentRepository(FLAGS));
    const manager = makeManager();

    await manager.start({
      mode: 'identify',
      config: config({ target_size: 5 }),
      profileId: 'profile.test',
      allowDraftContent: FLAGS.ALLOW_DRAFT_CONTENT,
      rng: () => 0.42,
    });

    const first = (await manager.next())!;
    await manager.answer(first.structure_id);
    const second = await manager.next();

    const stored = await repositories.sessions.getActive();
    expect(stored).not.toBeNull();

    // A fresh manager stands in for the app reloading.
    const restored = makeManager();
    const result = await restored.restore(stored!);

    expect(result.questions.length).toBeGreaterThan(0);
    expect(restored.question?.question_id).toBe(second?.question_id);
    expect(restored.question?.structure_id).toBe(second?.structure_id);
  });

  it('does not re-ask a question already answered when restored', async () => {
    publishPack(getContentRepository(FLAGS));
    const manager = makeManager();

    await manager.start({
      mode: 'identify',
      config: config({ target_size: 5 }),
      profileId: 'profile.test',
      allowDraftContent: FLAGS.ALLOW_DRAFT_CONTENT,
      rng: () => 0.42,
    });
    const first = (await manager.next())!;
    await manager.answer(first.structure_id);
    const stored = (await repositories.sessions.getActive())!;

    const restored = makeManager();
    await restored.restore(stored);

    expect(restored.question?.structure_id).not.toBe(first.structure_id);
  });

  it('archives an abandoned round without recording it as incorrect', async () => {
    publishPack(getContentRepository(FLAGS));
    const manager = makeManager();

    await manager.start({
      mode: 'identify',
      config: config({ target_size: 5 }),
      profileId: 'profile.test',
      allowDraftContent: FLAGS.ALLOW_DRAFT_CONTENT,
      rng: () => 0.42,
    });
    const question = (await manager.next())!;
    await manager.answer(question.structure_id);

    const abandoned = await manager.abandon();

    expect(abandoned?.status).toBe('abandoned');
    expect(await repositories.sessions.getActive()).toBeNull();

    const history = await repositories.sessions.listHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.status).toBe('abandoned');

    // Leaving mid-round must never invent an incorrect answer.
    const stored = await repositories.progress.get(question.structure_id);
    expect(stored?.incorrect_attempts).toBe(0);
  });

  it('archives a completed round and clears the active slot', async () => {
    publishPack(getContentRepository(FLAGS));
    const manager = makeManager();

    await manager.start({
      mode: 'identify',
      config: config({ target_size: 2 }),
      profileId: 'profile.test',
      allowDraftContent: FLAGS.ALLOW_DRAFT_CONTENT,
      rng: () => 0.42,
    });

    for (let i = 0; i < 2; i += 1) {
      const question = (await manager.next())!;
      await manager.answer(question.structure_id);
    }
    await manager.next();

    expect(await repositories.sessions.getActive()).toBeNull();
    expect((await repositories.sessions.listHistory())[0]?.status).toBe('completed');
  });

  it('restricts a Learn Then Test round to the chosen structures', async () => {
    publishPack(getContentRepository(FLAGS));
    const repository = getContentRepository(FLAGS);
    const chosen = repository.all.structures
      .filter((structure) =>
        structure.visible_in_views.includes(viewIdSchema.parse('anterior')),
      )
      .slice(0, 3)
      .map((structure) => structure.structure_id);

    const manager = makeManager();
    const result = await manager.start({
      mode: 'learn_then_test',
      config: config({ mode: 'learn_then_test', focus_structure_ids: chosen, target_size: 3 }),
      profileId: 'profile.test',
      allowDraftContent: FLAGS.ALLOW_DRAFT_CONTENT,
      rng: () => 0.42,
    });

    expect(result.questions).toHaveLength(chosen.length);
    for (const structureId of chosen) {
      expect(result.questions.map((q) => q.structure_id)).toContain(structureId);
    }
  });

  it('respects the view filter', async () => {
    publishPack(getContentRepository(FLAGS));
    const manager = makeManager();
    const result = await manager.start({
      mode: 'identify',
      config: config({ view_filter: 'posterior', target_size: 20 }),
      profileId: 'profile.test',
      allowDraftContent: FLAGS.ALLOW_DRAFT_CONTENT,
      rng: () => 0.42,
    });

    expect(result.questions.length).toBeGreaterThan(0);
    for (const question of result.questions) {
      expect(viewIdSchema.parse(question.view_id)).toBe(viewIdSchema.parse('posterior'));
    }
  });

  it('respects the region filter', async () => {
    publishPack(getContentRepository(FLAGS));
    const manager = makeManager();
    const result = await manager.start({
      mode: 'identify',
      config: config({ region_ids: ['region.abdomen'], target_size: 20 }),
      profileId: 'profile.test',
      allowDraftContent: FLAGS.ALLOW_DRAFT_CONTENT,
      rng: () => 0.42,
    });

    expect(result.questions.map((q) => q.structure_id).sort()).toEqual(
      ['muscular.external_oblique', 'muscular.rectus_abdominis'],
    );
  });

  it('says review mode has nothing to do when nothing has been missed', async () => {
    publishPack(getContentRepository(FLAGS));
    const manager = makeManager();
    const result = await manager.start({
      mode: 'review',
      config: config({ mode: 'review', target_size: 10 }),
      profileId: 'profile.test',
      allowDraftContent: FLAGS.ALLOW_DRAFT_CONTENT,
    });

    expect(result.emptyReason).toContain('Nothing needs review');
  });

  it('draws a review round from structures the learner missed', async () => {
    publishPack(getContentRepository(FLAGS));
    const repository = getContentRepository(FLAGS);
    const target = repository.all.structures.find((s) => s.structure_id === 'muscular.biceps_brachii')!;

    await repositories.progress.put(
      applyOutcomeToProgress({
        previous: null,
        profileId: 'profile.test',
        structureId: target.structure_id,
        outcome: 'incorrect',
        now: clock.now() - 86_400_000,
        packVersion: '1.0.0',
      }),
    );

    const manager = makeManager();
    const result = await manager.start({
      mode: 'review',
      config: config({ mode: 'review', target_size: 5 }),
      profileId: 'profile.test',
      allowDraftContent: FLAGS.ALLOW_DRAFT_CONTENT,
      rng: () => 0.42,
    });

    expect(result.emptyReason).toBeNull();
    expect(result.questions.map((q) => q.structure_id)).toContain('muscular.biceps_brachii');
  });

  it('keeps a valid record even when a structure is retired between sessions', async () => {
    // Retirement must not orphan stored progress.
    const record = applyOutcomeToProgress({
      previous: null,
      profileId: 'profile.test',
      structureId: 'muscular.retired_one',
      outcome: 'correct',
      now: clock.now(),
      packVersion: '1.0.0',
    });

    expect(() => studyProgressSchema.parse(record)).not.toThrow();
    expect(record.structure_id).toBe('muscular.retired_one');
  });
});
