import { Link } from 'react-router-dom';
import { Button } from '@/components/shared/Button';
import { Icon } from '@/components/shared/Icon';
import {
  unavailableMessage,
  type ThreeDUnavailableMessage,
} from '@/features/anatomy-board/board-3d/MeshStructureMapper';
import { formatBytes, type ModelPackDescriptor } from '@/services/assets/ModelCacheService';

/**
 * The 3D fallback.
 *
 * Shown whenever 3D cannot run. Three requirements shape it:
 *
 * 1. It must never look like an error. The learner did nothing wrong, and the
 *    2D board they came from is still there and complete.
 * 2. It must distinguish "you can fix this" from "you cannot", because
 *    telling someone to check their connection when a licence is the blocker
 *    wastes their time and teaches them that this app is unreliable.
 * 3. It must always offer a way back. There is no state in which the only way
 *    forward is unavailable.
 */
export function ThreeDViewerFallback({
  reason,
  onClose,
  pack,
  onDownload,
  downloadState,
}: {
  readonly reason: ThreeDUnavailableMessage;
  readonly onClose: () => void;
  readonly pack?: ModelPackDescriptor | undefined;
  readonly onDownload?: () => void;
  readonly downloadState?: 'idle' | 'downloading' | 'failed';
}) {
  const message = unavailableMessage(reason);
  const canDownload =
    reason === 'no-cached-pack' && onDownload !== undefined && downloadState !== 'downloading';

  return (
    <section className="surface stack" aria-labelledby="three-d-fallback-heading" data-testid="three-d-fallback">
      <div className="stack stack--tight">
        <p className="section-title">3D view</p>
        <h2 id="three-d-fallback-heading">{message.headline}</h2>
        <p className="prose">{message.detail}</p>
      </div>

      {reason === 'pack-licence-blocked' ? (
        <p className="notice notice--info">
          Muscle Atlas does not ship assets whose licence it has not verified. See{' '}
          <Link to="/settings/credits">Credits and licences</Link> for the current status.
        </p>
      ) : null}

      <div className="panel-actions">
        {canDownload && pack !== undefined ? (
          <Button variant="primary" size="large" block onClick={onDownload}>
            <Icon name="reset" size={18} />
            <span>Download for offline use ({formatBytes(pack.sizeBytes)})</span>
          </Button>
        ) : null}

        {downloadState === 'downloading' ? (
          <p className="prose" role="status">
            Downloading the model. You can return to 2D at any time; the download will finish on
            its own or stop when you leave.
          </p>
        ) : null}

        {downloadState === 'failed' ? (
          <p className="notice notice--warning" role="status">
            The download did not complete. Check your connection and try again, or continue in 2D.
          </p>
        ) : null}

        <Link className="btn btn--secondary btn--large" to="/explore">
          Continue in the 2D anatomy view
        </Link>

        <Button variant="ghost" block onClick={onClose}>
          Close 3D
        </Button>
      </div>
    </section>
  );
}