import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, userSettingsSchema, type UserSettings } from '@/domain/settings/user-settings';
import { SettingsRepository } from '@/features/progress/repositories/SettingsRepository';
import { effectiveReducedMotion } from '@/domain/settings/user-settings';

/**
 * Settings state.
 *
 * Settings are the only globally shared UI state in the app. Learning state
 * lives in services and is not mirrored here.
 */
interface SettingsContextValue {
  readonly settings: UserSettings;
  readonly ready: boolean;
  readonly reducedMotion: boolean;
  readonly update: (patch: Partial<UserSettings>) => Promise<void>;
  readonly reset: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({
  children,
  repository,
}: {
  readonly children: ReactNode;
  readonly repository?: SettingsRepository;
}) {
  const repo = useMemo(() => repository ?? new SettingsRepository(), [repository]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void repo.load().then((loaded) => {
      if (cancelled) return;
      setSettings(loaded);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const reducedMotion = effectiveReducedMotion(settings);

  useEffect(() => {
    document.documentElement.dataset['reducedMotion'] = String(reducedMotion);
  }, [reducedMotion]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      ready,
      reducedMotion,
      update: async (patch) => {
        // Validate before persisting: settings cross a storage boundary.
        const next = userSettingsSchema.parse({ ...settings, ...patch });
        setSettings(next);
        await repo.save(next);
      },
      reset: async () => {
        const next = await repo.reset();
        setSettings(next);
      },
    }),
    [settings, ready, reducedMotion, repo],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (context === null) {
    throw new Error('useSettings must be used inside a SettingsProvider.');
  }
  return context;
}
