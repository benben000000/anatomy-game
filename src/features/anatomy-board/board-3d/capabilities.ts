/**
 * 3D capability detection.
 *
 * Deliberately separated from any Three.js import so it can be unit tested
 * without a WebGL context, and so that importing this file never pulls a
 * renderer into a bundle that does not need one.
 *
 * All detection is feature detection. There is no user-agent sniffing anywhere
 * in this project, and specifically not here: an iPad on iPadOS 18 and an iPad
 * on iPadOS 26 are both "an iPad", and the WebGL situation differs between
 * them.
 */

export type RendererCapability = 'webgl2' | 'webgl1' | 'none';

export interface ThreeDCapabilities {
  readonly renderer: RendererCapability;
  readonly webglAvailable: boolean;
  /** True when a WebGPU context can actually be created, not merely advertised. */
  readonly webgpuAvailable: boolean;
  /** False when the user or a device setting turns animation off. */
  readonly animationAllowed: boolean;
  /** False below a threshold where 3D would harm more than help. */
  readonly performanceAcceptable: boolean;
  /** Why 3D is unavailable, when it is. Null means available. */
  readonly blockingReason: ThreeDBlockingReason | null;
}

export type ThreeDBlockingReason =
  | 'no-webgl'
  | 'no-cached-pack'
  | 'pack-licence-blocked'
  | 'insufficient-performance'
  | 'reduced-data-saver';

/**
 * The minimum we will attempt. Below this, a 3D view on a study device is more
 * likely to end a study session than to support one.
 */
export const MINIMUM_ACCEPTABLE_PERFORMANCE = {
  /** Logical cores. */
  deviceMemoryGb: 4,
  /** deviceMemory is Chromium-only; when absent this test is skipped, not failed. */
  prefersReducedData: false,
} as const;

export interface CapabilityProbe {
  readonly hasWebgl2: boolean;
  readonly hasWebgl1: boolean;
  readonly hasWebgpuContext: boolean;
  readonly deviceMemory: number | undefined;
  readonly saveData: boolean;
  readonly reducedMotion: boolean;
}

export interface EvaluateOptions {
  readonly probe: CapabilityProbe;
  /** Whether at least one pack is both licensed and available locally. */
  readonly hasUsablePack: boolean;
  /**
   * Whether every candidate pack is blocked on licence verification. Distinct
   * from "not downloaded yet": an unlicensed pack is a governance problem, not
   * a connectivity one, and the message must say so.
   */
  readonly packsLicenceBlocked: boolean;
}

/**
 * Decide whether 3D can run at all.
 *
 * The order matters. Licence is checked before capability, because offering a
 * technically perfect 3D view of an asset we are not permitted to ship would
 * be the worst possible outcome — it would look like a finished feature.
 */
export function evaluateCapabilities(options: EvaluateOptions): ThreeDCapabilities {
  const { probe } = options;

  const renderer: RendererCapability = probe.hasWebgl2
    ? 'webgl2'
    : probe.hasWebgl1
      ? 'webgl1'
      : 'none';

  const webglAvailable = renderer !== 'none';

  const performanceAcceptable = isPerformanceAcceptable(probe);

  let blockingReason: ThreeDBlockingReason | null = null;

  if (options.packsLicenceBlocked) {
    blockingReason = 'pack-licence-blocked';
  } else if (!webglAvailable) {
    blockingReason = 'no-webgl';
  } else if (probe.saveData) {
    blockingReason = 'reduced-data-saver';
  } else if (!performanceAcceptable) {
    blockingReason = 'insufficient-performance';
  } else if (!options.hasUsablePack) {
    blockingReason = 'no-cached-pack';
  }

  return {
    renderer,
    webglAvailable,
    webgpuAvailable: probe.hasWebgpuContext,
    animationAllowed: !probe.reducedMotion,
    performanceAcceptable,
    blockingReason,
  };
}

export function isPerformanceAcceptable(probe: CapabilityProbe): boolean {
  // deviceMemory is not implemented in Safari. Its absence is not a failure; it
  // simply means we have no signal and trust the renderer probe instead.
  if (probe.deviceMemory === undefined) return true;
  return probe.deviceMemory >= MINIMUM_ACCEPTABLE_PERFORMANCE.deviceMemoryGb;
}

/* ------------------------------------------------------------------ *
 * Live probes
 *
 * Kept here rather than inline in a component so they can be stubbed in tests
 * and so the detection logic stays in one auditable place.
 * ------------------------------------------------------------------ */

/**
 * Attempt to create a real WebGL2 context.
 *
 * Creating and immediately discarding a context is the only reliable test: the
 * existence of `HTMLCanvasElement.prototype.getContext` proves nothing, and on
 * iPadOS the browser may expose the API while refusing the context.
 */
export function probeWebGL2(): boolean {
  return canCreateContext('webgl2');
}

export function probeWebGL1(): boolean {
  return canCreateContext('webgl');
}

function canCreateContext(kind: 'webgl2' | 'webgl'): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext(kind, {
      failIfMajorPerformanceCaveat: true,
    });
    return context !== null;
  } catch {
    return false;
  }
}

/**
 * WebGPU is an optional enhancement only.
 *
 * `navigator.gpu` existing proves nothing: context creation commonly fails on
 * Safari even when the object is present, which is exactly the case we must not
 * mistake for support.
 */
export async function probeWebGPU(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (gpu === undefined) return false;
  try {
    const adapter = await gpu.requestAdapter();
    return adapter !== null && adapter !== undefined;
  } catch {
    return false;
  }
}

export function probeDeviceMemory(): number | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const value = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof value === 'number' ? value : undefined;
}

export function probeSaveData(): boolean {
  if (typeof navigator === 'undefined') return false;
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean };
    }
  ).connection;
  return connection?.saveData === true;
}

export function probeReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Convenience wrapper for the real environment. */
export async function detectCapabilities(
  options: Omit<EvaluateOptions, 'probe'>,
): Promise<ThreeDCapabilities> {
  return evaluateCapabilities({
    probe: {
      hasWebgl2: probeWebGL2(),
      hasWebgl1: probeWebGL1(),
      hasWebgpuContext: await probeWebGPU(),
      deviceMemory: probeDeviceMemory(),
      saveData: probeSaveData(),
      reducedMotion: probeReducedMotion(),
    },
    ...options,
  });
}