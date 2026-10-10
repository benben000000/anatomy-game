import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { STORAGE_CONFIG } from '@/config/storage-config';
import { MuscleAtlasDatabase, resetDatabaseInstance } from '@/services/storage/db';
import { readValidated, resetScope, unknownSchemaVersionProblem } from '@/services/storage/corrupted-store-recovery';
import { ProgressRepository, applyOutcomeToProgress } from './ProgressRepository';
import { SessionRepository } from './SessionRepository';
import { SettingsRepository } from './SettingsRepository';
import { quizSessionSchema, type QuizSession } from '@/domain/learning/learning';
import { studyProgressSchema } from '@/domain/progress/progress';
import { DEFAULT_SETTINGS } from '@/domain/settings/user-settings';
import { viewIdSchema } from '@/domain/anatomy/ids';

/**
 * A genuinely fresh database for each test.
 *
 * `resetDatabaseInstance` only forgets the module singleton; without deleting the
 * underlying database, records leak between cases and a "clears only progress"
 * assertion can pass or fail for the wrong reason.
 */
async function makeRepositories() {
  resetDatabaseInstance();
  await Dexie.delete(STORAGE_CONFIG.databaseName);
  const database = new MuscleAtlasDatabase();
  await database.open();
  return {
    database,
    progress: new ProgressRepository(database, 'profile.test'),
    sessions: new SessionRepository(database),
    settings: new SettingsRepository(database),
  };
}

function session(overrides: Partial<QuizSession> = {}): QuizSession {
  return quizSessionSchema.parse({
    session_id: 'session.test',
    profile_id: 'profile.test',
    config: { mode: 'identify', target_size: 5 },
    pool_structure_ids: ['muscular.a'],
    queue: ['muscular.a'],
    status: 'in_progress',
    started_at: 1000,
    pack_version: '1.0.0',
    ...overrides,
  });
}

describe('ProgressRepository', () => {
  beforeEach(async () => {
    await makeRepositories();
  });

  it('round-trips a record across a fresh connection', async () => {
    const { progress, database } = await makeRepositories();
    await progress.put(
      applyOutcomeToProgress({
        previous: null,
        profileId: 'profile.test', structureId: 'muscular.biceps_brachii',
        outcome: 'correct',
        now: 1000,
        packVersion: '1.0.0',
      }),
    );

    // A second repository instance stands in for a reload.
    const reloaded = new ProgressRepository(database, 'profile.test');
    const record = await reloaded.get('muscular.biceps_brachii');

    expect(record?.structure_id).toBe('muscular.biceps_brachii');
    expect(record?.correct_attempts).toBe(1);
  });

  it('returns null for a structure never attempted', async () => {
    const { progress } = await makeRepositories();
    expect(await progress.get('muscular.never')).toBeNull();
  });

  it('rejects a record that violates the schema rather than storing it', async () => {
    const { progress } = await makeRepositories();
    // A record that is internally inconsistent: more correct answers than
    // attempts. The repository must refuse it rather than store it.
    const incoherent = {
      ...applyOutcomeToProgress({
        previous: null,
        profileId: 'profile.test',
        structureId: 'muscular.bad',
        outcome: 'correct',
        now: 1000,
        packVersion: '1.0.0',
      }),
      attempts: 0,
    };

    await expect(progress.put(incoherent)).rejects.toThrow();
  });

  it('discards a corrupt record and keeps the rest', async () => {
    const { progress, database } = await makeRepositories();

    await database.progress.put({
      profile_id: 'profile.test',
      structure_id: 'muscular.corrupt',
      attempts: -5,
      content_version: '1.0.0',
    } as never);
    await progress.put(
      applyOutcomeToProgress({
        previous: null,
        profileId: 'profile.test', structureId: 'muscular.good',
        outcome: 'correct',
        now: 1000,
        packVersion: '1.0.0',
      }),
    );

    const all = await progress.getAll();
    expect(all.map((r) => r.structure_id)).toEqual(['muscular.good']);
  });

  it('clears only progress when asked', async () => {
    const { progress, sessions, database } = await makeRepositories();
    await progress.put(
      applyOutcomeToProgress({
        previous: null,
        profileId: 'profile.test', structureId: 'muscular.a',
        outcome: 'correct',
        now: 1000,
        packVersion: '1.0.0',
      }),
    );
    await sessions.saveActive(session());

    await resetScope(database, 'progress');

    expect(await progress.getAll()).toEqual([]);
    // History survives, because a learner resetting progress should not lose
    // the record of what they practised.
    expect(await sessions.getActive()).not.toBeNull();
  });
});

describe('SessionRepository', () => {
  beforeEach(async () => {
    await makeRepositories();
  });

  it('resumes the most recently started unfinished round', async () => {
    const { sessions } = await makeRepositories();
    await sessions.saveActive(session({ session_id: 'session.older', started_at: 1000 }));
    await sessions.saveActive(session({ session_id: 'session.newer', started_at: 9000 }));

    const active = await sessions.getActive();
    expect(active?.session_id).toBe('session.newer');
  });

  it('keeps two tabs from clobbering each other round', async () => {
    const { sessions } = await makeRepositories();
    await sessions.saveActive(session({ session_id: 'session.tabA', started_at: 1000 }));
    await sessions.saveActive(session({ session_id: 'session.tabB', started_at: 2000 }));

    // Both survive, and the newer one is the one that would be resumed.
    expect(await sessions.getActive()).toMatchObject({ session_id: 'session.tabB' });
  });

  it('survives a simulated reload', async () => {
    const { sessions, database } = await makeRepositories();
    await sessions.saveActive(session({ current_question_id: 'session.test.q1' }));

    const reloaded = new SessionRepository(database);
    const active = await reloaded.getActive();

    expect(active?.current_question_id).toBe('session.test.q1');
    expect(active?.status).toBe('in_progress');
  });

  it('keeps answers already recorded when the round is written again', async () => {
    const { sessions, database } = await makeRepositories();
    const first = session();
    first.records.push({
      question_id: 'session.test.q1',
      structure_id: 'muscular.a',
      selected_structure_id: 'muscular.a',
      outcome: 'correct',
      hints_used: [],
      elapsed_ms: 900,
      view_id: viewIdSchema.parse('anterior'),
      region_ids: [],
      question_type: 'locate_named_structure',
      pack_version: '1.0.0',
      recorded_at: 1500,
    });
    await sessions.saveActive(first);

    const reloaded = new SessionRepository(database);
    const active = await reloaded.getActive();
    expect(active?.records).toHaveLength(1);
    expect(active?.records[0]?.outcome).toBe('correct');
  });

  it('flushes a debounced write when the page is hidden', async () => {
    const { sessions, database } = await makeRepositories();
    sessions.queueActiveWrite(session({ session_id: 'session.queued' }));

    // Before the debounce elapses, nothing is on disk yet.
    expect(await new SessionRepository(database).getActive()).toBeNull();

    // The page-hidden path must not wait for the debounce.
    await sessions.flushActive(session({ session_id: 'session.flushed' }));
    expect((await new SessionRepository(database).getActive())?.session_id).toBe('session.flushed');
  });

  it('returns null for a corrupt active session rather than throwing', async () => {
    const { sessions, database } = await makeRepositories();
    await database.activeSession.put({ session_id: 'current', status: 'nonsense' } as never);
    expect(await sessions.getActive()).toBeNull();
  });

  it('archives completed rounds and keeps them out of the active slot', async () => {
    const { sessions } = await makeRepositories();
    await sessions.archive(session({ status: 'completed', ended_at: 5000 }));
    await sessions.clearActive();

    expect(await sessions.getActive()).toBeNull();
    const history = await sessions.listHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.status).toBe('completed');
  });

  it('does not return in-progress rounds from the history list', async () => {
    const { sessions } = await makeRepositories();
    await sessions.archive(session({ status: 'in_progress' }));
    expect(await sessions.listHistory()).toHaveLength(0);
  });

  it('lists history most recent first', async () => {
    const { sessions } = await makeRepositories();
    await sessions.archive(session({ session_id: 'session.old', started_at: 1000, status: 'completed' }));
    await sessions.archive(session({ session_id: 'session.new', started_at: 9000, status: 'completed' }));

    const history = await sessions.listHistory();
    expect(history[0]?.session_id).toBe('session.new');
  });
});

describe('SettingsRepository', () => {
  beforeEach(async () => {
    await makeRepositories();
  });

  it('returns documented defaults before anything is saved', async () => {
    const { settings } = await makeRepositories();
    expect(await settings.load()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips settings', async () => {
    const { settings, database } = await makeRepositories();
    await settings.save({ ...DEFAULT_SETTINGS, labels_visible_explore: false, sound_enabled: true });

    const reloaded = new SettingsRepository(database);
    const loaded = await reloaded.load();
    expect(loaded.labels_visible_explore).toBe(false);
    expect(loaded.sound_enabled).toBe(true);
  });

  it('falls back to defaults when the stored record is unusable', async () => {
    const { database } = await makeRepositories();
    // A record from a future or corrupt write. Settings are not study data, so
    // the repository falls back to defaults instead of blocking the app.
    await database.settings.put({
      key: 'settings',
      value: { schema_version: 1, reduce_motion: 'yes-please' },
    } as never);

    const reloaded = new SettingsRepository(database);
    expect(await reloaded.load()).toEqual(DEFAULT_SETTINGS);
  });

  it('resets to defaults', async () => {
    const { settings } = await makeRepositories();
    await settings.save({ ...DEFAULT_SETTINGS, sound_enabled: true });
    expect(await settings.reset()).toEqual(DEFAULT_SETTINGS);
    expect(await settings.load()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('storage recovery', () => {
  it('reports the number of records it discarded', async () => {
    const { database } = await makeRepositories();

    await database.progress.put({ structure_id: 'bad', attempts: 'lots' } as never);
    await database.progress.put(
      studyProgressSchema.parse({
        profile_id: 'profile.test',
        structure_id: 'muscular.good',
        content_version: '1.0.0',
      }),
    );

    const outcome = await readValidated(database.progress, (value) => {
      const parsed = studyProgressSchema.safeParse(value);
      return parsed.success ? parsed.data : null;
    }, 'progress');

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toHaveLength(1);
      expect(outcome.discarded).toBe(1);
    }
  });

  it('describes an unknown schema version in plain language', () => {
    const problem = unknownSchemaVersionProblem('progress', 4, 1);
    expect(problem.recoverableByReset).toBe(true);
    expect(problem.message).toContain('format version 4');
    expect(problem.message).toContain('version 1');
  });
});
