import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  getContentRepository,
  ContentRepository,
  ContentParseError,
  emptyContent,
  EMPTY_VALIDATION_REPORT,
} from './repository/ContentRepository';
import { resolveBuildFlags, type BuildFlags } from '@/config/build-flags';
import type { ValidationReport } from './validation/ContentValidator';

/**
 * Content access for the interface.
 *
 * Components read content through this provider. They never import JSON and
 * never ask the learning engine what is eligible — those are separate concerns.
 */

interface ContentContextValue {
  readonly repository: ContentRepository;
  readonly flags: BuildFlags;
  readonly report: ValidationReport;
  readonly contentCount: number;
  readonly systemId: string;
  /** Non-null when content failed to load. The UI shows a calm error instead. */
  readonly loadError: string | null;
}

const ContentContext = createContext<ContentContextValue | null>(null);

export const APP_FLAGS: BuildFlags = resolveBuildFlags(import.meta.env);

const SYSTEM_ID = 'muscular';

export function ContentProvider({ children }: { readonly children: ReactNode }) {
  const value = useMemo<ContentContextValue>(() => {
    try {
      const repository = getContentRepository(APP_FLAGS);
      return {
        repository,
        flags: APP_FLAGS,
        report: repository.report,
        contentCount: repository.all.structures.length,
        systemId: SYSTEM_ID,
        loadError: null,
      };
    } catch (error) {
      // A validation failure is a developer problem, not a learner problem.
      // Consumers still receive a real, genuinely empty repository, so no screen
      // can crash on a null pack — they simply have nothing to show and say so.
      //
      // The full validator report goes to the console and to the report object.
      // The message a screen shows is one sentence: a learner must never be
      // shown a raw schema dump, and a developer gets the detail either way.
      const detail =
        error instanceof ContentParseError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unknown content error';
      console.error('[Muscle Atlas] Content failed validation.\n' + detail);

      const report: ValidationReport = {
        ...EMPTY_VALIDATION_REPORT,
        errors:
          error instanceof ContentParseError
            ? error.report.errors
            : [
                {
                  rule: 'load-failed',
                  path: 'content',
                  message: 'The content pack could not be read.',
                },
              ],
        blockingReason: 'The anatomy content could not be loaded on this device.',
      };

      return {
        repository: new ContentRepository(emptyContent(report)),
        flags: APP_FLAGS,
        report,
        contentCount: 0,
        systemId: SYSTEM_ID,
        loadError: 'The anatomy content could not be loaded on this device.',
      };
    }
  }, []);

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function useContent(): ContentContextValue {
  const context = useContext(ContentContext);
  if (context === null) {
    throw new Error('useContent must be used inside a ContentProvider.');
  }
  return context;
}
