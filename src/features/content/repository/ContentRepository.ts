import {
  anatomySystemFileSchema,
  buildVisualMappingIndex,
  regionsFileSchema,
  structuresFileSchema,
  visualMappingsFileSchema,
  type AnatomyStructure,
  type AnatomySystem,
  type Region,
  type VisualMapping,
  type VisualMappingIndex,
} from '@/domain/anatomy/anatomy';
import { questionTemplatesFileSchema, type QuestionTemplate } from '@/domain/learning/learning';
import {
  assetManifestSchema,
  sourcesFileSchema,
  type AssetManifestEntry,
  type SourceReference,
} from '@/domain/content/source-reference';
import {
  isLearnerVisible,
  isPreviewVisible,
  type ContentStatus,
} from '@/domain/content/content-status';
import {
  validateContent,
  type ValidationReport,
} from '@/features/content/validation/ContentValidator';
import type { BuildFlags } from '@/config/build-flags';

/**
 * Content access.
 *
 * Content is bundled JSON, validated at load time, and exposed only through
 * this repository. No component reads a JSON file directly, and no quiz logic
 * knows which structures exist — it asks this repository what is eligible.
 */

import systemFile from '@/data/systems/muscular/anatomy-system.json';
import regionsFile from '@/data/systems/muscular/regions.json';
import structuresFile from '@/data/systems/muscular/structures.json';
import visualMappingsFile from '@/data/systems/muscular/visual-mappings.json';
import questionTemplatesFile from '@/data/systems/muscular/question-templates.json';
import sourcesFile from '@/data/systems/muscular/sources.json';
import assetManifestFile from '@/data/manifests/asset-manifest.json';
import threeDMappingsFile from '@/data/systems/muscular/three-d-visual-mappings.json';
import threeDPackManifestFile from '@/models/open3dmodel/muscular-3d-pack.manifest.json';

export interface LoadedContent {
  readonly systems: readonly AnatomySystem[];
  readonly regions: readonly Region[];
  readonly structures: readonly AnatomyStructure[];
  readonly mappings: readonly VisualMapping[];
  readonly mappingIndex: VisualMappingIndex;
  readonly templates: readonly QuestionTemplate[];
  readonly sources: readonly SourceReference[];
  readonly assets: readonly AssetManifestEntry[];
  readonly packVersion: string;
  readonly report: ValidationReport;
}

export class ContentParseError extends Error {
  constructor(
    message: string,
    readonly report: ValidationReport,
  ) {
    super(message);
    this.name = 'ContentParseError';
  }
}

export interface LoadOptions {
  readonly flags: BuildFlags;
}

export function loadContent(options: LoadOptions): LoadedContent {
  const report = validateContent(
    {
      systemFile,
      regionsFile,
      structuresFile,
      visualMappingsFile,
      questionTemplatesFile,
      sourcesFile,
      assetManifestFile,
      threeDMappingsFile,
      threeDPackManifestFile,
    },
    { provisionalArt: options.flags.PROVISIONAL_ART, allowDraftContent: options.flags.ALLOW_DRAFT_CONTENT },
  );

  if (!report.ok) {
    const summary = report.errors
      .slice(0, 8)
      .map((issue) => `  [${issue.rule}] ${issue.path}: ${issue.message}`)
      .join('\n');
    throw new ContentParseError(
      `Content failed validation and cannot be loaded.\n${summary}` +
        (report.errors.length > 8 ? `\n  …and ${report.errors.length - 8} more.` : ''),
      report,
    );
  }

  const systems = anatomySystemFileSchema.parse(systemFile).systems;
  const regions = regionsFileSchema.parse(regionsFile).regions;
  const structures = structuresFileSchema.parse(structuresFile).structures;
  const mappings = visualMappingsFileSchema.parse(visualMappingsFile).mappings;
  const templates = questionTemplatesFileSchema.parse(questionTemplatesFile).templates;
  const sources = sourcesFileSchema.parse(sourcesFile).sources;
  const assets = assetManifestSchema.parse(assetManifestFile).entries;

  return {
    systems,
    regions,
    structures,
    mappings,
    mappingIndex: buildVisualMappingIndex(mappings),
    templates,
    sources,
    assets,
    packVersion: structuresFile.content_version,
    report,
  };
}

/**
 * Content that is valid but empty.
 *
 * Used when loading fails. Every consumer then sees a well-formed, genuinely
 * empty pack rather than `null`, so a content problem degrades to an honest
 * "nothing is available" message instead of a crash on every screen.
 */
export function emptyContent(report: ValidationReport): LoadedContent {
  return {
    systems: [],
    regions: [],
    structures: [],
    mappings: [],
    mappingIndex: buildVisualMappingIndex([]),
    templates: [],
    sources: [],
    assets: [],
    packVersion: '0.0.0',
    report,
  };
}

export const EMPTY_VALIDATION_REPORT: ValidationReport = {
  ok: false,
  errors: [],
  warnings: [],
  blockingReason: 'Content could not be loaded.',
  stats: {
    systems: 0,
    structures: 0,
    published: 0,
    reviewed: 0,
    draft: 0,
    retired: 0,
    mappings: 0,
    selectableMappings: 0,
    sources: 0,
    approvedAssets: 0,
    learnerVisible: 0,
  },
};

/* ------------------------------------------------------------------ *
 * Lookups
 * ------------------------------------------------------------------ */

export interface StructureQuery {
  /** Statuses the caller is allowed to see. */
  readonly statuses: readonly ContentStatus[];
  readonly systemId: string;
}

export class ContentRepository {
  constructor(private readonly content: LoadedContent) {}

  get packVersion(): string {
    return this.content.packVersion;
  }

  get report(): ValidationReport {
    return this.content.report;
  }

  get all(): LoadedContent {
    return this.content;
  }

  system(systemId: string): AnatomySystem | null {
    return this.content.systems.find((system) => system.system_id === systemId) ?? null;
  }

  structure(structureId: string): AnatomyStructure | null {
    return this.content.structures.find((s) => s.structure_id === structureId) ?? null;
  }

  region(regionId: string): Region | null {
    return this.content.regions.find((r) => r.region_id === regionId) ?? null;
  }

  source(sourceId: string): SourceReference | null {
    return this.content.sources.find((s) => s.source_id === sourceId) ?? null;
  }

  assetByPath(path: string): AssetManifestEntry | null {
    return this.content.assets.find((a) => a.file_path === path) ?? null;
  }

  regionLabel(regionId: string): string {
    return this.region(regionId)?.display_name ?? regionId;
  }

  /**
   * Structures the learner may see.
   *
   * `published` only, unless draft content has been explicitly enabled for
   * development preview. This single function is the gate that keeps unreviewed
   * anatomy out of standard gameplay.
   */
  visibleStructures(query: StructureQuery): readonly AnatomyStructure[] {
    const allowed = new Set(query.statuses);
    return this.content.structures.filter(
      (structure) => structure.system_id === query.systemId && allowed.has(structure.content_status),
    );
  }

  learnerVisibleStructures(systemId: string): readonly AnatomyStructure[] {
    return this.visibleStructures({ statuses: visibleForLearners(), systemId });
  }

  previewStructures(systemId: string, flags: BuildFlags): readonly AnatomyStructure[] {
    return this.visibleStructures({
      statuses: flags.ALLOW_DRAFT_CONTENT ? previewStatuses() : visibleForLearners(),
      systemId,
    });
  }

  mappingsForStructure(structureId: string): readonly VisualMapping[] {
    return this.content.mappingIndex.byStructureId.get(structureId) ?? [];
  }

  selectableMappingsForStructure(structureId: string): readonly VisualMapping[] {
    return this.mappingsForStructure(structureId).filter((mapping) => mapping.selectable);
  }

  selectableStructuresInView(viewId: string): ReadonlySet<string> {
    const mappings = this.content.mappingIndex.selectableByView.get(viewId) ?? [];
    const ids = new Set<string>();
    for (const mapping of mappings) {
      if (this.isStructureSelectable(mapping.structure_id)) ids.add(mapping.structure_id);
    }
    return ids;
  }

  /** A structure is selectable only when its content status permits showing it. */
  isStructureSelectable(structureId: string, flags?: BuildFlags): boolean {
    const structure = this.structure(structureId);
    if (structure === null) return false;
    if (flags === undefined) return isLearnerVisible(structure.content_status);
    return isPreviewVisible(structure.content_status);
  }

  regionsForStructure(structureId: string): readonly Region[] {
    const structure = this.structure(structureId);
    if (structure === null) return [];
    return structure.region_ids
      .map((regionId) => this.region(regionId))
      .filter((region): region is Region => region !== null);
  }
}

function visibleForLearners(): readonly ContentStatus[] {
  return ['published'];
}

function previewStatuses(): readonly ContentStatus[] {
  return ['published', 'reviewed', 'draft'];
}

let cached: LoadedContent | null = null;
let cachedForFlags: string | null = null;

/**
 * Loads content once per flag combination. In tests the cache is bypassed so
 * each case sees the content it expects.
 */
export function getContentRepository(flags: BuildFlags): ContentRepository {
  const key = `${flags.ALLOW_DRAFT_CONTENT}:${flags.PROVISIONAL_ART}:${flags.ENABLE_DEBUG_TOOLS}`;
  if (cached === null || cachedForFlags !== key) {
    cached = loadContent({ flags });
    cachedForFlags = key;
  }
  return new ContentRepository(cached);
}

export function clearContentCache(): void {
  cached = null;
  cachedForFlags = null;
}
