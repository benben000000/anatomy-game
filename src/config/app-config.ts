/**
 * Application-wide constants.
 *
 * Anything that appears in more than one module lives here rather than being
 * repeated as a literal. No component invents its own copy.
 */

export const APP_CONFIG = {
  name: 'Muscle Atlas',
  tagline: 'Learn the body by locating it.',
  description:
    'Practice locating major muscles through interactive anatomy. Works offline once downloaded.',

  /**
   * Educational disclaimer shown in the About view and the info banner. Not a
   * substitute for anatomy laboratory instruction or professional education.
   */
  disclaimer:
    'Muscle Atlas is an educational study aid. It does not provide diagnosis, treatment advice, ' +
    'or clinical decision support, and it does not replace anatomy laboratory instruction or ' +
    'professional education. Illustrations are simplified teaching figures and do not represent ' +
    'the full complexity of human anatomy.',

  installInstructions:
    'To install on iPad: open in Safari, use Share, choose Add to Home Screen, and enable ' +
    'Open as Web App if shown.',

  supportEmail: null,
} as const;

/**
 * Performance budget, from docs/01-architecture.md section 9. Exported so the
 * performance documentation and any future instrumentation agree on the
 * numbers, and so a regression can be named rather than argued about.
 */
export const PERFORMANCE_BUDGET = {
  firstContentfulPaintMs: 900,
  timeToInteractiveBoardMs: 1800,
  firstRouteTransferKbGzip: 220,
  interactionFeedbackMs: 100,
  frameBudgetMs: 16,
  maxHeapGrowthPercentOverTwentyQuestions: 5,
  maxLongTaskMs: 50,
} as const;

/** iPad-friendly sizing constants that must not be duplicated in components. */
export const LAYOUT_CONFIG = {
  /**
   * Single-finger travel in CSS pixels before a gesture is treated as a pan
   * rather than a tap. Generous, because a fingertip wobble is not a pan and
   * selection must feel immediate.
   */
  tapSlopPx: 10,

  /**
   * Upper bound on tap duration. Beyond this the gesture is a press, not a tap.
   */
  tapMaxDurationMs: 700,

  /**
   * One-finger panning is disabled at fit scale. This is what guarantees a
   * drag can never be mistaken for a selection, and that the main learning flow
   * never requires a drag gesture.
   */
  panRequiresZoom: true,

  zoom: {
    min: 1,
    max: 6,
    step: 1.35,
    default: 1,
  },
} as const;

/** Viewport measurement for the anatomy board, in SVG user units. */
export const BOARD_VIEWBOX = {
  width: 1000,
  height: 2200,
  minX: 0,
  minY: 0,
} as const;

/** Every published structure must be reachable without spatial targeting. */
export const ACCESSIBLE_SELECTION_ENABLED = true;
