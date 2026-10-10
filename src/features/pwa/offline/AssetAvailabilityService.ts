import { CACHE_NAMES } from '@/config/storage-config';
import { APP_FLAGS } from '@/features/content/ContentProvider';

/**
 * Content availability.
 *
 * Local-first. The app must play normally with no network as soon as the current
 * content pack is cached, and must never show an offline error over content it
 * already has.
 *
 * Three states, and only the last two justify telling the learner anything:
 *
 * - `cached`   play normally. No indicator, no banner, nothing.
 * - `partial`  blocked, with the specific missing assets named.
 * - `missing`  one clear sentence explaining that a first download needs a
 *              connection. Never a generic network error.
 */

export type PackAvailability = 'cached' | 'partial' | 'missing' | 'unknown';

export interface PackState {
  readonly status: PackAvailability;
  readonly version: string;
  readonly missing: readonly string[];
}

const REQUIRED_ASSETS = [
  '/',
  '/index.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
] as const;

export async function checkShellCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cacheNames = await caches.keys();
    const shellCaches = cacheNames.filter((name) => name.startsWith('muscle-atlas-shell-'));
    if (shellCaches.length === 0) return false;

    for (const name of shellCaches) {
      const cache = await caches.open(name);
      const results = await Promise.all(
        REQUIRED_ASSETS.map(async (asset) => (await cache.match(asset)) !== undefined),
      );
      if (results.every(Boolean)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function checkContentCached(packVersion: string): Promise<PackState> {
  if (typeof caches === 'undefined') {
    return { status: 'unknown', version: packVersion, missing: [] };
  }

  try {
    const cache = await caches.open(CACHE_NAMES.content(packVersion));
    const results = await Promise.all(
      REQUIRED_ASSETS.map(async (asset) => (await cache.match(asset)) !== undefined),
    );
    const missing = REQUIRED_ASSETS.filter((_, index) => results[index] !== true);

    if (missing.length === 0) {
      return { status: 'cached', version: packVersion, missing: [] };
    }
    if (missing.length === REQUIRED_ASSETS.length) {
      return { status: 'missing', version: packVersion, missing: [...missing] };
    }
    return { status: 'partial', version: packVersion, missing: [...missing] };
  } catch {
    return { status: 'unknown', version: packVersion, missing: [] };
  }
}

/**
 * The one sentence a learner sees when a pack is not available offline.
 *
 * Written once, here, so it cannot drift into something vague or alarming
 * across screens.
 */
export function offlineExplanation(status: PackAvailability): string | null {
  switch (status) {
    case 'missing':
      return (
        'This content has not been downloaded on this device yet. It needs one internet ' +
        'connection the first time you open it, and then it works offline.'
      );
    case 'partial':
      return (
        'Some of this content is only partly downloaded, so it cannot run offline yet. Reconnect ' +
        'once to finish the download.'
      );
    case 'unknown':
      return 'Offline support is not available in this browser.';
    case 'cached':
    default:
      return null;
  }
}

/** Feature detection, not browser-name detection. */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

/**
 * A service worker update is pending. Surfaced here rather than as a banner, so
 * the notice can sit in Settings where it cannot interrupt a round.
 */
export function provisionalArtInUse(): boolean {
  return APP_FLAGS.PROVISIONAL_ART;
}
