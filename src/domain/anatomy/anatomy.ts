import { z } from 'zod';
import {
  contentVersionSchema,
  layerIdSchema,
  regionIdSchema,
  sourceIdSchema,
  structureIdSchema,
  systemIdSchema,
  viewIdSchema,
  visualIdSchema,
} from '@/domain/anatomy/ids';
import {
  contentStatusSchema,
  difficultyTierSchema,
  lateralitySchema,
  medicalReviewStatusSchema,
  structureTypeSchema,
  visualStatusSchema,
} from '@/domain/content/content-status';

/* ------------------------------------------------------------------ *
 * AnatomySystem
 * ------------------------------------------------------------------ */

export const learningModeSchema = z.enum([
  'explore',
  'identify',
  'learn_then_test',
  'review',
  'timed_challenge',
]);
export type LearningMode = z.infer<typeof learningModeSchema>;

export const anatomySystemSchema = z.object({
  system_id: systemIdSchema,
  display_name: z.string().min(2).max(80),
  description: z.string().min(10).max(600),
  status: z.enum(['planned', 'authoring', 'in_review', 'released', 'retired']),
  supported_learning_modes: z.array(learningModeSchema).min(1),
  default_views: z.array(viewIdSchema).min(1),
  content_version: contentVersionSchema,
  /**
   * Recorded so a future accelerated renderer is an explicit, optional path
   * rather than an assumption. The 2D SVG experience never depends on it.
   */
  renderer_baseline: z.literal('svg_2d').default('svg_2d'),
  accelerated_renderer: z.literal('webgl').nullable().default(null),
  acceleration_is_optional: z.literal(true).default(true),
});

export type AnatomySystem = z.infer<typeof anatomySystemSchema>;

/* ------------------------------------------------------------------ *
 * Region
 * ------------------------------------------------------------------ */

export const regionSchema = z.object({
  region_id: regionIdSchema,
  display_name: z.string().min(2).max(80),
  parent_region_id: regionIdSchema.nullable().default(null),
  views: z.array(viewIdSchema).min(1),
});
export type Region = z.infer<typeof regionSchema>;

/* ------------------------------------------------------------------ *
 * AnatomyStructure
 * ------------------------------------------------------------------ */

export const distinctionNoteSchema = z.object({
  against_structure_id: structureIdSchema,
  note: z.string().min(10).max(240),
});
export type DistinctionNote = z.infer<typeof distinctionNoteSchema>;

export const anatomyStructureSchema = z
  .object({
    structure_id: structureIdSchema,
    system_id: systemIdSchema,
    canonical_name: z.string().min(2).max(80),
    display_name: z.string().min(2).max(80),
    aliases: z.array(z.string().min(1)).default([]),
    latin_name: z.string().min(2).max(120).nullable().default(null),

    structure_type: structureTypeSchema,
    parent_structure_id: structureIdSchema.nullable().default(null),

    region_ids: z.array(regionIdSchema).min(1),
    laterality: lateralitySchema,
    visible_in_views: z.array(viewIdSchema).min(1),
    difficulty_tier: difficultyTierSchema,

    summary: z.string().min(20).max(400),
    function_summary: z.string().min(20).max(400),

    origin_summary: z.string().max(300).nullable().default(null),
    insertion_summary: z.string().max(300).nullable().default(null),
    innervation_summary: z.string().max(300).nullable().default(null),

    action_tags: z.array(z.string().min(2).max(40)).default([]),
    relation_ids: z.array(structureIdSchema).default([]),
    distinction_notes: z.array(distinctionNoteSchema).default([]),

    source_references: z.array(sourceIdSchema).default([]),
    content_status: contentStatusSchema.default('draft'),
    medical_review_status: medicalReviewStatusSchema.default('provisional'),
    review_notes: z.string().max(1000).nullable().default(null),
    created_version: contentVersionSchema,
    updated_version: contentVersionSchema,
  })
  .superRefine((structure, ctx) => {
    // Publishing requires provenance. This is enforced mechanically so a
    // record cannot be promoted without a source.
    if (structure.content_status === 'published' && structure.source_references.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source_references'],
        message: `Structure ${structure.structure_id} is published but has no source references.`,
      });
    }
    if (
      structure.content_status === 'published' &&
      structure.medical_review_status !== 'approved'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['medical_review_status'],
        message: `Structure ${structure.structure_id} is published but medical_review_status is "${structure.medical_review_status}".`,
      });
    }
  });

export type AnatomyStructure = z.infer<typeof anatomyStructureSchema>;

/* ------------------------------------------------------------------ *
 * VisualMapping
 *
 * This is what lets an SVG path, a canvas region and a future 3D mesh collider
 * be interchangeable. The learning engine only ever sees `structure_id`.
 * ------------------------------------------------------------------ */

const ASSET_PATH_PATTERN = /^\/?[\w\-./]+\.(svg|png|webp|glb|gltf)$/;

export const boundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().min(1),
  height: z.number().min(1),
});
export type BoundingBox = z.infer<typeof boundingBoxSchema>;

export const visualMappingSchema = z
  .object({
    visual_id: visualIdSchema,
    structure_id: structureIdSchema,

    representation_type: z.enum([
      'svg_path',
      'svg_group',
      'canvas_region',
      '3d_mesh',
      '3d_collider',
    ]),

    body_presentation_id: z.string().min(1),
    view_id: viewIdSchema,
    layer_id: layerIdSchema,

    asset_path: z.string().regex(ASSET_PATH_PATTERN, 'asset_path must be a relative asset path'),
    element_id: z.string().min(1).nullable(),

    selectable: z.boolean(),
    visible_by_default: z.boolean().default(true),

    // Fairness affordances for touch. See docs/03-anatomy-board.md section 4.
    min_fair_target_px: z.number().int().nonnegative().default(0),
    forgiveness_margin_units: z.number().min(0).max(16).default(6),
    requires_disambiguation: z.boolean().default(false),
    zoom_to_fit: z.boolean().default(true),

    // Deterministic tie-break when several candidates sit under one point.
    selection_priority: z.number().int().min(0).max(1000).default(500),

    occlusion_notes: z.string().max(300).nullable().default(null),
    visual_status: visualStatusSchema.default('provisional'),
    art_source_reference: sourceIdSchema.nullable().default(null),
    license_reference: z.string().min(3).default('UNSET'),
    bounding_box: boundingBoxSchema.nullable().default(null),
  })
  .superRefine((mapping, ctx) => {
    // Whether an unset licence is acceptable depends on the build, so that
    // judgement lives in ContentValidator rather than here. The schema only
    // enforces rules that are true in every mode.
    // A small target must declare at least one way for a finger to reach it
    // fairly. Enforced so "blind tap" questions cannot be authored by accident.
    const needsAffordance =
      mapping.selectable &&
      mapping.min_fair_target_px > 0 &&
      mapping.min_fair_target_px < 44;
    const hasAffordance =
      mapping.requires_disambiguation ||
      mapping.forgiveness_margin_units >= 8 ||
      mapping.zoom_to_fit;
    if (needsAffordance && !hasAffordance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['selectable'],
        message:
          `Visual mapping ${String(mapping.visual_id)} declares a ${mapping.min_fair_target_px}px target ` +
          `with no fairness affordance. Enable requires_disambiguation, raise forgiveness_margin_units, ` +
          `or set zoom_to_fit.`,
      });
    }
  });

export type VisualMapping = z.infer<typeof visualMappingSchema>;

/** Convenience lookup used by the board and the learning engine. */
export interface VisualMappingIndex {
  readonly byVisualId: ReadonlyMap<string, VisualMapping>;
  /** Selectable, learner-visible mappings grouped by view. */
  readonly selectableByView: ReadonlyMap<string, readonly VisualMapping[]>;
  readonly byStructureId: ReadonlyMap<string, readonly VisualMapping[]>;
}

export function buildVisualMappingIndex(
  mappings: readonly VisualMapping[],
): VisualMappingIndex {
  const byVisualId = new Map<string, VisualMapping>();
  const byStructureId = new Map<string, VisualMapping[]>();
  const selectableByView = new Map<string, VisualMapping[]>();

  for (const mapping of mappings) {
    byVisualId.set(mapping.visual_id, mapping);

    const forStructure = byStructureId.get(mapping.structure_id);
    if (forStructure) {
      forStructure.push(mapping);
    } else {
      byStructureId.set(mapping.structure_id, [mapping]);
    }

    if (!mapping.selectable) continue;
    const forView = selectableByView.get(mapping.view_id);
    if (forView) {
      forView.push(mapping);
    } else {
      selectableByView.set(mapping.view_id, [mapping]);
    }
  }

  return { byVisualId, selectableByView, byStructureId };
}

/* ------------------------------------------------------------------ *
 * File containers
 * ------------------------------------------------------------------ */

export const anatomySystemFileSchema = z.object({
  $schema: z.string().optional(),
  content_version: contentVersionSchema,
  systems: z.array(anatomySystemSchema),
});

export const structuresFileSchema = z.object({
  $schema: z.string().optional(),
  system_id: systemIdSchema,
  content_version: contentVersionSchema,
  structures: z.array(anatomyStructureSchema),
});

export const visualMappingsFileSchema = z.object({
  $schema: z.string().optional(),
  system_id: systemIdSchema,
  content_version: contentVersionSchema,
  mappings: z.array(visualMappingSchema),
});

export const regionsFileSchema = z.object({
  $schema: z.string().optional(),
  system_id: systemIdSchema,
  content_version: contentVersionSchema,
  regions: z.array(regionSchema),
});
