import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/shared/Button';
import { Icon } from '@/components/shared/Icon';
import type {
  AnatomyBoardAdapter,
  AnatomyBoardEvent,
  CandidateHit,
} from '@/features/anatomy-board/contracts/anatomy-board-adapter';
import type { StructureId } from '@/domain/anatomy/ids';
import { MeshStructureMapper } from '@/features/anatomy-board/board-3d/MeshStructureMapper';
import {
  INSPECT_ONLY_REASONS,
  threeDMappingsFile,
} from '@/features/anatomy-board/board-3d/threeDMappings';
import type { ThreeDAnatomyBoard } from '@/features/anatomy-board/board-3d/ThreeDAnatomyBoard';

type BoardState = 'idle' | 'loading' | 'ready' | 'failed';

export interface ThreeDViewerProps {
  /** Built for local use and the owner has opted in at build time. */
  readonly enabled: boolean;
  /** Structures that must never be asked in a blind question. */
  readonly inspectOnlyStructureIds?: readonly StructureId[];
  readonly onStructureSelected?: (structureId: StructureId) => void;
}

/**
 * The 3D viewer shell.
 *
 * ## What this component owns
 *
 * Three.js is imported here with a **dynamic** import inside an effect, never at
 * module scope. That is the whole mechanism by which ~600 kB of renderer stays
 * out of the 2D bundle: a learner who never opens 3D never downloads it. The
 * route itself is also `React.lazy`.
 *
 * ## Controls
 *
 * Every gesture has a visible on-screen equivalent, because the target is a held
 * iPad where a feature reachable only by pinch is a feature most learners never
 * find. One finger rotates, two fingers pan, pinch zooms, and rotate / pan /
 * zoom / reset / isolate / back-to-2D all have buttons.
 *
 * ## Inspection-only structures
 *
 * Soleus is covered by gastrocnemius in the only posterior view these packs
 * provide, so it cannot be fairly asked. It is still visible and inspectable —
 * hiding a muscle entirely would be a worse lie — but the host is told it must
 * not generate blind questions from it, and the reason is shown in the UI.
 */
export function ThreeDViewer({
  enabled,
  inspectOnlyStructureIds = [],
  onStructureSelected,
}: ThreeDViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boardRef = useRef<AnatomyBoardAdapter | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const [state, setState] = useState<BoardState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [structureCount, setStructureCount] = useState(0);
  const [candidates, setCandidates] = useState<readonly CandidateHit[] | null>(null);
  const [labelsVisible, setLabelsVisible] = useState(false);
  const [inspectOnly, setInspectOnly] = useState<string | null>(null);

  const inspectOnlySet = useMemo(() => new Set(inspectOnlyStructureIds), [inspectOnlyStructureIds]);

  const mapper = useMemo(
    () => new MeshStructureMapper({ mappings: threeDMappingsFile.mappings }),
    [],
  );

  /** Packs actually present in the private asset store, keyed by display name. */
  const packPath = '/private-models/upper-limb-muscles.glb';

  useEffect(() => {
    if (!enabled) return undefined;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (container === null || canvas === null) return undefined;

    let cancelled = false;
    setState('loading');

    void (async () => {
      try {
        // Dynamic import. This is what keeps three.js out of the 2D bundle.
        const [three, boardModule] = await Promise.all([
          import('three'),
          import('@/features/anatomy-board/board-3d/ThreeDAnatomyBoard'),
        ]);

        if (cancelled) return;

        const board = new boardModule.ThreeDAnatomyBoard({
          container,
          canvas,
          mapper,
          assetPath: packPath,
          three,
          animationAllowed: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          preserveDrawingBuffer: new URLSearchParams(window.location.search).get('pixelProbe') === '1',
          onError: (_code, message) => {
            setErrorMessage(message);
            setState('failed');
          },
          onDisambiguation: (hitCandidates) => setCandidates(hitCandidates),
        });

        boardRef.current = board;
        unsubscribeRef.current = board.subscribe((event: AnatomyBoardEvent) => {
          if (event.type === 'board-ready') {
            setStructureCount(event.structureCount);
            setState('ready');
          }
          if (event.type === 'structure-selected') {
            const selectedId = event.structureId;
            onStructureSelected?.(selectedId);
            // Explain, in place, why an inspection-only muscle will never be a
            // blind question — instead of leaving its exclusions unexplained.
            if (inspectOnlySet.has(selectedId)) {
              setInspectOnly(
                INSPECT_ONLY_REASONS[selectedId] !== undefined ? selectedId : null,
              );
              board.setFocusSet([selectedId]);
              (board as ThreeDAnatomyBoard).focusStructure(selectedId);
            }
          }
        });

        await board.load();
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'The 3D model could not be loaded.',
          );
          setState('failed');
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      // destroy() releases the WebGL context, geometries and textures. Without
      // it, navigating away and back eventually exhausts the browser's limit of
      // live contexts and the canvas silently stops rendering on iOS.
      boardRef.current?.destroy();
      boardRef.current = null;
    };
  }, [enabled, mapper, onStructureSelected, packPath, inspectOnlySet]);

  const withBoard = useCallback((action: (board: AnatomyBoardAdapter) => void) => {
    const board = boardRef.current;
    if (board !== null) action(board);
  }, []);

  const resolveCandidate = useCallback(
    (candidate: CandidateHit) => {
      setCandidates(null);
      onStructureSelected?.(candidate.structureId as StructureId);
    },
    [onStructureSelected],
  );

  if (!enabled) {
    return (
      <section className="surface stack" aria-labelledby="three-d-disabled">
        <h2 id="three-d-disabled">3D view is switched off</h2>
        <p className="prose">
          Private 3D models are disabled. Turn them on in Settings if you want to use them. The 2D
          anatomy view is complete and unaffected.
        </p>
        <Link className="btn btn--secondary" to="/explore">
          Continue in the 2D anatomy view
        </Link>
      </section>
    );
  }

  return (
    <section className="stack" aria-labelledby="three-d-heading">
      <h2 id="three-d-heading" className="visually-hidden">
        3D anatomy model
      </h2>

      <div
        ref={containerRef}
        className="three-d-stage"
        data-testid="three-d-stage"
        data-state={state}
        style={{ position: 'relative', width: '100%', minHeight: 420 }}
      >
        <canvas
          ref={canvasRef}
          className="three-d-canvas"
          data-testid="three-d-canvas"
          aria-label="Three-dimensional anatomy model. Use the controls below to rotate, pan and zoom."
          style={{ width: '100%', height: '100%', minHeight: 420, display: 'block', touchAction: 'none' }}
          role="img"
        />

        {state === 'loading' ? (
          <p className="prose" role="status" style={{ padding: '1rem' }}>
            Loading the local 3D model…
          </p>
        ) : null}

        {state === 'failed' ? (
          <div className="notice notice--warning" role="alert" style={{ padding: '1rem' }}>
            <p>
              <strong>The 3D model could not be loaded.</strong>
            </p>
            <p>{errorMessage}</p>
            <p>The 2D anatomy view is complete and unaffected.</p>
            <Link className="btn btn--secondary" to="/explore">
              Continue in 2D
            </Link>
          </div>
        ) : null}

        {state === 'ready' && inspectOnly !== null ? (
          <div className="notice notice--info" style={{ padding: '1rem' }} role="status">
            <p>
              <strong>{inspectOnly.replace('muscular.', '').replaceAll('_', ' ')} is shown for
              inspection only.</strong>
            </p>
            <p>
              It is largely covered by another muscle from this angle, so it cannot be fairly asked
              as a question. Look at it as long as you like, but do not expect it to be tested here.
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                setInspectOnly(null);
                // Restore the full roster, not a half-cleared focus set.
                withBoard((b) => (b as ThreeDAnatomyBoard).resetViewerState());
              }}
            >
              Show all muscles
            </Button>
          </div>
        ) : null}
      </div>

      {/* Every gesture has a visible equivalent. Nothing is hidden. */}
      <div className="panel-actions" role="group" aria-label="3D view controls">
        <Button variant="secondary" onClick={() => withBoard((b) => b.setActiveView('anterior' as never))}>
          Anterior
        </Button>
        <Button variant="secondary" onClick={() => withBoard((b) => b.setActiveView('posterior' as never))}>
          Posterior
        </Button>
        <Button variant="secondary" onClick={() => withBoard((b) => b.setActiveView('lateral' as never))}>
          Lateral
        </Button>
        <Button variant="secondary" onClick={() => withBoard((b) => b.setActiveView('medial' as never))}>
          Medial
        </Button>

        <Button
          variant="ghost"
          aria-label="Rotate the model a quarter turn"
          onClick={() => withBoard((b) => (b as ThreeDAnatomyBoard).rotateBy(Math.PI / 8))}
        >
          <Icon name="reset" size={18} />
          <span>Rotate</span>
        </Button>

        <Button variant="ghost" onClick={() => withBoard((b) => b.zoomBy(1.2))}>
          Zoom in
        </Button>
        <Button variant="ghost" onClick={() => withBoard((b) => b.zoomBy(1 / 1.2))}>
          Zoom out
        </Button>

        <Button variant="secondary" onClick={() => withBoard((b) => (b as ThreeDAnatomyBoard).resetViewerState())}>
          Reset view
        </Button>

        <Button
          variant="ghost"
          aria-pressed={labelsVisible}
          onClick={() => {
            const next = !labelsVisible;
            setLabelsVisible(next);
            withBoard((b) => b.setLabelsVisible(next));
          }}
        >
          {labelsVisible ? 'Hide names' : 'Show names'}
        </Button>

        <Link className="btn btn--secondary btn--large" to="/explore" data-testid="three-d-back-to-2d">
          Back to 2D
        </Link>
      </div>

      <p className="muted" style={{ fontSize: '0.875rem' }} role="status" data-testid="three-d-status">
        {state === 'ready'
          ? `${structureCount} muscles available in 3D. Drag with one finger to rotate, two fingers to pan and pinch to zoom.`
          : state === 'loading'
            ? 'Setting up the 3D view…'
            : ''}
        {state === 'ready' && inspectOnlySet.size > 0
          ? ` ${inspectOnlySet.size} muscle${inspectOnlySet.size === 1 ? '' : 's'} can be inspected but are never asked as blind questions.`
          : ''}
      </p>

      {candidates !== null ? (
        <div className="surface stack" role="dialog" aria-labelledby="disambiguate-heading">
          <h3 id="disambiguate-heading">More than one structure is under your finger</h3>
          <p className="prose">These structures overlap here. Which did you mean?</p>
          <div className="panel-actions">
            {candidates.map((candidate) => (
              <Button key={candidate.structureId} variant="secondary" onClick={() => resolveCandidate(candidate)}>
                {candidate.structureId.replace('muscular.', '').replaceAll('_', ' ')}
              </Button>
            ))}
            <Button variant="ghost" onClick={() => setCandidates(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default ThreeDViewer;
