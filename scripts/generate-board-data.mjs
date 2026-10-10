/**
 * One-time generator for visual-mappings.json and the provisional geometry
 * module.
 *
 * Both artefacts describe the same shapes. Generating them from one table keeps
 * hit regions and drawn geometry from drifting apart, which is the most common
 * way an anatomy board becomes unselectable or misleading.
 *
 * The committed output is the source of truth from then on: the content owner
 * and the asset owner edit the JSON and the geometry module directly.
 *
 * Run with: node scripts/generate-board-data.mjs
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/**
 * ViewBox 0 0 1000 2200. Midline x = 500. Head top y = 60, feet y = 1990.
 *
 * PROVISIONAL placeholder geometry: rounded shapes marking roughly where each
 * muscle is expected to sit, so the interaction model can be built and tested.
 * They are NOT anatomically accurate, are not a medical illustration, and are
 * labelled as such everywhere they appear.
 */
const ANTERIOR = [
  {
    id: 'muscular.frontalis',
    description: 'front of the forehead',
    shape: 'rect',
    x: 432, y: 95, w: 136, h: 72, r: 28,
    margin: 6, disambiguate: false,
  },
  {
    id: 'muscular.sternocleidomastoid',
    description: 'side of the neck',
    shape: 'rect',
    x: 466, y: 306, w: 68, h: 92, r: 26,
    margin: 8, disambiguate: false,
  },
  {
    id: 'muscular.deltoid',
    description: 'shoulder',
    shape: 'ellipse',
    cx: 345, cy: 440, rx: 58, ry: 60,
    margin: 8, disambiguate: false,
  },
  {
    id: 'muscular.pectoralis_major',
    description: 'front of the chest',
    shape: 'rect',
    x: 384, y: 396, w: 112, h: 126, r: 36,
    margin: 8, disambiguate: false,
  },
  {
    id: 'muscular.serratus_anterior',
    description: 'side of the rib cage, below the armpit',
    shape: 'rect',
    x: 380, y: 544, w: 52, h: 108, r: 18,
    margin: 10, disambiguate: true,
  },
  {
    id: 'muscular.biceps_brachii',
    description: 'front of the upper arm',
    shape: 'rect',
    x: 312, y: 474, w: 58, h: 232, r: 26,
    margin: 8, disambiguate: false,
  },
  {
    id: 'muscular.rectus_abdominis',
    description: 'front of the abdomen',
    shape: 'rect',
    x: 452, y: 548, w: 96, h: 344, r: 30,
    margin: 6, disambiguate: false,
  },
  {
    id: 'muscular.external_oblique',
    description: 'outer side of the abdomen',
    shape: 'rect',
    x: 396, y: 560, w: 52, h: 304, r: 22,
    margin: 10, disambiguate: true,
  },
  {
    id: 'muscular.rectus_femoris',
    description: 'front of the thigh',
    shape: 'rect',
    x: 404, y: 1020, w: 56, h: 312, r: 26,
    margin: 8, disambiguate: false,
  },
  {
    id: 'muscular.vastus_lateralis',
    description: 'outer side of the thigh',
    shape: 'rect',
    x: 364, y: 1032, w: 38, h: 300, r: 19,
    margin: 10, disambiguate: true,
  },
  {
    id: 'muscular.vastus_medialis',
    description: 'inner thigh, just above the knee',
    shape: 'rect',
    x: 466, y: 1236, w: 36, h: 112, r: 16,
    margin: 12, disambiguate: true,
  },
  {
    id: 'muscular.tibialis_anterior',
    description: 'front of the lower leg',
    shape: 'rect',
    x: 406, y: 1420, w: 58, h: 268, r: 26,
    margin: 8, disambiguate: false,
  },
];

const POSTERIOR = [
  {
    id: 'muscular.trapezius',
    description: 'upper back, from the neck out to both shoulders',
    shape: 'poly',
    points: [352, 330, 648, 330, 596, 646, 404, 646],
    margin: 6, disambiguate: false,
  },
  {
    id: 'muscular.deltoid',
    description: 'shoulder',
    shape: 'ellipse',
    cx: 345, cy: 446, rx: 56, ry: 58,
    margin: 8, disambiguate: false,
  },
  {
    id: 'muscular.triceps_brachii',
    description: 'back of the upper arm',
    shape: 'rect',
    x: 310, y: 480, w: 56, h: 236, r: 26,
    margin: 8, disambiguate: false,
  },
  {
    id: 'muscular.latissimus_dorsi',
    description: 'lower back, sweeping up toward the armpit',
    shape: 'poly',
    points: [360, 566, 478, 566, 470, 828, 374, 812],
    margin: 8, disambiguate: false,
  },
  {
    id: 'muscular.erector_spinae',
    description: 'either side of the spine, in the lower back',
    shape: 'rect',
    x: 468, y: 604, w: 28, h: 336, r: 14,
    margin: 12, disambiguate: true,
  },
  {
    id: 'muscular.gluteus_maximus',
    description: 'buttock',
    shape: 'rect',
    x: 386, y: 944, w: 104, h: 146, r: 40,
    margin: 8, disambiguate: false,
  },
  {
    id: 'muscular.gastrocnemius',
    description: 'upper back of the lower leg, the calf',
    shape: 'rect',
    x: 392, y: 1400, w: 100, h: 206, r: 42,
    margin: 8, disambiguate: false,
  },
  {
    id: 'muscular.soleus',
    description: 'lower back of the lower leg, below the calf',
    shape: 'rect',
    x: 404, y: 1600, w: 76, h: 180, r: 32,
    margin: 12, disambiguate: true,
  },
];

/** Structures whose artwork is drawn on both sides of the midline. */
const BILATERAL = new Set([
  'muscular.frontalis',
  'muscular.sternocleidomastoid',
  'muscular.deltoid',
  'muscular.pectoralis_major',
  'muscular.serratus_anterior',
  'muscular.biceps_brachii',
  'muscular.external_oblique',
  'muscular.rectus_femoris',
  'muscular.vastus_lateralis',
  'muscular.vastus_medialis',
  'muscular.tibialis_anterior',
  'muscular.trapezius',
  'muscular.triceps_brachii',
  'muscular.latissimus_dorsi',
  'muscular.erector_spinae',
  'muscular.gluteus_maximus',
  'muscular.gastrocnemius',
  'muscular.soleus',
]);

/** Midline structures are drawn once; everything else is mirrored. */
const MIDLINE = new Set(['muscular.rectus_abdominis', 'muscular.trapezius']);

const REGIONS = {
  'muscular.frontalis': ['region.head_neck'],
  'muscular.sternocleidomastoid': ['region.head_neck'],
  'muscular.deltoid': ['region.shoulder', 'region.upper_limb.arm'],
  'muscular.pectoralis_major': ['region.thorax'],
  'muscular.serratus_anterior': ['region.thorax'],
  'muscular.biceps_brachii': ['region.upper_limb.arm'],
  'muscular.rectus_abdominis': ['region.abdomen'],
  'muscular.external_oblique': ['region.abdomen'],
  'muscular.rectus_femoris': ['region.lower_limb.thigh'],
  'muscular.vastus_lateralis': ['region.lower_limb.thigh'],
  'muscular.vastus_medialis': ['region.lower_limb.thigh'],
  'muscular.tibialis_anterior': ['region.lower_limb.leg'],
  'muscular.trapezius': ['region.back', 'region.shoulder'],
  'muscular.triceps_brachii': ['region.upper_limb.arm'],
  'muscular.latissimus_dorsi': ['region.back'],
  'muscular.erector_spinae': ['region.back'],
  'muscular.gluteus_maximus': ['region.gluteal'],
  'muscular.gastrocnemius': ['region.lower_limb.leg'],
  'muscular.soleus': ['region.lower_limb.leg'],
};

const MIDLINE_X = 500;

/** Outline in SVG user units. */
function outlineFor(entry) {
  if (entry.shape === 'ellipse') {
    return `M ${entry.cx - entry.rx} ${entry.cy} a ${entry.rx} ${entry.ry} 0 1 0 ${entry.rx * 2} 0 a ${entry.rx} ${entry.ry} 0 1 0 ${-entry.rx * 2} 0 Z`;
  }
  if (entry.shape === 'poly') {
    const points = entry.points;
    const d = [];
    for (let i = 0; i < points.length; i += 2) {
      d.push(`${i === 0 ? 'M' : 'L'} ${points[i]} ${points[i + 1]}`);
    }
    return `${d.join(' ')} Z`;
  }
  const { x, y, w, h, r } = entry;
  const radius = Math.min(r, w / 2, h / 2);
  return [
    `M ${x + radius} ${y}`,
    `H ${x + w - radius}`,
    `A ${radius} ${radius} 0 0 1 ${x + w} ${y + radius}`,
    `V ${y + h - radius}`,
    `A ${radius} ${radius} 0 0 1 ${x + w - radius} ${y + h}`,
    `H ${x + radius}`,
    `A ${radius} ${radius} 0 0 1 ${x} ${y + h - radius}`,
    `V ${y + radius}`,
    `A ${radius} ${radius} 0 0 1 ${x + radius} ${y}`,
    'Z',
  ].join(' ');
}

function boundingBoxFor(entry) {
  if (entry.shape === 'ellipse') {
    return {
      x: round1(entry.cx - entry.rx),
      y: round1(entry.cy - entry.ry),
      width: round1(entry.rx * 2),
      height: round1(entry.ry * 2),
    };
  }
  if (entry.shape === 'poly') {
    const xs = [];
    const ys = [];
    for (let i = 0; i < entry.points.length; i += 2) {
      xs.push(entry.points[i]);
      ys.push(entry.points[i + 1]);
    }
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      x: round1(minX),
      y: round1(minY),
      width: round1(maxX - minX),
      height: round1(maxY - minY),
    };
  }
  return { x: round1(entry.x), y: round1(entry.y), width: round1(entry.w), height: round1(entry.h) };
}

function round1(value) {
  return Number(value.toFixed(1));
}

function isMirrored(entry) {
  return BILATERAL.has(entry.id) && !MIDLINE.has(entry.id);
}

function entryFor(view, row) {
  return {
    ...row,
    view,
    shortId: row.id.replace('muscular.', ''),
    visualId: `muscular.${view}.${row.id.replace('muscular.', '')}.surface`,
    mirror: isMirrored(row),
    bbox: boundingBoxFor(row),
  };
}

const entries = [
  ...ANTERIOR.map((row) => entryFor('anterior', row)),
  ...POSTERIOR.map((row) => entryFor('posterior', row)),
];

/* ---------------------------- mappings ---------------------------- */

const mappings = entries.map((entry) => ({
  visual_id: entry.visualId,
  structure_id: entry.id,
  representation_type: 'svg_path',
  body_presentation_id: 'neutral_adult_provisional_01',
  view_id: entry.view,
  layer_id: 'layer.superficial',
  asset_path: `/assets/anatomy/muscular/${entry.view}/${entry.view}-muscles.svg`,
  element_id: entry.visualId,
  selectable: true,
  visible_by_default: true,
  min_fair_target_px: Math.max(
    18,
    Math.round(Math.min(entry.bbox.width, entry.bbox.height) * 1.1),
  ),
  forgiveness_margin_units: entry.margin,
  requires_disambiguation: entry.disambiguate,
  zoom_to_fit: true,
  selection_priority: entry.disambiguate ? 600 : 500,
  occlusion_notes: null,
  visual_status: 'provisional',
  art_source_reference: null,
  license_reference: 'UNSET',
  bounding_box: entry.bbox,
}));

writeFileSync(
  resolve(root, 'src/data/systems/muscular/visual-mappings.json'),
  `${JSON.stringify(
    {
      $schema: './visual-mappings.schema.json',
      system_id: 'muscular',
      content_version: '1.0.0',
      mappings,
    },
    null,
    2,
  )}\n`,
  'utf8',
);
process.stdout.write(`wrote visual-mappings.json (${mappings.length} mappings)\n`);

/* ---------------------------- geometry ---------------------------- */

const geometryEntries = entries.map((entry) => ({
  structureId: entry.id,
  visualId: entry.visualId,
  view: entry.view,
  shape: entry.shape,
  path: outlineFor(entry),
  mirrorTransform: mirrorTransformFor(entry),
  description: entry.description,
  regionIds: REGIONS[entry.id] ?? [],
  mirror: entry.mirror,
  margin: entry.margin,
  requiresDisambiguation: entry.disambiguate,
  boundingBox: entry.bbox,
}));

/**
 * Mirrored outline. Reflection about the midline keeps a bilateral structure
 * visually identical on both sides without duplicating hand-authored geometry.
 */
function mirrorTransformFor(entry) {
  if (!entry.mirror) return null;
  return `translate(${round1(MIDLINE_X * 2)} 0) scale(-1 1)`;
}

writeFileSync(
  resolve(root, 'src/features/anatomy-board/board-2d-svg/provisional-geometry.data.ts'),
  `/**
 * PROVISIONAL placeholder geometry.
 *
 * GENERATED FILE — regenerate with \`node scripts/generate-board-data.mjs\`.
 *
 * These shapes mark roughly where each muscle is expected to sit so the
 * interaction model can be built and tested. They are NOT anatomically
 * accurate, they are not a medical illustration, and they must never be
 * presented to a learner as reviewed anatomy content.
 *
 * Replacing this file with licensed vector artwork requires a qualified anatomy
 * reviewer and a recorded licence. See docs/04-asset-pipeline-and-licensing.md.
 *
 * \`structureId\` values here match visual-mappings.json. Learning logic resolves
 * selections through that mapping and never through these shapes.
 */

export type ProvisionalView = 'anterior' | 'posterior';

export interface ProvisionalGeometryEntry {
  readonly structureId: string;
  readonly visualId: string;
  readonly view: ProvisionalView;
  readonly shape: 'rect' | 'ellipse' | 'poly';
  /** Outline in SVG user units, for the left-hand instance. */
  readonly path: string;
  /**
   * SVG transform that reflects the shape about the midline, or null for
   * structures drawn once on the midline.
   */
  readonly mirrorTransform: string | null;
  /** Plain-language region description. Never a structure name. */
  readonly description: string;
  readonly regionIds: readonly string[];
  /** Drawn on both sides of the midline. */
  readonly mirror: boolean;
  /** Half-width of the forgiving hit stroke, in user units. */
  readonly margin: number;
  readonly requiresDisambiguation: boolean;
  readonly boundingBox: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export const PROVISIONAL_VIEWBOX = '0 0 1000 2200';
export const PROVISIONAL_MIDLINE_X = 500;

export const PROVISIONAL_GEOMETRY: readonly ProvisionalGeometryEntry[] = ${JSON.stringify(
    geometryEntries,
    null,
    2,
  )};

export function geometryForView(view: ProvisionalView): readonly ProvisionalGeometryEntry[] {
  return PROVISIONAL_GEOMETRY.filter((entry) => entry.view === view);
}
`,
  'utf8',
);
process.stdout.write('wrote provisional-geometry.data.ts\n');

writeFileSync(
  resolve(root, 'src/features/anatomy-board/board-2d-svg/region-descriptions.data.ts'),
  `/**
 * Plain-language region descriptions used by the disambiguation chooser.
 *
 * In blind quiz mode the chooser must not name the structures, because naming
 * them would give away the answer. It describes where each candidate is instead.
 * Explore mode shows names, because there is nothing to hide there.
 *
 * GENERATED FILE — regenerate with \`node scripts/generate-board-data.mjs\`.
 */

export const REGION_DESCRIPTIONS: Readonly<Record<string, string>> = ${JSON.stringify(
    Object.fromEntries(entries.map((entry) => [entry.id, entry.description])),
    null,
    2,
  )};
`,
  'utf8',
);
process.stdout.write('wrote region-descriptions.data.ts\n');
