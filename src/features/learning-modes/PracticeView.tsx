import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContent } from '@/features/content/ContentProvider';
import { PageScroll } from '@/app/AppShell';
import { Button } from '@/components/shared/Button';
import { Icon } from '@/components/shared/Icon';
import { buildReviewList } from '@/features/learning/study-scheduler/ReviewPriority';
import { summariseProgress } from '@/features/progress/repositories/ProgressRepository';
import { useProgressRecords } from '@/features/progress/useProgressRecords';

/**
 * Practice hub.
 *
 * Two routes into deliberate practice, plus a plain explanation of where each
 * one starts from. Beginner practice is Learn Then Test: a small, chosen group
 * is introduced with labels on, then asked for with labels hidden.
 */
export default function PracticeView() {
  const { repository, flags, systemId, loadError } = useContent();
  const navigate = useNavigate();
  const progress = useProgressRecords();
  const [learnSetSize, setLearnSetSize] = useState(5);

  const structures = useMemo(
    () => (loadError === null ? repository.previewStructures(systemId, flags) : []),
    [flags, loadError, repository, systemId],
  );

  const eligibleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const structure of structures) {
      if (repository.selectableMappingsForStructure(structure.structure_id).length > 0) {
        ids.add(structure.structure_id);
      }
    }
    return ids;
  }, [repository, structures]);

  const reviewList = useMemo(
    () =>
      buildReviewList({
        progress,
        eligibleStructureIds: eligibleIds,
        now: Date.now(),
        limit: 8,
      }),
    [eligibleIds, progress],
  );

  const summary = summariseProgress(progress);

  const startLearnThenTest = () => {
    const picks = structures.slice(0, learnSetSize).map((structure) => structure.structure_id);
    const params = new URLSearchParams({ mode: 'learn_then_test', focus: picks.join(',') });
    navigate(`/identify?${params.toString()}`);
  };

  return (
    <PageScroll>
      <div className="stack stack--loose" style={{ maxWidth: '46rem' }}>
        <div className="stack stack--tight">
          <h1>Practice</h1>
          <p className="prose">
            Deliberate practice, at a pace you choose. Nothing here is timed unless you ask for it.
          </p>
        </div>

        <section className="surface stack" aria-labelledby="learn-heading">
          <h2 id="learn-heading">Beginner practice</h2>
          <p className="prose">
            Learn Then Test. You will be shown {learnSetSize} muscles with labels and a short
            explanation, free to explore them as long as you like. Then the labels are hidden and
            you are asked to find the same ones. There is no score until the second part, and the
            result is labelled as a first encounter rather than as mastery.
          </p>
          <div className="choice-group" role="group" aria-label="How many muscles to introduce">
            {[3, 5, 8].map((size) => (
              <button
                key={size}
                type="button"
                className="choice"
                aria-pressed={learnSetSize === size}
                onClick={() => setLearnSetSize(size)}
              >
                {size} muscles
              </button>
            ))}
          </div>
          <div>
            <Button
              variant="primary"
              size="large"
              onClick={startLearnThenTest}
              disabled={structures.length === 0}
            >
              <Icon name="book" size={18} />
              <span>Start beginner practice</span>
            </Button>
          </div>
        </section>

        <section className="surface stack" aria-labelledby="review-heading">
          <h2 id="review-heading">Review weak areas</h2>
          <p className="prose">
            Ordered by a simple, published rule set — not by anything opaque. Each item says plainly
            why it is here.
          </p>

          {reviewList.length === 0 ? (
            <p className="prose">
              Nothing needs review yet. Structures appear here after you miss them, reveal them, or
              skip them.
            </p>
          ) : (
            <ul className="stack stack--tight" style={{ listStyle: 'none', padding: 0 }}>
              {reviewList.map((entry) => (
                <li key={entry.structureId}>
                  <div className="surface" style={{ padding: '0.75rem' }}>
                    <strong>
                      {repository.structure(entry.structureId)?.canonical_name ?? entry.structureId}
                    </strong>
                    <ul style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                      {entry.reasons.map((reason) => (
                        <li key={reason.code}>{reason.text}</li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div>
            <Button
              variant="primary"
              size="large"
              disabled={reviewList.length === 0}
              onClick={() => navigate('/identify?mode=review')}
            >
              <Icon name="reset" size={18} />
              <span>Review {Math.min(reviewList.length, 10)} structures</span>
            </Button>
          </div>
        </section>

        <section className="surface stack">
          <h2>Where you are</h2>
          <p className="prose">
            {summary.structuresSeen === 0
              ? 'No structures attempted yet.'
              : `${summary.structuresSeen} structure${summary.structuresSeen === 1 ? '' : 's'} attempted, ` +
                `${Math.round(summary.accuracy * 100)}% recalled without a hint.`}
          </p>
          <p>
            <Button variant="secondary" onClick={() => navigate('/progress')}>
              See full progress
            </Button>
          </p>
        </section>
      </div>
    </PageScroll>
  );
}
