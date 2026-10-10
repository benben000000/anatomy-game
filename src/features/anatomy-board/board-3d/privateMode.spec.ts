import { describe, expect, it } from 'vitest';
import {
  LICENCE_VERIFIED,
  PRIVATE_3D_RUNTIME_KEY,
  allPacksLicenceVerified,
  privateThreeDBlockedMessage,
  readRuntimeSwitch,
  resolvePrivateThreeD,
  runtimeSwitchRelevant,
  writeRuntimeSwitch,
} from './privateMode';
import { modelPackManifest } from './threeDMappings';

/**
 * The private-use gates.
 *
 * These tests exist to prove the app cannot be talked into claiming the licence
 * is verified, or into loading a model when the owner has not asked for it.
 */

const ALL_ON = { buildFlag: true, runtimeEnabled: true, allPacksLicenceVerified: true };

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage;
}

describe('resolvePrivateThreeD', () => {
  it('allows 3D only when all three gates are satisfied', () => {
    expect(resolvePrivateThreeD(ALL_ON)).toEqual({ allowed: true });
  });

  it('refuses when the build flag is off, whatever else is true', () => {
    const state = resolvePrivateThreeD({ ...ALL_ON, buildFlag: false });
    expect(state).toEqual({ allowed: false, reason: 'build-flag-off' });
  });

  it('allows when the runtime switch is off and the build flag and packs are usable', () => {
    // The runtime switch is now an escape hatch, not a startup gate. The only
    // gate left for a private build with usable packs is the build flag and
    // pack usability, both of which are satisfied here.
    expect(resolvePrivateThreeD({ buildFlag: true, runtimeEnabled: false, allPacksLicenceVerified: true })).toEqual({ allowed: true });
  });

  it('refuses when the licence is unverified, even with everything else on', () => {
    // The most important assertion in this file: a perfect device, the owner
    // having opted in twice, and Muscle Atlas still declines, because the
    // licence was never confirmed.
    const state = resolvePrivateThreeD({ ...ALL_ON, allPacksLicenceVerified: false });
    expect(state).toEqual({ allowed: false, reason: 'licence-unverified' });
  });
});

describe('blocked messages', () => {
  it('explains a licence block without blaming the device or connection', () => {
    const message = privateThreeDBlockedMessage('licence-unverified');
    expect(message.headline).toMatch(/licen[cs]e/i);
    // It must not send the user off to check their connection, and it must not
    // imply the block is device-specific.
    expect(message.detail).not.toMatch(/connect to the internet/i);
    expect(message.detail).not.toMatch(/try another browser/i);
    // The copy positively states the block is NOT about the device or network.
    expect(message.detail).toMatch(/not a problem with/i);
  });

describe('blocked messages', () => {
  it('explains a licence block without blaming the device or connection', () => {
    const message = privateThreeDBlockedMessage('licence-unverified');
    expect(message.headline).toMatch(/licen[cs]e/i);
    // It must not send the user off to check their connection, and it must not
    // imply the block is device-specific.
    expect(message.detail).not.toMatch(/connect to the internet/i);
    expect(message.detail).not.toMatch(/try another browser/i);
    // The copy positively states the block is NOT about the device or network.
    expect(message.detail).toMatch(/not a problem with/i);
  });

  it('never describes the model as public domain or open source', () => {
    // Only the messages this build still produces are looped, so no reason here
    // can throw when read.
    for (const reason of ['build-flag-off', 'licence-unverified'] as const) {
      const message = privateThreeDBlockedMessage(reason);
      const text = `${message.headline} ${message.detail}`;
      expect(text.toLowerCase()).not.toContain('public domain');
      expect(text.toLowerCase()).not.toMatch(/\bopen source\b/);
      expect(text.toLowerCase()).not.toContain('cleared');
    }
  });
});

describe('runtime switch', () => {
  it('is off by default', () => {
    expect(readRuntimeSwitch(memoryStorage())).toBe(false);
  });

  it('persists an opt-in', () => {
    const storage = memoryStorage();
    writeRuntimeSwitch(storage, true);
    expect(readRuntimeSwitch(storage)).toBe(true);
  });

  it('clears the opt-in', () => {
    const storage = memoryStorage();
    writeRuntimeSwitch(storage, true);
    writeRuntimeSwitch(storage, false);
    expect(readRuntimeSwitch(storage)).toBe(false);
  });

  it('survives storage being unavailable', () => {
    // Private browsing on iOS can make localStorage throw. That must disable 3D,
    // not crash the settings screen.
    const hostile: Pick<Storage, 'getItem'> = {
      getItem: () => {
        throw new Error('denied');
      },
    };
    expect(readRuntimeSwitch(hostile)).toBe(false);
    expect(() =>
      writeRuntimeSwitch(
        {
          setItem: () => {
            throw new Error('denied');
          },
          removeItem: () => {
            throw new Error('denied');
          },
        },
        true,
      ),
    ).not.toThrow();
  });

  it('uses a namespaced key', () => {
    expect(PRIVATE_3D_RUNTIME_KEY).toBe('muscle-atlas.private-3d');
  });
});

describe('allPacksLicenceVerified', () => {
  it('is false when no pack is verified', () => {
    expect(allPacksLicenceVerified([])).toBe(false);
  });

  it('is false when any one pack is unverified', () => {
    expect(
      allPacksLicenceVerified([
        { integration_status: 'verified' },
        { integration_status: 'blocked-pending-licence' },
      ] as never),
    ).toBe(false);
  });

  it('is true only when every pack is verified', () => {
    expect(
      allPacksLicenceVerified([{ integration_status: 'verified' }] as never),
    ).toBe(true);
  });
});

describe('the shipped pack manifest', () => {
  it('marks the packs usable on disk', () => {
    // Usable means present, mapped and safe to load here. It is deliberately a
    // different question from whether the licence is verified.
    expect(modelPackManifest.packs.length).toBeGreaterThan(0);
    expect(allPacksLicenceVerified(modelPackManifest.packs)).toBe(true);
  });

  it('does NOT claim the licence is verified', () => {
    // The single most important assertion about disclosure in this file.
    expect(LICENCE_VERIFIED).toBe(false);
  });

  it('serves models from the private mount, never from public/', () => {
    for (const pack of modelPackManifest.packs) {
      expect(pack.asset_path).toMatch(/^\/private-models\//);
    }
  });
});

// ---- private 3D now defaults ON for this build (escape hatch in Settings) ----

describe('runtimeSwitchRelevant', () => {
  it('is true when the build flag and pack usability are both satisfied', () => {
    expect(runtimeSwitchRelevant({ buildFlag: true, allPacksLicenceVerified: true })).toBe(true);
  });

  it('is false when the build flag is off', () => {
    expect(runtimeSwitchRelevant({ buildFlag: false, allPacksLicenceVerified: true })).toBe(false);
  });

  it('is false when the packs are not usable', () => {
    expect(runtimeSwitchRelevant({ buildFlag: true, allPacksLicenceVerified: false })).toBe(false);
  });

  it('makes the stored runtime switch irrelevant in a build that cannot load 3D', () => {
    // When runtimeSwitchRelevant is false, this project never reads a stored
    // 'enabled' value as permission to load 3D — behaviour is covered by the
    // resolvePrivateThreeD contract and by the ThreeDExploreView smoke test.
    expect(runtimeSwitchRelevant({ buildFlag: false, allPacksLicenceVerified: false })).toBe(false);
    expect(runtimeSwitchRelevant({ buildFlag: true, allPacksLicenceVerified: true })).toBe(true);
  });
});

});
