import { useContent } from '@/features/content/ContentProvider';
import { Button } from '@/components/shared/Button';

/**
 * Content status banner.
 *
 * When the project is showing unreviewed content or placeholder artwork, the
 * app says so on every screen that uses content. This is not a formality: a
 * learner must never mistake a development build for reviewed anatomy.
 *
 * When nothing is provisional, this renders nothing at all.
 */
export function ContentStatusGate() {
  const { flags, report, contentCount } = useContent();

  if (!flags.PROVISIONAL_ART && !flags.ALLOW_DRAFT_CONTENT) return null;

  const unpublished = report.blockingReason !== null;

  return (
    <div className="stack stack--tight">
      <div className="notice notice--warning" role="status">
        <div>
          <p>
            <strong>Development build.</strong> The illustration is placeholder geometry and the
            descriptions are unreviewed draft text. Neither is anatomically verified. Do not study
            from this build.
          </p>
        </div>
      </div>

      {unpublished ? (
        <div className="notice" role="status">
          <div>
            <p>{report.blockingReason}</p>
            <p style={{ marginTop: '0.5rem' }}>
              {contentCount} structure{contentCount === 1 ? '' : 's'} are loaded for development
              preview. Nothing is eligible for a learner round.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Empty state for a mode with nothing eligible to show.
 *
 * Shown instead of an empty board or an empty quiz, because a blank screen reads
 * as a broken app rather than as an honest answer.
 */
export function EmptyEligibilityState({ action }: { readonly action?: React.ReactNode }) {
  return (
    <div className="surface stack" data-testid="empty-eligibility">
      <h2>Nothing is ready to ask yet</h2>
      <p className="prose">
        Every muscle in this content pack is still awaiting review by a qualified anatomy
        reviewer, so no question can be asked without risking teaching something unverified.
      </p>
      <p className="prose">
        See <code>docs/05-content-review-workflow.md</code> for how to take a structure from draft
        to published.
      </p>
      {action}
    </div>
  );
}

export function StorageUnavailableNotice({ message }: { readonly message: string }) {
  return (
    <div className="notice notice--info" role="status">
      <div>
        <p>{message}</p>
      </div>
    </div>
  );
}

export function RetryButton({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <Button variant="secondary" onClick={onRetry}>
      Try again
    </Button>
  );
}
