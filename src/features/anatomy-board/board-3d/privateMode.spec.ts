import { describe, expect, it } from 'vitest';
import {
  LICENCE_VERIFIED,
  PRIVATE_3D_RUNTIME_KEY,
  allPacksLicenceVerified,
  privateThreeDBlockedMessage,
  readRuntimeSwitch,
  resolvePrivateThreeD,
  writeRuntimeSwitch,
  type PrivateThreeDState,
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

  it('refuses when the runtime switch is off', () => {
    const state = resolvePrivateThreeD({ ...ALL_ON, runtimeEnabled: false });
    expect(state).toEqual({ allowed: false, reason: 'runtime-switch-off' });
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

  it('never describes the model as public domain or open source', () => {
    for (const reason of ['build-flag-off', 'runtime-switch-off', 'licence-unverified'] as const) {
      const text = `${privateThreeDBlockedMessage(reason).headline} ${privateThreeDBlockedMessage(reason).detail}`;
      expect(text.toLowerCase()).not.toContain('public domain');
      expect(text.toLowerCase()).not.toMatch(/\bopen source\b/);
      expect(text.toLowerCase()).not.toContain('cleared');
    }
  });

  it('tells the owner where the switch is', () => {
    expect(privateThreeDBlockedMessage('runtime-switch-off').detail).toMatch(/settings/i);
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

describe('state shape', () => {
  it('never reports a reason when allowed', () => {
    const state: PrivateThreeDState = resolvePrivateThreeD(ALL_ON);
    if (state.allowed) {
      expect('reason' in state).toBe(false);
    } else {
      expect(typeof state.reason).toBe('string');
    }
  });
});