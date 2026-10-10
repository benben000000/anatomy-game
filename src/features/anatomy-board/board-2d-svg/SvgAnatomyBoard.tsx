import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BOARD_VIEWBOX, LAYOUT_CONFIG } from '@/config/app-config';
import {
  focusOn,
  INITIAL_VIEWPORT,
  isPanEnabled,
  panBy,
  resetViewport,
  viewportTransform,
  zoomBy,
  type ViewId,
  type ViewportState,
} from './viewport';
import { resolveCandidates, screenToBoard } from './resolveCandidate';
import { viewIdSchema, layerIdSchema } from '@/domain/anatomy/ids';
import {
  geometryForView,
  PROVISIONAL_MIDLINE_X,
  PROVISIONAL_VIEWBOX,
  type ProvisionalGeometryEntry,
} from './provisional-geometry.data';
import type {
  AnatomyBoardAdapter,
  AnatomyBoardEvent,
  BoardSelectionEvent,
  CandidateHit,
  PointerInputType,
  SelectionResolution,
  StructureVisualState,
  ViewportState as AdapterViewportState,
} from '../contracts/anatomy-board-adapter';

/**
 * The 2D SVG anatomy board.
 *
 * Responsibilities are deliberately narrow: report which structure was
 * selected, and render whatever visual state the learning system asks for. It
 * never decides whether an answer was correct.
 */

export type DebugMode = 'off' | 'hit-regions' | 'ids' | 'eligible-targets';

export interface SvgBoardProps {
  readonly view: ViewId;
  /** Selectable structures in the current view, as candidates. */
  readonly candidates: readonly CandidateHit[];
  readonly visualStates: ReadonlyMap<string, StructureVisualState>;
  readonly interactionEnabled: boolean;
  readonly labelsVisible: boolean;
  readonly reducedMotion: boolean;
  /** Pencil selects precisely: the forgiveness margin is dropped. */
  readonly pencilPrecision: boolean;
  readonly debugMode?: DebugMode;
  readonly onEvent: (event: AnatomyBoardEvent) => void;
  readonly onViewportChange?: (viewport: ViewportState) => void;
  readonly onPointerCountChange?: (count: number) => void;
  readonly viewportRef?: { current: ViewportState };
}

/**
 * At most two pointers drive the board.
 *
 * A third finger is ignored rather than treated as a gesture. Exported so the
 * rule can be tested directly: pointer identifiers are unreliable in a DOM-less
 * test environment, so asserting on it through simulated events would test the
 * environment rather than the rule.
 */
export const MAX_TRACKED_POINTERS = 2;

export function canTrackPointer(currentCount: number): boolean {
  return currentCount < MAX_TRACKED_POINTERS;
}

interface TrackedPointer {
  readonly id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  readonly startTime: number;
  readonly inputType: PointerInputType;
  exceededSlop: boolean;
}

const VIEWBOX = {
  x: BOARD_VIEWBOX.minX,
  y: BOARD_VIEWBOX.minY,
  width: BOARD_VIEWBOX.width,
  height: BOARD_VIEWBOX.height,
};

export const SvgAnatomyBoard = forwardRef<SvgAnatomyBoardHandle, SvgBoardProps>(
  function SvgAnatomyBoard(
    {
      view,
      candidates,
      visualStates,
      interactionEnabled,
      labelsVisible,
      reducedMotion: _reducedMotion,
      pencilPrecision,
      debugMode = 'off',
      onEvent,
      onViewportChange,
      onPointerCountChange,
      viewportRef,
    },
    ref,
  ) {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const pointers = useRef<Map<number, TrackedPointer>>(new Map());
    const pinchStart = useRef<{ distance: number; scale: number } | null>(null);
    const startedAt = useRef<number>(performance.now());
    const [viewport, setViewport] = useState<ViewportState>(INITIAL_VIEWPORT);
    const localViewport = useRef<ViewportState>(INITIAL_VIEWPORT);
    const viewportState = viewportRef ?? localViewport;

    const geometry = useMemo(() => geometryForView(view), [view]);
    const geometryByStructure = useMemo(
      () => new Map<string, ProvisionalGeometryEntry>(geometry.map((entry) => [entry.structureId, entry])),
      [geometry],
    );
    const candidateByStructure = useMemo(
      () => new Map<string, CandidateHit>(candidates.map((candidate) => [candidate.structureId, candidate])),
      [candidates],
    );

    const viewId = viewIdSchema.parse(view);
    const layerId = layerIdSchema.parse('layer.superficial');

    const commitViewport = useCallback(
      (next: ViewportState) => {
        viewportState.current = next;
        setViewport(next);
        onViewportChange?.(next);
      },
      [onViewportChange, viewportState],
    );

    /* ------------------------- selection ------------------------- */

    const attemptSelection = useCallback(
      (clientX: number, clientY: number, inputType: PointerInputType) => {
        const svg = svgRef.current;
        if (svg === null) return;

        const elements = document.elementsFromPoint(clientX, clientY);
        const hitCandidates: CandidateHit[] = [];
        const seen = new Set<string>();

        for (const element of elements) {
          if (!(element instanceof Element)) continue;
          const visualId = element.getAttribute('data-hit-visual-id');
          if (visualId === null) continue;
          const structureId = element.getAttribute('data-hit-structure-id');
          if (structureId === null) continue;
          const key = `${visualId}:${structureId}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const mapping = candidates.find((candidate) => candidate.visualId === visualId);
          if (mapping === undefined) continue;
          hitCandidates.push({
            ...mapping,
            visualId: mapping.visualId,
            structureId: mapping.structureId,
          });
        }

        const rect = svg.getBoundingClientRect();
        const point = screenToBoard({ clientX, clientY, rect, viewBox: VIEWBOX });

        const outcome = resolveCandidates(hitCandidates, {
          maxCandidates: LAYOUT_CONFIG.zoom.max,
        });

        if (outcome.needsDisambiguation) {
          onEvent({
            type: 'disambiguation-requested',
            candidates: outcome.candidates,
            point,
            viewId,
          });
          return;
        }

        const selected = outcome.selected;
        if (selected === null) {
          // Tapping empty board is not an error and must not select anything.
          return;
        }

        const event: BoardSelectionEvent = {
          type: 'structure-selected',
          structureId: selected.structureId,
          visualId: selected.visualId,
          inputType,
          point,
          candidates: outcome.candidates.map((candidate) => ({
            ...candidate,
            resolution: outcome.resolution,
          })),
          resolution: outcome.resolution as SelectionResolution,
          activeView: viewId,
          activeLayer: layerId,
          timestampMs: performance.now() - startedAt.current,
        };
        onEvent(event);
      },
      [candidates, layerId, onEvent, viewId],
    );

    /* ------------------------- gestures ------------------------- */

    /*
     * Gestures are tracked with native listeners rather than React's synthetic
     * pointer events, for two reasons:
     *
     * 1. Correctness on a real device: once a gesture starts, moving and
     *    releasing are tracked on `window`, so a finger that slides off the
     *    board mid-pan still completes the pan instead of losing it, and a
     *    system interruption still produces a clean `pointercancel`.
     * 2. Testability: the decision logic is then reachable without depending on
     *    a synthetic event system that a DOM-less environment cannot fully
     *    emulate, so "tap versus pan" is tested as behaviour rather than as an
     *    artefact of the test environment.
     */

    const handlePointerDown = useCallback(
      (event: PointerEvent) => {
        if (!interactionEnabled) return;
        if (!canTrackPointer(pointers.current.size)) return;

        const inputType = toInputType(event.pointerType);
        pointers.current.set(event.pointerId, {
          id: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          lastX: event.clientX,
          lastY: event.clientY,
          startTime: performance.now(),
          inputType,
          exceededSlop: false,
        });

        onPointerCountChange?.(pointers.current.size);

        if (pointers.current.size === 2) {
          const [first, second] = [...pointers.current.values()];
          if (first && second) {
            pinchStart.current = {
              distance: Math.hypot(first.lastX - second.lastX, first.lastY - second.lastY),
              scale: viewportState.current.scale,
            };
          }
        }

        onEvent({
          type: 'interaction',
          kind: 'pointer-down',
          inputType,
          point: { x: event.clientX, y: event.clientY },
          exceedsTapThreshold: false,
          pointerCount: pointers.current.size,
          timestampMs: performance.now() - startedAt.current,
        });
      },
      [interactionEnabled, onEvent, onPointerCountChange, viewportState],
    );

    const handlePointerMove = useCallback(
      (event: PointerEvent) => {
        const tracked = pointers.current.get(event.pointerId);
        if (tracked === undefined) return;

        const dx = event.clientX - tracked.lastX;
        const dy = event.clientY - tracked.lastY;
        tracked.lastX = event.clientX;
        tracked.lastY = event.clientY;

        const totalTravel = Math.hypot(
          event.clientX - tracked.startX,
          event.clientY - tracked.startY,
        );
        if (totalTravel > LAYOUT_CONFIG.tapSlopPx) tracked.exceededSlop = true;

        if (pointers.current.size === 2 && pinchStart.current !== null) {
          const [first, second] = [...pointers.current.values()];
          if (first && second) {
            const distance = Math.hypot(first.lastX - second.lastX, first.lastY - second.lastY);
            const start = pinchStart.current;
            if (start.distance > 0) {
              const rect = svgRef.current?.getBoundingClientRect();
              const centre =
                rect === undefined
                  ? { x: VIEWBOX.x + VIEWBOX.width / 2, y: VIEWBOX.y + VIEWBOX.height / 2 }
                  : screenToBoard(
                      {
                        clientX: (first.lastX + second.lastX) / 2,
                        clientY: (first.lastY + second.lastY) / 2,
                        rect,
                        viewBox: VIEWBOX,
                      },
                    );
              commitViewport(
                zoomBy(
                  viewportState.current,
                  (distance / start.distance) * (start.scale / viewportState.current.scale),
                  centre,
                ),
              );
            }
          }
          return;
        }

        // One-finger panning is disabled at fit scale. This is what guarantees a
        // drag is never mistaken for a selection and that no learning action
        // requires a drag gesture.
        if (tracked.exceededSlop && isPanEnabled(viewportState.current)) {
          const rect = svgRef.current?.getBoundingClientRect();
          if (rect !== undefined) {
            const scale = Math.max(VIEWBOX.width / rect.width, VIEWBOX.height / rect.height);
            commitViewport(panBy(viewportState.current, dx * scale, dy * scale));
          }
        }
      },
      [commitViewport, viewportState],
    );

    const finishPointer = useCallback(
      (event: PointerEvent, kind: 'pointer-up' | 'pointer-cancel') => {
        const tracked = pointers.current.get(event.pointerId);
        pointers.current.delete(event.pointerId);
        onPointerCountChange?.(pointers.current.size);

        if (tracked === undefined) return;

        if (pointers.current.size < 2) pinchStart.current = null;

        onEvent({
          type: 'interaction',
          kind,
          inputType: tracked.inputType,
          point: { x: event.clientX, y: event.clientY },
          exceedsTapThreshold: tracked.exceededSlop,
          pointerCount: pointers.current.size,
          timestampMs: performance.now() - startedAt.current,
        });

        // A cancelled gesture never selects, whatever it had done so far.
        if (kind === 'pointer-cancel') return;

        const duration = performance.now() - tracked.startTime;
        if (!tracked.exceededSlop && duration <= LAYOUT_CONFIG.tapMaxDurationMs && interactionEnabled) {
          attemptSelection(event.clientX, event.clientY, tracked.inputType);
        }
      },
      [attemptSelection, interactionEnabled, onEvent, onPointerCountChange],
    );

    useEffect(() => {
      const canvas = canvasRef.current;
      if (canvas === null) return;

      const onUp = (event: PointerEvent) => finishPointer(event, 'pointer-up');
      const onCancel = (event: PointerEvent) => finishPointer(event, 'pointer-cancel');

      const onMove = (event: PointerEvent) => handlePointerMove(event);

      canvas.addEventListener('pointerdown', handlePointerDown);
      // Tracking continues on the window so a gesture survives the pointer
      // leaving the board, and so an interrupted gesture cancels cleanly.
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);

      return () => {
        canvas.removeEventListener('pointerdown', handlePointerDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
      };
    }, [finishPointer, handlePointerDown, handlePointerMove]);

    /* ------------------------- imperative API ------------------------- */

    useImperativeHandle(
      ref,
      (): AnatomyBoardAdapter => ({
        subscribe: () => () => undefined,
        destroy: () => {
          pointers.current.clear();
          pinchStart.current = null;
        },
        listAvailableStructureIds: () => candidates.map((candidate) => candidate.structureId),
        setActiveView: () => undefined,
        getActiveView: () => viewIdSchema.parse(view),
        setActiveLayer: () => undefined,
        getActiveLayer: () => layerIdSchema.parse('layer.superficial'),
        setInteractionEnabled: () => undefined,
        isInteractionEnabled: () => interactionEnabled,
        requestDisambiguation: () => undefined,
        setStructureVisualState: () => undefined,
        setVisualStates: () => undefined,
        clearVisualStates: () => undefined,
        setFocusSet: () => undefined,
        getCurrentViewState: () => toAdapterViewport(viewportState.current),
        zoomBy: (factor, origin) => {
          const point = origin ?? { x: VIEWBOX.width / 2, y: VIEWBOX.height / 2 };
          commitViewport(zoomBy(viewportState.current, factor, point));
        },
        setZoom: (scale) => {
          const centre = { x: VIEWBOX.width / 2, y: VIEWBOX.height / 2 };
          commitViewport(
            zoomBy(viewportState.current, scale / viewportState.current.scale, centre),
          );
        },
        panBy: (dx, dy) => commitViewport(panBy(viewportState.current, dx, dy)),
        focusStructure: (structureId, options) => {
          const entry = geometryByStructure.get(structureId);
          if (entry === undefined) return;
          commitViewport(focusOn(entry.boundingBox, options));
        },        focusRegion: (regionId) => {
          const entries = geometry.filter((item) => item.regionIds.includes(regionId));
          if (entries.length === 0) return;
          const box = unionBounds(entries.map((entry) => entry.boundingBox));
          commitViewport(focusOn(box));
        },        resetViewport: () => commitViewport(resetViewport()),
        setLabelsVisible: () => undefined,
        areLabelsVisible: () => labelsVisible,
        getStructureBounds: (structureId) => {
          const entry = geometryByStructure.get(structureId);
          return entry?.boundingBox ?? null;
        },
      }),
      [
        candidates,
        commitViewport,
        geometry,
        geometryByStructure,
        interactionEnabled,
        labelsVisible,
        view,
        viewportState,
      ],
    );

    /* ------------------------- render ------------------------- */

    return (
      <div
        ref={canvasRef}
        className="board__canvas"
        data-testid="board-canvas"
        data-pointer-count={pointers.current.size}
      >
        <svg
          ref={svgRef}
          className="board__svg"
          viewBox={PROVISIONAL_VIEWBOX}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-labelledby="board-title board-description"
        >
          <title id="board-title">
            {view === 'anterior' ? 'Anterior' : 'Posterior'} view of the muscular system
          </title>
          <desc id="board-description">
            Provisional placeholder illustration. Every structure is also selectable from the
            accessible structure list, without needing to tap its location.
          </desc>

          <g data-viewport={viewport} transform={viewportTransform(viewport)}>
            <BodySilhouette view={view} />

            <g data-layer="muscle">
              {geometry.map((entry) => {
                const state = visualStates.get(entry.structureId) ?? 'neutral';
                return (
                  <g
                    key={entry.visualId}
                    data-structure-id={entry.structureId}
                    data-visual-id={entry.visualId}
                    data-visual-state={state}
                    aria-hidden="true"
                  >
                    <path className="muscle__fill" d={entry.path} pointerEvents="none" />
                    {entry.mirrorTransform === null ? null : (
                      <path
                        className="muscle__fill"
                        d={entry.path}
                        transform={entry.mirrorTransform}
                        pointerEvents="none"
                      />
                    )}
                    <path className="muscle__edge" d={entry.path} pointerEvents="none" />
                    {entry.mirrorTransform === null ? null : (
                      <path
                        className="muscle__edge"
                        d={entry.path}
                        transform={entry.mirrorTransform}
                        pointerEvents="none"
                      />
                    )}
                  </g>
                );
              })}
            </g>

            <g data-layer="hit">
              {geometry.map((entry) => {
                if (candidateByStructure.get(entry.structureId) === undefined) return null;
                // Pencil selects precisely: the forgiveness margin is dropped
                // because the learner chose a precision instrument.
                const margin = pencilPrecision ? 0 : entry.margin;
                const stroke = margin * 2;
                const active = interactionEnabled;
                return (
                  <g key={entry.visualId}>
                    <path
                      d={entry.path}
                      data-hit-visual-id={entry.visualId}
                      data-hit-structure-id={entry.structureId}
                      fill={active ? 'transparent' : 'none'}
                      stroke="transparent"
                      strokeWidth={stroke}
                      pointerEvents={active ? 'fill stroke' : 'none'}
                      style={{ cursor: active ? 'pointer' : 'default' }}
                    />
                    {entry.mirrorTransform === null ? null : (
                      <path
                        d={entry.path}
                        transform={entry.mirrorTransform}
                        data-hit-visual-id={entry.visualId}
                        data-hit-structure-id={entry.structureId}
                        fill={active ? 'transparent' : 'none'}
                        stroke="transparent"
                        strokeWidth={stroke}
                        pointerEvents={active ? 'fill stroke' : 'none'}
                        style={{ cursor: active ? 'pointer' : 'default' }}
                      />
                    )}
                  </g>
                );
              })}
            </g>

            {debugMode !== 'off' ? (
              <DebugLayer mode={debugMode} geometry={geometry} visualStates={visualStates} />
            ) : null}
          </g>
        </svg>

        {labelsVisible ? (
          <LabelsOverlay geometry={geometry} />
        ) : null}
      </div>
    );
  },
);

export type SvgAnatomyBoardHandle = AnatomyBoardAdapter;

export function toInputType(pointerType: string): PointerInputType {
  switch (pointerType) {
    case 'pen':
      return 'pen';
    case 'touch':
      return 'touch';
    case 'mouse':
      return 'mouse';
    default:
      return 'trackpad';
  }
}

function toAdapterViewport(state: ViewportState): AdapterViewportState {
  return {
    transform: { scale: state.scale, tx: state.tx, ty: state.ty, mode: state.mode },
    viewBox: VIEWBOX,
    visibleBounds: {
      x: state.tx,
      y: state.ty,
      width: VIEWBOX.width / state.scale,
      height: VIEWBOX.height / state.scale,
    },
    canZoomIn: state.scale < LAYOUT_CONFIG.zoom.max,
    canZoomOut: state.scale > LAYOUT_CONFIG.zoom.min,
    canReset: state.scale !== INITIAL_VIEWPORT.scale || state.tx !== 0 || state.ty !== 0,
    panEnabled: isPanEnabled(state),
  };
}

function unionBounds(boxes: readonly { x: number; y: number; width: number; height: number }[]) {
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/* ------------------------------------------------------------------ *
 * Base silhouette
 *
 * Deliberately schematic and obviously non-anatomical. It exists to give the
 * muscles context, not to depict a body accurately.
 * ------------------------------------------------------------------ */

function BodySilhouette({ view }: { readonly view: ViewId }) {
  const isAnterior = view === 'anterior';
  return (
    <g data-layer="base" pointerEvents="none" aria-hidden="true">
      <ellipse className="body__head" cx={PROVISIONAL_MIDLINE_X} cy={190} rx={92} ry={118} />
      <rect className="body__neck" x={468} y={292} width={64} height={104} rx={26} />
      <path
        className="body__torso"
        d={
          isAnterior
            ? 'M 372 392 Q 500 366 628 392 L 612 700 Q 604 860 596 934 L 404 934 Q 396 860 388 700 Z'
            : 'M 368 392 Q 500 366 632 392 L 616 720 Q 606 880 598 946 L 402 946 Q 394 880 384 720 Z'
        }
      />
      <path className="body__pelvis" d="M 398 926 L 602 926 L 616 1044 L 500 1074 L 384 1044 Z" />
      <path className="body__limb" d="M 300 404 Q 268 470 276 566 L 292 760 L 322 760 L 336 566 L 372 452 Z" />
      <path
        className="body__limb"
        d="M 700 404 Q 732 470 724 566 L 708 760 L 678 760 L 664 566 L 628 452 Z"
      />
      <path className="body__limb" d="M 356 1030 L 512 1030 L 508 1382 L 452 1382 L 440 1060 L 404 1060 L 392 1382 L 336 1382 Z" />
      <path className="body__limb" d="M 488 1030 L 644 1030 L 668 1382 L 612 1382 L 600 1060 L 564 1060 L 552 1382 L 496 1382 Z" />
      <path className="body__limb" d="M 344 1374 L 458 1374 L 452 1836 L 384 1836 L 380 1420 L 340 1420 Z" />
      <path className="body__limb" d="M 542 1374 L 656 1374 L 660 1420 L 620 1420 L 616 1836 L 548 1836 Z" />
      <path className="body__foot" d="M 372 1828 L 456 1828 L 470 1958 Q 470 1984 444 1984 L 372 1984 Z" />
      <path className="body__foot" d="M 544 1828 L 628 1828 L 628 1984 L 556 1984 Q 530 1984 530 1958 Z" />
    </g>
  );
}

/* ------------------------------------------------------------------ *
 * Labels
 * ------------------------------------------------------------------ */

function LabelsOverlay({
  geometry,
}: {
  readonly geometry: readonly ProvisionalGeometryEntry[];
}) {
  return (
    <ul className="visually-hidden" data-testid="board-labels">
      {geometry.map((entry) => (
        <li key={entry.visualId}>{entry.description}</li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ *
 * Debug layer — development builds only
 * ------------------------------------------------------------------ */

function DebugLayer({
  mode,
  geometry,
  visualStates,
}: {
  readonly mode: DebugMode;
  readonly geometry: readonly ProvisionalGeometryEntry[];
  readonly visualStates: ReadonlyMap<string, StructureVisualState>;
}) {
  if (mode === 'off') return null;

  return (
    <g data-layer="debug" pointerEvents="none" data-build="dev-only">
      {mode === 'hit-regions'
        ? geometry.map((entry) => (
            <path
              key={entry.visualId}
              d={entry.path}
              fill="none"
              stroke="rgba(31, 95, 139, 0.55)"
              strokeWidth={entry.margin * 2}
            />
          ))
        : null}

      {mode === 'ids' || mode === 'eligible-targets'
        ? geometry.map((entry) => {
            const state = visualStates.get(entry.structureId) ?? 'neutral';
            if (mode === 'eligible-targets' && state === 'dimmed') return null;
            const centre = {
              x: entry.boundingBox.x + entry.boundingBox.width / 2,
              y: entry.boundingBox.y + entry.boundingBox.height / 2,
            };
            return (
              <g key={entry.visualId}>
                <rect
                  x={entry.boundingBox.x}
                  y={entry.boundingBox.y}
                  width={entry.boundingBox.width}
                  height={entry.boundingBox.height}
                  fill="none"
                  stroke="rgba(31, 95, 139, 0.7)"
                  strokeWidth={2}
                />
                {mode === 'ids' ? (
                  <>
                    <text x={centre.x} y={centre.y - 4} textAnchor="middle" fontSize={22} fill="#1f5f8b">
                      {entry.structureId}
                    </text>
                    <text x={centre.x} y={centre.y + 22} textAnchor="middle" fontSize={18} fill="#4a4c50">
                      {entry.visualId}
                    </text>
                  </>
                ) : null}
              </g>
            );
          })
        : null}
    </g>
  );
}
