import { z } from 'zod';
import { viewIdSchema } from '@/domain/anatomy/ids';
import { quizModeSchema, viewFilterSchema } from '@/domain/learning/learning';

/**
 * User settings.
 *
 * `sound_enabled` defaults to false: audio must never be required to learn.
 * `reduce_motion` is a user preference; the operating system setting is a hard
 * floor that this preference can only match, never override in the
 * accessibility-reducing direction.
 */
export const userSettingsSchema = z.object({
  // A literal with a default: it can only ever be 1, but writing `{}` still
  // parses, which keeps the defaults object and the migration path honest.
  schema_version: z.literal(1).default(1),

  reduce_motion: z.boolean().default(false),
  sound_enabled: z.boolean().default(false),
  sound_volume: z.number().min(0).max(1).default(0.6),

  labels_visible_explore: z.boolean().default(true),
  labels_visible_quiz: z.boolean().default(false),

  /** Apple Pencil selects precisely: no forgiveness margin. */
  pencil_precision_mode: z.boolean().default(true),

  default_view: viewIdSchema.default('anterior'),
  default_mode: quizModeSchema.default('identify'),
  default_view_filter: viewFilterSchema.default('anterior'),
  default_round_size: z.number().int().min(1).max(200).default(10),

  timed_challenge_enabled: z.boolean().default(false),
  scheduled_review_enabled: z.boolean().default(true),
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

export const DEFAULT_SETTINGS: UserSettings = userSettingsSchema.parse({});

export const SETTINGS_STORAGE_KEY = 'settings';

/* ------------------------------------------------------------------ *
 * Accessibility helpers
 * ------------------------------------------------------------------ */

/** The OS preference, feature-detected. Defaults to "not reduced". */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Effective reduced-motion state. The OS setting wins if it asks for less
 * motion; the in-app preference can ask for more, never less.
 */
export function effectiveReducedMotion(settings: Pick<UserSettings, 'reduce_motion'>): boolean {
  return prefersReducedMotion() || settings.reduce_motion;
}
