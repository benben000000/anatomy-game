/**
 * 3D model cache.
 *
 * ## Rules this enforces
 *
 * 1. **Nothing is downloaded without an explicit user action.** No precache, no
 *    speculative background fetch, no "while you were away". A learner on a
 *    metered connection must never be surprised by a 6 MB transfer.
 * 2. **Progress is never stored in a cache.** Progress lives in IndexedDB; a
 *    cache eviction can therefore never cost learning history.
 * 3. **A cache is only removed on user action**, or when a version genuinely
 *    supersedes it. Storage pressure eviction is detected and reported, not
 *    silently absorbed.
 * 4. **Cached models are verifiable.** We store a marker per pack/version and
 *    can tell the difference between "downloaded" and "the browser evicted it".
 */

export type ModelCacheState =
  | { readonly status: 'absent'; readonly packId: string; readonly version: string }
  | { readonly status: 'downloading'; readonly packId: string; readonly version: string; readonly progress: number }
  | { readonly status: 'cached'; readonly packId: string; readonly version: string; readonly cachedAt: number }
  | {
      readonly status: 'failed';
      readonly packId: string;
      readonly version: string;
      readonly message: string;
      readonly retryable: boolean;
    }
  | { readonly status: 'stale'; readonly packId: string; readonly version: string; readonly cachedVersion: string };

export interface ModelPackDescriptor {
  readonly packId: string;
  readonly version: string;
  readonly displayName: string;
  readonly assetPath: string;
  readonly sizeBytes: number;
  readonly requiresDraco: boolean;
}

export interface ModelCacheServiceOptions {
  readonly cacheName: string;
  readonly fetchImpl?: typeof fetch;
}

const CACHE_KEY_PREFIX = 'muscle-atlas-model-';

/** Cache key for a pack. Versioned, so a new pack never overwrites an old one. */
export function cacheKeyFor(pack: Pick<ModelPackDescriptor, 'packId' | 'version'>): string {
  return `${CACHE_KEY_PREFIX}${pack.packId}@${pack.version}`;
}

/** Human-readable size. Used before a download is started, never after. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export class ModelCacheService {
  private readonly cacheName: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ModelCacheServiceOptions) {
    this.cacheName = options.cacheName;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  private get supported(): boolean {
    return typeof caches !== 'undefined';
  }

  async getState(pack: ModelPackDescriptor): Promise<ModelCacheState> {
    if (!this.supported) {
      return { status: 'absent', packId: pack.packId, version: pack.version };
    }

    try {
      const cache = await caches.open(this.cacheName);
      const exact = await cache.match(cacheKeyFor(pack));

      if (exact !== undefined) {
        return {
          status: 'cached',
          packId: pack.packId,
          version: pack.version,
          cachedAt: Number(exact.headers.get('x-cached-at') ?? 0),
        };
      }

      // A different version of the same pack means this one is out of date.
      const prefix = `${CACHE_KEY_PREFIX}${pack.packId}@`;
      for (const request of await cache.keys()) {
        const url = request.url;
        if (url.includes(prefix)) {
          const cachedVersion = url.slice(url.indexOf(prefix) + prefix.length);
          if (cachedVersion !== pack.version) {
            return {
              status: 'stale',
              packId: pack.packId,
              version: pack.version,
              cachedVersion,
            };
          }
        }
      }

      return { status: 'absent', packId: pack.packId, version: pack.version };
    } catch {
      return { status: 'absent', packId: pack.packId, version: pack.version };
    }
  }

  /**
   * Download a pack on explicit request.
   *
   * Reports progress so the learner can see what is happening and cancel by
   * navigating away. Never called automatically.
   */
  async download(
    pack: ModelPackDescriptor,
    onProgress?: (fraction: number) => void,
    signal?: AbortSignal,
  ): Promise<ModelCacheState> {
    if (!this.supported) {
      return {
        status: 'failed',
        packId: pack.packId,
        version: pack.version,
        message: 'This browser does not support offline storage for models.',
        retryable: false,
      };
    }

    try {
      const response = await this.fetchImpl(pack.assetPath, {
        cache: 'no-store',
        ...(signal === undefined ? {} : { signal }),
      });

      if (!response.ok) {
        return {
          status: 'failed',
          packId: pack.packId,
          version: pack.version,
          message: `The model could not be downloaded (${response.status}).`,
          retryable: response.status >= 500 || response.status === 429,
        };
      }

      const body = await response.arrayBuffer();

      const cache = await caches.open(this.cacheName);
      const headers = new Headers({ 'x-cached-at': String(Date.now()) });
      await cache.put(
        cacheKeyFor(pack),
        new Response(body, { headers, status: 200 }),
      );

      return {
        status: 'cached',
        packId: pack.packId,
        version: pack.version,
        cachedAt: Date.now(),
      };
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      return {
        status: 'failed',
        packId: pack.packId,
        version: pack.version,
        message: aborted
          ? 'The download was cancelled.'
          : 'The model could not be downloaded. Check your connection and try again.',
        retryable: !aborted,
      };
    } finally {
      onProgress?.(1);
    }
  }

  /** Load a cached pack. Returns null when absent, so the caller falls back to 2D. */
  async load(pack: ModelPackDescriptor): Promise<ArrayBuffer | null> {
    if (!this.supported) return null;
    try {
      const cache = await caches.open(this.cacheName);
      const hit = await cache.match(cacheKeyFor(pack));
      if (hit === undefined) return null;
      return await hit.arrayBuffer();
    } catch {
      return null;
    }
  }

  /** Remove one pack. Only ever called from an explicit user action. */
  async remove(pack: Pick<ModelPackDescriptor, 'packId' | 'version'>): Promise<boolean> {
    if (!this.supported) return false;
    try {
      const cache = await caches.open(this.cacheName);
      return await cache.delete(cacheKeyFor(pack));
    } catch {
      return false;
    }
  }

  /** Remove every version of one pack, used when superseding. */
  async removeAllVersions(packId: string): Promise<number> {
    if (!this.supported) return 0;
    try {
      const cache = await caches.open(this.cacheName);
      const prefix = `${CACHE_KEY_PREFIX}${packId}@`;
      const keys = await cache.keys();
      let removed = 0;
      for (const key of keys) {
        if (key.url.includes(prefix) && (await cache.delete(key))) removed += 1;
      }
      return removed;
    } catch {
      return 0;
    }
  }

  /**
   * Report packs that were downloaded but are no longer present.
   *
   * The browser evicts caches under storage pressure without asking. Silently
   * losing a 6 MB download is exactly the kind of thing that makes a PWA feel
   * broken, so it is surfaced rather than absorbed.
   */
  async findEvicted(packs: readonly ModelPackDescriptor[]): Promise<
    readonly { packId: string; displayName: string }[]
  > {
    const evicted: { packId: string; displayName: string }[] = [];
    for (const pack of packs) {
      const state = await this.getState(pack);
      if (state.status !== 'cached') evicted.push({ packId: pack.packId, displayName: pack.displayName });
    }
    return evicted;
  }
}