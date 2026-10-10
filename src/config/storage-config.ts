/**
 * Storage configuration.
 *
 * All browser storage sits behind repositories. UI components never call
 * IndexedDB directly. See docs/01-architecture.md section 7.
 */

export const STORAGE_CONFIG = {
  databaseName: 'muscle-atlas',
  databaseVersion: 2,

  stores: {
    /** Per-structure study progress, keyed by structure_id. */
    progress: 'progress',
    /** Completed round history, keyed by session_id. */
    sessions: 'sessions',
    /** Exactly one in-flight round, keyed by the literal 'current'. */
    activeSession: 'activeSession',
    /** User settings, keyed by a single literal key. */
    settings: 'settings',
    /** Which content packs are cached locally, keyed by pack_id. */
    contentMeta: 'contentMeta',
  },

  activeSessionKey: 'current',
  settingsKey: 'settings',

  /** Debounce for routine writes. Page-hidden events bypass this entirely. */
  writeDebounceMs: 150,

  /** Persisted schema versions, for migration and recovery decisions. */
  schemaVersions: {
    progress: 1,
    sessions: 1,
    activeSession: 1,
    settings: 1,
    contentMeta: 1,
  },
} as const;

/** Key used for the local (non-identifying) learner profile. */
export const PROFILE_STORAGE_KEY = 'muscle-atlas:profile-id';

export const CACHE_NAMES = {
  shell: (buildId: string) => `muscle-atlas-shell-${buildId}`,
  content: (packVersion: string) => `muscle-atlas-content-${packVersion}`,
  fonts: 'muscle-atlas-fonts-v1',
  assets: 'muscle-atlas-assets-v1',
} as const;
