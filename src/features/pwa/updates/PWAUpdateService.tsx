import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '@/components/shared/Button';

/**
 * Service worker update lifecycle.
 *
 * The rules this file exists to enforce:
 *
 * 1. Never reload automatically. A learner's active round must not be replaced
 *    underneath them because a new build was deployed.
 * 2. Never take control of an open tab. `clientsClaim` is disabled in the Vite
 *    PWA configuration for the same reason.
 * 3. Never reload mid-question. The reload control stays disabled until the
 *    round ends, even if the learner would like it sooner.
 * 4. Say what happened, once, without stealing focus.
 *
 * Everything is feature detected. On a browser without service worker support
 * this provider renders nothing and does nothing.
 */

export type UpdateAvailability = 'none' | 'available' | 'applied';

interface PwaUpdateContextValue {
  readonly availability: UpdateAvailability;
  readonly applyUpdate: () => void;
  /** Suppresses the reload control while a round is in progress. */
  readonly setRoundActive: (active: boolean) => void;
}

const PwaUpdateContext = createContext<PwaUpdateContextValue>({
  availability: 'none',
  applyUpdate: () => undefined,
  setRoundActive: () => undefined,
});

export const UPDATE_MESSAGE = 'A new version is ready. Reload after you finish this round.';

export function usePwaUpdate(): PwaUpdateContextValue {
  return useContext(PwaUpdateContext);
}

export function PwaUpdateProvider({ children }: { readonly children: ReactNode }) {
  const [availability, setAvailability] = useState<UpdateAvailability>('none');
  const [roundActive, setRoundActive] = useState(false);

  // A ServiceWorker handle must survive re-renders without causing them.
  const waitingWorker = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const onControllerChange = () => setAvailability('applied');

    const register = async () => {
      let registration: ServiceWorkerRegistration;
      try {
        registration = await navigator.serviceWorker.register('/sw.js');
      } catch {
        // A failed registration must never break the app. It still runs; it
        // simply will not work offline, and Settings says so.
        return;
      }

      if (registration.waiting !== null && navigator.serviceWorker.controller !== null) {
        waitingWorker.current = registration.waiting;
        setAvailability('available');
      }

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (installing === null) return;

        installing.addEventListener('statechange', () => {
          // A worker that reaches "installed" while another one controls the
          // page is waiting. We deliberately do not skip waiting; the learner
          // decides when to reload.
          if (installing.state === 'installed' && navigator.serviceWorker.controller !== null) {
            waitingWorker.current = registration.waiting ?? installing;
            setAvailability('available');
          }
        });
      });
    };

    void register();
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (roundActive) return;
    const worker = waitingWorker.current;
    if (worker === null) return;
    worker.postMessage({ type: 'SKIP_WAITING' });
    setAvailability('applied');
  }, [roundActive]);

  const setRoundActiveSafe = useCallback((active: boolean) => setRoundActive(active), []);

  const value = useMemo<PwaUpdateContextValue>(
    () => ({ availability, applyUpdate, setRoundActive: setRoundActiveSafe }),
    [applyUpdate, availability, setRoundActiveSafe],
  );

  return (
    <PwaUpdateContext.Provider value={value}>
      {children}
      {availability === 'available' ? (
        <div className="banner" role="status" aria-live="polite" data-testid="update-banner">
          <span className="banner__text">{UPDATE_MESSAGE}</span>
          <Button
            variant="secondary"
            size="small"
            onClick={applyUpdate}
            disabled={roundActive}
            {...(roundActive ? { title: 'Finish your round before reloading' } : {})}
          >
            {roundActive ? 'Finish this round first' : 'Reload'}
          </Button>
        </div>
      ) : null}
    </PwaUpdateContext.Provider>
  );
}
