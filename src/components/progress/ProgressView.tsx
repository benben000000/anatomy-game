import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageScroll } from '@/app/AppShell';
import { useContent } from '@/features/content/ContentProvider';
import { useProgressRecords } from '@/features/progress/useProgressRecords';
import { useRepositories } from '@/app/providers/RepositoryProvider';
import { bandForProgress, summariseProgress } from '@/features/progress/repositories/ProgressRepository';
import { buildReviewList, improvingStructures } from '@/features/learning/study-scheduler/ReviewPriority';
import { resetScope, type ResetScope } from '@/services/storage/corrupted-store-recovery';
import { getDatabase } from '@/services/storage/db';
import { Button } from '@/components/shared/Button';
import { RECENT_ATTEMPT_WINDOW } from '@/domain/progress/progress';

/**
 * Progress.
 *
 * Useful and calm. Accuracy, what is improving, what needs review, and one
 * recommended next action. No charts required to understand it, no streaks, no
 * badges, and no claim of competency.
 */
export default function ProgressView() {
  const { repository, flags, systemId } = useContent();
  const { repositories, storageUnavailable } = useRepositories();
  const records = useProgressRecords();
  const [message, setMessage] = useState<string | null>(null);

  const eligibleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const structure of repository.previewStructures(systemId, flags)) {
      if (repository.selectableMappingsForStructure(structure.structure_id).length > 0) {
        ids.add(structure.structure_id);
      }
    }
    return ids;
  }, [flags, repository, systemId]);

  const summary = useMemo(() => summariseProgress(records), [records]);
  const review = useMemo(
    () => buildReviewList({ progress: records, eligibleStructureIds: eligibleIds, now: Date.now() }),
    [eligibleIds, records],
  );
  const improving = useMemo(() => improvingStructures(records), [records]);

  const handleReset = async (scope: ResetScope) => {
    await resetScope(getDatabase(), scope);
    if (scope === 'progress' || scope === 'sessions' || scope === 'all') {
      setMessage('Learning progress cleared. Cached content and settings were kept.');
    } else {
      setMessage(`${scope === 'content' ? 'Cached content record' : 'Settings'} cleared.`);
    }
    window.location.reload();
  };

  return (
    <PageScroll>
      <div className="stack stack--loose" style={{ maxWidth: '52rem' }}>
        <div className="stack stack--tight">
          <h1>Progress</h1>
          <p className="prose">
            Progress is stored only on this device. There is no account, no server and no sync.
          </p>
        </div>

        {storageUnavailable ? (
          <div className="notice notice--warning" role="status">
            <p>
              This browser is not allowing local storage, so progress will not be saved after you
              close the tab. This is expected in Safari Private Browsing.
            </p>
          </div>
        ) : null}

        {records.length === 0 ? (
          <div className="surface stack">
            <h2>No attempts yet</h2>
            <p className="prose">
              Once you answer a few questions, your accuracy and review list will appear here.
            </p>
            <p>
              <Link className="btn btn--primary btn--large" to="/identify">
                Start a round
              </Link>
            </p>
          </div>
        ) : (
          <>
            <section className="surface stack" aria-labelledby="summary-heading">
              <h2 id="summary-heading">Overall</h2>
              <div className="metric-row">
                <div className="metric">
                  <div className="metric__value">{Math.round(summary.accuracy * 100)}%</div>
                  <div className="metric__label">recalled without a hint</div>
                </div>
                <div className="metric">
                  <div className="metric__value">{summary.structuresSeen}</div>
                  <div className="metric__label">structures attempted</div>
                </div>
                <div className="metric">
                  <div className="metric__value">{summary.attempts}</div>
                  <div className="metric__label">total attempts</div>
                </div>
                <div className="metric">
                  <div className="metric__value">{review.length}</div>
                  <div className="metric__label">waiting for review</div>
                </div>
              </div>
              <p className="prose" style={{ fontSize: '0.875rem' }}>
                A structure only reaches the highest band after {3} separate unassisted successes.
                One correct answer is not treated as mastery.
              </p>
            </section>

            <section className="surface stack" aria-labelledby="next-heading">
              <h2 id="next-heading">Recommended next step</h2>
              {review.length > 0 ? (
                <>
                  <p className="prose">
                    {review.length} structure{review.length === 1 ? '' : 's'} would benefit from
                    another look before you move on to anything new.
                  </p>
                  <p>
                    <Link className="btn btn--primary btn--large" to="/identify?mode=review">
                      Review weak areas
                    </Link>
                  </p>
                </>
              ) : (
                <>
                  <p className="prose">
                    Nothing is flagged for review. A new round on a different region is the most
                    useful next step.
                  </p>
                  <p>
                    <Link className="btn btn--primary btn--large" to="/identify">
                      Start a new round
                    </Link>
                  </p>
                </>
              )}
            </section>

            <section className="surface stack" aria-labelledby="review-heading">
              <h2 id="review-heading">Needs review</h2>
              {review.length === 0 ? (
                <p className="prose">Nothing is waiting for review right now.</p>
              ) : (
                <div className="mastery-list">
                  {review.map((entry) => (
                    <div key={entry.structureId} className="mastery-row">
                      <div className="mastery-row__head">
                        <span>
                          {repository.structure(entry.structureId)?.canonical_name ?? entry.structureId}
                        </span>
                        <span className="mastery-row__band">{entry.band.label}</span>
                      </div>
                      <ul style={{ fontSize: '0.875rem' }}>
                        {entry.reasons.map((reason) => (
                          <li key={reason.code}>{reason.text}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {improving.length > 0 ? (
              <section className="surface stack" aria-labelledby="improving-heading">
                <h2 id="improving-heading">Coming along</h2>
                <div className="mastery-list">
                  {improving.map((record) => (
                    <div key={record.structure_id} className="mastery-row">
                      <div className="mastery-row__head">
                        <span>
                          {repository.structure(record.structure_id)?.canonical_name ??
                            record.structure_id}
                        </span>
                        <span className="mastery-row__band">{bandForProgress(record).wording}</span>
                      </div>
                      <div className="mastery-bar">
                        <div
                          className="mastery-bar__fill"
                          style={{ width: `${Math.round(record.mastery_score * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="surface stack" aria-labelledby="outcomes-heading">
              <h2 id="outcomes-heading">Answer breakdown</h2>
              <dl className="detail-list">
                <div className="detail-list__row">
                  <dt className="detail-list__term">Recalled unaided</dt>
                  <dd>{summary.unassistedCorrect}</dd>
                </div>
                <div className="detail-list__row">
                  <dt className="detail-list__term">Selected something else</dt>
                  <dd>{summary.incorrect}</dd>
                </div>
                <div className="detail-list__row">
                  <dt className="detail-list__term">Found with a hint</dt>
                  <dd>{summary.assisted}</dd>
                </div>
                <div className="detail-list__row">
                  <dt className="detail-list__term">Revealed</dt>
                  <dd>{summary.revealed}</dd>
                </div>
                <div className="detail-list__row">
                  <dt className="detail-list__term">Skipped</dt>
                  <dd>{summary.skipped}</dd>
                </div>
              </dl>
              <p className="muted" style={{ fontSize: '0.875rem' }}>
                Review priority looks at the last {RECENT_ATTEMPT_WINDOW} attempts per structure.
              </p>
            </section>
          </>
        )}

        <section className="surface stack" aria-labelledby="reset-heading">
          <h2 id="reset-heading">Erase data</h2>
          <p className="prose">
            These are separate on purpose. Clearing cached artwork must never cost you your learning
            history.
          </p>
          {message === null ? null : <p className="notice notice--info">{message}</p>}
          <div className="choice-group">
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm('Erase all learning progress on this device? This cannot be undone.')) {
                  void handleReset('progress');
                }
              }}
            >
              Reset learning progress
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm('Erase round history? This cannot be undone.')) {
                  void handleReset('sessions');
                }
              }}
            >
              Clear round history
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm('Forget which content is downloaded? Progress is kept.')) {
                  void handleReset('content');
                }
              }}
            >
              Clear downloaded content record
            </Button>
          </div>
          <p className="muted" style={{ fontSize: '0.875rem' }}>
            {repositories.progress.storageProblem === null
              ? 'Local storage is available.'
              : 'Local storage is unavailable in this browsing mode.'}
          </p>
        </section>
      </div>
    </PageScroll>
  );
}
