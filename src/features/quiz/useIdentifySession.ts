import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useContent } from '@/features/content/ContentProvider';
import { useRepositories } from '@/app/providers/RepositoryProvider';
import { useSettings } from '@/app/providers/SettingsProvider';
import { QuizSessionManager } from '@/features/learning/session/QuizSessionManager';
import { findEligibleStructures } from '@/features/learning/question-generator/QuestionGenerator';
import type {
  AnswerOutcome,
  HintLevel,
  Question,
  QuizSessionConfig,
} from '@/domain/learning/learning';
import type {
  AnatomyBoardEvent,
  CandidateHit,
  StructureVisualState,
} from '@/features/anatomy-board/contracts/anatomy-board-adapter';
import type { ViewId } from '@/components/anatomy/AnatomyBoard';
import type { SessionSummary } from '@/features/learning/answer-evaluator/AnswerEvaluator';

/**
 * Identify mode state.
 *
 * A thin hook over `QuizSessionManager`: it translates board events into
 * answers, keeps the visual-state map the board renders, and persists on every
 * commit. It contains no rules of its own — every decision about correctness,
 * scheduling and eligibility lives in the learning engine.
 */

export type RoundPhase = 'setup' | 'question' | 'feedback' | 'results';

export interface FeedbackState {
  readonly outcome: AnswerOutcome;
  readonly correctStructureId: string;
  readonly selectedStructureId: string | null;
  readonly hintLevelUsed: HintLevel;
}

export interface IdentifySessionState {
  readonly phase: RoundPhase;
  readonly question: Question | null;
  readonly questionNumber: number;
  readonly totalQuestions: number;
  readonly feedback: FeedbackState | null;
  readonly visualStates: ReadonlyMap<string, StructureVisualState>;
  readonly candidates: readonly CandidateHit[];
  readonly pendingDisambiguation: readonly CandidateHit[] | null;
  readonly summary: SessionSummary | null;
  readonly emptyReason: string | null;
  readonly hintAvailable: boolean;
  readonly hintsUsed: number;
  readonly restored: boolean;
  readonly canStart: boolean;
}

export function useIdentifySession(config: QuizSessionConfig) {  const { repository, flags, systemId, loadError } = useContent();
  const { repositories } = useRepositories();
  const { settings } = useSettings();

  const managerRef = useRef<QuizSessionManager | null>(null);
  if (managerRef.current === null) {
    managerRef.current = new QuizSessionManager(
      repository,
      repositories.progress,
      repositories.sessions,
      systemId,
      flags.ALLOW_DRAFT_CONTENT,
    );
  }
  const manager = managerRef.current;

  const [phase, setPhase] = useState<RoundPhase>('setup');
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [visualStates, setVisualStates] = useState<ReadonlyMap<string, StructureVisualState>>(
    () => new Map(),
  );
  const [pendingDisambiguation, setPendingDisambiguation] = useState<readonly CandidateHit[] | null>(
    null,
  );
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [restored, setRestored] = useState(false);
  const [view, setView] = useState<ViewId>(config.view_filter === 'posterior' ? 'posterior' : 'anterior');

  const eligible = useMemo(
    () =>
      loadError === null
        ? findEligibleStructures({
            repository,
            systemId,
            viewFilter: config.view_filter,
            regionIds: config.region_ids,
            difficultyTiers: config.difficulty_tiers,
            onlyStructureIds:
              config.focus_structure_ids.length > 0 ? config.focus_structure_ids : undefined,
            allowDraftContent: flags.ALLOW_DRAFT_CONTENT,
          })
        : [],
    [config, flags.ALLOW_DRAFT_CONTENT, loadError, repository, systemId],
  );

  const mappingLookup = useCallback(
    (structureId: string, boardView: ViewId): CandidateHit | null => {
      const mapping = repository
        .selectableMappingsForStructure(structureId)
        .find((candidate) => candidate.view_id === boardView);
      if (mapping === undefined) return null;
      return {
        visualId: mapping.visual_id,
        structureId: mapping.structure_id,
        selectionPriority: mapping.selection_priority,
        requiresDisambiguation: mapping.requires_disambiguation,
      };
    },
    [repository],
  );

  const candidates = useMemo(() => {
    const ids = new Set<string>();
    for (const item of eligible) {
      if (mappingLookup(item.structure.structure_id, view) !== null) {
        ids.add(item.structure.structure_id);
      }
    }
    return [...ids].flatMap((structureId) => {
      const hit = mappingLookup(structureId, view);
      return hit === null ? [] : [hit];
    });
  }, [eligible, mappingLookup, view]);

  /* --------------------- persistence on interruption --------------------- */

  useEffect(() => {
    const flush = () => {
      const session = manager.current;
      if (session !== null && session.status === 'in_progress') {
        void repositories.sessions.flushActive(session);
      }
    };

    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [manager, repositories.sessions]);

  /* --------------------- actions --------------------- */

  const start = useCallback(async () => {
    const result = await manager.start({
      mode: config.mode ?? 'identify',
      config,
      profileId: repositories.progress.getProfileId(),
      allowDraftContent: flags.ALLOW_DRAFT_CONTENT,
    });

    setEmptyReason(result.emptyReason);
    setTotalQuestions(result.questions.length);
    setQuestionNumber(0);
    setSummary(null);
    setRestored(false);
    setVisualStates(new Map());

    if (result.emptyReason !== null) {
      setPhase('setup');
      return;
    }

    setView((current) => {
      const first = result.questions[0];
      return (first?.view_id as ViewId | undefined) ?? current;
    });

    const first = await manager.next();
    setQuestion(first);
    setQuestionNumber(first === null ? 0 : 1);
    setPhase(first === null ? 'results' : 'question');
    if (first === null) setSummary(manager.summary());
  }, [config, flags.ALLOW_DRAFT_CONTENT, manager, repositories.progress]);

  const resume = useCallback(async () => {
    const stored = await repositories.sessions.getActive();
    if (stored === null || stored.status !== 'in_progress') return false;

    const result = await manager.restore(stored);
    const pending = manager.question;
    const answered = stored.records.length;
    setEmptyReason(result.emptyReason);
    setTotalQuestions(result.questions.length);
    // N questions answered means the learner is now looking at question N + 1.
    setQuestionNumber(pending === null ? answered : answered + 1);
    setRestored(true);
    setVisualStates(new Map());

    if (pending === null) {
      setPhase('results');
      setSummary(manager.summary());
      return true;
    }

    setQuestion(pending);
    setView(pending.view_id as ViewId);
    setPhase('question');
    return true;
  }, [manager, repositories.sessions]);

  const commit = useCallback(
    async (selectedStructureId: string | null) => {
      const active = manager.question;
      if (active === null) return;

      const outcome = await manager.answer(selectedStructureId);

      const states = new Map<string, StructureVisualState>();
      if (selectedStructureId !== null) {
        states.set(
          selectedStructureId,
          outcome === 'incorrect' ? 'incorrect' : outcome === 'correct' ? 'correct' : 'assisted',
        );
      }
      if (outcome !== 'correct') {
        states.set(active.structure_id, outcome === 'incorrect' ? 'correct' : 'revealed');
      }
      setVisualStates(states);

      setFeedback({
        outcome,
        correctStructureId: active.structure_id,
        selectedStructureId,
        hintLevelUsed: hintsUsed > 0 ? lastHintLevel(manager.activeHints) : 'region',
      });
      setPhase('feedback');
    },
    [hintsUsed, manager],
  );

  const continueRound = useCallback(async () => {
    const next = await manager.next();
    setVisualStates(new Map());
    setFeedback(null);
    setHintsUsed(0);
    if (next === null) {
      setQuestion(null);
      setSummary(manager.summary());
      setPhase('results');
      return;
    }
    setQuestion(next);
    setQuestionNumber((n) => n + 1);
    setView(next.view_id as ViewId);
    setPhase('question');
  }, [manager]);

  const useHint = useCallback(() => {
    const level = manager.useHint();
    if (level === null) return;
    setHintsUsed((n) => n + 1);
  }, [manager]);

  const skip = useCallback(() => {
    void commit(null);
  }, [commit]);

  const exit = useCallback(async () => {
    await manager.abandon();
    setPhase('setup');
    setQuestion(null);
    setFeedback(null);
    setVisualStates(new Map());
  }, [manager]);

  /* --------------------- board events --------------------- */

  const handleSelection = useCallback(
    (structureId: string) => {
      if (phase !== 'question') return;
      void commit(structureId);
    },
    [commit, phase],
  );

  const onBoardEvent = useCallback(
    (event: AnatomyBoardEvent) => {
      if (event.type === 'disambiguation-requested') {
        setPendingDisambiguation(event.candidates);
        return;
      }
      if (event.type === 'structure-selected') {
        handleSelection(event.structureId);
      }
    },
    [handleSelection],
  );

  const resolveDisambiguation = useCallback(
    (candidate: CandidateHit) => {
      setPendingDisambiguation(null);
      handleSelection(candidate.structureId);
    },
    [handleSelection],
  );

  /* --------------------- restore on mount --------------------- */

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const didResume = await resume();
      if (!cancelled && !didResume) setPhase('setup');
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally runs once per mount: restoring an interrupted round is the
    // only thing this effect is for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Why nothing can be asked, derived rather than only reported after a failed
   * start.
   *
   * A learner arriving at a round that cannot be built is owed the reason
   * immediately, not only after pressing a button that does nothing.
   */
  const derivedEmptyReason = useMemo(() => {
    if (emptyReason !== null) return emptyReason;
    if (eligible.length > 0) return null;

    const withSources = repository
      .previewStructures(systemId, flags)
      .filter((structure) => structure.source_references.length > 0);

    if (withSources.length === 0) {
      return (
        'No muscle is ready to be asked about yet. Every structure in this content pack is still ' +
        'awaiting review by a qualified anatomy reviewer, so no question can be asked without ' +
        'risking teaching something unverified. Explore mode is unaffected.'
      );
    }

    return 'No structure matches the current view, region and difficulty filters.';
  }, [eligible.length, emptyReason, flags, repository, systemId]);

  const state: IdentifySessionState = {
    phase,
    question,
    questionNumber,
    totalQuestions,
    feedback,
    visualStates,
    candidates,
    pendingDisambiguation,
    summary,
    emptyReason: derivedEmptyReason,
    hintAvailable: manager.hintAvailable,
    hintsUsed,
    restored,
    canStart: eligible.length > 0,
  };

  return {
    state,
    view,
    setView,
    start,
    resume,
    continueRound,
    useHint,
    skip,
    exit,
    commit,
    onBoardEvent,
    resolveDisambiguation,
    cancelDisambiguation: () => setPendingDisambiguation(null),
    hintText: hintTextFor(manager.activeHints),
    activeHints: manager.activeHints,
    settings,
    eligible,
  };
}

function lastHintLevel(levels: readonly HintLevel[]): HintLevel {
  return levels[levels.length - 1] ?? 'region';
}

/**
 * Plain-language hint text.
 *
 * Level 1 names the general region, level 2 points at the approximate area, and
 * level 3 reveals the target — which is why the reveal changes the recorded
 * outcome and can never count as an unassisted success.
 */
function hintTextFor(levels: readonly HintLevel[]): string | null {
  const last = levels[levels.length - 1];
  if (last === undefined) return null;
  if (last === 'region') return 'Start with the general region.';
  if (last === 'approximate_area') return 'It sits toward the upper part of that region.';
  return null;
}
