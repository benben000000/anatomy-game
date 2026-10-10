import { useCallback, useEffect, useState } from 'react';
import { useRepositories } from '@/app/providers/RepositoryProvider';
import type { StudyProgress } from '@/domain/progress/progress';

/**
 * Progress records for the interface.
 *
 * Wraps the repository so components never touch IndexedDB, and re-reads on
 * demand after an answer is recorded so the progress screen is never stale.
 */
export function useProgressRecords(): readonly StudyProgress[] {
  const { repositories } = useRepositories();
  const [records, setRecords] = useState<readonly StudyProgress[]>([]);

  const reload = useCallback(async () => {
    const next = await repositories.progress.getAll();
    setRecords(next);
  }, [repositories.progress]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Storage events from another tab, and returns from the background.
  useEffect(() => {
    const onChange = () => void reload();
    document.addEventListener('visibilitychange', onChange);
    window.addEventListener('focus', onChange);
    return () => {
      document.removeEventListener('visibilitychange', onChange);
      window.removeEventListener('focus', onChange);
    };
  }, [reload]);

  return records;
}
