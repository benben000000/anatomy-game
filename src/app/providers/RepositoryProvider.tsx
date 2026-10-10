import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ProgressRepository } from '@/features/progress/repositories/ProgressRepository';
import { SessionRepository } from '@/features/progress/repositories/SessionRepository';
import type { MuscleAtlasDatabase } from '@/services/storage/db';

/**
 * Repository access.
 *
 * UI components read repositories from here rather than constructing them, so
 * tests can inject in-memory or instrumented implementations. No component ever
 * touches IndexedDB directly.
 */
export interface Repositories {
  readonly progress: ProgressRepository;
  readonly sessions: SessionRepository;
}

interface RepositoryContextValue {
  readonly repositories: Repositories;
  /** True when the browser refused storage (Safari Private Browsing). */
  readonly storageUnavailable: boolean;
}

const RepositoryContext = createContext<RepositoryContextValue | null>(null);

export function RepositoryProvider({
  children,
  database,
}: {
  readonly children: ReactNode;
  readonly database?: MuscleAtlasDatabase;
}) {
  const repositories = useMemo<Repositories>(() => {
    if (database) {
      return {
        progress: new ProgressRepository(database),
        sessions: new SessionRepository(database),
      };
    }
    return {
      progress: new ProgressRepository(),
      sessions: new SessionRepository(),
    };
  }, [database]);

  const [storageUnavailable, setStorageUnavailable] = useState(false);

  useEffect(() => {
    // Feature detection, not browser-name detection.
    setStorageUnavailable(repositories.progress.storageProblem !== null);
  }, [repositories]);

  const value = useMemo<RepositoryContextValue>(
    () => ({ repositories, storageUnavailable }),
    [repositories, storageUnavailable],
  );

  return <RepositoryContext.Provider value={value}>{children}</RepositoryContext.Provider>;
}

export function useRepositories(): RepositoryContextValue {
  const context = useContext(RepositoryContext);
  if (context === null) {
    throw new Error('useRepositories must be used inside a RepositoryProvider.');
  }
  return context;
}
