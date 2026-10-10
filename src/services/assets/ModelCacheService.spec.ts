import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelCacheService, cacheKeyFor, formatBytes } from './ModelCacheService';

/**
 * Model cache behaviour.
 *
 * The properties that matter are mostly negative: no hidden download, no
 * progress stored in a cache, and an honest answer when a pack is not there.
 */

const PACK = {
  packId: 'open3dmodel.upper_limb.v1',
  version: '1.0.0',
  displayName: 'Open3Dmodel — upper limb',
  assetPath: '/models/open3dmodel/muscular/upper-limb/upper-limb.glb',
  sizeBytes: 6_911_588,
  requiresDraco: true,
} as const;

/** The real Cache API accepts a string, a Request or a URL, and returns Request objects from keys(). Normalise so the fake matches real behaviour. */
function toKey(request: RequestInfo | URL): string {
  return typeof request === 'object' && request !== null && 'url' in request
    ? String((request as { url: unknown }).url)
    : String(request);
}

function installCache() {
  const store = new Map<string, Response>();
  Object.defineProperty(globalThis, 'caches', {
    writable: true,
    configurable: true,
    value: {
      open: async () => ({
        match: async (request: RequestInfo | URL) => store.get(toKey(request)),
        put: async (request: RequestInfo | URL, response: Response) => {
          store.set(String(request), response);
        },
        delete: async (request: RequestInfo | URL) => store.delete(toKey(request)),
        keys: async () => [...store.keys()].map((url) => ({ url })),
      }),
    },
  });
  return store;
}

function okResponse(bytes = 1024) {
  return new Response(new ArrayBuffer(bytes), { status: 200 });
}

beforeEach(() => {
  installCache();
});

describe('cache keys', () => {
  it('includes the version so a new pack never overwrites an old one', () => {
    expect(cacheKeyFor(PACK)).toContain('open3dmodel.upper_limb.v1');
    expect(cacheKeyFor(PACK)).toContain('1.0.0');
    expect(cacheKeyFor({ packId: 'p', version: '1' })).not.toBe(cacheKeyFor({ packId: 'p', version: '2' }));
  });
});

describe('formatBytes', () => {
  it('states a size honestly before a download starts', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 kB');
    expect(formatBytes(6_911_588)).toBe('6.6 MB');
  });
});

describe('getState', () => {
  it('reports an undownloaded pack as absent', async () => {
    const service = new ModelCacheService({ cacheName: 'test' });
    expect((await service.getState(PACK)).status).toBe('absent');
  });

  it('reports a downloaded pack as cached with a timestamp', async () => {
    const service = new ModelCacheService({ cacheName: 'test', fetchImpl: vi.fn().mockImplementation(async () => okResponse()) });
    await service.download(PACK, undefined, undefined);

    const state = await service.getState(PACK);
    expect(state.status).toBe('cached');
    if (state.status === 'cached') expect(state.cachedAt).toBeGreaterThan(0);
  });

  it('reports an out-of-date version as stale rather than cached', async () => {
    const service = new ModelCacheService({ cacheName: 'test', fetchImpl: vi.fn().mockImplementation(async () => okResponse()) });
    await service.download({ ...PACK, version: '0.9.0' });

    const state = await service.getState(PACK);
    expect(state.status).toBe('stale');
    if (state.status === 'stale') expect(state.cachedVersion).toBe('0.9.0');
  });

  it('degrades to absent rather than throwing when caching is unsupported', async () => {
    Object.defineProperty(globalThis, 'caches', { writable: true, configurable: true, value: undefined });
    const service = new ModelCacheService({ cacheName: 'test' });
    expect((await service.getState(PACK)).status).toBe('absent');
  });
});

describe('download', () => {
  it('only runs when explicitly called, and reports progress', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => okResponse());
    const service = new ModelCacheService({ cacheName: 'test', fetchImpl });
    const progress: number[] = [];

    const state = await service.download(PACK, (fraction) => progress.push(fraction));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(state.status).toBe('cached');
    expect(progress).toContain(1);
  });

  it('reports a retryable failure for a server error', async () => {
    const service = new ModelCacheService({
      cacheName: 'test',
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    });

    const state = await service.download(PACK);
    expect(state.status).toBe('failed');
    if (state.status === 'failed') {
      expect(state.retryable).toBe(true);
      expect(state.message).toContain('503');
    }
  });

  it('does not offer retry for a not-found response', async () => {
    const service = new ModelCacheService({
      cacheName: 'test',
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    });

    const state = await service.download(PACK);
    if (state.status === 'failed') expect(state.retryable).toBe(false);
  });

  it('reports a network failure as retryable', async () => {
    const service = new ModelCacheService({
      cacheName: 'test',
      fetchImpl: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    });

    const state = await service.download(PACK);
    expect(state.status).toBe('failed');
    if (state.status === 'failed') {
      expect(state.retryable).toBe(true);
      expect(state.message).not.toContain('Failed to fetch');
    }
  });

  it('never caches a failed download', async () => {
    const service = new ModelCacheService({
      cacheName: 'test',
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    });
    await service.download(PACK);
    expect((await service.getState(PACK)).status).toBe('absent');
  });
});

describe('load', () => {
  it('returns the cached bytes', async () => {
    const service = new ModelCacheService({
      cacheName: 'test',
      fetchImpl: vi.fn().mockResolvedValue(okResponse(2048)),
    });
    await service.download(PACK);

    const buffer = await service.load(PACK);
    expect(buffer?.byteLength).toBe(2048);
  });

  it('returns null when absent so the caller falls back to 2D', async () => {
    const service = new ModelCacheService({ cacheName: 'test' });
    expect(await service.load(PACK)).toBeNull();
  });
});

describe('removal', () => {
  it('removes one pack only on request', async () => {
    const service = new ModelCacheService({
      cacheName: 'test',
      fetchImpl: vi.fn().mockImplementation(async () => okResponse()),
    });

    await service.download(PACK);
    await service.download({ ...PACK, packId: 'other', assetPath: '/other.glb' });

    expect(await service.remove(PACK)).toBe(true);
    expect((await service.getState(PACK)).status).toBe('absent');
    expect((await service.getState({ ...PACK, packId: 'other' })).status).toBe('cached');
  });

  it('removes every version of one pack when superseding', async () => {
    const service = new ModelCacheService({
      cacheName: 'test',
      fetchImpl: vi.fn().mockImplementation(async () => okResponse()),
    });

    await service.download({ ...PACK, version: '0.9.0' });
    await service.download({ ...PACK, version: '1.0.0' });

    expect(await service.removeAllVersions(PACK.packId)).toBe(2);
    expect((await service.getState(PACK)).status).toBe('absent');
  });
});

describe('findEvicted', () => {
  it('surfaces a pack the browser dropped rather than absorbing it silently', async () => {
    const service = new ModelCacheService({
      cacheName: 'test',
      fetchImpl: vi.fn().mockImplementation(async () => okResponse()),
    });
    await service.download(PACK);
    expect(await service.findEvicted([PACK])).toHaveLength(0);

    // Simulate browser eviction by clearing the underlying store.
    installCache();
    const evicted = await service.findEvicted([PACK]);
    expect(evicted).toHaveLength(1);
    expect(evicted[0]?.displayName).toBe('Open3Dmodel — upper limb');
  });
});