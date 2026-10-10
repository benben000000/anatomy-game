import {
  HINT_LEVEL_ORDER,
  REVEALING_HINT_LEVEL,
  quizSessionSchema,
  type AnswerOutcome,
  type AnswerRecord,
  type HintLevel,
  type Question,
  type QuizMode,
  type QuizSession,
  type QuizSessionConfig,
} from '@/domain/learning/learning';
import {
  buildSession,
  evaluateAnswer,
  summariseSession,
  type SessionSummary,
} from '@/features/learning/answer-evaluator/AnswerEvaluator';
import {
  buildQuestions,
  buildReviewPool,
  findEligibleStructures,
  type EligibleStructure,
} from '@/features/learning/question-generator/QuestionGenerator';
import { buildReviewList } from '@/features/learning/study-scheduler/ReviewPriority';
import { applyOutcomeToProgress } from '@/features/progress/repositories/ProgressRepository';
import { LEARNING_CONFIG } from '@/config/learning-config';
import type { ContentRepository } from '@/features/content/repository/ContentRepository';
import type { ProgressRepository } from '@/features/progress/repositories/ProgressRepository';
import type { SessionRepository } from '@/features/progress/repositories/SessionRepository';
import type { StudyProgress } from '@/domain/progress/progress';

/**
 * Quiz session orchestration.
 *
 * The manager owns the round. It builds the eligible pool, produces questions,
 * accepts a selection from whichever board the learner is using, evaluates it,
 * records progress, and persists after every commit.
 *
 * It never inspects the DOM, never reads an SVG id, and never compares display
 * names. It deals in structure identifiers only.
 */

export interface StartSessionInput {
  readonly mode: QuizMode;
  readonly config: QuizSessionConfig;
  readonly profileId: string;
  readonly allowDraftContent: boolean;
  /** Injectable clock and randomness so tests are deterministic. */
  readonly now?: () => number;
  readonly rng?: () => number;
  readonly sessionId?: string;
}

export interface StartSessionResult {
  readonly session: QuizSession;
  readonly questions: readonly Question[];
  readonly eligible: readonly EligibleStructure[];
  /** Set when nothing could be asked. Explains why, rather than failing silently. */
  readonly emptyReason: string | null;
}

export class QuizSessionManager {
  private session: QuizSession | null = null;
  private questions: readonly Question[] = [];
  private currentQuestion: Question | null = null;
  private currentStartedAt = 0;
  private hintsUsed: HintLevel[] = [];
  private pendingPersisted: QuizSession | null = null;

  constructor(
    private readonly content: ContentRepository,
    private readonly progressRepository: ProgressRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly systemId: string,
    private readonly allowDraftContent: boolean,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get current(): QuizSession | null {
    return this.session;
  }

  get question(): Question | null {
    return this.currentQuestion;
  }

  get activeHints(): readonly HintLevel[] {
    return this.hintsUsed;
  }

  get unanswered(): boolean {
    return this.currentQuestion !== null;
  }

  /* --------------------- starting a round --------------------- */

  async start(input: StartSessionInput): Promise<StartSessionResult> {
    const now = input.now?.() ?? this.now();
    const packVersion = this.content.packVersion;

    let poolStructureIds: readonly string[];
    let eligible: readonly EligibleStructure[];

    if (input.mode === 'review') {
      eligible = findEligibleStructures({
        repository: this.content,
        systemId: this.systemId,
        viewFilter: input.config.view_filter,
        regionIds: input.config.region_ids,
        difficultyTiers: input.config.difficulty_tiers,
        allowDraftContent: this.allowDraftContent,
      });
      const progress = await this.progressRepository.getAll();
      const eligibleIds = new Set(eligible.map((item) => item.structure.structure_id));
      const reviewList = buildReviewList({
        progress,
        eligibleStructureIds: eligibleIds,
        now,
      });
      poolStructureIds = buildReviewPool(
        reviewList.map((entry) => ({ structureId: entry.structureId, priority: entry.priority })),
        eligible,
        input.config.target_size,
      );
    } else {
      eligible = findEligibleStructures({
        repository: this.content,
        systemId: this.systemId,
        viewFilter: input.config.view_filter,
        regionIds: input.config.region_ids,
        difficultyTiers: input.config.difficulty_tiers,
        onlyStructureIds:
          input.config.focus_structure_ids.length > 0 ? input.config.focus_structure_ids : undefined,
        allowDraftContent: this.allowDraftContent,
      });
      poolStructureIds = eligible.map((item) => item.structure.structure_id);    }

    const emptyReason =
      poolStructureIds.length === 0 ? this.explainEmptyPool(input.mode) : null;

    const sessionId = input.sessionId ?? `session.${now.toString(36)}.${Math.random().toString(36).slice(2, 8)}`;

    if (emptyReason !== null) {
      // Still return a well-formed, empty session so the UI has something
      // truthful to render rather than crashing.
      const empty = buildSession({
        sessionId,
        profileId: input.profileId,
        mode: input.mode,
        config: { ...input.config, target_size: 1 },
        poolStructureIds: ['placeholder.none'],
        packVersion,
        now,
      });
      this.session = empty;
      this.questions = [];
      this.currentQuestion = null;
      return { session: empty, questions: [], eligible, emptyReason };
    }

    const limited = poolStructureIds.slice(0, Math.max(1, input.config.target_size));

    const session = buildSession({
      sessionId,
      profileId: input.profileId,
      mode: input.mode,
      config: input.config,
      poolStructureIds: limited,
      packVersion,
      now,
      ...(input.rng === undefined ? {} : { rng: input.rng }),
    });

    this.session = session;
    this.questions = buildQuestions({
      eligible,
      packVersion,
      sessionId,
      onlyStructureIds: limited,
    }).slice(0, session.config.target_size);

    await this.persistNow();
    return { session, questions: this.questions, eligible, emptyReason: null };
  }

  private explainEmptyPool(mode: QuizMode): string {
    const published = this.content
      .learnerVisibleStructures(this.systemId)
      .filter((structure) => structure.source_references.length > 0);

    if (published.length === 0) {
      return (
        'No muscle is ready to be asked about yet. Every structure in this content pack is still ' +
        'awaiting review by a qualified anatomy reviewer, so no question can be asked without ' +
        'risking teaching something unverified. Explore mode is unaffected.'
      );
    }

    if (mode === 'review') {
      return (
        'Nothing needs review right now. Structures appear here after you miss them, reveal them, ' +
        'or skip them.'
      );
    }

    return 'No structure matches the current view, region and difficulty filters.';
  }

  /* --------------------- answering --------------------- */

  async answer(selectedStructureId: string | null): Promise<AnswerOutcome> {
    const question = this.currentQuestion;
    const session = this.session;
    if (question === null || session === null) {
      throw new Error('Cannot record an answer with no active question.');
    }

    const result = evaluateAnswer({
      question,
      selectedStructureId,
      hintsUsed: this.hintsUsed,
      elapsedMs: this.now() - this.currentStartedAt,
      packVersion: session.pack_version,
      now: this.now(),
      regionIds: question.region_ids,
      revealHintLevel: REVEALING_HINT_LEVEL,
    });

    session.records.push(result.record);

    const previous = await this.progressRepository.get(question.structure_id);
    const updated: StudyProgress = applyOutcomeToProgress({
      previous,
      structureId: question.structure_id,
      profileId: this.progressRepository.getProfileId(),
      outcome: result.outcome,
      now: result.record.recorded_at,
      packVersion: session.pack_version,
      viewId: question.view_id,
      questionType: question.prompt_format,
    });
    await this.progressRepository.put(updated);

    this.currentQuestion = null;
    await this.persistNow();

    return result.outcome;
  }

  /* --------------------- hints --------------------- */

  /** Hints are unlimited and free. Level 3 reveals the answer. */
  useHint(): HintLevel | null {
    if (this.currentQuestion === null) return null;
    const next = HINT_LEVEL_ORDER.find((level) => !this.hintsUsed.includes(level));
    if (next === undefined) return null;
    this.hintsUsed.push(next);
    return next;
  }

  get hintAvailable(): boolean {
    return (
      this.currentQuestion !== null &&
      HINT_LEVEL_ORDER.some((level) => !this.hintsUsed.includes(level))
    );
  }

  /* --------------------- advancing --------------------- */

  /** Advance to the next question, or complete the round. */
  async next(): Promise<Question | null> {
    const session = this.session;
    if (session === null) return null;

    const nextIndex = this.questions.findIndex(
      (question) => !session.records.some((record) => record.question_id === question.question_id),
    );

    if (nextIndex === -1) {
      session.status = 'completed';
      session.ended_at = this.now();
      session.current_question_id = null;
      await this.persistNow();
      await this.sessionRepository.archive(session);
      await this.sessionRepository.clearActive();
      this.currentQuestion = null;
      return null;
    }

    const question = this.questions[nextIndex];
    if (question === undefined) return null;

    this.currentQuestion = question;
    this.currentStartedAt = this.now();
    this.hintsUsed = [];
    session.current_question_id = question.question_id;

    await this.persistNow();
    return question;
  }

  /** Leaving mid-round records the rest as abandoned, never as incorrect. */
  async abandon(): Promise<QuizSession | null> {
    const session = this.session;
    if (session === null) return null;

    if (session.status === 'in_progress') {
      session.status = 'abandoned';
      session.ended_at = this.now();
      session.current_question_id = null;
      await this.persistNow();
      await this.sessionRepository.archive(session);
    }

    await this.sessionRepository.clearActive();
    this.currentQuestion = null;
    return session;
  }

  summary(): SessionSummary | null {
    return this.session === null ? null : summariseSession(this.session);
  }

  /* --------------------- interruption recovery --------------------- */

  /**
   * Rebuild a round from disk after a background, lock, or reload.
   *
   * The pool is recomputed from content, because the stored queue may name
   * structures that have since been retired. Any question whose structure is no
   * longer eligible is dropped rather than asked.
   */
  async restore(session: QuizSession): Promise<StartSessionResult> {
    const now = this.now();
    const eligible = findEligibleStructures({
      repository: this.content,
      systemId: this.systemId,
      viewFilter: session.config.view_filter,
      regionIds: session.config.region_ids,
      difficultyTiers: session.config.difficulty_tiers,
      onlyStructureIds:
        session.config.focus_structure_ids.length > 0
          ? session.config.focus_structure_ids
          : session.pool_structure_ids,
      allowDraftContent: this.allowDraftContent,
    });
    this.session = session;
    this.questions = buildQuestions({
      eligible,
      packVersion: session.pack_version,
      sessionId: session.session_id,
      onlyStructureIds: session.pool_structure_ids,
    });

    const answered = new Set(session.records.map((record) => record.question_id));
    const pending = this.questions.find((question) => !answered.has(question.question_id)) ?? null;
    this.currentQuestion = pending;
    this.currentStartedAt = now;
    this.hintsUsed = [];

    return {
      session,
      questions: this.questions,
      eligible,
      emptyReason: this.questions.length === 0 ? 'The saved round no longer has any eligible questions.' : null,
    };
  }

  getMode(): QuizMode {
    return this.session?.config.mode ?? 'identify';
  }

  /* --------------------- persistence --------------------- */

  private async persistNow(): Promise<void> {
    const session = this.session;
    if (session === null) return;
    const validated = quizSessionSchema.parse(session);
    this.pendingPersisted = validated;
    await this.sessionRepository.flushActive(validated);
    this.pendingPersisted = null;
  }

  get hasUnsavedWork(): boolean {
    return this.pendingPersisted !== null;
  }
}

/** Records the current session as abandoned without clearing stored history. */
export async function abandonForExit(manager: QuizSessionManager): Promise<void> {
  await manager.abandon();
}

export { LEARNING_CONFIG };
export type { AnswerRecord, QuizSessionConfig };
