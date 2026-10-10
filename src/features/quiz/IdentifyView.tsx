import { useMemo, useState } from 'react';
import { useContent } from '@/features/content/ContentProvider';
import { useIdentifySession } from './useIdentifySession';
import { AnatomyBoard } from '@/components/anatomy/AnatomyBoard';
import { PromptBar, OutcomeBadge, SourcedNote, PrimaryActions } from '@/components/quiz/PromptBar';
import { DisambiguationChooser, StructureList } from '@/components/quiz/DisambiguationChooser';
import { RoundSetupForm, type RoundConfigShape } from '@/components/quiz/RoundSetupForm';
import { ResultsView } from '@/components/quiz/ResultsView';
import { Button } from '@/components/shared/Button';
import { Icon } from '@/components/shared/Icon';
import { APP_FLAGS } from '@/features/content/ContentProvider';
import type { AnswerOutcome, QuizSessionConfig } from '@/domain/learning/learning';

/**
 * Identify mode.
 *
 * The main retrieval-practice loop. Three zones: prompt above the board, board
 * in the middle taking the largest area, contextual feedback to the side (and a
 * capped bottom sheet in portrait).
 */
export default function IdentifyView() {
  const { repository, loadError } = useContent();
  const [config, setConfig] = useState<QuizSessionConfig>(() => ({
    mode: 'identify',
    view_filter: 'anterior',
    region_ids: [],
    difficulty_tiers: [],
    target_size: 10,
    focus_structure_ids: [],
    time_limit_seconds: null,
  }));

  const session = useIdentifySession(config);
  const { state } = session;

  const setupConfig: RoundConfigShape = {
    mode: config.mode,
    view_filter: config.view_filter,
    region_ids: config.region_ids,
    difficulty_tiers: config.difficulty_tiers,
    target_size: config.target_size,
    focus_structure_ids: config.focus_structure_ids,
    time_limit_seconds: config.time_limit_seconds,
  };

  const targetName = useMemo(() => {
    if (state.question === null) return '';
    return repository.structure(state.question.structure_id)?.canonical_name ?? '';
  }, [repository, state.question]);

  if (loadError !== null) {
    return (
      <main className="home" id="main-content">
        <div className="home__inner">
          <div className="notice notice--warning" role="alert">
            <p>{loadError}</p>
            <p>Run `npm run validate:content` for the full report.</p>
          </div>
        </div>
      </main>
    );
  }

  if (state.phase === 'setup') {
    return (
      <main className="home" id="main-content">
        <div className="home__inner">
          <RoundSetupForm
            title="Quick identification"
            description="Find the named muscle on the body illustration. Hints are always free and never affect your score beyond being recorded."
            config={setupConfig}
            onConfigChange={(next) =>
              setConfig({
                mode: next.mode,
                view_filter: next.view_filter,
                region_ids: [...next.region_ids],
                difficulty_tiers: next.difficulty_tiers.filter(
                  (tier): tier is 'introductory' | 'intermediate' | 'advanced' =>
                    tier === 'introductory' || tier === 'intermediate' || tier === 'advanced',
                ),
                target_size: next.target_size,
                focus_structure_ids: [...next.focus_structure_ids],
                time_limit_seconds: next.time_limit_seconds,
              })
            }
            eligibleCount={session.eligible.length}
            canStart={state.canStart}
            onStart={() => void session.start()}
            emptyReason={state.emptyReason}
          />
        </div>
      </main>
    );
  }

  if (state.phase === 'results' && state.summary !== null) {
    return (
      <main className="home" id="main-content">
        <div className="home__inner">
          <ResultsView
            summary={state.summary}
            onRepeat={() => void session.start()}
          />
        </div>
      </main>
    );
  }

  const interactive = state.phase === 'question';

  return (
    <main className="workspace" id="main-content">
      <div className="workspace__board">
        <AnatomyBoard
          view={session.view}
          onViewChange={session.setView}
          candidates={state.candidates}
          visualStates={state.visualStates}
          interactionEnabled={interactive}
          labelsVisible={false}
          onEvent={session.onBoardEvent}
          showDebugTools={APP_FLAGS.ENABLE_DEBUG_TOOLS}
          prompt={
            state.question !== null ? (
              <PromptBar
                targetName={targetName}
                questionNumber={state.questionNumber}
                totalQuestions={state.totalQuestions}
                hintCount={state.hintsUsed}
              />
            ) : null
          }
          boardControls={
            interactive ? (
              <div className="board__controls-group" role="group" aria-label="Help">
                <Button
                  variant="secondary"
                  size="small"
                  onClick={session.useHint}
                  disabled={!state.hintAvailable}
                >
                  <Icon name="hint" size={18} />
                  <span>Hint</span>
                </Button>
                <Button variant="ghost" size="small" onClick={session.skip}>
                  <Icon name="skip" size={18} />
                  <span>Skip</span>
                </Button>
              </div>
            ) : null
          }
        />
      </div>

      <aside className="workspace__panel" aria-label="Answer feedback">
        <AnswerPanel session={session} />
      </aside>

      {state.pendingDisambiguation !== null ? (
        <DisambiguationChooser
          candidates={state.pendingDisambiguation}
          blind
          onSelect={session.resolveDisambiguation}
          onCancel={session.cancelDisambiguation}
        />
      ) : null}
    </main>
  );
}

function AnswerPanel({ session }: { readonly session: ReturnType<typeof useIdentifySession> }) {
  const { state, hintText } = session;
  const { repository } = useContent();

  if (state.feedback === null) {
    return (
      <div className="stack">
        <div>
          <h2 className="section-title">Answer</h2>
          <p className="prose">
            Tap the muscle on the board, or choose it from the list below. Both routes count
            identically.
          </p>
        </div>

        {hintText !== null ? (
          <p className="notice notice--info" role="status">
            {hintText}
          </p>
        ) : null}

        <StructureList
          title="Choose a structure without tapping"
          structureIds={state.candidates.map((candidate) => candidate.structureId)}
          selectedStructureId={null}
          onSelect={(structureId) => void session.commit(structureId)}
          disabled={!interactivePhase(state.phase)}
        />
      </div>
    );
  }

  const { feedback } = state;
  const correct = repository.structure(feedback.correctStructureId);
  const selected =
    feedback.selectedStructureId === null ? null : repository.structure(feedback.selectedStructureId);

  return (
    <div className="stack">
      <OutcomeBadge
        outcome={toBadgeOutcome(feedback.outcome)}
        title={headlineFor(feedback.outcome, correct?.canonical_name ?? '')}
        detail={detailFor(feedback.outcome, selected?.canonical_name ?? null, correct?.canonical_name ?? '')}
      />

      {correct !== null ? (
        <SourcedNote text={`${correct.summary} ${correct.function_summary}`} />
      ) : null}

      <PrimaryActions onContinue={() => void session.continueRound()} inspectLabel="Inspect on the board" />

      <p className="muted" style={{ fontSize: '0.875rem' }}>
        Hints and skips are recorded honestly so review can target what you actually found hard.
      </p>
    </div>
  );
}

function interactivePhase(phase: string): boolean {
  return phase === 'question';
}

function toBadgeOutcome(
  outcome: AnswerOutcome,
): 'correct' | 'incorrect' | 'revealed' | 'assisted' | 'skipped' {
  return outcome as 'correct' | 'incorrect' | 'revealed' | 'assisted' | 'skipped';
}

function headlineFor(outcome: AnswerOutcome, correctName: string): string {
  switch (outcome) {
    case 'correct':
      return `Correct — ${correctName}`;
    case 'incorrect':
      return 'Not quite';
    case 'revealed':
      return `Answer revealed — ${correctName}`;
    case 'assisted':
      return `Correct with a hint — ${correctName}`;
    case 'skipped':
      return 'Skipped';
    default:
      return 'Round ended';
  }
}

function detailFor(
  outcome: AnswerOutcome,
  selectedName: string | null,
  correctName: string,
): string {
  switch (outcome) {
    case 'correct':
      return 'You located it without a hint.';
    case 'incorrect':
      return `You selected ${selectedName}. The target was ${correctName}.`;
    case 'revealed':
      return `Shown rather than recalled. This one will come back sooner.`;
    case 'assisted':
      return `You found it with a hint. ${correctName} will return sooner than an unassisted answer.`;
    case 'skipped':
      return `The target was ${correctName}. It will come back sooner.`;
    default:
      return '';
  }
}
