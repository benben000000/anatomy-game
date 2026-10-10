import { describe, expect, it } from 'vitest';
import {
  checkContentCached,
  offlineExplanation,
  isOnline,
  type PackState,
} from './AssetAvailabilityService';
import { CACHE_NAMES } from '@/config/storage-config';
import {
  resolveBuildFlags,
  releaseBlockingFlags,
  RELEASE_BLOCKING_FLAGS,
} from '@/config/build-flags';

/**
 * Offline behaviour and release gating.
 *
 * The most important property here is negative: when content is already cached,
 * the app must say nothing at all about being offline.
 */

/**
 * Installs a minimal `caches` implementation and runs `body`, returning its
 * result. Real Cache Storage is unavailable in jsdom, and the service only asks
 * for `keys`, `open` and `match`.
 */
async function withCaches<T>(
  entries: readonly { readonly name: string; readonly urls: readonly string[] }[],
  body: () => Promise<T>,
): Promise<T> {
  const store = new Map<string, Set<string>>(
    entries.map((entry) => [entry.name, new Set(entry.urls)]),
  );

  Object.defineProperty(globalThis, 'caches', {
    writable: true,
    configurable: true,
    value: {
      keys: async () => [...store.keys()],
      open: async (name: string) => {
        const urls = store.get(name) ?? new Set<string>();
        store.set(name, urls);
        return {
          match: async (request: RequestInfo | URL) =>
            urls.has(String(request)) ? ({} as Response) : undefined,
        };
      },
      delete: async () => true,
    },
  });

  return body();
}

const REQUIRED = ['/', '/index.html', '/icons/icon-192.png', '/icons/icon-512.png'];

describe('content availability', () => {
  it('reports a fully cached pack as cached', async () => {
    const state = await withCaches(
      [{ name: CACHE_NAMES.content('1.0.0'), urls: REQUIRED }],
      () => checkContentCached('1.0.0'),
    );
    expect(state.status).toBe('cached');
    expect(state.missing).toEqual([]);
  });

  it('reports a pack that was never downloaded as missing', async () => {
    const state = await withCaches([], () => checkContentCached('1.0.0'));
    expect(state.status).toBe('missing');
  });

  it('names the specific missing assets when only partly cached', async () => {
    const state = await withCaches(
      [{ name: CACHE_NAMES.content('1.0.0'), urls: ['/', '/index.html'] }],
      () => checkContentCached('1.0.0'),
    );
    expect(state.status).toBe('partial');
    expect(state.missing.length).toBeGreaterThan(0);
    expect(state.missing).not.toContain('/');
  });

  it('does not treat a different pack version as this pack', async () => {
    const state = await withCaches(
      [{ name: CACHE_NAMES.content('0.9.0'), urls: REQUIRED }],
      () => checkContentCached('1.0.0'),
    );
    expect(state.status).not.toBe('cached');
  });

  it('degrades without throwing when the cache API is unavailable', async () => {
    Object.defineProperty(globalThis, 'caches', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    const state = await checkContentCached('1.0.0');
    expect(state.status).toBe('unknown');
  });
});

describe('offlineExplanation', () => {
  const expectations: readonly { status: PackState['status']; shouldExplain: boolean }[] = [
    { status: 'cached', shouldExplain: false },
    { status: 'missing', shouldExplain: true },
    { status: 'partial', shouldExplain: true },
    { status: 'unknown', shouldExplain: true },
  ];

  for (const { status, shouldExplain } of expectations) {
    it(`${shouldExplain ? 'explains' : 'stays silent about'} a ${status} pack`, () => {
      const message = offlineExplanation(status);
      if (shouldExplain) {
        expect(message).not.toBeNull();
        expect(message?.length).toBeGreaterThan(20);
      } else {
        // Cached content must never produce an offline nag.
        expect(message).toBeNull();
      }
    });
  }

  it('explains a first download rather than showing a generic network error', () => {
    const message = offlineExplanation('missing') ?? '';
    expect(message).toMatch(/first time/i);
    expect(message).toMatch(/internet connection/i);
    expect(message.toLowerCase()).not.toContain('error');
  });
});

describe('connectivity', () => {
  it('reports a definite connectivity state', () => {
    expect(typeof isOnline()).toBe('boolean');
  });
});

describe('build flags', () => {
  it('defaults both safety-relevant flags to on, describing what the bundle contains', () => {
    const flags = resolveBuildFlags({ MODE: 'production', PROD: true });
    expect(flags.PROVISIONAL_ART).toBe(true);
    expect(flags.ALLOW_DRAFT_CONTENT).toBe(true);
  });

  it('keeps the timed challenge off unless explicitly enabled', () => {
    expect(resolveBuildFlags({}).ENABLE_TIMED_CHALLENGE).toBe(false);
    expect(resolveBuildFlags({ VITE_ENABLE_TIMED_CHALLENGE: 'true' }).ENABLE_TIMED_CHALLENGE).toBe(
      true,
    );
  });

  it('honours an explicit override', () => {
    const flags = resolveBuildFlags({
      VITE_ALLOW_DRAFT_CONTENT: 'false',
      VITE_PROVISIONAL_ART: 'false',
    });
    expect(flags.ALLOW_DRAFT_CONTENT).toBe(false);
    expect(flags.PROVISIONAL_ART).toBe(false);
  });

  it('reads true and 1 as enabled, and anything else as disabled', () => {
    expect(resolveBuildFlags({ VITE_PROVISIONAL_ART: '1' }).PROVISIONAL_ART).toBe(true);
    expect(resolveBuildFlags({ VITE_PROVISIONAL_ART: 'yes' }).PROVISIONAL_ART).toBe(false);
    expect(resolveBuildFlags({ VITE_PROVISIONAL_ART: '' }).PROVISIONAL_ART).toBe(true);
  });

  it('blocks a release while either safety flag is on', () => {
    expect(releaseBlockingFlags(resolveBuildFlags({}))).toEqual(
      expect.arrayContaining([...RELEASE_BLOCKING_FLAGS]),
    );
    expect(
      releaseBlockingFlags(
        resolveBuildFlags({ VITE_ALLOW_DRAFT_CONTENT: 'false', VITE_PROVISIONAL_ART: 'false' }),
      ),
    ).toEqual([]);
  });
});
