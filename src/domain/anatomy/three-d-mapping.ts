import { z } from 'zod';
import {
  layerIdSchema,
  sourceIdSchema,
  structureIdSchema,
  viewIdSchema,
} from '@/domain/anatomy/ids';

/**
 * 3D visual mapping.
 *
 * ## Why this is not the 2D `VisualMapping`
 *
 * The 2D board maps one structure to one SVG element. The 3D packs do not work
 * that way, and assuming they do is the most common way a 3D integration
 * silently becomes wrong.
 *
 * Verified against the official upper-limb and lower-limb GLB packs
 * (2026-10-10), node names are Terminologia Anatomica names with a laterality
 * suffix, and several of our structures are split across nodes:
 *
 *   Trapezius      -> "Ascending part of Trapezius muscle",
 *                     "Descending part of Trapezius muscle",
 *                     "Transverse part of Trapezius muscle"
 *   Deltoid        -> "Acromial part of deltoid muscle",
 *                     "Clavicular part of deltoid muscle",
 *                     "Thoracoacromial artery Deltoid br.r"
 *   Pectoralis major -> "Clavicular head of pectoralis major muscle",
 *                     "Abdominal head of pectoralis major muscle"
 *
 * So a mapping is many nodes to one structure, and selection priority decides
 * which part wins when two parts overlap on screen.
 *
 * ## The false-positive trap
 *
 * A substring search for "oblique" in the real node list returns only unrelated
 * structures — the radio-ulnar syndesmosis, the oblique ligament of the 1st
 * finger, the oblique head of adductor pollicis. A search for "serratus" returns
 * the muscle *and* the infraserratus and supraserratus bursae.
 *
 * Therefore: `node_names` is an explicit allowlist that a human confirmed
 * against the real node list. It is never derived by matching, and
 * `anatomyNodeAudit` below exists so that a stale allowlist fails loudly.
 */

/** Laterality as the 3D packs express it, including per-part anatomy. */
export const threeDLateralitySchema = z.enum([
  'left',
  'right',
  'bilateral',
  'midline',
  'per_part',
]);

/**
 * Occlusion policy for structures that are not freely visible.
 *
 * 'peel' exists because the source project models named parts of continuous
 * structures — the clavicular head of pectoralis major, the conoid ligament —
 * as separate objects above the parent. Selecting a peelable node must not
 * silently answer for its parent.
 */
export const occlusionPolicySchema = z.enum([
  'always',
  'only_when_unoccluded',
  'peel',
]);

/** A single geometry part belonging to one structure. */
export const meshPartSchema = z.object({
  /** Exact glTF node name as published. Case-sensitive. */
  node_name: z.string().min(1),
  /**
   * Optional disambiguation suffix, e.g. `.r` for right in the source packs.
   * Recorded explicitly so the credit and licence record can name the part.
   */
  laterality_suffix: z.string().max(8).nullable().default(null),
  /**
   * True when this node is a named part of a larger structure rather than an
   * independent muscle — the source project's "overlay" technique.
   */
  is_parent_overlay: z.boolean().default(false),
  selection_priority: z.number().int().min(0).max(1000).default(500),
});

export const threeDVisualMappingSchema = z
  .object({
    visual_id: z.string().min(3),

    /** Stable Muscle Atlas identifier. Never the source project's naming. */
    structure_id: structureIdSchema,

    representation_type: z.literal('3d_mesh'),

    /** Identifies which downloadable pack this mapping points into. */
    model_pack_id: z.string().min(3),
    asset_path: z.string().min(3),

    /** The parts that together make up this structure. One or more. */
    parts: z.array(meshPartSchema).min(1),

    view_ids: z.array(viewIdSchema).min(1),
    layer_id: layerIdSchema,
    laterality: threeDLateralitySchema,
    occlusion_policy: occlusionPolicySchema.default('always'),

    selectable: z.boolean().default(true),
    requires_disambiguation: z.boolean().default(false),

    /** Real-world tap radius in metres, measured on device. Not guessed. */
    fair_target_radius_m: z.number().min(0).nullable().default(null),

    /** Human-readable note about what is visible and from where. */
    visibility_notes: z.string().max(300).nullable().default(null),

    source_asset_id: z.string().min(3),
    content_source_references: z.array(sourceIdSchema).default([]),

    /**
     * Governance. A mapping is never `published` unless the underlying
     * structure is published, the asset licence is verified, and a reviewer has
     * signed off the mesh-to-structure correspondence.
     */
    mapping_status: z.enum(['draft', 'reviewed', 'published', 'retired']).default('draft'),
    reviewer: z.string().min(2).nullable().default(null),
    review_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
  })
  .superRefine((mapping, ctx) => {
    const label = mapping.visual_id;

    if (mapping.mapping_status === 'published') {
      if (mapping.reviewer === null || mapping.review_date === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reviewer'],
          message: `${label} is published but records no reviewer or review date.`,
        });
      }
      if (mapping.fair_target_radius_m === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fair_target_radius_m'],
          message: `${label} is published but has no measured tap radius.`,
        });
      }
      if (mapping.content_source_references.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content_source_references'],
          message: `${label} is published but cites no educational source.`,
        });
      }
    }

    // A structure whose parts sit on top of a parent must not silently answer
    // for that parent.
    const overlayParts = mapping.parts.filter((part) => part.is_parent_overlay);
    if (overlayParts.length > 0 && mapping.occlusion_policy === 'always') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['occlusion_policy'],
        message:
          `${label} contains overlay parts but declares occlusion_policy "always". ` +
          `An overlay part must be "peel" or "only_when_unoccluded", so that selecting ` +
          `it does not silently answer for its parent structure.`,
      });
    }

    // Duplicate node names within one mapping mean two parts of the same muscle
    // would be indistinguishable at selection time.
    const seen = new Set<string>();
    for (const part of mapping.parts) {
      if (seen.has(part.node_name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['parts'],
          message: `${label} lists node "${part.node_name}" more than once.`,
        });
      }
      seen.add(part.node_name);
    }
  });

export type ThreeDVisualMapping = z.infer<typeof threeDVisualMappingSchema>;
export type MeshPart = z.infer<typeof meshPartSchema>;
export type OcclusionPolicy = z.infer<typeof occlusionPolicySchema>;

/* ------------------------------------------------------------------ *
 * Pack manifest
 * ------------------------------------------------------------------ */

export const modelPackSchema = z
  .object({
    model_pack_id: z.string().min(3),
    display_name: z.string().min(2),
    asset_path: z.string().min(3),
    /** Bytes, as published by the source project. Used for the download prompt. */
    size_bytes: z.number().int().positive(),
    approx_triangles: z.number().int().nonnegative().default(0),
    mesh_count: z.number().int().nonnegative().default(0),
    requires_draco: z.boolean().default(false),
    /**
     * Whether Muscle Atlas is permitted to ship this pack. False until the
     * licence questions in the source record are resolved.
     */
    integration_status: z.enum(['blocked-pending-licence', 'verified', 'rejected']),
    blocking_reason: z.string().min(3).nullable().default(null),
  })
  .superRefine((pack, ctx) => {
    if (pack.integration_status === 'blocked-pending-licence' && pack.blocking_reason === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blocking_reason'],
        message: `${pack.model_pack_id} is blocked but gives no reason.`,
      });
    }
  });

export type ModelPack = z.infer<typeof modelPackSchema>;

export const modelPackManifestSchema = z.object({
  $schema: z.string().optional(),
  content_version: z.string().min(5),
  source_project: z.string().min(3),
  packs: z.array(modelPackSchema),
});

/* ------------------------------------------------------------------ *
 * Files
 * ------------------------------------------------------------------ */

export const threeDMappingsFileSchema = z.object({
  $schema: z.string().optional(),
  system_id: z.string().min(1),
  content_version: z.string().min(5),
  mappings: z.array(threeDVisualMappingSchema),
});

/* ------------------------------------------------------------------ *
 * Node audit
 *
 * Guards the allowlist against drift. When a pack is re-exported and node
 * names change, every mapping referring to a node that no longer exists must be
 * reported rather than silently becoming unselectable.
 * ------------------------------------------------------------------ */

export interface NodeAuditFinding {
  readonly kind:
    | 'unmapped-node'
    | 'missing-node'
    | 'duplicate-node-claim'
    | 'conflicting-priority';
  readonly nodeName: string;
  readonly detail: string;
  readonly visualIds: readonly string[];
}

export function auditNodesAgainstPack(
  mappings: readonly ThreeDVisualMapping[],
  packId: string,
  actualNodeNames: readonly string[],
): readonly NodeAuditFinding[] {
  const actual = new Set(actualNodeNames);
  const findings: NodeAuditFinding[] = [];

  /** nodeName -> mappings claiming it */
  const claims = new Map<string, string[]>();

  for (const mapping of mappings) {
    if (mapping.model_pack_id !== packId) continue;

    for (const part of mapping.parts) {
      const holders = claims.get(part.node_name) ?? [];
      holders.push(mapping.visual_id);
      claims.set(part.node_name, holders);

      if (!actual.has(part.node_name)) {
        findings.push({
          kind: 'missing-node',
          nodeName: part.node_name,
          detail:
            `Mapping "${mapping.visual_id}" refers to a node that does not exist in pack ` +
            `"${packId}". The mapping will be unselectable until corrected.`,
          visualIds: [mapping.visual_id],
        });
      }
    }
  }

  for (const [nodeName, holders] of claims) {
    if (holders.length > 1) {
      findings.push({
        kind: 'duplicate-node-claim',
        nodeName,
        detail:
          `Node "${nodeName}" is claimed by ${holders.length} mappings ` +
          `(${holders.join(', ')}). A node must resolve to exactly one structure, ` +
          `otherwise selection is ambiguous by construction.`,
        visualIds: holders,
      });
    }
  }

  for (const mapping of mappings) {
    if (mapping.model_pack_id !== packId) continue;

    const byPriority = new Map<number, string[]>();
    for (const part of mapping.parts) {
      const holders = byPriority.get(part.selection_priority) ?? [];
      holders.push(part.node_name);
      byPriority.set(part.selection_priority, holders);
    }
    for (const [priority, nodeNames] of byPriority) {
      if (nodeNames.length > 1 && mapping.selectable) {
        findings.push({
          kind: 'conflicting-priority',
          nodeName: nodeNames[0] ?? '',
          detail:
            `Mapping "${mapping.visual_id}" gives ${nodeNames.length} selectable parts the same ` +
            `selection_priority (${priority}). Overlapping parts must differ so that a tap on ` +
            `their shared region resolves deterministically.`,
          visualIds: [mapping.visual_id],
        });
      }
    }
  }

  // Nodes present in the pack but claimed by no mapping. Not an error — most of
  // the pack is not a Muscle Atlas learning target — but worth reporting so an
  // omission is a decision rather than an oversight.
  const claimed = new Set(claims.keys());
  for (const nodeName of actual) {
    if (!claimed.has(nodeName)) {
      findings.push({
        kind: 'unmapped-node',
        nodeName,
        detail:
          `Node "${nodeName}" exists in pack "${packId}" but is claimed by no mapping. It will ` +
          `not be selectable. Expected for non-target structures; verify it is intentional.`,
        visualIds: [],
      });
    }
  }

  return findings;
}
