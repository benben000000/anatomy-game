import { STORAGE_CONFIG } from '@/config/storage-config';
import { getDatabase, isIndexedDbAvailable, type MuscleAtlasDatabase } from '@/services/storage/db';
import { quizSessionSchema, type QuizSession } from '@/domain/learning/learning';
import { readValidated, storageUnavailableProblem, type StorageProblem } from '@/services/storage/corrupted-store-recovery';

/**
 * Session persistence.
 *
 * Unfinished rounds live in the `activeSession` store, keyed by their own
 * `session_id`. "The active session" is therefore *the most recently started
 * round that is still in progress*, which means:
 *
 * - a round's identity survives a restore and can be archived with it,
 * - a second tab cannot clobber the first tab's round,
 * - resuming after a background, lock, or reload is a read, not a
 *   reconstruction.
 */
export class SessionRepository {
  private pendingWrite: ReturnType<typeof setTimeout> | null = null;
  private pendingSession: QuizSession | null = null;

  constructor(private readonly db: MuscleAtlasDatabase = getDatabase()) {}

  async getActive(): Promise<QuizSession | null> {
    try {
      const records = await this.db.activeSession
        .where('status')
        .equals('in_progress')
        .reverse()
        .sortBy('started_at');

      const latest = records[0];
      if (latest === undefined) return null;
      const parsed = quizSessionSchema.safeParse(latest);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async saveActive(session: QuizSession): Promise<void> {
    const parsed = quizSessionSchema.parse(session);
    await this.db.activeSession.put(parsed);
  }

  /**
   * Debounced write for routine progress. Never used on the page-hidden path,
   * where `flushActive` is called instead so nothing is lost.
   */
  queueActiveWrite(session: QuizSession): void {
    this.pendingSession = quizSessionSchema.parse(session);
    if (this.pendingWrite !== null) return;
    this.pendingWrite = setTimeout(() => {
      this.pendingWrite = null;
      const queued = this.pendingSession;
      this.pendingSession = null;
      if (queued) {
        void this.saveActive(queued);
      }
    }, STORAGE_CONFIG.writeDebounceMs);
  }

  /** Write immediately. Used on visibilitychange, pagehide and answer commit. */
  async flushActive(session: QuizSession): Promise<void> {
    if (this.pendingWrite !== null) {
      clearTimeout(this.pendingWrite);
      this.pendingWrite = null;
    }
    this.pendingSession = null;
    await this.saveActive(session);
  }

  async clearActive(): Promise<void> {
    if (this.pendingWrite !== null) {
      clearTimeout(this.pendingWrite);
      this.pendingWrite = null;
    }
    this.pendingSession = null;
    const inProgress = await this.db.activeSession.where('status').equals('in_progress').toArray();
    await this.db.activeSession.bulkDelete(inProgress.map((session) => session.session_id));
  }

  async archive(session: QuizSession): Promise<void> {
    const parsed = quizSessionSchema.parse(session);
    // Archive and remove the in-flight copy in one transaction, so a crash
    // between the two cannot leave a completed round looking unfinished.
    await this.db.transaction('rw', this.db.activeSession, this.db.sessions, async () => {
      await this.db.activeSession.delete(parsed.session_id);
      await this.db.sessions.put(parsed);
    });
  }

  async listHistory(limit = 20): Promise<QuizSession[]> {
    const outcome = await readValidated(this.db.sessions, (value) => {
      const parsed = quizSessionSchema.safeParse(value);
      return parsed.success ? parsed.data : null;
    }, 'session history');

    if (!outcome.ok) return [];

    return outcome.value
      .filter((session) => session.status !== 'in_progress')
      .sort((a, b) => b.started_at - a.started_at)
      .slice(0, limit);
  }

  async clearHistory(): Promise<void> {
    await this.db.sessions.clear();
  }

  get storageProblem(): StorageProblem | null {
    return isIndexedDbAvailable() ? null : storageUnavailableProblem('round history');
  }
}
