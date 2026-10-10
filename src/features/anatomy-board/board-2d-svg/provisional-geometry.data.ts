/**
 * PROVISIONAL placeholder geometry.
 *
 * GENERATED FILE — regenerate with `node scripts/generate-board-data.mjs`.
 *
 * These shapes mark roughly where each muscle is expected to sit so the
 * interaction model can be built and tested. They are NOT anatomically
 * accurate, they are not a medical illustration, and they must never be
 * presented to a learner as reviewed anatomy content.
 *
 * Replacing this file with licensed vector artwork requires a qualified anatomy
 * reviewer and a recorded licence. See docs/04-asset-pipeline-and-licensing.md.
 *
 * `structureId` values here match visual-mappings.json. Learning logic resolves
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

export const PROVISIONAL_GEOMETRY: readonly ProvisionalGeometryEntry[] = [
  {
    "structureId": "muscular.frontalis",
    "visualId": "muscular.anterior.frontalis.surface",
    "view": "anterior",
    "shape": "rect",
    "path": "M 460 95 H 540 A 28 28 0 0 1 568 123 V 139 A 28 28 0 0 1 540 167 H 460 A 28 28 0 0 1 432 139 V 123 A 28 28 0 0 1 460 95 Z",
    "mirrorTransform": "translate(1000 0) scale(-1 1)",
    "description": "front of the forehead",
    "regionIds": [
      "region.head_neck"
    ],
    "mirror": true,
    "margin": 6,
    "requiresDisambiguation": false,
    "boundingBox": {
      "x": 432,
      "y": 95,
      "width": 136,
      "height": 72
    }
  },
  {
    "structureId": "muscular.sternocleidomastoid",
    "visualId": "muscular.anterior.sternocleidomastoid.surface",
    "view": "anterior",
    "shape": "rect",
    "path": "M 492 306 H 508 A 26 26 0 0 1 534 332 V 372 A 26 26 0 0 1 508 398 H 492 A 26 26 0 0 1 466 372 V 332 A 26 26 0 0 1 492 306 Z",
    "mirrorTransform": "translate(1000 0) scale(-1 1)",
    "description": "side of the neck",
    "regionIds": [
      "region.head_neck"
    ],
    "mirror": true,
    "margin": 8,
    "requiresDisambiguation": false,
    "boundingBox": {
      "x": 466,
      "y": 306,
      "width": 68,
      "height": 92
    }
  },
  {
    "structureId": "muscular.deltoid",
    "visualId": "muscular.anterior.deltoid.surface",
    "view": "anterior",
    "shape": "ellipse",
    "path": "M 287 440 a 58 60 0 1 0 116 0 a 58 60 0 1 0 -116 0 Z",
    "mirrorTransform": "translate(1000 0) scale(-1 1)",
    "description": "shoulder",
    "regionIds": [
      "region.shoulder",
      "region.upper_limb.arm"
    ],
    "mirror": true,
    "margin": 8,
    "requiresDisambiguation": false,
    "boundingBox": {
      "x": 287,
      "y": 380,
      "width": 116,
      "height": 120
    }
  },
  {
    "structureId": "muscular.pectoralis_major",
    "visualId": "muscular.anterior.pectoralis_major.surface",
    "view": "anterior",
    "shape": "rect",
    "path": "M 420 396 H 460 A 36 36 0 0 1 496 432 V 486 A 36 36 0 0 1 460 522 H 420 A 36 36 0 0 1 384 486 V 432 A 36 36 0 0 1 420 396 Z",
    "mirrorTransform": "translate(1000 0) scale(-1 1)",
    "description": "front of the chest",
    "regionIds": [
      "region.thorax"
    ],
    "mirror": true,
    "margin": 8,
    "requiresDisambiguation": false,
    "boundingBox": {
      "x": 384,
      "y": 396,
      "width": 112,
      "height": 126
    }
  },
  {
    "structureId": "muscular.serratus_anterior",
    "visualId": "muscular.anterior.serratus_anterior.surface",
    "view": "anterior",
    "shape": "rect",
    "path": "M 398 544 H 414 A 18 18 0 0 1 432 562 V 634 A 18 18 0 0 1 414 652 H 398 A 18 18 0 0 1 380 634 V 562 A 18 18 0 0 1 398 544 Z",
    "mirrorTransform": "translate(1000 0) scale(-1 1)",
    "description": "side of the rib cage, below the armpit",
    "regionIds": [
      "region.thorax"
    ],
    "mirror": true,
    "margin": 10,
    "requiresDisambiguation": true,
    "boundingBox": {
      "x": 380,
      "y": 544,
      "width": 52,
      "height": 108
    }
  },
  {
    "structureId": "muscular.biceps_brachii",
    "visualId": "muscular.anterior.biceps_brachii.surface",
    "view": "anterior",
    "shape": "rect",
    "path": "M 338 474 H 344 A 26 26 0 0 1 370 500 V 680 A 26 26 0 0 1 344 706 H 338 A 26 26 0 0 1 312 680 V 500 A 26 26 0 0 1 338 474 Z",
    "mirrorTransform": "translate(1000 0) scale(-1 1)",
    "description": "front of the upper arm",
    "regionIds": [
      "region.upper_limb.arm"
    ],
    "mirror": true,
    "margin": 8,
    "requiresDisambiguation": false,
    "boundingBox": {
      "x": 312,
      "y": 474,
      "width": 58,
      "height": 232
    }
  },
  {
    "structureId": "muscular.rectus_abdominis",
    "visualId": "muscular.anterior.rectus_abdominis.surface",
    "view": "anterior",
    "shape": "rect",
    "path": "M 482 548 H 518 A 30 30 0 0 1 548 578 V 862 A 30 30 0 0 1 518 892 H 482 A 30 30 0 0 1 452 862 V 578 A 30 30 0 0 1 482 548 Z",
    "mirrorTransform": null,
    "description": "front of the abdomen",
    "regionIds": [
      "region.abdomen"
    ],
    "mirror": false,
    "margin": 6,
    "requiresDisambiguation": false,
    "boundingBox": {
      "x": 452,
      "y": 548,
      "width": 96,
      "height": 344
    }
  },
  {
    "structureId": "muscular.external_oblique",
    "visualId": "muscular.anterior.external_oblique.surface",
    "view": "anterior",
    "shape": "rect",
    "path": "M 418 560 H 426 A 22 22 0 0 1 448 582 V 842 A 22 22 0 0 1 426 864 H 418 A 22 22 0 0 1 396 842 V 582 A 22 22 0 0 1 418 560 Z",
    "mirrorTransform": "translate(1000 0) scale(-1 1)",
    "description": "outer side of the abdomen",
    "regionIds": [
      "region.abdomen"
    ],
    "mirror": true,
    "margin": 10,
    "requiresDisambiguation": true,
    "boundingBox": {
      "x": 396,
      "y": 560,
      "width": 52,
      "height": 304
    }
  },
  {
    "structureId": "muscular.rectus_femoris",
    "visualId": "muscular.anterior.rectus_femoris.surface",
    "view": "anterior",
    "shape": "rect",
    "path": "M 430 1020 H 434 A 26 26 0 0 1 460 1046 V 1306 A 26 26 0 0 1 434 1332 H 430 A 26 26 0 0 1 404 1306 V 1046 A 26 26 0 0 1 430 1020 Z",
    "mirrorTransform": "translate(1000 0) scale(-1 1)",
    "description": "front of the thigh",
    "regionIds": [
      "region.lower_limb.thigh"
    ],
    "mirror": true,
    "margin": 8,
    "requiresDisambiguation": false,
    "boundingBox": {
      "x": 404,
      "y": 1020,
      "width": 56,
      "height": 312
    }
  },
  {
    "structureId": "muscular.vastus_lateralis",
    "visualId": "muscular.anterior.vastus_lateralis.surface",
    "view": "anterior",
    "shape": "rect",
    "path": "M 383 1032 H 383 A 19 19 0 0 1 402 1051 V 1313 A 19 19 0 0 1 383 1332 H 383 A 19 19 0 0 1 364 1313 V 1051 A 19 19 0 0 1 383 1032 Z",
    "mirrorTransform": "translate(1000 0) scale(-1 1)",
    "description": "outer side of the thigh",
    "regionIds": [
      "region.lower_limb.thigh"
    ],
    "mirror": true,
    "margin": 10,
    "requiresDisambiguation": true,
    "boundingBox": {
      "x": 364,
      "y": 1032,
      "width": 38,
      "height": 300
    }
  },
  {
    "structureId": "muscular.vastus_medialis",
    "visualId": "muscular.anterior.vastus_medialis.surface",
    "view": "anterior",
    "shape": "rect",
    "path": "M 482 1236 H 486 A 16 16 0 0 1 502 1252 V 1332 A 16 16 0 0 1 486 1348 H 482 A 16 16 0 0 1 466 1332 V 1252 A 16 16 0 0 1 482 1236 Z",
    "mirrorTransform": "translate(1000 0) scale(-1 1)",
    "description": "inner thigh, just above the knee",
    "regionIds": [
      "region.lower_limb.thigh"
    ],
    "mirror": true,
    "margin": 12,
    "requiresDisambiguation": true,
    "boundingBox": {
      "x": 466,
      "y": 1236,
      "width": 36,
      "height": 112
    }
  },
  {
    "structureId": "muscular.tibialis_anterior",
    "visualId": "muscular.anterior.tibialis_anterior.surface",
    "view": "anterior",
    "shape": "rect",
    "path": "M 432 1420 H 438 A 26 26 0 0 1 464 1446 V 1662 A 26 26 0 0 1 438 1688 H 432 A 26 26 0 0 1 406 1662 V 1446 A 26 26 0 0 1 432 1420 Z",
    "mirrorTransform": "translate(1000 0) scale(-1 1)",
    "description": "front of the lower leg",
    "regionIds": [
      "region.lower_limb.leg"
    ],
    "mirror": true,
    "margin": 8,
    "requiresDisambiguation": false,
    "boundingBox": {
      "x": 406,
      "y": 1420,
      "width": 58,
      "height": 268
    }
  },
  {
    "structureId": "muscular.trapezius",
    "visualId": "muscular.posterior.trapezius.surface",
    "view": "posterior",
    "shape": "poly",
    "path": "M 352 330 L 648 330 L 596 646 L 404 646 Z",
    "mirrorTransform": null,
    "description": "upper back, from the neck out to both shoulders",
    "regionIds": [
      "region.back",
      "region.shoulder"
    ],
    "mirror": false,
    "margin": 6,
    "requiresDisambiguation": false,
    "boundingBox": {
      "x": 352,
      "y": 330,
      "width": 296,
      "height": 316
    }
  },
  {
    "structureId": "muscular.deltoid",
    "visualId": "muscular.posterior.deltoid.surface",
    "view": "posterior",
    "shape": "ellipse",
    "path": "M 289 446 a 56 58 0 1 0 112 0 a 56 58 0 1 0 -112 0 Z",
    "mirrorTransform": "translate(1000 0) scale(-1 1)",
    "description": "shoulder",
    "regionIds": [
      "region.shoulder",
      "region.upper_limb.arm"
    ],
    "mirror": true,
    "margin": 8,
    "requiresDisambiguation": false,
    "boundingBox": {
      "x": 289,
      "y": 388,
      "width": 112,
      "height": 116
    }
  },
  {
    "structureId": "muscular.triceps_brachii",
    "visualId": "muscular.posterior.triceps_brachii.surface",
    "view": "posterior",
    "shape": "rect",
    "path": "M 336 480 H 340 A 26 26 0 0 1 366 506 V 690 A 26 26 0 0 1 340 716 H 336 A 26 26 0 0 1 310 690 V 506 A 26 26 0 0 1 336 480 Z",
    "mirrorTransform": "translate(1000 0) scale(-1 1)",
    "description": "back of the upper arm",
    "regionIds": [
      "region.upper_limb.arm"
    ],
    "mirror": true,
    "margin": 8,
    "requiresDisambiguation": false,
    "boundingBox": {
      "x": 310,
      "y": 480,
      "width": 56,
      "height": 236
    }
  },
  {
    "structureId": "muscular.latissimus_dorsi",
    "visualId": "muscular.posterior.latissimus_dorsi.surface",
    "view": "posterior",
    "shape": "poly",
    "path": "M 360 566 L 478 566 L 470 828 L 374 812 Z",
    "mirrorTransform": "translate(1000 0) scale(-1 1)",
    "description": "lower back, sweeping up toward the armpit",
    "regionIds": [
      "region.back"
    ],
    "mirror": true,
    "margin": 8,
    "requiresDisambiguation": false,
    "boundingBox": {
      "x": 360,
      "y": 566,
      "width": 118,
      "height": 262
    }
  },
  {
    "structureId": "muscular.erector_spinae",
    "visualId": "muscular.posterior.erector_spinae.surface",
    "view": "posterior",
    "shape": "rect",
    "path": "M 482 604 H 482 A 14 14 0 0 1 496 618 V 926 A 14 14 0 0 1 482 940 H 482 A 14 14 0 0 1 468 926 V 618 A 14 14 0 0 1 482 604 Z",
    "mirrorTransform": "translate(1000 0) scale(-1 1)",
    "description": "either side of the spine, in the lower back",
    "regionIds": [
      "region.back"
    ],
    "mirror": true,
    "margin": 12,
    "requiresDisambiguation": true,
    "boundingBox": {
      "x": 468,
      "y": 604,
      "width": 28,
      "height": 336
    }
  },
  {
    "structureId": "muscular.gluteus_maximus",
    "visualId": "muscular.posterior.gluteus_maximus.surface",
    "view": "posterior",
    "shape": "rect",
    "path": "M 426 944 H 450 A 40 40 0 0 1 490 984 V 1050 A 40 40 0 0 1 450 1090 H 426 A 40 40 0 0 1 386 1050 V 984 A 40 40 0 0 1 426 944 Z",
    "mirrorTransform": "translate(1000 0) scale(-1 1)",
    "description": "buttock",
    "regionIds": [
      "region.gluteal"
    ],
    "mirror": true,
    "margin": 8,
    "requiresDisambiguation": false,
    "boundingBox": {
      "x": 386,
      "y": 944,
      "width": 104,
      "height": 146
    }
  },
  {
    "structureId": "muscular.gastrocnemius",
    "visualId": "muscular.posterior.gastrocnemius.surface",
    "view": "posterior",
    "shape": "rect",
    "path": "M 434 1400 H 450 A 42 42 0 0 1 492 1442 V 1564 A 42 42 0 0 1 450 1606 H 434 A 42 42 0 0 1 392 1564 V 1442 A 42 42 0 0 1 434 1400 Z",
    "mirrorTransform": "translate(1000 0) scale(-1 1)",
    "description": "upper back of the lower leg, the calf",
    "regionIds": [
      "region.lower_limb.leg"
    ],
    "mirror": true,
    "margin": 8,
    "requiresDisambiguation": false,
    "boundingBox": {
      "x": 392,
      "y": 1400,
      "width": 100,
      "height": 206
    }
  },
  {
    "structureId": "muscular.soleus",
    "visualId": "muscular.posterior.soleus.surface",
    "view": "posterior",
    "shape": "rect",
    "path": "M 436 1600 H 448 A 32 32 0 0 1 480 1632 V 1748 A 32 32 0 0 1 448 1780 H 436 A 32 32 0 0 1 404 1748 V 1632 A 32 32 0 0 1 436 1600 Z",
    "mirrorTransform": "translate(1000 0) scale(-1 1)",
    "description": "lower back of the lower leg, below the calf",
    "regionIds": [
      "region.lower_limb.leg"
    ],
    "mirror": true,
    "margin": 12,
    "requiresDisambiguation": true,
    "boundingBox": {
      "x": 404,
      "y": 1600,
      "width": 76,
      "height": 180
    }
  }
];

export function geometryForView(view: ProvisionalView): readonly ProvisionalGeometryEntry[] {
  return PROVISIONAL_GEOMETRY.filter((entry) => entry.view === view);
}
