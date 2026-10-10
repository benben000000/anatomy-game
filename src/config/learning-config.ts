/**
 * Learning configuration.
 *
 * Values here implement the transparent scheduling rules documented in
 * docs/00-design-brief.md section 6. They are named and centralised so a future
 * curriculum decision can change one number rather than hunting through code.
 */

export const LEARNING_CONFIG = {
  /** Round sizes offered in the setup form. */
  roundSizes: [5, 10, 20] as const,

  /** Endless mode has no fixed size. */
  endlessSupported: true,

  /**
   * Structures eligible for a round are drawn at random, but the same
   * structure never appears twice in a row (rule LD-5). Review mode may repeat
   * intentionally.
   */
  preventImmediateRepeat: true,

  /**
   * Optional timed challenge. Off by default and never the default view. It is
   * speed practice, not a measure of learning, and it is disableable.
   */
  timedChallenge: {
    enabledByDefault: false,
    defaultSeconds: 20,
    minSeconds: 5,
    maxSeconds: 120,
    /** Time running out is recorded as skipped, never as incorrect. */
    timeoutOutcome: 'skipped' as const,
  },

  /**
   * The learner sees at most this many candidates in a disambiguation chooser.
   * Beyond it the chooser would stop being a decision and become a list.
   */
  maxDisambiguationCandidates: 5,

  /**
   * Structures closer than this in board space are treated as spatially
   * confusable when deciding whether to require disambiguation.
   */
  spatialNeighbourThresholdPx: 26,

  /** Feedback is never auto-advanced. The learner chooses when to continue. */
  autoAdvance: false,

  /** Minimum gap between repeats of the same structure in review mode. */
  reviewRepeatAllowed: true,
} as const;

export type RoundSize = (typeof LEARNING_CONFIG.roundSizes)[number];
