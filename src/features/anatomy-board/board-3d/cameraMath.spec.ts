import { describe, expect, it } from 'vitest';
import {
  ANATOMICAL_VIEW_DIRECTIONS,
  TAP_THRESHOLD_PX,
  boundsToSphere,
  boundsContain,
  classifyGesture,
  clampPhi,
  clampRadius,
  emptyBounds,
  evaluateTap,
  isEmptyBounds,
  nearFarFor,
  orbitForView,
  orbitFromPosition,
  orbitPosition,
  panFromDrag,
  pinchDistance,
  radiusToFit,
  unionBounds,
  zoomRatio,
} from './cameraMath';

/**
 * Camera and gesture maths.
 *
 * These are the calculations that decide whether the 3D view feels right on an
 * iPad Air M4. They are pure, so they are tested here; whether they *feel* right
 * in the hand is a real-device question that this suite cannot answer, and
 * docs/three-d-ipad-safari-test-plan.md says so.
 */

const FOV = Math.PI / 4;

describe('orbit maths', () => {
  it('places the anterior camera in front of the model', () => {
    const state = orbitForView('anterior', 2);
    const position = orbitPosition(state, { x: 0, y: 0, z: 0 });
    expect(position.z).toBeCloseTo(2, 5);
  });

  it('places the posterior camera behind the model', () => {
    const state = orbitForView('posterior', 2);
    const position = orbitPosition(state, { x: 0, y: 0, z: 0 });
    expect(position.z).toBeCloseTo(-2, 5);
  });

  it('places lateral and medial on opposite sides', () => {
    const lateral = orbitPosition(orbitForView('lateral', 1), { x: 0, y: 0, z: 0 });
    const medial = orbitPosition(orbitForView('medial', 1), { x: 0, y: 0, z: 0 });
    expect(lateral.x).toBeCloseTo(-medial.x, 5);
    expect(Math.abs(lateral.x)).toBeCloseTo(1, 5);
  });

  it('round-trips a camera position back to the same orbit', () => {
    const original = { theta: 0.7, phi: -0.3, radius: 1.8 };
    const position = orbitPosition(original, { x: 0.1, y: 0.2, z: 0.3 });
    const recovered = orbitFromPosition(position, { x: 0.1, y: 0.2, z: 0.3 });

    expect(recovered.theta).toBeCloseTo(original.theta, 6);
    expect(recovered.phi).toBeCloseTo(original.phi, 6);
    expect(recovered.radius).toBeCloseTo(original.radius, 6);
  });

  it('never lets the camera flip over the poles', () => {
    expect(clampPhi(Math.PI)).toBeLessThan(Math.PI / 2);
    expect(clampPhi(-Math.PI)).toBeGreaterThan(-Math.PI / 2);
  });

  it('clamps zoom to the limits', () => {
    expect(clampRadius(0.001, 0.5, 4)).toBe(0.5);
    expect(clampRadius(99, 0.5, 4)).toBe(4);
  });

  it('defines every anatomical view direction', () => {
    for (const direction of Object.values(ANATOMICAL_VIEW_DIRECTIONS)) {
      expect(Math.hypot(direction.x, direction.y, direction.z)).toBeCloseTo(1, 6);
    }
  });
});

describe('gesture classification', () => {
  const pointer = (id: number) => ({ id, x: id * 10, y: id * 10, pointerType: 'touch' as const });

  it('rotates with one finger', () => {
    expect(classifyGesture([pointer(1)])).toBe('rotate');
  });

  it('pans with two fingers', () => {
    expect(classifyGesture([pointer(1), pointer(2)])).toBe('pan');
  });

  it('treats three or more fingers as a zoom gesture, never a pan', () => {
    // A pinch needs exactly two points. Three or more is a stray palm and must
    // not be treated as a pan, which would move the model unexpectedly.
    expect(classifyGesture([pointer(1), pointer(2), pointer(3)])).toBe('zoom');
  });

  it('does nothing with no pointers', () => {
    expect(classifyGesture([])).toBe('none');
  });

  it('measures the distance between two pointers', () => {
    expect(pinchDistance(pointer(1), pointer(2))).toBeCloseTo(Math.hypot(10, 10), 6);
  });
});

describe('tap detection', () => {
  it('treats a stationary release as a tap', () => {
    expect(evaluateTap({ x: 100, y: 100 }, { x: 101, y: 101 }).isTap).toBe(true);
  });

  it('does not treat a drag as a tap', () => {
    // This is what stops "drag to look around" from selecting a muscle.
    expect(evaluateTap({ x: 100, y: 100 }, { x: 140, y: 100 }).isTap).toBe(false);
  });

  it('uses a fingertip-appropriate threshold', () => {
    expect(TAP_THRESHOLD_PX).toBeGreaterThanOrEqual(8);
    expect(TAP_THRESHOLD_PX).toBeLessThanOrEqual(14);
  });
});

describe('pan direction', () => {
  it('moves the model with the finger, not against it', () => {
    // Dragging right must push the model right. An inverted sign here was a real
    // bug in the 2D board during development and is asserted against.
    const delta = panFromDrag({ x: 0, y: 0 }, { x: 50, y: 0 }, 400, 400, 2);
    expect(delta.x).toBeLessThan(0);
  });

  it('moves the model down when the finger moves up on screen', () => {
    // Screen Y grows downward while world Y grows upward. Dragging the finger up
    // must push the model up on screen, which means world Y decreases. This is
    // the "grab and drag" behaviour a touch screen needs.
    const delta = panFromDrag({ x: 0, y: 100 }, { x: 0, y: 50 }, 400, 400, 2);
    expect(delta.y).toBeLessThan(0);
  });

  it('does not divide by a zero-sized viewport', () => {
    const delta = panFromDrag({ x: 0, y: 0 }, { x: 10, y: 10 }, 0, 0, 2);
    expect(delta.x).toBe(0);
    expect(delta.y).toBe(0);
  });
});

describe('zoom', () => {
  it('zooms in when the pinch spreads', () => {
    expect(zoomRatio(100, 200)).toBeCloseTo(2, 6);
  });

  it('zooms out when the pinch closes', () => {
    expect(zoomRatio(200, 100)).toBeCloseTo(0.5, 6);
  });

  it('does nothing for a degenerate previous distance', () => {
    expect(zoomRatio(0, 100)).toBe(1);
  });

  it('is frame-rate independent', () => {
    // The same physical pinch must produce the same result whether it arrives
    // in one event or two. zoomRatio returns a multiplier to apply to the
    // radius: dividing by it as the board does, a spread pinch shrinks radius.
    const single = zoomRatio(100, 200);

    let ratio = 1;
    ratio *= zoomRatio(100, 140);
    ratio *= zoomRatio(140, 200);

    expect(ratio).toBeCloseTo(single, 6);
  });

  it('matches the inverse when the pinch is reversed', () => {
    expect(zoomRatio(150, 100) * zoomRatio(100, 150)).toBeCloseTo(1, 6);
  });
});

describe('framing', () => {
  it('frames the model so it fits the view', () => {
    const radius = radiusToFit(1, FOV, 1);
    expect(radius).toBeGreaterThan(1);
  });

  it('pulls the camera back in portrait, where height is the constraint', () => {
    const landscape = radiusToFit(1, FOV, 2);
    const portrait = radiusToFit(1, FOV, 0.5);
    expect(portrait).toBeGreaterThan(landscape);
  });

  it('keeps the near plane positive and the far plane beyond the model', () => {
    const { near, far } = nearFarFor(2);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(2);
  });

  it('survives a zero radius without producing a degenerate near plane', () => {
    const { near, far } = nearFarFor(0);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(0);
  });
});

describe('bounds', () => {
  const bounds = { min: { x: -1, y: -2, z: -3 }, max: { x: 1, y: 2, z: 3 } };

  it('computes a bounding sphere', () => {
    const sphere = boundsToSphere(bounds);
    expect(sphere.center).toEqual({ x: 0, y: 0, z: 0 });
    expect(sphere.radius).toBeCloseTo(Math.hypot(2, 4, 6) / 2, 6);
  });

  it('unions two bounds', () => {
    const merged = unionBounds(bounds, { min: { x: 5, y: 0, z: 0 }, max: { x: 6, y: 1, z: 1 } });
    expect(merged.max.x).toBe(6);
    expect(merged.min.x).toBe(-1);
  });

  it('treats an inverted range as empty', () => {
    // Box3.setFromObject returns an empty box for a node with no geometry; that
    // must not be mistaken for a real bounds.
    expect(isEmptyBounds(emptyBounds())).toBe(true);
    expect(isEmptyBounds(bounds)).toBe(false);
  });

  it('tests containment', () => {
    expect(boundsContain(bounds, { x: 0, y: 0, z: 0 })).toBe(true);
    expect(boundsContain(bounds, { x: 5, y: 0, z: 0 })).toBe(false);
  });
});