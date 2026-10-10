import Dexie, { type Table } from 'dexie';
import { STORAGE_CONFIG } from '@/config/storage-config';
import type { StudyProgress } from '@/domain/progress/progress';
import type { QuizSession } from '@/domain/learning/learning';
import type { UserSettings } from '@/domain/settings/user-settings';

/** Which content packs are available locally, and at which version. */
export interface ContentMetaRecord {
  packId: string;
  packVersion: string;
  cachedAt: number;
  /** True once the pack's assets have been confirmed present in the cache. */
  assetsCached: boolean;
  lastCheckedAt: number;
}

export interface SettingsRecord {
  key: string;
  value: UserSettings;
}

/**
 * IndexedDB schema.
 *
 * Dexie is used here rather than the raw API because versioned, typed
 * migrations are exactly the failure mode that loses a learner's progress.
 */
export class MuscleAtlasDatabase extends Dexie {
  progress!: Table<StudyProgress, string>;
  sessions!: Table<QuizSession, string>;
  activeSession!: Table<QuizSession, string>;
  settings!: Table<SettingsRecord, string>;
  contentMeta!: Table<ContentMetaRecord, string>;

  constructor() {
    super(STORAGE_CONFIG.databaseName);

    this.version(STORAGE_CONFIG.databaseVersion).stores({
      [STORAGE_CONFIG.stores.progress]: 'structure_id, profile_id, last_seen_at, next_review_at',
      [STORAGE_CONFIG.stores.sessions]: 'session_id, status, started_at, profile_id',
      [STORAGE_CONFIG.stores.activeSession]: 'session_id, status',
      [STORAGE_CONFIG.stores.settings]: 'key',
      [STORAGE_CONFIG.stores.contentMeta]: 'packId',
    });
  }
}

let databaseInstance: MuscleAtlasDatabase | null = null;

export function getDatabase(): MuscleAtlasDatabase {
  if (databaseInstance === null) {
    databaseInstance = new MuscleAtlasDatabase();
  }
  return databaseInstance;
}

/** Test hook. Closes and forgets the current instance. */
export function resetDatabaseInstance(): void {
  databaseInstance?.close();
  databaseInstance = null;
}

/**
 * Feature detection rather than browser-name detection.
 *
 * iPadOS Safari in Private Browsing historically restricts IndexedDB. The app
 * must remain usable there, so callers check this rather than assuming.
 */
export function isIndexedDbAvailable(): boolean {
  try {
    if (typeof indexedDB === 'undefined') return false;
    // Safari private mode exposes the object but throws on open.
    return typeof indexedDB.open === 'function';
  } catch {
    return false;
  }
}
