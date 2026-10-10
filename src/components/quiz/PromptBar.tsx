import { Button } from '@/components/shared/Button';
import { Icon } from '@/components/shared/Icon';

/**
 * Question prompt.
 *
 * Sits above the figure, never over the anatomical target region, and is always
 * visible in both orientations.
 */
export function PromptBar({
  targetName,
  questionNumber,
  totalQuestions,
  hintCount,
}: {
  readonly targetName: string;
  readonly questionNumber: number;
  readonly totalQuestions: number;
  readonly hintCount: number;
}) {
  const percent = totalQuestions === 0 ? 0 : Math.round((questionNumber / totalQuestions) * 100);

  return (
    <div className="prompt-bar">
      <span className="prompt-bar__label">Find the</span>
      <strong className="prompt-bar__target">{targetName}</strong>
      <div className="prompt-bar__progress">
        {hintCount > 0 ? (
          <span className="muted">
            {hintCount} hint{hintCount === 1 ? '' : 's'} used
          </span>
        ) : null}
        <span>
          Question {questionNumber} of {totalQuestions}
        </span>
        <div
          className="prompt-progress"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Round progress"
        >
          <div className="prompt-progress__fill" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}

/**
 * Outcome badge.
 *
 * Colour is always paired with an icon and with words, so the state is
 * legible without colour perception.
 */
export function OutcomeBadge({
  outcome,
  title,
  detail,
}: {
  readonly outcome: 'correct' | 'incorrect' | 'revealed' | 'assisted' | 'skipped';
  readonly title: string;
  readonly detail: string;
}) {
  const mark =
    outcome === 'correct' ? 'check' : outcome === 'incorrect' ? 'cross' : outcome === 'revealed' ? 'eye' : 'info';

  return (
    <div className="outcome" data-outcome={outcome}>
      <span className="outcome__mark" aria-hidden="true">
        <Icon name={mark} size={18} />
      </span>
      <div className="outcome__text">
        <p className="outcome__title">
          <span className="visually-hidden">{outcomeLabel(outcome)}. </span>
          {title}
        </p>
        <p className="outcome__detail">{detail}</p>
      </div>
    </div>
  );
}

function outcomeLabel(outcome: string): string {
  switch (outcome) {
    case 'correct':
      return 'Correct';
    case 'incorrect':
      return 'Not correct';
    case 'revealed':
      return 'Answer revealed';
    case 'assisted':
      return 'Correct with a hint';
    default:
      return 'Skipped';
  }
}

/** A single short, sourced note. Never a paragraph, never invented detail. */
export function SourcedNote({ text }: { readonly text: string }) {
  return <p className="outcome__fact">{text}</p>;
}

export function PrimaryActions({
  onContinue,
  onInspect,
  onAddToReview,
  continueLabel = 'Continue',
  inspectLabel = 'View details',
}: {
  readonly onContinue: () => void;
  readonly onInspect?: () => void;
  readonly onAddToReview?: () => void;
  readonly continueLabel?: string;
  readonly inspectLabel?: string;
}) {
  return (
    <div className="panel-actions">
      <Button variant="primary" size="large" block onClick={onContinue}>
        {continueLabel}
        <Icon name="chevronRight" size={18} />
      </Button>
      {onInspect !== undefined ? (
        <Button variant="secondary" block onClick={onInspect}>
          {inspectLabel}
        </Button>
      ) : null}
      {onAddToReview !== undefined ? (
        <Button variant="ghost" block onClick={onAddToReview}>
          Add to review
        </Button>
      ) : null}
    </div>
  );
}
