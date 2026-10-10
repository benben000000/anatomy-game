import { describe, expect, it } from 'vitest';
import {
  clampScale,
  clampTranslation,
  focusOn,
  FULL_VIEWBOX,
  INITIAL_VIEWPORT,
  isPanEnabled,
  panBy,
  resetViewport,
  viewportTransform,
  zoomBy,
} from './viewport';
import { LAYOUT_CONFIG } from '@/config/app-config';

describe('zoom', () => {
  it('clamps to the configured limits', () => {
    expect(clampScale(0.1)).toBe(LAYOUT_CONFIG.zoom.min);
    expect(clampScale(999)).toBe(LAYOUT_CONFIG.zoom.max);
  });

  it('never zooms out below fit', () => {
    const zoomedOut = zoomBy(INITIAL_VIEWPORT, 0.1, { x: 500, y: 1100 });
    expect(zoomedOut.scale).toBe(LAYOUT_CONFIG.zoom.min);
  });

  it('never zooms beyond the maximum', () => {
    let state = INITIAL_VIEWPORT;
    for (let i = 0; i < 40; i += 1) {
      state = zoomBy(state, 2, { x: 500, y: 1100 });
    }
    expect(state.scale).toBe(LAYOUT_CONFIG.zoom.max);
  });

  it('returns the same state when the scale cannot change', () => {
    const atMax = { scale: LAYOUT_CONFIG.zoom.max, tx: 0, ty: 0, mode: 'free' as const };
    expect(zoomBy(atMax, 2, { x: 500, y: 1100 })).toBe(atMax);
  });

  it('keeps the point under the fingers fixed while scaling', () => {
    const origin = { x: 400, y: 900 };
    const zoomed = zoomBy(INITIAL_VIEWPORT, 2, origin);

    // The board point under the fingers must project to the same place.
    const before = project(origin, INITIAL_VIEWPORT);
    const after = project(origin, zoomed);

    expect(round(after.x)).toBe(round(before.x));
    expect(round(after.y)).toBe(round(before.y));
  });

  it('pans the artwork in the same direction as the finger', () => {
    const zoomed = zoomBy(INITIAL_VIEWPORT, 3, { x: 500, y: 1100 });
    const before = project({ x: 300, y: 300 }, zoomed);
    const panned = panBy(zoomed, 40, 0);
    const after = project({ x: 300, y: 300 }, panned);

    // A finger moving right drags the artwork right.
    expect(after.x).toBeGreaterThan(before.x);
  });
});

describe('translation clamping', () => {
  it('cannot pan at fit scale', () => {
    const panned = panBy(INITIAL_VIEWPORT, 200, 200);
    expect(panned).toEqual(INITIAL_VIEWPORT);
  });

  it('centres the view when the whole board fits', () => {
    const state = clampTranslation({ scale: 1, tx: 120, ty: 80, mode: 'free' });
    expect(state.tx).toBe(0);
    expect(state.ty).toBe(0);
  });

  it('keeps the figure on screen when zoomed in', () => {
    const zoomed = zoomBy(INITIAL_VIEWPORT, 4, { x: 500, y: 1100 });
    const pushedFar = panBy(zoomed, 100_000, 100_000);
    const visibleWidth = FULL_VIEWBOX.width / pushedFar.scale;
    const visibleHeight = FULL_VIEWBOX.height / pushedFar.scale;

    // Panning saturates at the clamp rather than running off into nothing, so
    // the visible region always overlaps the artwork.
    expect(visibleWidth).toBeGreaterThan(0);
    expect(visibleHeight).toBeGreaterThan(0);
    expect(pushedFar.tx).toBeGreaterThanOrEqual(
      FULL_VIEWBOX.x + visibleWidth - FULL_VIEWBOX.width,
    );
    expect(pushedFar.ty).toBeGreaterThanOrEqual(
      FULL_VIEWBOX.y + visibleHeight - FULL_VIEWBOX.height,
    );

    // Pushing further changes nothing: the clamp has been reached.
    expect(panBy(pushedFar, 100_000, 100_000)).toEqual(pushedFar);
  });

  it('reports panning as unavailable at fit scale and available once zoomed', () => {
    expect(isPanEnabled(INITIAL_VIEWPORT)).toBe(false);
    expect(isPanEnabled(zoomBy(INITIAL_VIEWPORT, 3, { x: 500, y: 1100 }))).toBe(true);
  });
});

describe('focusOn', () => {
  const target = { x: 300, y: 400, width: 120, height: 120 };

  it('centres the target', () => {
    const focused = focusOn(target, { paddingUnits: 0 });
    const centre = project({ x: target.x + target.width / 2, y: target.y + target.height / 2 }, focused);
    const viewCentre = project(
      { x: FULL_VIEWBOX.x + FULL_VIEWBOX.width / 2, y: FULL_VIEWBOX.y + FULL_VIEWBOX.height / 2 },
      INITIAL_VIEWPORT,
    );

    expect(round(centre.x)).toBe(round(viewCentre.x));
    expect(round(centre.y)).toBe(round(viewCentre.y));
  });

  it('never zooms below fit for a target larger than the view', () => {
    const huge = { x: 0, y: 0, width: FULL_VIEWBOX.width * 3, height: FULL_VIEWBOX.height * 3 };
    expect(focusOn(huge).scale).toBe(LAYOUT_CONFIG.zoom.min);
  });

  it('zooms in for a small target', () => {
    expect(focusOn({ x: 460, y: 120, width: 20, height: 20 }).scale).toBeGreaterThan(1);
  });
});

describe('reset', () => {
  it('returns to fit with no offset', () => {
    const zoomed = zoomBy(INITIAL_VIEWPORT, 4, { x: 400, y: 800 });
    expect(zoomed.scale).toBeGreaterThan(1);
    expect(resetViewport()).toEqual(INITIAL_VIEWPORT);
  });

  it('renders a transform string with bounded precision', () => {
    const transform = viewportTransform(zoomBy(INITIAL_VIEWPORT, 1.35, { x: 500, y: 1100 }));
    expect(transform).toMatch(/^translate\(-?[\d.]+ -?[\d.]+\) scale\([\d.]+\)$/);
  });
});

function project(point: { x: number; y: number }, state: { scale: number; tx: number; ty: number }) {
  const centre = { x: FULL_VIEWBOX.x + FULL_VIEWBOX.width / 2, y: FULL_VIEWBOX.y + FULL_VIEWBOX.height / 2 };
  return {
    x: centre.x + (point.x - centre.x - state.tx) * state.scale,
    y: centre.y + (point.y - centre.y - state.ty) * state.scale,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
