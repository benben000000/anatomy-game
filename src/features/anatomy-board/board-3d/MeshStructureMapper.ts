import {
  auditNodesAgainstPack,
  threeDVisualMappingSchema,
  type NodeAuditFinding,
  type ThreeDVisualMapping,
} from '@/domain/anatomy/three-d-mapping';
import {
  structureIdSchema,
  visualIdSchema,
  viewIdSchema,
  type StructureId,
} from '@/domain/anatomy/ids';
import {
  resolveCandidates,
  type ResolutionOutcome,
} from '@/features/anatomy-board/board-2d-svg/resolveCandidate';
import type { CandidateHit } from '@/features/anatomy-board/contracts/anatomy-board-adapter';

/**
 * Mesh-to-structure resolution.
 *
 * ## Why this reuses the 2D resolver
 *
 * The temptation in a 3D raycast is to write new selection logic: take the
 * closest intersected mesh, done. That is wrong in a specific and damaging way.
 * A 3D model places muscles on top of each other constantly — the deltoid over
 * the supraspinatus, the biceps over the brachialis, the gastrocnemius over the
 * soleus. "Closest hit wins" means the learner tapping the calf is marked wrong
 * for tapping the soleus, when the honest answer is that the model shows both
 * and they overlap.
 *
 * So 3D selection goes through the same `resolveCandidates` function the 2D
 * board uses, and gets the same guarantees: one candidate selects, several
 * prompt, and ties never guess. That function was extracted for exactly this
 * reason.
 *
 * This module is deliberately free of Three.js. It turns node names into stable
 * structure identifiers, which is the whole job. Anything that requires a GPU
 * context belongs in the renderer.
 */

export interface ThreeDMeshNode {
  readonly name: string;
  readonly structureId: StructureId | null;
  readonly selectable: boolean;
  readonly selectionPriority: number;
  readonly requiresDisambiguation: boolean;
}

export interface MeshStructureMapperOptions {
  readonly mappings: readonly ThreeDVisualMapping[];
  /**
   * Whether parent overlays may be selected. Off by default: the source
   * project models named parts of continuous structures as separate objects
   * above the parent, and a learner aiming at "the deltoid" means the whole
   * deltoid.
   */
  readonly allowOverlaySelection?: boolean;
}

/**
 * Normalise a mesh name to the form three.js reports it under.
 *
 * three.js sanitises object names taken from a glTF file using
 * `PropertyBinding.sanitizeNodeName`: whitespace becomes an underscore, and the
 * characters `[ ] . : /` are **removed outright**. So:
 *
 *   "Deltoid muscle.r"  ->  "Deltoid_muscler"
 *   "Long head of biceps brachii.r"  ->  "Long_head_of_biceps_brachiir"
 *
 * That broke the whole mapping layer. The allowlist is written with the real
 * anatomical spelling, exact matching found nothing, and the board reported zero
 * structures while still drawing the geometry — a visible, completely inert model.
 *
 * This must stay byte-for-byte equivalent to three.js's own sanitiser. If three
 * changes its rule, this must change with it or selection silently breaks again.
 */
export function normaliseMeshName(name: string): string {
  // Matches three.js r180 PropertyBinding.sanitizeNodeName.
  return name.replace(/\s/g, '_').replace(/[[\].:/]/g, '');
}

export class MeshStructureMapper {
  private readonly nodeToVisual = new Map<string, ThreeDVisualMapping>();
  private readonly structureToVisual = new Map<StructureId, ThreeDVisualMapping>();
  private readonly overlayNodes = new Set<string>();

  constructor(options: MeshStructureMapperOptions) {
    const allowOverlay = options.allowOverlaySelection ?? false;

    for (const raw of options.mappings) {
      const mapping = threeDVisualMappingSchema.parse(raw);

      for (const part of mapping.parts) {
        // Index under both spellings so callers can pass either the real
        // anatomical name or the name as three.js reports it.
        const keys = [part.node_name, normaliseMeshName(part.node_name)];

        if (part.is_parent_overlay && !allowOverlay) {
          for (const key of keys) this.overlayNodes.add(key);
          continue;
        }
        if (!mapping.selectable) continue;
        // A node must resolve to exactly one structure. If the data ever puts
        // two mappings on one node, keep the first and let the audit report it,
        // rather than silently letting the last writer win.
        for (const key of keys) {
          if (!this.nodeToVisual.has(key)) this.nodeToVisual.set(key, mapping);
        }
      }

      if (!this.structureToVisual.has(mapping.structure_id)) {
        this.structureToVisual.set(mapping.structure_id, mapping);
      }
    }
  }

  /** Nodes that exist only as overlays on a parent, and are therefore inert. */
  get overlayNodeNames(): readonly string[] {
    return [...this.overlayNodes];
  }

  /** Resolve a raw glTF node name to a stable structure identifier. */
  resolveNode(nodeName: string): ThreeDMeshNode | null {
    if (this.overlayNodes.has(nodeName)) {
      return {
        name: nodeName,
        structureId: null,
        selectable: false,
        selectionPriority: 0,
        requiresDisambiguation: false,
      };
    }

    const mapping = this.nodeToVisual.get(nodeName);
    if (mapping === undefined) return null;

    const part = mapping.parts.find((candidate) => candidate.node_name === nodeName);

    return {
      name: nodeName,
      structureId: mapping.structure_id,
      selectable: true,
      selectionPriority: part?.selection_priority ?? 500,
      requiresDisambiguation:
        mapping.requires_disambiguation || part?.is_parent_overlay === true,
    };
  }

  /** All node names this mapper can select, for populating a raycast whitelist. */
  selectableNodeNames(): readonly string[] {
    return [...this.nodeToVisual.keys()];
  }

  /** Structures selectable in a given view, for building an eligible pool. */
  structureIdsForView(viewId: string): readonly StructureId[] {
    const ids = new Set<StructureId>();
    for (const mapping of this.nodeToVisual.values()) {
      const views = mapping.view_ids as readonly string[];
      if (views.includes(viewId)) ids.add(mapping.structure_id);
    }
    return [...ids];
  }

  /**
   * Look up by structure id.
   *
   * Accepts a plain string as well as a branded id because callers legitimately
   * hold both: the content pipeline deals in strings, the renderer in branded
   * ids. Normalised through the schema so a typo cannot silently miss.
   */
  mappingForStructure(structureId: StructureId | string): ThreeDVisualMapping | null {
    return this.structureToVisual.get(parseStructureId(structureId)) ?? null;
  }

  /** Does any mapping in this pack cover the given structure? */
  hasStructure(structureId: StructureId | string): boolean {
    return this.structureToVisual.has(parseStructureId(structureId));
  }
}

/** Accept a branded or plain id without letting a typo through silently. */
function parseStructureId(structureId: StructureId | string): StructureId {
  return typeof structureId === 'string' ? structureIdSchema.parse(structureId) : structureId;
}

/* ------------------------------------------------------------------ *
 * Raycast resolution
 * ------------------------------------------------------------------ */

/**
 * Turn the set of mesh node names a raycast struck into a selection outcome.
 *
 * The return type is the same one the 2D board produces, which is what allows
 * the host UI to offer the same disambiguation chooser regardless of renderer.
 */
export function resolveRaycastHits(
  nodeNames: readonly string[],
  mapper: MeshStructureMapper,
): ResolutionOutcome & { readonly candidates: readonly CandidateHit[] } {
  const hits: CandidateHit[] = [];
  const seen = new Set<string>();

  for (const nodeName of nodeNames) {
    const resolved = mapper.resolveNode(nodeName);
    if (resolved === null || resolved.structureId === null) continue;

    const mapping = mapper.mappingForStructure(resolved.structureId);
    if (mapping === null) continue;

    const key = resolved.structureId;
    if (seen.has(key)) continue;
    seen.add(key);

    hits.push({
      visualId: visualIdSchema.parse(mapping.visual_id),
      structureId: structureIdSchema.parse(resolved.structureId),
      selectionPriority: resolved.selectionPriority,
      requiresDisambiguation: resolved.requiresDisambiguation,
    });
  }

  return resolveCandidates(hits, { maxCandidates: 5 });
}

/* ------------------------------------------------------------------ *
 * Auditing
 * ------------------------------------------------------------------ */

export function auditMappings(
  mappings: readonly ThreeDVisualMapping[],
  packId: string,
  actualNodeNames: readonly string[],
): readonly NodeAuditFinding[] {
  return auditNodesAgainstPack(mappings, packId, actualNodeNames);
}

/* ------------------------------------------------------------------ *
 * Pack availability
 * ------------------------------------------------------------------ */

export interface UsablePack {
  readonly modelPackId: string;
  readonly displayName: string;
  readonly assetPath: string;
  readonly sizeBytes: number;
  readonly requiresDraco: boolean;
  readonly mappedStructures: readonly string[];
}

export interface PackAvailability {
  readonly usable: readonly UsablePack[];
  readonly blockedByLicence: readonly string[];
  readonly blockedByMapping: readonly string[];
  readonly hasAnyUsablePack: boolean;
  readonly allPacksLicenceBlocked: boolean;
}

/**
 * Decide which packs may actually be offered.
 *
 * A pack is usable only when all three hold: the licence is verified, the pack
 * is present locally, and at least one mapping in it is `published`. A pack with
 * draft mappings is correctly treated as unavailable — otherwise the first
 * person to resolve the licence ships 3D content nobody reviewed.
 */
export function computePackAvailability(input: {
  readonly packs: readonly {
    readonly modelPackId: string;
    readonly displayName: string;
    readonly assetPath: string;
    readonly sizeBytes: number;
    readonly requiresDraco: boolean;
    readonly integrationStatus: 'blocked-pending-licence' | 'verified' | 'rejected';
  }[];
  readonly mappings: readonly ThreeDVisualMapping[];
  readonly isPackCachedLocally: (packId: string) => boolean;
}): PackAvailability {
  const usable: UsablePack[] = [];
  const blockedByLicence: string[] = [];
  const blockedByMapping: string[] = [];

  for (const pack of input.packs) {
    if (pack.integrationStatus !== 'verified') {
      if (pack.integrationStatus === 'blocked-pending-licence') {
        blockedByLicence.push(pack.modelPackId);
      }
      continue;
    }

    const published = input.mappings.filter(
      (mapping) => mapping.model_pack_id === pack.modelPackId && mapping.mapping_status === 'published',
    );
    if (published.length === 0) {
      blockedByMapping.push(pack.modelPackId);
      continue;
    }

    if (!input.isPackCachedLocally(pack.modelPackId)) continue;

    usable.push({
      modelPackId: pack.modelPackId,
      displayName: pack.displayName,
      assetPath: pack.assetPath,
      sizeBytes: pack.sizeBytes,
      requiresDraco: pack.requiresDraco,
      mappedStructures: published.map((mapping) => mapping.structure_id),
    });
  }

  return {
    usable,
    blockedByLicence,
    blockedByMapping,
    hasAnyUsablePack: usable.length > 0,
    allPacksLicenceBlocked:
      input.packs.length > 0 && blockedByLicence.length === input.packs.length,
  };
}

/* ------------------------------------------------------------------ *
 * Learner-facing explanations
 * ------------------------------------------------------------------ */

export type ThreeDUnavailableMessage =
  | 'no-cached-pack'
  | 'pack-licence-blocked'
  | 'no-webgl'
  | 'reduced-data-saver'
  | 'insufficient-performance';

/**
 * One sentence per situation, written once here.
 *
 * The distinction that matters most: "not downloaded yet" is a connectivity
 * problem the learner can solve, while "blocked pending licence" is a
 * governance problem they cannot. Collapsing the two would tell a learner to
 * check their internet when reconnecting would not help.
 */
export function unavailableMessage(reason: ThreeDUnavailableMessage): {
  readonly headline: string;
  readonly detail: string;
  readonly canUserFix: boolean;
} {
  switch (reason) {
    case 'pack-licence-blocked':
      return {
        headline: 'The 3D model is not available in this build.',
        detail:
          'Its licence has not been verified, so Muscle Atlas does not ship it. This is a ' +
          'licensing decision, not a problem with your device or connection. Everything in the ' +
          '2D anatomy view works exactly as before.',
        canUserFix: false,
      };
    case 'no-cached-pack':
      return {
        headline: 'The 3D model has not been downloaded on this device yet.',
        detail:
          'Connect to the internet once and choose "Download for offline use". After that it ' +
          'works with no connection. Your 2D study is unaffected in the meantime.',
        canUserFix: true,
      };
    case 'no-webgl':
      return {
        headline: '3D view is not available in this browser or device configuration.',
        detail:
          'You can continue learning in the 2D anatomy view. Every structure, question and ' +
          'explanation available in 3D is also available in 2D.',
        canUserFix: false,
      };
    case 'reduced-data-saver':
      return {
        headline: '3D view is switched off because data saver is enabled.',
        detail:
          'Turn off data saver to use the 3D view, or continue in 2D. The 2D view uses far less ' +
          'data and is the recommended option on a metered connection.',
        canUserFix: true,
      };
    case 'insufficient-performance':
      return {
        headline: '3D view is switched off on this device to keep the app responsive.',
        detail:
          'Muscle Atlas keeps the 2D anatomy view rather than risk the app becoming slow or ' +
          'unusable on this device. Nothing in 2D is reduced.',
        canUserFix: false,
      };
  }
}

/** Structures that have no 3D counterpart and must stay reachable another way. */
export function structuresNeedingTwoDimensionalFallback(
  allStructureIds: readonly string[],
  mapper: MeshStructureMapper,
): readonly string[] {
  return allStructureIds.filter((structureId) => !mapper.hasStructure(structureId));
}

export { viewIdSchema };
