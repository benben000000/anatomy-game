import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  SvgAnatomyBoard,
  type DebugMode,
  type SvgAnatomyBoardHandle,
} from '@/features/anatomy-board/board-2d-svg/SvgAnatomyBoard';
import {
  INITIAL_VIEWPORT,
  isPanEnabled,
  type ViewId,
  type ViewportState,
} from '@/features/anatomy-board/board-2d-svg/viewport';
import type {
  AnatomyBoardEvent,
  CandidateHit,
  StructureVisualState,
} from '@/features/anatomy-board/contracts/anatomy-board-adapter';
import { LAYOUT_CONFIG } from '@/config/app-config';
import { IconButton } from '@/components/shared/Button';
import { Icon } from '@/components/shared/Icon';
import { APP_FLAGS } from '@/features/content/ContentProvider';

export type { ViewId };

export interface AnatomyBoardProps {
  readonly view: ViewId;
  readonly onViewChange: (view: ViewId) => void;
  readonly candidates: readonly CandidateHit[];
  readonly visualStates: ReadonlyMap<string, StructureVisualState>;
  readonly interactionEnabled: boolean;
  readonly labelsVisible: boolean;
  readonly onEvent: (event: AnatomyBoardEvent) => void;
  /** Prompt rendered above the figure, never over the target region. */
  readonly prompt?: ReactNode;
  readonly boardControls?: ReactNode;
  readonly showDebugTools?: boolean;
}

/**
 * Board host.
 *
 * Owns the viewport controls, the view switch, and the provisional-artwork
 * notice. Pan and zoom changes a single transform attribute inside one
 * animation frame; nothing re-renders React per frame.
 */
export function AnatomyBoard({
  view,
  onViewChange,
  candidates,
  visualStates,
  interactionEnabled,
  labelsVisible,
  onEvent,
  prompt,
  boardControls,
  showDebugTools = false,
}: AnatomyBoardProps) {
  const boardRef = useRef<SvgAnatomyBoardHandle | null>(null);
  const viewportRef = useRef<ViewportState>(INITIAL_VIEWPORT);
  const [viewport, setViewport] = useState<ViewportState>(INITIAL_VIEWPORT);
  const [pointerCount, setPointerCount] = useState(0);
  const [debug, setDebug] = useState<DebugMode>('off');

  const reducedMotion = document.documentElement.dataset['reducedMotion'] === 'true';

  const zoomIn = useCallback(() => {
    boardRef.current?.zoomBy(LAYOUT_CONFIG.zoom.step);
  }, []);

  const zoomOut = useCallback(() => {
    boardRef.current?.zoomBy(1 / LAYOUT_CONFIG.zoom.step);
  }, []);

  const reset = useCallback(() => {
    boardRef.current?.resetViewport();
  }, []);

  const canPan = isPanEnabled(viewport);
  const canZoomIn = viewport.scale < LAYOUT_CONFIG.zoom.max;
  const canZoomOut = viewport.scale > LAYOUT_CONFIG.zoom.min;
  const canReset = viewport.scale !== INITIAL_VIEWPORT.scale || viewport.tx !== 0 || viewport.ty !== 0;

  const activeDebugMode = showDebugTools ? debug : 'off';

  return (
    <section className="board" aria-label="Anatomy board">
      {prompt}

      {APP_FLAGS.PROVISIONAL_ART ? (
        <p className="board__provisional-notice" role="status">
          Provisional placeholder illustration — not anatomically accurate, and not for study.
        </p>
      ) : null}

      <SvgAnatomyBoard
        ref={boardRef}
        view={view}
        candidates={candidates}
        visualStates={visualStates}
        interactionEnabled={interactionEnabled}
        labelsVisible={labelsVisible}
        reducedMotion={reducedMotion}
        pencilPrecision
        debugMode={activeDebugMode}
        onEvent={onEvent}
        onViewportChange={setViewport}
        onPointerCountChange={setPointerCount}
        viewportRef={viewportRef}
      />

      <div className="board__controls">
        <div className="board__controls-group" role="group" aria-label="Body view">
          <IconButton
            label="Anterior view, front of the body"
            pressed={view === 'anterior'}
            onClick={() => onViewChange('anterior')}
          >
            <Icon name="anterior" />
          </IconButton>
          <IconButton
            label="Posterior view, back of the body"
            pressed={view === 'posterior'}
            onClick={() => onViewChange('posterior')}
          >
            <Icon name="posterior" />
          </IconButton>
        </div>

        <div className="board__controls-group" role="group" aria-label="Zoom">
          <IconButton label="Zoom in" onClick={zoomIn} disabled={!canZoomIn}>
            <Icon name="zoomIn" />
          </IconButton>
          <span className="board__zoom-readout" aria-live="polite">
            {Math.round(viewport.scale * 100)}%
          </span>
          <IconButton label="Zoom out" onClick={zoomOut} disabled={!canZoomOut}>
            <Icon name="zoomOut" />
          </IconButton>
          <button type="button" className="btn btn--secondary btn--small" onClick={reset} disabled={!canReset}>
            <Icon name="reset" size={18} />
            <span>Reset view</span>
          </button>
        </div>

        {boardControls}

        {showDebugTools ? (
          <div className="board__controls-group" role="group" aria-label="Developer overlay">
            <span className="debug-toolbar__label">debug</span>
            {(['off', 'hit-regions', 'ids', 'eligible-targets'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className="btn btn--ghost btn--small"
                aria-pressed={debug === mode}
                onClick={() => setDebug(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {pointerCount > 0 ? (
        <p className="visually-hidden" aria-live="polite">
          {pointerCount === 1 ? 'One finger down on the board.' : 'Two fingers down on the board.'}
        </p>
      ) : null}

      {!canPan ? (
        <p className="visually-hidden">
          One-finger panning is disabled while the whole body is visible. Use zoom controls or the
          Reset view button.
        </p>
      ) : null}
    </section>
  );
}

/** Board candidates derived from content mappings. */
export function useBoardCandidates(
  structureIds: readonly string[],
  view: ViewId,
  mappingLookup: (structureId: string, view: ViewId) => CandidateHit | null,
): readonly CandidateHit[] {
  return useMemo(() => {
    const seen = new Set<string>();
    const result: CandidateHit[] = [];
    for (const structureId of structureIds) {
      const hit = mappingLookup(structureId, view);
      if (hit === null || seen.has(hit.structureId)) continue;
      seen.add(hit.structureId);
      result.push(hit);
    }
    return result;
  }, [structureIds, view, mappingLookup]);
}
