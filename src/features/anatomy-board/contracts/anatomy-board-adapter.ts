import type { StructureId, VisualId, ViewId, LayerId, RegionId } from '@/domain/anatomy/ids';

/* ------------------------------------------------------------------ *
 * Phase 0 deliverable: the renderer contract.
 *
 * The learning engine never imports anything from this file, and this
 * file imports nothing from the learning engine. It is the boundary
 * that lets an SVG board today, a canvas board later, and a WebGL or
 * WebGPU 3D board in the future satisfy the same quiz engine unchanged.
 * ------------------------------------------------------------------ */

/** How the pointer event that produced a selection was delivered. */
export type PointerInputType = 'touch' | 'pen' | 'mouse' | 'trackpad' | 'keyboard' | 'programmatic';

/** Visual states the learning system may request for a structure. */
export type StructureVisualState =
  | 'neutral'
  | 'hover'
  | 'focus'
  | 'pressed'
  | 'selected'
  | 'correct'
  | 'incorrect'
  | 'revealed'
  | 'assisted'
  | 'dimmed'
  | 'hidden';

export const STRUCTURE_VISUAL_STATES: readonly StructureVisualState[] = [
  'neutral', 'hover', 'focus', 'pressed', 'selected',
  'correct', 'incorrect', 'revealed', 'assisted', 'dimmed', 'hidden',
] as const;

/** A structure that could legitimately be selected at a given point. */
export interface CandidateHit {
  readonly visualId: VisualId;
  readonly structureId: StructureId;
  readonly selectionPriority: number;
  readonly requiresDisambiguation: boolean;
}

/**
 * How a selection was settled.
 * - 'direct'          exactly one candidate; unambiguous.
 * - 'priority'        several candidates; settled by selection_priority.
 *                     The board still reports every candidate so the UI can
 *                     explain an ambiguous selection to the learner.
 * - 'disambiguation'  the host UI showed a chooser and the user picked.
 * - 'accessible-list' chosen without spatial targeting, via the keyboard
 *                     list or combobox equivalent.
 */
export type SelectionResolution = 'direct' | 'priority' | 'disambiguation' | 'accessible-list';

export interface SelectionCandidateReported extends CandidateHit {
  readonly resolution: SelectionResolution;
}

export interface BoardSelectionEvent {
  readonly type: 'structure-selected';
  /** The structure the learner committed to. Stable ID. Never a display name. */
  readonly structureId: StructureId;
  readonly visualId: VisualId;
  readonly inputType: PointerInputType;
  /** Board-space coordinates in SVG user units, not screen pixels. */
  readonly point: { readonly x: number; readonly y: number };
  /** Every structure that was a legitimate candidate under that point. */
  readonly candidates: readonly SelectionCandidateReported[];
  readonly resolution: SelectionResolution;
  readonly activeView: ViewId;
  readonly activeLayer: LayerId;
  /** Milliseconds since board ready. Lets the session time an answer. */
  readonly timestampMs: number;
}

export interface BoardInteractionEvent {
  readonly type: 'interaction';
  readonly kind: 'pointer-down' | 'pointer-move' | 'pointer-up' | 'pointer-cancel';
  readonly inputType: PointerInputType;
  readonly point: { readonly x: number; readonly y: number };
  /** True once movement exceeded the tap threshold: this gesture is a pan. */
  readonly exceedsTapThreshold: boolean;
  readonly pointerCount: number;
  readonly timestampMs: number;
}

export interface ViewportTransform {
  readonly scale: number;
  readonly tx: number;
  readonly ty: number;
  readonly mode: 'fit' | 'free' | 'focused';
}

export interface ViewportState {
  readonly transform: ViewportTransform;
  /** ViewBox in user units. Identical across views where the board aligns. */
  readonly viewBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** Board-space rect currently visible, used to cull offscreen rendering. */
  readonly visibleBounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly canZoomIn: boolean;
  readonly canZoomOut: boolean;
  readonly canReset: boolean;
  /** True when one-finger panning is allowed. False at fit scale. */
  readonly panEnabled: boolean;
}

export interface BoardReadyEvent {
  readonly type: 'board-ready';
  readonly viewId: ViewId;
  readonly structureCount: number;
  readonly timestampMs: number;
}

export interface BoardErrorEvent {
  readonly type: 'board-error';
  readonly code:
    | 'asset-load-failed'
    | 'mapping-missing'
    | 'unsupported-representation'
    | 'content-not-available'
    | 'renderer-init-failed';
  readonly message: string;
  /** True when retrying could plausibly succeed (e.g. network returned). */
  readonly recoverable: boolean;
  readonly structureId?: StructureId;
  readonly visualId?: VisualId;
}

export interface BoardHostRequest {
  /** A pending request the host UI must resolve, e.g. a disambiguation prompt. */
  readonly type: 'disambiguation-requested';
  readonly candidates: readonly CandidateHit[];
  readonly point: { readonly x: number; readonly y: number };
  readonly viewId: ViewId;
}

export type AnatomyBoardEvent =
  | BoardSelectionEvent
  | BoardInteractionEvent
  | BoardReadyEvent
  | BoardErrorEvent
  | BoardHostRequest;

export type AnatomyBoardEventHandler = (event: AnatomyBoardEvent) => void;

export interface FocusStructureOptions {
  /** Extra user units of padding around the structure's bounds. */
  readonly paddingUnits?: number;
  /** Target scale. Clamped to the renderer's zoom limits. */
  readonly targetScale?: number;
  /** Duration in ms. 0 for immediate, which reduced-motion forces. */
  readonly durationMs?: number;
}

export interface RegionBounds {
  readonly regionId: RegionId;
  readonly viewId: ViewId;
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

/**
 * Implemented by the 2D SVG renderer now, and by future canvas and 3D renderers.
 *
 * Contract notes that matter:
 * - The adapter reports selection. It NEVER evaluates correctness. That is
 *   AnswerEvaluator's job, and it depends only on structureId.
 * - Visual state is pushed by the host. The adapter does not decide emphasis.
 * - Every method is safe to call before board-ready; calls are queued and
 *   replayed, so React effects cannot race the renderer's async asset load.
 */
export interface AnatomyBoardAdapter {
  /* ---------- lifecycle ---------- */

  /** Subscribe to board events. Returns an unsubscribe function. */
  subscribe(handler: AnatomyBoardEventHandler): () => void;

  /** Clean up listeners, observers, and any rAF work. Must be idempotent. */
  destroy(): void;

  /* ---------- inventory ---------- */

  /**
   * Structures that can be selected in the current view and layer.
   * The quiz engine uses this to build eligible pools. A structure absent
   * from this list must never be asked in this view.
   */
  listAvailableStructureIds(): readonly StructureId[];

  /* ---------- view and layer ---------- */

  setActiveView(viewId: ViewId): void;
  getActiveView(): ViewId;

  /** Deep layers require an explicit, explained layer context. Never implicit. */
  setActiveLayer(layerId: LayerId): void;
  getActiveLayer(): LayerId;

  /* ---------- interaction ---------- */

  /** False during feedback review and while a sheet or drawer owns input. */
  setInteractionEnabled(enabled: boolean): void;
  isInteractionEnabled(): boolean;

  /**
   * Ask the host UI to let the learner disambiguate among candidates.
   * The board reports which structures overlap but does not name them; in
   * blind quiz mode the host shows anatomical descriptions, never answers.
   */
  requestDisambiguation(candidates: readonly CandidateHit[]): void;

  /* ---------- visual state ---------- */

  setStructureVisualState(structureId: StructureId, state: StructureVisualState): void;
  /** Batch form. Preferred: one pass, no layout thrash. */
  setVisualStates(states: ReadonlyMap<StructureId, StructureVisualState>): void;
  clearVisualStates(): void;
  /** Dim everything not in the set. Used by Explore mode region focus. */
  setFocusSet(structureIds: readonly StructureId[] | null): void;

  /* ---------- viewport ---------- */

  getCurrentViewState(): ViewportState;
  zoomBy(factor: number, origin?: { readonly x: number; readonly y: number }): void;
  setZoom(scale: number): void;
  panBy(dx: number, dy: number): void;
  /** Frame a structure. Uses VisualMapping.bounding_box, so cheap. */
  focusStructure(structureId: StructureId, options?: FocusStructureOptions): void;
  /** Isolate-region mode: frame a named body region and dim its neighbours. */
  focusRegion(regionId: RegionId, options?: FocusStructureOptions): void;
  resetViewport(): void;

  /* ---------- presentation ---------- */

  setLabelsVisible(visible: boolean): void;
  areLabelsVisible(): boolean;
  getStructureBounds(structureId: StructureId): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;

  /* ---------- development ---------- */

  /** Development builds only. No-op in production bundles. */
  setDebugOverlay?(mode: 'off' | 'hit-regions' | 'ids' | 'eligible-targets'): void;
}
