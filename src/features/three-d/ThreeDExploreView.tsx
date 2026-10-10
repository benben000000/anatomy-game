import { useCallback, useMemo, useState } from 'react';
import { useContent } from '@/features/content/ContentProvider';
import { PageScroll } from '@/app/AppShell';
import { Button } from '@/components/shared/Button';
import { Icon } from '@/components/shared/Icon';
import { ThreeDViewer } from '@/components/anatomy/ThreeDViewer';
import { ModelAttributionPanel } from '@/components/anatomy/ModelAttributionPanel';
import {
  LICENCE_VERIFIED,
  PRIVATE_3D_BUILD_FLAG,
  allPacksLicenceVerified,
  privateThreeDBlockedMessage,
  readRuntimeSwitch,
  resolvePrivateThreeD,
} from '@/features/anatomy-board/board-3d/privateMode';
import {
  INSPECT_ONLY_REASONS,
  INSPECT_ONLY_STRUCTURE_IDS,
  modelPackManifest,
} from '@/features/anatomy-board/board-3d/threeDMappings';
import { structureIdSchema, type StructureId } from '@/domain/anatomy/ids';

/**
 * The 3D exploration route.
 *
 * ## Lazy by construction
 *
 * This module is loaded through `React.lazy` in routes.tsx, and `ThreeDViewer`
 * loads three.js with a dynamic import inside an effect. A learner who never
 * opens `/explore/3d` downloads neither.
 *
 * ## The 2D board is never blocked
 *
 * Whatever happens here, there is a visible, working path back to the complete
 * 2D board. Five structures have no 3D counterpart at all, so 2D is the only route
 * to them by definition.
 */
export default function ThreeDExploreView() {
  const { repository } = useContent();
  const [panelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState<StructureId | null>(null);

  // Pack usability gates loading. Licence status gates disclosure. Private use
  // triggers no ShareAlike obligation, so an unverified licence must not block
  // local study -- but every licence warning below must stay visible.
  const state = resolvePrivateThreeD({
    buildFlag: PRIVATE_3D_BUILD_FLAG,
    runtimeEnabled: readRuntimeSwitch(safeStorage()),
    allPacksLicenceVerified: allPacksLicenceVerified(modelPackManifest.packs),
  });
  const licenceVerified = LICENCE_VERIFIED;

  const inspectOnly = useMemo(
    () => INSPECT_ONLY_STRUCTURE_IDS.map((id) => structureIdSchema.parse(id)),
    [],
  );

  const onStructureSelected = useCallback((structureId: StructureId) => {
    setSelected(structureId);
  }, []);

  const structureCount = repository.all.structures.length;
  // Narrow the union once so the JSX below does not re-check it on every branch.
  const blockedReason = state.allowed === true ? null : state.reason;
  const blocked = blockedReason === null ? null : privateThreeDBlockedMessage(blockedReason);
  const selectedIsInspectOnly = selected !== null && inspectOnly.includes(selected);

  return (
    <PageScroll>
      <div className="stack stack--loose" style={{ maxWidth: '56rem' }}>
        <div className="stack stack--tight">
          <h1>Explore in 3D</h1>
          <p className="prose">
            An optional rotating view of real anatomy, running entirely on this device. It sits
            alongside the 2D anatomy board rather than replacing it, and every structure available in
            3D is also available in 2D.
          </p>
        </div>

        {blocked !== null ? (
          <section className="surface stack" aria-labelledby="three-d-blocked">
            <h2 id="three-d-blocked">{blocked.headline}</h2>
            <p className="prose">{blocked.detail}</p>
            {blockedReason === 'licence-unverified' ? (
              <p className="prose">
                <strong>Why this is not merely a technical problem:</strong> Muscle Atlas will not
                load or describe a model whose licence it could not confirm, even for private use.
                Using it privately does not trigger the ShareAlike condition, because nothing is
                distributed — but the licence is still recorded as unverified, and the attribution
                below is shown either way.
              </p>
            ) : null}
            {blockedReason === 'runtime-switch-off' ? (
              <p className="prose">
                Turn it on in <strong>Settings → Private 3D models</strong>, then return here.
              </p>
            ) : null}
            <p>
              <Button variant="primary" size="large" onClick={() => window.location.reload()}>
                Check again
              </Button>
            </p>
          </section>
        ) : (
          <>
            <ThreeDViewer
              enabled
              inspectOnlyStructureIds={inspectOnly}
              onStructureSelected={onStructureSelected}
            />

            {/*
              The licence notice appears on the 3D route itself, not only in
              Settings. A model on screen whose licence is unconfirmed must say so
              wherever the model is, or the disclosure is easy to miss.
            */}
            {!licenceVerified ? (
              <p className="notice notice--info" role="note">
                <strong>Licence not verified.</strong> This model is the Open 3D Model for Education,
                which the source project states is CC BY-SA 4.0. That could not be confirmed - the
                project describes the licence as future work and ships no licence text with the
                files. It is loaded here for private study only, is never redistributed, and is not
                cleared for publication. Full credits are below.
              </p>
            ) : null}
          </>
        )}

        {selected !== null ? (
          <section className="surface stack" aria-labelledby="three-d-selected">
            <h2 id="three-d-selected">
              {repository.all.structures.find((structure) => structure.structure_id === selected)
                ?.display_name ?? 'Selected structure'}
            </h2>
            {selectedIsInspectOnly ? (
              <p className="notice notice--info" role="status">
                <strong>Inspection only.</strong>{' '}
                {INSPECT_ONLY_REASONS[selected] ?? 'This structure cannot be fairly asked.'}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="surface stack">
          <h2>What the 3D view adds, and what it does not</h2>
          <p className="prose">
            Rotation lets you see a muscle from an angle a flat board cannot show, which genuinely
            helps for muscles that wrap around — the deltoid around the shoulder, the vastus
            lateralis down the outside of the thigh.
          </p>
          <p className="prose">
            It does not replace the 2D board for identification practice. A rotating model also makes
            it easier to lose track of where you are, and {structureCount} structures exist in the
            2D content pack while only some of them have a 3D counterpart in the packs currently
            available from the source project. The 2D board therefore remains the complete route,
            and will continue to be.
          </p>
          <p className="muted" style={{ fontSize: '0.875rem' }}>
            Every muscle you see here was verified node-by-node against the source model's own node
            list. Where a name could have belonged to a tendon, a bursa or an overlapping part of
            another muscle, it was excluded rather than guessed at — see{' '}
            <code>scripts/three-d-trim-manifest.ts</code>.
          </p>
        </section>

        <Button
          variant="secondary"
          onClick={() => setPanelOpen((value) => !value)}
          aria-expanded={panelOpen}
        >
          <Icon name="info" size={18} />
          <span>{panelOpen ? 'Hide model credits' : 'Model credits and licence'}</span>
        </Button>

        {panelOpen ? <ModelAttributionPanel /> : null}
      </div>
    </PageScroll>
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
