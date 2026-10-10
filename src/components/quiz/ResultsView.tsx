import { Link } from 'react-router-dom';
import type { SessionSummary } from '@/features/learning/answer-evaluator/AnswerEvaluator';
import { Button } from '@/components/shared/Button';
import { useContent } from '@/features/content/ContentProvider';

/**
 * Round results.
 *
 * Calm and specific. No confetti for routine correctness, no streak, no badge
 * inflation, and never the word "mastered" — one correct answer does not make
 * anyone competent at anything.
 */
export function ResultsView({
  summary,
  onRepeat,
}: {
  readonly summary: SessionSummary;
  readonly onRepeat: () => void;
}) {
  const { repository, systemId } = useContent();

  const percent = Math.round(summary.accuracy * 100);
  const graded = summary.correct + summary.incorrect + summary.assisted + summary.revealed;

  const reviewNames = summary.reviewTargets
    .map((id) => repository.structure(id)?.canonical_name)
    .filter((name): name is string => typeof name === 'string');

  return (
    <div className="stack stack--loose" style={{ maxWidth: '48rem' }}>
      <div className="stack stack--tight">
        <h1>Round complete</h1>
        <p className="prose">
          You answered {summary.total} question{summary.total === 1 ? '' : 's'} in this round.
        </p>
      </div>

      <section className="surface stack" aria-labelledby="accuracy-heading">
        <h2 id="accuracy-heading">Accuracy</h2>
        <div className="metric-row">
          <div className="metric">
            <div className="metric__value">{percent}%</div>
            <div className="metric__label">
              recalled unaided ({summary.correct} of {graded} graded)
            </div>
          </div>
          <div className="metric">
            <div className="metric__value">{summary.incorrect}</div>
            <div className="metric__label">selected something else</div>
          </div>
          <div className="metric">
            <div className="metric__value">{summary.assisted + summary.revealed}</div>
            <div className="metric__label">found with a hint or revealed</div>
          </div>
          <div className="metric">
            <div className="metric__value">{summary.skipped}</div>
            <div className="metric__label">skipped</div>
          </div>
        </div>
        <p className="prose" style={{ fontSize: '0.875rem' }}>
          Skipped questions are not counted against accuracy, and answers found with a hint are
          counted separately. That is what makes the number honest.
        </p>
      </section>

      {reviewNames.length > 0 ? (
        <section className="surface stack" aria-labelledby="review-heading">
          <h2 id="review-heading">Worth another look</h2>
          <p className="prose">
            These came back in this round. They will return sooner in Review weak areas than things
            you recalled unaided.
          </p>
          <ul>
            {reviewNames.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="surface stack">
          <h2>Nothing flagged for review</h2>
          <p className="prose">
            Every question in this round was recalled unaided. Come back later to check it has stuck
            rather than rereading it now.
          </p>
        </section>
      )}

      <div className="choice-group">
        <Button variant="primary" size="large" onClick={onRepeat}>
          Practise again
        </Button>
        <Link className="btn btn--secondary btn--large" to="/identify">
          Change the round
        </Link>
        <Link className="btn btn--secondary btn--large" to="/progress">
          See progress
        </Link>
        <Link className="btn btn--secondary btn--large" to={`/explore?system=${systemId}`}>
          Explore anatomy
        </Link>
      </div>
    </div>
  );
}
