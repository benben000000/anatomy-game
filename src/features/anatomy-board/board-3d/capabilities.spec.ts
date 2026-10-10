import { describe, expect, it } from 'vitest';
import {
  evaluateCapabilities,
  isPerformanceAcceptable,
  MINIMUM_ACCEPTABLE_PERFORMANCE,
  type CapabilityProbe,
} from './capabilities';

function probe(overrides: Partial<CapabilityProbe> = {}): CapabilityProbe {
  return {
    hasWebgl2: true,
    hasWebgl1: true,
    hasWebgpuContext: false,
    deviceMemory: 8,
    saveData: false,
    reducedMotion: false,
    ...overrides,
  };
}

describe('evaluateCapabilities', () => {
  it('reports WebGL2 when available', () => {
    const result = evaluateCapabilities({
      probe: probe({ hasWebgl2: true }),
      hasUsablePack: true,
      packsLicenceBlocked: false,
    });

    expect(result.renderer).toBe('webgl2');
    expect(result.webglAvailable).toBe(true);
    expect(result.blockingReason).toBeNull();
  });

  it('falls back to WebGL1 without failing', () => {
    const result = evaluateCapabilities({
      probe: probe({ hasWebgl2: false, hasWebgl1: true }),
      hasUsablePack: true,
      packsLicenceBlocked: false,
    });

    expect(result.renderer).toBe('webgl1');
    expect(result.blockingReason).toBeNull();
  });

  it('blocks when no WebGL exists at all', () => {
    const result = evaluateCapabilities({
      probe: probe({ hasWebgl2: false, hasWebgl1: false }),
      hasUsablePack: true,
      packsLicenceBlocked: false,
    });

    expect(result.renderer).toBe('none');
    expect(result.webglAvailable).toBe(false);
    expect(result.blockingReason).toBe('no-webgl');
  });

  it('never treats WebGPU as a requirement', () => {
    const withoutGpu = evaluateCapabilities({
      probe: probe({ hasWebgpuContext: false }),
      hasUsablePack: true,
      packsLicenceBlocked: false,
    });
    const withGpu = evaluateCapabilities({
      probe: probe({ hasWebgpuContext: true }),
      hasUsablePack: true,
      packsLicenceBlocked: false,
    });

    expect(withoutGpu.blockingReason).toBeNull();
    expect(withGpu.blockingReason).toBeNull();
    // It is reported as an enhancement, never as a gate.
    expect(withGpu.webgpuAvailable).toBe(true);
    expect(withoutGpu.webgpuAvailable).toBe(false);
  });

  it('blocks on licence before it blocks on capability', () => {
    // A technically perfect device with an unverified asset must be blocked by
    // licence: offering it would present unlicensed content as a finished feature.
    const result = evaluateCapabilities({
      probe: probe({ hasWebgl2: true, hasWebgl1: true }),
      hasUsablePack: false,
      packsLicenceBlocked: true,
    });

    expect(result.webglAvailable).toBe(true);
    expect(result.blockingReason).toBe('pack-licence-blocked');
  });

  it('distinguishes not-downloaded from licence-blocked', () => {
    const notDownloaded = evaluateCapabilities({
      probe: probe(),
      hasUsablePack: false,
      packsLicenceBlocked: false,
    });
    const licenceBlocked = evaluateCapabilities({
      probe: probe(),
      hasUsablePack: false,
      packsLicenceBlocked: true,
    });

    expect(notDownloaded.blockingReason).toBe('no-cached-pack');
    expect(licenceBlocked.blockingReason).toBe('pack-licence-blocked');
  });

  it('respects data saver', () => {
    const result = evaluateCapabilities({
      probe: probe({ saveData: true }),
      hasUsablePack: true,
      packsLicenceBlocked: false,
    });
    expect(result.blockingReason).toBe('reduced-data-saver');
  });

  it('reports reduced motion without blocking', () => {
    const result = evaluateCapabilities({
      probe: probe({ reducedMotion: true }),
      hasUsablePack: true,
      packsLicenceBlocked: false,
    });

    // Reduced motion removes animation, not capability.
    expect(result.animationAllowed).toBe(false);
    expect(result.blockingReason).toBeNull();
  });
});

describe('isPerformanceAcceptable', () => {
  it('does not fail when deviceMemory is unavailable, as on Safari', () => {
    // Safari does not implement navigator.deviceMemory. Treating its absence as
    // a failure would disable 3D on the primary target device.
    expect(isPerformanceAcceptable(probe({ deviceMemory: undefined }))).toBe(true);
  });

  it('blocks only below the documented threshold', () => {
    expect(isPerformanceAcceptable(probe({ deviceMemory: MINIMUM_ACCEPTABLE_PERFORMANCE.deviceMemoryGb }))).toBe(true);
    expect(isPerformanceAcceptable(probe({ deviceMemory: MINIMUM_ACCEPTABLE_PERFORMANCE.deviceMemoryGb - 1 }))).toBe(false);
  });
});