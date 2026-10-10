/**
 * Build flags control what content and which artwork the running app is allowed
 * to show.
 *
 * Two flags are safety-relevant and are enforced at build time in
 * `vite.config.ts`:
 *
 * - `ALLOW_DRAFT_CONTENT` — permits structures with `content_status: draft`
 *   or `reviewed` to be loaded. Must be `false` in any release build.
 * - `PROVISIONAL_ART` — the anatomy illustration is development placeholder
 *   geometry, not reviewed medical artwork. Must be `false` in any release build.
 *
 * The environment lookup is passed in rather than read at module scope, because
 * this module is imported by both the browser bundle (where `import.meta.env`
 * exists) and by `vite.config.ts` (where it does not).
 */

export interface BuildFlagEnv {
  readonly PROD?: boolean;
  readonly DEV?: boolean;
  readonly MODE?: string;
  readonly VITE_ALLOW_DRAFT_CONTENT?: string;
  readonly VITE_PROVISIONAL_ART?: string;
  readonly VITE_ENABLE_DEBUG_TOOLS?: string;
  readonly VITE_ENABLE_TIMED_CHALLENGE?: string;
}

export interface BuildFlags {
  readonly ALLOW_DRAFT_CONTENT: boolean;
  readonly PROVISIONAL_ART: boolean;
  readonly ENABLE_DEBUG_TOOLS: boolean;
  readonly ENABLE_TIMED_CHALLENGE: boolean;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

/**
 * Resolve the flags for a given environment.
 *
 * Both safety-relevant flags default to `true`, because both describe what the
 * bundle actually contains: the artwork *is* provisional placeholder geometry
 * and the content *is* unreviewed draft text. Defaulting either to `false`
 * would make an ordinary `npm run build` assert something untrue about itself.
 *
 * What makes this safe is that a release build is **refused** while either flag
 * is set — see `assertReleaseReadiness` in `vite.config.ts`. So the only way to
 * publish is to satisfy the review and licensing requirements and then set the
 * flags to false deliberately.
 */
export function resolveBuildFlags(env: BuildFlagEnv): BuildFlags {
  return {
    ALLOW_DRAFT_CONTENT: readBoolean(env.VITE_ALLOW_DRAFT_CONTENT, true),
    PROVISIONAL_ART: readBoolean(env.VITE_PROVISIONAL_ART, true),
    ENABLE_DEBUG_TOOLS: readBoolean(env.VITE_ENABLE_DEBUG_TOOLS, true),
    ENABLE_TIMED_CHALLENGE: readBoolean(env.VITE_ENABLE_TIMED_CHALLENGE, false),
  };
}

/** Flags that must all be `false` before a build may be published. */
export const RELEASE_BLOCKING_FLAGS = ['ALLOW_DRAFT_CONTENT', 'PROVISIONAL_ART'] as const;

export function releaseBlockingFlags(flags: BuildFlags): readonly string[] {
  return RELEASE_BLOCKING_FLAGS.filter((flag) => flags[flag] === true);
}
