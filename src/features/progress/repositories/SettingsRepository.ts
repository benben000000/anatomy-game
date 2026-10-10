import { STORAGE_CONFIG } from '@/config/storage-config';
import { getDatabase, isIndexedDbAvailable, type MuscleAtlasDatabase } from '@/services/storage/db';
import {
  DEFAULT_SETTINGS,
  userSettingsSchema,
  type UserSettings,
} from '@/domain/settings/user-settings';
import { storageUnavailableProblem, type StorageProblem } from '@/services/storage/corrupted-store-recovery';

export class SettingsRepository {
  constructor(private readonly db: MuscleAtlasDatabase = getDatabase()) {}

  async load(): Promise<UserSettings> {
    if (!isIndexedDbAvailable()) return DEFAULT_SETTINGS;
    try {
      const record = await this.db.settings.get(STORAGE_CONFIG.settingsKey);
      if (!record) return DEFAULT_SETTINGS;
      const parsed = userSettingsSchema.safeParse(record.value);
      // A corrupt or outdated settings record falls back to defaults rather
      // than blocking the app. Settings are not study data.
      return parsed.success ? parsed.data : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async save(settings: UserSettings): Promise<void> {
    const parsed = userSettingsSchema.parse(settings);
    await this.db.settings.put({ key: STORAGE_CONFIG.settingsKey, value: parsed });
  }

  async reset(): Promise<UserSettings> {
    await this.db.settings.clear();
    return DEFAULT_SETTINGS;
  }

  get storageProblem(): StorageProblem | null {
    return isIndexedDbAvailable() ? null : storageUnavailableProblem('settings');
  }
}
