/**
 * Pure camera maths for the 3D board.
 *
 * ## Why this is separate from the renderer
 *
 * Every one of these functions is testable without a WebGL context, a GPU, or a
 * DOM. That is not tidiness for its own sake: it is the only way the gesture
 * behaviour on the primary target device — an iPad Air M4, touched with fingers
 * and sometimes a Pencil — can be verified by automated tests at all. The real
 * device checklist in docs/three-d-ipad-safari-test-plan.md still has to be run
 * by a person; this makes sure the arithmetic underneath it is right before that
 * happens.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/* ------------------------------------------------------------------ *
 * Spherical camera coordinates
 * ------------------------------------------------------------------ */

/**
 * The model faces -Z in glTF convention after Blender's Y-up conversion.
 * These directions place the camera on a named anatomical view.
 */
export const ANATOMICAL_VIEW_DIRECTIONS = {
  anterior: { x: 0, y: 0, z: 1 },
  posterior: { x: 0, y: 0, z: -1 },
  lateral: { x: 1, y: 0, z: 0 },
  medial: { x: -1, y: 0, z: 0 },
  superior: { x: 0, y: 1, z: 0 },
  inferior: { x: 0, y: -1, z: 0 },
} as const satisfies Record<string, Vec3>;

export type AnatomicalView = keyof typeof ANATOMICAL_VIEW_DIRECTIONS;

export interface OrbitState {
  /** Horizontal angle in radians. 0 looks down -Z. */
  readonly theta: number;
  /** Vertical angle in radians, clamped away from the poles. */
  readonly phi: number;
  /** Distance from the orbit target. */
  readonly radius: number;
}

/** How far the camera may orbit vertically before it flips. */
export const PHI_LIMIT = Math.PI / 2 - 0.02;

export function clampPhi(phi: number): number {
  return Math.min(PHI_LIMIT, Math.max(-PHI_LIMIT, phi));
}

export function clampRadius(radius: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, radius));
}

/**
 * Unit vector from the orbit target toward the camera.
 *
 * Spherical convention: theta sweeps around the vertical axis, phi is elevation.
 *
 *   x = r * cos(phi) * sin(theta)
 *   y = r * sin(phi)
 *   z = r * cos(phi) * cos(theta)
 *
 * The horizontal terms use **cos(phi)**, not sin(phi). At the equator (phi = 0)
 * the camera must be at maximum horizontal distance, which only cos gives. Using
 * sin here collapses the camera onto the target at the equator and pushes it
 * off-axis at the poles — a bug the tests caught.
 */
export function orbitDirection(state: OrbitState): Vec3 {
  const cosPhi = Math.cos(state.phi);
  return {
    x: state.radius * cosPhi * Math.sin(state.theta),
    y: state.radius * Math.sin(state.phi),
    z: state.radius * cosPhi * Math.cos(state.theta),
  };
}

export function orbitPosition(state: OrbitState, target: Vec3): Vec3 {
  const direction = orbitDirection(state);
  return {
    x: target.x + direction.x,
    y: target.y + direction.y,
    z: target.z + direction.z,
  };
}

/** Inverse of `orbitPosition`: which orbit state puts the camera here? */
export function orbitFromPosition(position: Vec3, target: Vec3): OrbitState {
  const dx = position.x - target.x;
  const dy = position.y - target.y;
  const dz = position.z - target.z;
  const radius = Math.hypot(dx, dy, dz);
  return {
    theta: Math.atan2(dx, dz),
    phi: clampPhi(radius === 0 ? 0 : Math.asin(dy / radius)),
    radius,
  };
}

/** The orbit state that looks at a named anatomical view. */
export function orbitForView(view: AnatomicalView, radius: number): OrbitState {
  const direction = ANATOMICAL_VIEW_DIRECTIONS[view];
  const length = Math.hypot(direction.x, direction.y, direction.z);
  const normalized = {
    x: direction.x / length,
    y: direction.y / length,
    z: direction.z / length,
  };
  return {
    theta: Math.atan2(normalized.x, normalized.z),
    phi: clampPhi(Math.asin(normalized.y)),
    radius,
  };
}

/* ------------------------------------------------------------------ *
 * Gestures
 * ------------------------------------------------------------------ */

export interface GestureInput {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly pointerType: 'touch' | 'pen' | 'mouse';
}

/**
 * What a frame of pointer input means.
 *
 * The mapping is fixed and visible rather than configurable, because the whole
 * point is that nothing is hidden:
 *
 *   1 finger  -> rotate
 *   2 fingers -> pan
 *   pinch     -> zoom
 *   pen/mouse -> drag to rotate, wheel or pinch to zoom
 */
export type GestureKind = 'none' | 'rotate' | 'pan' | 'zoom';

export function classifyGesture(pointers: readonly GestureInput[]): GestureKind {
  if (pointers.length === 0) return 'none';
  if (pointers.length === 1) return 'rotate';
  if (pointers.length >= 3) return 'zoom';
  return 'pan';
}

/** Distance between the first two active pointers. */
export function pinchDistance(a: GestureInput, b: GestureInput): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Movement beyond this many CSS pixels is a drag, not a tap.
 *
 * Sized for a fingertip on a held iPad: 10 CSS px is comfortably under the
 * threshold at which a thumb resting on glass starts registering as motion, and
 * comfortably over the jitter of a deliberate tap.
 */
export const TAP_THRESHOLD_PX = 10;

export interface TapDecision {
  readonly isTap: boolean;
  readonly distanceTravelled: number;
}

export function evaluateTap(
  start: Vec2,
  current: Vec2,
  threshold = TAP_THRESHOLD_PX,
): TapDecision {
  const distanceTravelled = Math.hypot(current.x - start.x, current.y - start.y);
  return { isTap: distanceTravelled <= threshold, distanceTravelled };
}

/**
 * Map a two-finger drag to an orbit target pan.
 *
 * The sign here was wrong in the 2D board during development and produced
 * inverted panning. The invariant, asserted in the tests, is: dragging the model
 * right moves the point under the fingers left, as though pushing it. That is
 * what "grab and drag" must feel like on a touch screen.
 */
export function panFromDrag(
  start: Vec2,
  current: Vec2,
  viewportWidth: number,
  viewportHeight: number,
  worldHeight: number,
): Vec2 {
  if (viewportWidth <= 0 || viewportHeight <= 0) return { x: 0, y: 0 };
  const worldWidth = worldHeight * (viewportWidth / viewportHeight);
  return {
    x: -((current.x - start.x) / viewportWidth) * worldWidth,
    y: (current.y - start.y) / viewportHeight * worldHeight,
  };
}

/**
 * Zoom multiplier from a pinch.
 *
 * Uses the ratio of distances rather than a fixed per-event increment, so the
 * zoom feels the same whether the pinch is fast or slow, and is independent of
 * frame rate.
 */
export function zoomRatio(previousDistance: number, currentDistance: number): number {
  if (previousDistance <= 0) return 1;
  return currentDistance / previousDistance;
}

/* ------------------------------------------------------------------ *
 * Framing
 * ------------------------------------------------------------------ */

export interface Bounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

export function boundsCenter(bounds: Bounds): Vec3 {
  return {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };
}

export function boundsSize(bounds: Bounds): Vec3 {
  return {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  };
}

/**
 * Camera radius that fits a sphere of the given radius in view.
 *
 * `fov` is the vertical field of view in radians. Dividing by the smaller of the
 * two aspect-derived radii is what keeps the model fully visible in portrait,
 * where the vertical field of view is the binding constraint.
 */
export function radiusToFit(
  sphereRadius: number,
  fov: number,
  aspect: number,
): number {
  if (sphereRadius <= 0) return 1;
  const vertical = sphereRadius / Math.sin(fov / 2);
  const horizontalFov = 2 * Math.atan(Math.tan(fov / 2) * Math.max(aspect, 0.0001));
  const horizontal = sphereRadius / Math.sin(Math.min(horizontalFov, Math.PI) / 2);
  return Math.max(vertical, horizontal);
}

/**
 * Near and far planes for a given orbit radius.
 *
 * A near plane at 0 disables depth precision and makes muscles z-fight as the
 * camera moves, which matters here because several muscles sit within
 * millimetres of each other. A far plane at infinity is unnecessary and reduces
 * depth precision further on mobile GPUs.
 */
export function nearFarFor(radius: number): { near: number; far: number } {
  const safeRadius = Math.max(radius, 0.001);
  return {
    near: Math.max(safeRadius / 100, 0.0001),
    far: safeRadius * 10,
  };
}

/** Bounding sphere of an axis-aligned box, centred on the box centre. */
export function boundsToSphere(bounds: Bounds): { center: Vec3; radius: number } {
  const size = boundsSize(bounds);
  return {
    center: boundsCenter(bounds),
    radius: Math.hypot(size.x, size.y, size.z) / 2,
  };
}

export function unionBounds(a: Bounds | null, b: Bounds): Bounds {
  if (a === null) return b;
  return {
    min: { x: Math.min(a.min.x, b.min.x), y: Math.min(a.min.y, b.min.y), z: Math.min(a.min.z, b.min.z) },
    max: { x: Math.max(a.max.x, b.max.x), y: Math.max(a.max.y, b.max.y), z: Math.max(a.max.z, b.max.z) },
  };
}

export function emptyBounds(): Bounds {
  return {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  };
}

export function isEmptyBounds(bounds: Bounds): boolean {
  return bounds.min.x > bounds.max.x || bounds.min.y > bounds.max.y || bounds.min.z > bounds.max.z;
}

export function boundsContain(bounds: Bounds, point: Vec3): boolean {
  return (
    point.x >= bounds.min.x &&
    point.x <= bounds.max.x &&
    point.y >= bounds.min.y &&
    point.y <= bounds.max.y &&
    point.z >= bounds.min.z &&
    point.z <= bounds.max.z
  );
}

/**
 * Offset a ray origin slightly along its own direction.
 *
 * Raycasting a surface that coincides exactly with the near plane, or a muscle
 * modelled flush against another, intermittently misses. A sub-millimetre nudge
 * removes the class of bug without being visible.
 */
export const RAY_ORIGIN_EPSILON = 0.0001;