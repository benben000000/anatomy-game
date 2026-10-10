import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/shared/Button';
import {
  LICENCE_VERIFIED,
  PRIVATE_3D_BUILD_FLAG,
  allPacksLicenceVerified,
  privateThreeDBlockedMessage,
  readRuntimeSwitch,
  resolvePrivateThreeD,
  writeRuntimeSwitch,
} from '@/features/anatomy-board/board-3d/privateMode';
import { modelPackManifest } from '@/features/anatomy-board/board-3d/threeDMappings';

/**
 * The private 3D switch.
 *
 * ## Three gates for loading, one for disclosure
 *
 * **Load gates** - build flag, runtime switch, and every pack usable on disk.
 *
 * **Disclosure gate** — LICENCE_VERIFIED, hard-coded false until the source
 * project answers questions Q1 and Q2. It does not block loading, because
 * private personal use triggers no ShareAlike obligation. It does control the
 * warnings, and it is false now, so the warnings show.
 *
 * Keeping those apart is the point. Marking the packs unusable would make private
 * study impossible for no good reason; describing the licence as confirmed would
 * be a false claim. Neither is acceptable, so neither happens.
 */

function arePacksUsable(): boolean {
  return allPacksLicenceVerified(modelPackManifest.packs);
}

export function PrivateThreeDSection() {
  const [enabled, setEnabled] = useState(() => readRuntimeSwitch(safeStorage()));

  const state = resolvePrivateThreeD({
    buildFlag: PRIVATE_3D_BUILD_FLAG,
    runtimeEnabled: enabled,
    allPacksLicenceVerified: arePacksUsable(),
  });

  const toggle = useCallback(() => {
    setEnabled((current) => {
      const next = !current;
      writeRuntimeSwitch(safeStorage(), next);
      return next;
    });
  }, []);

  // The licence status is separate from pack usability, and drives disclosure only.
  const licenceVerified = LICENCE_VERIFIED;

  return (
    <section className="surface stack" aria-labelledby="private-3d-heading">
      <h2 id="private-3d-heading">Private 3D models</h2>
      <p className="prose">
        An optional 3D view using the Open 3D Model for Education. It is stored only on this
        device, is never uploaded, and is not part of any published build.
      </p>

      {!licenceVerified ? (
        // Shown regardless of the build flag. The licence status is a fact about
        // the asset, not about this build, and hiding it whenever 3D is off
        // would mean nobody ever sees it.
        <div className="notice notice--warning">
          <p>
            <strong>The model licence is not verified.</strong>{' '}
            {privateThreeDBlockedMessage('licence-unverified').detail}
          </p>
          <p>
            Using it privately does not require ShareAlike to be triggered, because nothing is
            distributed — but Muscle Atlas will not describe the licence as confirmed while the
            source project still describes it as future work and ships no licence text with the
            files.
          </p>
          <p>
            <Link to="/settings/credits">Read the licence record</Link>
          </p>
        </div>
      ) : null}

      {!PRIVATE_3D_BUILD_FLAG ? (
        <div className="notice notice--info">
          <p>
            <strong>Not available in this build.</strong>{' '}
            {privateThreeDBlockedMessage('build-flag-off').detail}
          </p>
          <p>
            Start the app with <code>npm run dev:3d</code> to enable it.
          </p>
        </div>
      ) : (
        <>
          <div className="switch-row">
            <div className="switch-row__text">
              <p className="switch-row__title">Load local 3D models</p>
              <p className="switch-row__description">
                Off by default, so a shared device never loads them unexpectedly.
              </p>
            </div>
            <Button
              variant={enabled ? 'primary' : 'secondary'}
              aria-pressed={enabled}
              onClick={toggle}
            >
              {enabled ? 'On' : 'Off'}
            </Button>
          </div>

          <p className="muted" style={{ fontSize: '0.875rem' }}>
            Current state:{' '}
            {state.allowed ? 'available' : privateThreeDBlockedMessage(state.reason).headline}.
          </p>
        </>
      )}

      <p>
        <Link className="btn btn--secondary" to="/explore/3d">
          Open the 3D view
        </Link>
      </p>
    </section>
  );
}

/** Private browsing and locked-down modes can make localStorage throw. */
function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export default PrivateThreeDSection;