import type { z } from 'zod';
import {
  anatomySystemFileSchema,
  regionsFileSchema,
  structuresFileSchema,
  visualMappingsFileSchema,
} from '@/domain/anatomy/anatomy';
import { questionTemplatesFileSchema } from '@/domain/learning/learning';
import {
  assetManifestSchema,
  isValidLicenceForRelease,
  sourcesFileSchema,
} from '@/domain/content/source-reference';
import type { License, MedicalReviewStatus } from '@/domain/content/content-status';
import {
  modelPackManifestSchema,
  threeDMappingsFileSchema,
} from '@/domain/anatomy/three-d-mapping';

/**
 * Content validation.
 *
 * Every rule is named so a failure is actionable rather than a stack trace. The
 * validator is the mechanical half of the content-review workflow described in
 * docs/05-content-review-workflow.md: it cannot tell whether an anatomy fact is
 * correct, but it can guarantee that no fact reaches a learner without a source,
 * a reviewer, a recorded licence, and a selectable hit region.
 */

export interface ValidationIssue {
  readonly rule: string;
  readonly path: string;
  readonly message: string;
}

export interface ValidationStats {
  readonly systems: number;
  readonly structures: number;
  readonly published: number;
  readonly reviewed: number;
  readonly draft: number;
  readonly retired: number;
  readonly mappings: number;
  readonly selectableMappings: number;
  readonly sources: number;
  readonly approvedAssets: number;
  /** Structures a learner can currently be shown. */
  readonly learnerVisible: number;
}

export interface ValidationReport {
  readonly ok: boolean;
  readonly errors: readonly ValidationIssue[];
  readonly warnings: readonly ValidationIssue[];
  readonly stats: ValidationStats;
  /**
   * Present when nothing is publishable. States the reason plainly rather than
   * leaving a developer to guess why a quiz pool is empty.
   */
  readonly blockingReason: string | null;
}

export interface ContentBundle {
  readonly systemFile: unknown;
  readonly regionsFile: unknown;
  readonly structuresFile: unknown;
  readonly visualMappingsFile: unknown;
  readonly questionTemplatesFile: unknown;
  readonly sourcesFile: unknown;
  readonly assetManifestFile: unknown;
  /**
   * Optional 3D inputs.
   *
   * Optional so that a content pack which contains no 3D at all still
   * validates. When present they are validated as strictly as the 2D files,
   * and the rules that connect them — pack to manifest entry, mapping to
   * structure — only fire when both sides are actually present.
   */
  readonly threeDMappingsFile?: unknown;
  readonly threeDPackManifestFile?: unknown;
}

export interface ValidateOptions {
  /** True when the project still carries placeholder artwork. */
  readonly provisionalArt: boolean;
  /**
   * True when unreviewed draft content is permitted. A release build must set
   * this to false, at which point any published-or-worse structure without a
   * licence becomes an error rather than a warning.
   */
  readonly allowDraftContent: boolean;
}

interface Parsed<T> {
  readonly ok: boolean;
  readonly value: T | null;
  readonly issues: readonly ValidationIssue[];
}

function parseBundle<S extends z.ZodTypeAny>(
  value: unknown,
  schema: S,
  key: string,
): Parsed<z.infer<S>> {
  const result = schema.safeParse(value);
  if (result.success) {
    return { ok: true, value: result.data, issues: [] };
  }
  const issues = result.error.issues.map((issue) => ({
    rule: 'schema',
    path: `${key}${issue.path.length > 0 ? `.${issue.path.join('.')}` : ''}`,
    message: issue.message,
  }));
  return { ok: false, value: null, issues };
}

export function validateContent(
  bundle: ContentBundle,
  options: ValidateOptions,
): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const systems = parseBundle(bundle.systemFile, anatomySystemFileSchema, 'systemFile');
  const regions = parseBundle(bundle.regionsFile, regionsFileSchema, 'regionsFile');
  const structures = parseBundle(bundle.structuresFile, structuresFileSchema, 'structuresFile');
  const mappings = parseBundle(bundle.visualMappingsFile, visualMappingsFileSchema, 'visualMappingsFile');
  const templates = parseBundle(
    bundle.questionTemplatesFile,
    questionTemplatesFileSchema,
    'questionTemplatesFile',
  );
  const sources = parseBundle(bundle.sourcesFile, sourcesFileSchema, 'sourcesFile');
  const manifest = parseBundle(bundle.assetManifestFile, assetManifestSchema, 'assetManifestFile');

  for (const parsed of [systems, regions, structures, mappings, templates, sources, manifest]) {
    errors.push(...parsed.issues);
  }

  const structureList = structures.value?.structures ?? [];
  const mappingList = mappings.value?.mappings ?? [];
  const regionList = regions.value?.regions ?? [];
  const sourceList = sources.value?.sources ?? [];
  const assetList = manifest.value?.entries ?? [];
  const templateList = templates.value?.templates ?? [];

  /* ---------------- duplicate identifiers ---------------- */

  duplicates(structureList.map((s) => s.structure_id)).forEach((id) =>
    errors.push({
      rule: 'duplicate-structure-id',
      path: `structures.${id}`,
      message: `Structure id "${id}" appears more than once.`,
    }),
  );

  duplicates(mappingList.map((m) => m.visual_id)).forEach((id) =>
    errors.push({
      rule: 'duplicate-visual-id',
      path: `visual-mappings.${id}`,
      message: `Visual id "${id}" appears more than once.`,
    }),
  );

  duplicates(templateList.map((t) => t.template_id)).forEach((id) =>
    errors.push({
      rule: 'duplicate-template-id',
      path: `question-templates.${id}`,
      message: `Template id "${id}" appears more than once.`,
    }),
  );

  duplicates(sourceList.map((s) => s.source_id)).forEach((id) =>
    errors.push({
      rule: 'duplicate-source-id',
      path: `sources.${id}`,
      message: `Source id "${id}" appears more than once.`,
    }),
  );

  duplicates(assetList.map((a) => a.asset_id)).forEach((id) =>
    errors.push({
      rule: 'duplicate-asset-id',
      path: `asset-manifest.${id}`,
      message: `Asset id "${id}" appears more than once.`,
    }),
  );

  const structureById = new Map(structureList.map((s) => [s.structure_id, s]));
  const regionIds = new Set(regionList.map((r) => r.region_id));
  const sourceById = new Map(sourceList.map((s) => [s.source_id, s]));
  const assetByPath = new Map(assetList.map((a) => [a.file_path, a]));

  /* ---------------- 3D ---------------- */

  const threeDMappings =
    bundle.threeDMappingsFile === undefined
      ? { ok: true, value: null, issues: [] as readonly ValidationIssue[] }
      : parseBundle(bundle.threeDMappingsFile, threeDMappingsFileSchema, 'threeDMappingsFile');

  const threeDPacks =
    bundle.threeDPackManifestFile === undefined
      ? { ok: true, value: null, issues: [] as readonly ValidationIssue[] }
      : parseBundle(bundle.threeDPackManifestFile, modelPackManifestSchema, 'threeDPackManifestFile');

  errors.push(...threeDMappings.issues, ...threeDPacks.issues);

  const threeDMappingList = threeDMappings.value?.mappings ?? [];
  const packList = threeDPacks.value?.packs ?? [];
  const packIds = new Set(packList.map((p) => p.model_pack_id));

  duplicates(threeDMappingList.map((m) => m.visual_id)).forEach((id) =>
    errors.push({
      rule: '3d-duplicate-visual-id',
      path: `three-d-mappings.${id}`,
      message: `3D visual id "${id}" appears more than once.`,
    }),
  );

  // A node must resolve to exactly one structure. If two mappings claim one
  // node, selection is ambiguous by construction and a tap would pick whichever
  // the renderer happened to register last.
  const nodeOwners = new Map<string, string[]>();
  for (const mapping of threeDMappingList) {
    for (const part of mapping.parts) {
      const owners = nodeOwners.get(part.node_name) ?? [];
      owners.push(mapping.visual_id);
      nodeOwners.set(part.node_name, owners);
    }
  }
  for (const [nodeName, owners] of nodeOwners) {
    if (owners.length > 1) {
      errors.push({
        rule: '3d-node-claimed-twice',
        path: `three-d-mappings.${nodeName}`,
        message:
          `Mesh node "${nodeName}" is claimed by ${owners.length} mappings ` +
          `(${owners.join(', ')}). A node must resolve to exactly one structure.`,
      });
    }
  }

  for (const mapping of threeDMappingList) {
    if (structureList.length > 0 && !structureById.has(mapping.structure_id)) {
      errors.push({
        rule: '3d-mapping-unknown-structure',
        path: `three-d-mappings.${mapping.visual_id}.structure_id`,
        message: `Structure "${mapping.structure_id}" is not in the content pack.`,
      });
    }

    if (packList.length > 0 && !packIds.has(mapping.model_pack_id)) {
      errors.push({
        rule: '3d-mapping-unknown-pack',
        path: `three-d-mappings.${mapping.visual_id}.model_pack_id`,
        message: `Model pack "${mapping.model_pack_id}" is not in the pack manifest.`,
      });
    }

    for (const part of mapping.parts) {
      if (mapping.selectable && part.is_parent_overlay && mapping.occlusion_policy === 'always') {
        errors.push({
          rule: '3d-overlay-answers-for-parent',
          path: `three-d-mappings.${mapping.visual_id}.occlusion_policy`,
          message:
            `"${mapping.visual_id}" has overlay part "${part.node_name}" but declares ` +
            `occlusion_policy "always". Selecting an overlay must not answer for its parent.`,
        });
      }
    }

    // A published 3D mapping on a draft structure would put unreviewed geometry
    // in front of learners ahead of the content it depicts.
    const structure = structureById.get(mapping.structure_id);
    if (
      mapping.mapping_status === 'published' &&
      structure !== undefined &&
      structure.content_status !== 'published'
    ) {
      errors.push({
        rule: '3d-mapping-ahead-of-structure',
        path: `three-d-mappings.${mapping.visual_id}.mapping_status`,
        message:
          `3D mapping is published but structure "${mapping.structure_id}" is ` +
          `"${structure.content_status}". The 2D content must be published first.`,
      });
    }
  }

  for (const pack of packList) {
    const entry = assetByPath.get(pack.asset_path);

    if (entry === undefined) {
      errors.push({
        rule: '3d-pack-missing-manifest-entry',
        path: `three-d-packs.${pack.model_pack_id}.asset_path`,
        message:
          `No asset manifest entry records "${pack.asset_path}". Every 3D asset must have ` +
          `a creator, a licence and a modification note.`,
      });
      continue;
    }

    if (entry.license === 'UNSET') {
      const issue: ValidationIssue = {
        rule: '3d-pack-licence-unset',
        path: `three-d-packs.${pack.model_pack_id}`,
        message:
          `Pack "${pack.model_pack_id}" has no resolved licence. It must remain ` +
          `blocked-pending-licence and must not be offered to learners.`,
      };
      (options.allowDraftContent ? warnings : errors).push(issue);
    }

    const attribution = entry.attribution_requirement;
    if (
      pack.integration_status === 'verified' &&
      (attribution === null || attribution.trim().length === 0)
    ) {
      errors.push({
        rule: '3d-verified-pack-without-attribution',
        path: `asset-manifest.${entry.asset_id}.attribution_requirement`,
        message:
          `Pack "${pack.model_pack_id}" is verified but its manifest entry states no ` +
          `attribution requirement. A share-alike asset must record one.`,
      });
    }
  }

  /* ---------------- referential integrity ---------------- */

  for (const structure of structureList) {
    if (structure.parent_structure_id !== null && !structureById.has(structure.parent_structure_id)) {
      errors.push({
        rule: 'dangling-parent',
        path: `structures.${structure.structure_id}.parent_structure_id`,
        message: `Parent structure "${structure.parent_structure_id}" does not exist.`,
      });
    }

    for (const regionId of structure.region_ids) {
      if (!regionIds.has(regionId)) {
        errors.push({
          rule: 'dangling-region',
          path: `structures.${structure.structure_id}.region_ids`,
          message: `Region "${regionId}" is not declared in regions.json.`,
        });
      }
    }

    for (const related of structure.relation_ids) {
      if (!structureById.has(related)) {
        errors.push({
          rule: 'dangling-relation',
          path: `structures.${structure.structure_id}.relation_ids`,
          message: `Related structure "${related}" does not exist.`,
        });
      }
    }

    for (const note of structure.distinction_notes) {
      if (!structureById.has(note.against_structure_id)) {
        errors.push({
          rule: 'dangling-distinction',
          path: `structures.${structure.structure_id}.distinction_notes`,
          message: `Distinction note references unknown structure "${note.against_structure_id}".`,
        });
      }
    }
  }

  for (const mapping of mappingList) {
    if (!structureById.has(mapping.structure_id)) {
      errors.push({
        rule: 'orphan-visual-mapping',
        path: `visual-mappings.${mapping.visual_id}`,
        message: `Visual mapping references unknown structure "${mapping.structure_id}".`,
      });
    }

    const structure = structureById.get(mapping.structure_id);
    if (structure && !structure.visible_in_views.includes(mapping.view_id)) {
      errors.push({
        rule: 'visual-view-mismatch',
        path: `visual-mappings.${mapping.visual_id}.view_id`,
        message:
          `Mapping is for view "${mapping.view_id}" but ${structure.structure_id} does not ` +
          `list that view in visible_in_views.`,
      });
    }
  }

  /* ---------------- content status gates ---------------- */

  const learnerVisible = structureList.filter((s) => s.content_status === 'published');
  const reviewed = structureList.filter((s) => s.content_status === 'reviewed');
  const draft = structureList.filter((s) => s.content_status === 'draft');
  const retired = structureList.filter((s) => s.content_status === 'retired');

  for (const structure of learnerVisible) {
    // Intra-record rules (published implies a source and an approved medical
    // review) are enforced by the Zod schemas in `@/domain/anatomy/anatomy`.
    // Repeating them here would be unreachable code, so only cross-record
    // integrity — which no single schema can see — is checked below.

    for (const sourceId of structure.source_references) {
      const source = sourceById.get(sourceId);
      if (!source) {
        errors.push({
          rule: 'missing-source-reference',
          path: `structures.${structure.structure_id}.source_references`,
          message: `Source "${sourceId}" is not declared in sources.json.`,
        });
        continue;
      }
      if (!source.reviewer_name || !source.review_date) {
        errors.push({
          rule: 'source-review-missing',
          path: `sources.${sourceId}`,
          message: 'A source cited by a published structure must record a reviewer and a review date.',
        });
      }
    }

    const viewMappings = mappingList.filter(
      (m) => m.structure_id === structure.structure_id && m.selectable && m.visual_status === 'approved',
    );
    for (const view of structure.visible_in_views) {
      const covered = viewMappings.some((m) => m.view_id === view);
      if (!covered) {
        errors.push({
          rule: 'published-without-selectable-visual',
          path: `structures.${structure.structure_id}`,
          message: `No approved selectable visual mapping exists for view "${view}".`,
        });
      }
    }

    for (const mapping of mappingList.filter((m) => m.structure_id === structure.structure_id)) {
      const asset = assetByPath.get(mapping.asset_path);
      if (!asset) {
        errors.push({
          rule: 'missing-license-entry',
          path: `visual-mappings.${mapping.visual_id}.asset_path`,
          message: `Asset "${mapping.asset_path}" is not present in asset-manifest.json.`,
        });
        continue;
      }
      if (!isValidLicenceForRelease(asset.license)) {
        errors.push({
          rule: 'published-without-license',
          path: `asset-manifest.${asset.asset_id}.license`,
          message: `Asset licence is "${asset.license}", which cannot be released.`,
        });
      }
      if (asset.medical_review_status !== 'approved') {
        errors.push({
          rule: 'provisional-art-in-published',
          path: `asset-manifest.${asset.asset_id}.medical_review_status`,
          message: 'A published structure must not reference unapproved artwork.',
        });
      }
    }
  }

  /* ---------------- licence gate for release ---------------- */

  for (const asset of assetList) {
    if (asset.license === 'proprietary_restricted') {
      errors.push({
        rule: 'restricted-license',
        path: `asset-manifest.${asset.asset_id}`,
        message: 'A restricted licence cannot ship.',
      });
    }
    if (asset.medical_review_status === 'rejected') {
      errors.push({
        rule: 'rejected-asset',
        path: `asset-manifest.${asset.asset_id}`,
        message: 'A rejected asset must not remain in the manifest.',
      });
    }
    if (options.provisionalArt && asset.license === 'UNSET') {
      warnings.push({
        rule: 'provisional-asset-licence',
        path: `asset-manifest.${asset.asset_id}`,
        message: 'Licence is unset. This is expected for placeholder artwork and blocks a release build.',
      });
    }
    if (
      asset.license === 'CC-BY-4.0' ||
      asset.license === 'CC-BY-SA-4.0' ||
      asset.license === 'CC-BY-NC-4.0'
    ) {
      if (!asset.attribution_requirement) {
        errors.push({
          rule: 'missing-attribution',
          path: `asset-manifest.${asset.asset_id}.attribution_requirement`,
          message: `${asset.license} requires an attribution notice for the Credits screen.`,
        });
      }
    }
  }

  /* ---------------- fairness ---------------- */

  // The unforgiving-margin cap and the small-target affordance requirement are
  // Zod refinements on `visualMappingSchema`, so no data that violates them can
  // reach here. See anatomy.spec.ts.

  for (const mapping of mappingList) {
    if (mapping.license_reference === 'UNSET' && !options.provisionalArt) {
      errors.push({
        rule: 'missing-license-reference',
        path: `visual-mappings.${mapping.visual_id}.license_reference`,
        message: 'A visual mapping must name the licence of the artwork it points at.',
      });
    }
  }

  /* ---------------- templates ---------------- */

  for (const template of templateList) {
    if (template.implemented && template.prompt_format !== 'locate_named_structure') {
      errors.push({
        rule: 'unsupported-implementation',
        path: `question-templates.${template.template_id}`,
        message: 'Only "locate_named_structure" is implemented in this release.',
      });
    }
    for (const view of template.allowed_views) {
      const hasMapping = mappingList.some((m) => m.view_id === view);
      if (!hasMapping) {
        errors.push({
          rule: 'template-unsupported-view',
          path: `question-templates.${template.template_id}.allowed_views`,
          message: `No visual mapping exists for view "${view}".`,
        });
      }
    }
  }

  /* ---------------- version consistency ---------------- */

  const packVersion = (bundle as { structuresFile?: { content_version?: string } }).structuresFile
    ?.content_version;

  if (packVersion === undefined) {
    errors.push({
      rule: 'missing-pack-version',
      path: 'structuresFile.content_version',
      message: 'The content pack must declare a semver content_version.',
    });
  } else {
    const mismatched = structureList.filter(
      (structure) => structure.created_version !== packVersion || structure.updated_version !== packVersion,
    );
    for (const structure of mismatched) {
      errors.push({
        rule: 'version-mismatch',
        path: `structures.${structure.structure_id}`,
        message:
          `Structure versions (created ${structure.created_version}, updated ${structure.updated_version}) ` +
          `do not match the pack version ${packVersion}.`,
      });
    }

    for (const asset of assetList) {
      if (asset.content_version !== packVersion) {
        errors.push({
          rule: 'version-mismatch',
          path: `asset-manifest.${asset.asset_id}.content_version`,
          message: `Asset version ${asset.content_version} does not match pack version ${packVersion}.`,
        });
      }
    }

    if (systems.value && systems.value.systems[0]?.content_version !== packVersion) {
      errors.push({
        rule: 'version-mismatch',
        path: 'anatomy-system.json.content_version',
        message: `System version does not match pack version ${packVersion}.`,
      });
    }
  }

  /* ---------------- draft leakage guard ---------------- */

  if (!options.allowDraftContent) {
    for (const structure of draft) {
      errors.push({
        rule: 'draft-content-allowed-in-build',
        path: `structures.${structure.structure_id}`,
        message: 'Draft content is present in a build that forbids it.',
      });
    }
    for (const structure of reviewed) {
      errors.push({
        rule: 'reviewed-content-allowed-in-build',
        path: `structures.${structure.structure_id}`,
        message: 'Reviewed-but-unpublished content is present in a build that forbids it.',
      });
    }
  }

  /* ---------------- blocking reason ---------------- */

  const blockingReason =
    learnerVisible.length === 0
      ? sourceList.length === 0
        ? 'No published structures, because sources.json contains no approved sources. This is the expected ' +
          'state until a qualified anatomy reviewer signs off. See docs/05-content-review-workflow.md.'
        : 'No published structures. Every structure is still in draft or review.'
      : null;

  if (options.provisionalArt && learnerVisible.length > 0) {
    warnings.push({
      rule: 'provisional-art',
      path: 'assets',
      message: 'Anatomy artwork is provisional placeholder geometry and must not be published.',
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    blockingReason,
    stats: {
      systems: systems.value?.systems.length ?? 0,
      structures: structureList.length,
      published: learnerVisible.length,
      reviewed: reviewed.length,
      draft: draft.length,
      retired: retired.length,
      mappings: mappingList.length,
      selectableMappings: mappingList.filter((m) => m.selectable).length,
      sources: sourceList.length,
      approvedAssets: assetList.filter((a) => a.medical_review_status === 'approved').length,
      learnerVisible: learnerVisible.length,
    },
  };
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

export type { License, MedicalReviewStatus };
