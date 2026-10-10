import { BOARD_VIEWBOX, LAYOUT_CONFIG } from '@/config/app-config';

/**
 * Viewport maths.
 *
 * Pure functions only, so pan/zoom behaviour can be unit tested without a DOM
 * or a renderer. The board applies the result by writing one transform
 * attribute inside a single animation frame.
 */

export type ViewId = 'anterior' | 'posterior';

export interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const FULL_VIEWBOX: ViewBox = {
  x: BOARD_VIEWBOX.minX,
  y: BOARD_VIEWBOX.minY,
  width: BOARD_VIEWBOX.width,
  height: BOARD_VIEWBOX.height,
};

export interface ViewportState {
  readonly scale: number;
  readonly tx: number;
  readonly ty: number;
  readonly mode: 'fit' | 'free' | 'focused';
}

export const INITIAL_VIEWPORT: ViewportState = {
  scale: LAYOUT_CONFIG.zoom.default,
  tx: 0,
  ty: 0,
  mode: 'fit',
};

export function clampScale(scale: number): number {
  const { min, max } = LAYOUT_CONFIG.zoom;
  return Math.min(max, Math.max(min, scale));
}

/**
 * Keep the visible region inside the artwork.
 *
 * The board may be panned only while part of the body is off-screen, so the
 * learner can never lose the figure entirely. Zoomed out, the view is centred
 * and cannot move.
 */
export function clampTranslation(
  viewport: ViewportState,
  viewBox: ViewBox = FULL_VIEWBOX,
): ViewportState {  const { scale } = viewport;
  const visibleWidth = viewBox.width / scale;
  const visibleHeight = viewBox.height / scale;

  if (visibleWidth >= viewBox.width && visibleHeight >= viewBox.height) {
    return { ...viewport, tx: 0, ty: 0, mode: scale > 1 ? 'free' : 'fit' };
  }

  const minTx = viewBox.x + visibleWidth - viewBox.width;
  const maxTx = viewBox.x;
  const minTy = viewBox.y + visibleHeight - viewBox.height;
  const maxTy = viewBox.y;

  return {
    ...viewport,
    tx: Math.min(maxTx, Math.max(minTx, viewport.tx)),
    ty: Math.min(maxTy, Math.max(minTy, viewport.ty)),
  };
}

export function zoomBy(
  current: ViewportState,
  factor: number,
  origin: { readonly x: number; readonly y: number },
  viewBox: ViewBox = FULL_VIEWBOX,
): ViewportState {
  const nextScale = clampScale(current.scale * factor);
  if (nextScale === current.scale) return current;

  // Keep the board point under the fingers fixed while scaling.
  //
  // A board point p projects to c + (p - c - t) * s. Requiring that the point at
  // `origin` keeps the same projection gives:
  //
  //   t' = t + (origin - c - t) * (1 - currentScale / nextScale)
  //
  const viewCentre = {
    x: viewBox.x + viewBox.width / 2,
    y: viewBox.y + viewBox.height / 2,
  };
  const offsetX = origin.x - viewCentre.x - current.tx;
  const offsetY = origin.y - viewCentre.y - current.ty;
  const keepRatio = 1 - current.scale / nextScale;

  return clampTranslation(
    {
      scale: nextScale,
      tx: current.tx + offsetX * keepRatio,
      ty: current.ty + offsetY * keepRatio,
      mode: 'free',
    },
    viewBox,
  );
}

/**
 * Pan by a finger movement, in board user units.
 *
 * A positive `dx` means the finger moved right, so the artwork must move right
 * too. Since the projection is `c + (p - c - t) * s`, moving the artwork right
 * means decreasing the translation.
 */
export function panBy(
  current: ViewportState,
  dx: number,
  dy: number,
  viewBox: ViewBox = FULL_VIEWBOX,
): ViewportState {
  // One-finger panning is only available once zoomed in. At fit scale the whole
  // body is visible, so a drag must never be mistaken for a selection and must
  // never move the board away from the learner mid-question.
  if (current.scale <= 1) return current;

  return clampTranslation(
    { ...current, tx: current.tx - dx, ty: current.ty - dy, mode: 'free' },
    viewBox,
  );
}

export interface FocusTarget {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FocusOptions {
  readonly paddingUnits?: number;
  readonly targetScale?: number;
}

/** Frame a structure or region with padding, without ever zooming below fit. */
export function focusOn(
  target: FocusTarget,
  options: FocusOptions = {},
  viewBox: ViewBox = FULL_VIEWBOX,
): ViewportState {
  const padding = options.paddingUnits ?? 120;
  const framedWidth = target.width + padding * 2;
  const framedHeight = target.height + padding * 2;

  const fitScale = Math.min(
    viewBox.width / framedWidth,
    viewBox.height / framedHeight,
  );
  const scale = clampScale(options.targetScale ?? fitScale);

  const centreX = target.x + target.width / 2;
  const centreY = target.y + target.height / 2;
  const viewCentreX = viewBox.x + viewBox.width / 2;
  const viewCentreY = viewBox.y + viewBox.height / 2;

  // The projection is `c + (p - c - t) * s`, so a target centre lands on the
  // view centre exactly when t = targetCentre - viewCentre.
  return clampTranslation(
    {
      scale,
      tx: centreX - viewCentreX,
      ty: centreY - viewCentreY,
      mode: 'focused',
    },
    viewBox,
  );
}

export function resetViewport(): ViewportState {
  return INITIAL_VIEWPORT;
}

export function viewportTransform(viewport: ViewportState): string {
  return `translate(${viewport.tx.toFixed(2)} ${viewport.ty.toFixed(2)}) scale(${viewport.scale.toFixed(4)})`;
}

/** One-finger panning is only available once zoomed in. */
export function isPanEnabled(viewport: ViewportState): boolean {
  return viewport.scale > 1 || viewport.mode === 'focused';
}
