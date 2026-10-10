import { STORAGE_CONFIG } from '@/config/storage-config';
import type { MuscleAtlasDatabase } from './db';

/**
 * Storage recovery.
 *
 * Three distinct failure modes, three distinct honest responses. The
 * requirement is never "silently start over" and never "silently keep
 * untrustworthy data".
 */

export type StorageProblemKind =
  | 'record-invalid'
  | 'schema-version-unknown'
  | 'store-unreadable'
  | 'storage-unavailable';

export interface StorageProblem {
  readonly kind: StorageProblemKind;
  readonly store: string;
  readonly message: string;
  /** Whether a clean reset is likely to resolve it. */
  readonly recoverableByReset: boolean;
}

export type RecoveryOutcome<T> =
  | { readonly ok: true; readonly value: T; readonly discarded: number }
  | { readonly ok: false; readonly problem: StorageProblem };

/**
 * Read every record from a table, validate each one, and discard only the
 * records that fail validation.
 *
 * Returns the surviving records and how many were quarantined, so the caller
 * can tell the learner that something was dropped rather than hiding it.
 */
export async function readValidated<T>(
  table: { toArray(): Promise<unknown[]> },
  validate: (value: unknown) => T | null,
  storeName: string,
): Promise<RecoveryOutcome<T[]>> {
  let raw: unknown[];
  try {
    raw = await table.toArray();
  } catch (error) {
    return {
      ok: false,
      problem: {
        kind: 'store-unreadable',
        store: storeName,
        message: describeError(error, `Could not read local ${storeName} data.`),
        recoverableByReset: true,
      },
    };
  }

  const valid: T[] = [];
  let discarded = 0;

  for (const entry of raw) {
    const parsed = validate(entry);
    if (parsed === null) {
      discarded += 1;
      continue;
    }
    valid.push(parsed);
  }

  return { ok: true, value: valid, discarded };
}

export function invalidRecordProblem(storeName: string, discarded: number): StorageProblem {
  return {
    kind: 'record-invalid',
    store: storeName,
    message:
      `${discarded} saved ${storeName} ${discarded === 1 ? 'record was' : 'records were'} ` +
      'in a format this version does not recognise and ' +
      `${discarded === 1 ? 'has' : 'have'} been discarded. Everything else was kept.`,
    recoverableByReset: false,
  };
}

export function unknownSchemaVersionProblem(
  storeName: string,
  found: number,
  supported: number,
): StorageProblem {
  return {
    kind: 'schema-version-unknown',
    store: storeName,
    message:
      `Saved ${storeName} data uses format version ${found}, but this build understands ` +
      `version ${supported}. Progress cannot be read safely.`,
    recoverableByReset: true,
  };
}

export function storageUnavailableProblem(storeName: string): StorageProblem {
  return {
    kind: 'storage-unavailable',
    store: storeName,
    message:
      `This browser is not allowing ${storeName} to be stored. Study still works, but ` +
      'progress will not be saved after you close the tab. This is expected in Safari ' +
      'Private Browsing.',
    recoverableByReset: false,
  };
}

function describeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return fallback;
  return fallback;
}

/* ------------------------------------------------------------------ *
 * Destructive resets
 *
 * Three separate operations. A learner clearing cached artwork must not lose
 * their learning history, and clearing history must not un-install the app's
 * settings. Every caller confirms with the learner first.
 * ------------------------------------------------------------------ */

export type ResetScope = 'progress' | 'sessions' | 'content' | 'settings' | 'all';

export async function resetScope(
  db: MuscleAtlasDatabase,
  scope: ResetScope,
): Promise<{ readonly cleared: readonly string[] }> {
  const cleared: string[] = [];

  switch (scope) {
    case 'progress': {
      await db.progress.clear();
      cleared.push(STORAGE_CONFIG.stores.progress);
      break;
    }
    case 'sessions': {
      await db.sessions.clear();
      cleared.push(STORAGE_CONFIG.stores.sessions);
      break;
    }
    case 'content': {
      await db.contentMeta.clear();
      cleared.push(STORAGE_CONFIG.stores.contentMeta);
      break;
    }
    case 'settings': {
      await db.settings.clear();
      cleared.push(STORAGE_CONFIG.stores.settings);
      break;
    }
    case 'all': {
      await Promise.all([
        db.progress.clear(),
        db.sessions.clear(),
        db.activeSession.clear(),
        db.settings.clear(),
        db.contentMeta.clear(),
      ]);
      cleared.push('all local data');
      break;
    }
  }

  return { cleared };
}
