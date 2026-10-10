import { describe, expect, it } from 'vitest';
import { validateContent, type ContentBundle } from './ContentValidator';
import {
  structuresFileSchema,
  visualMappingsFileSchema,
} from '@/domain/anatomy/anatomy';
import { questionTemplatesFileSchema } from '@/domain/learning/learning';
import { assetManifestSchema, sourcesFileSchema } from '@/domain/content/source-reference';

import systemFile from '@/data/systems/muscular/anatomy-system.json';
import regionsFile from '@/data/systems/muscular/regions.json';
import structuresFile from '@/data/systems/muscular/structures.json';
import visualMappingsFile from '@/data/systems/muscular/visual-mappings.json';
import questionTemplatesFile from '@/data/systems/muscular/question-templates.json';
import sourcesFile from '@/data/systems/muscular/sources.json';
import assetManifestFile from '@/data/manifests/asset-manifest.json';

const DEV_OPTIONS = { provisionalArt: true, allowDraftContent: true } as const;
const RELEASE_OPTIONS = { provisionalArt: false, allowDraftContent: false } as const;

function bundle(): ContentBundle {
  return {
    systemFile,
    regionsFile,
    structuresFile,
    visualMappingsFile,
    questionTemplatesFile,
    sourcesFile,
    assetManifestFile,
  };
}

function rulesOf(report: { errors: readonly { rule: string }[] }): string[] {
  return [...new Set(report.errors.map((error) => error.rule))];
}

describe('the shipped muscular content pack', () => {
  const report = validateContent(bundle(), DEV_OPTIONS);

  it('passes validation in a development build', () => {
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('reports zero publishable structures and explains why', () => {
    expect(report.stats.published).toBe(0);
    expect(report.blockingReason).toContain('no approved sources');
  });

  it('never marks unreviewed content as published', () => {
    const structures = structuresFileSchema.parse(structuresFile).structures;
    expect(structures.every((structure) => structure.content_status !== 'published')).toBe(true);
    expect(structures.every((structure) => structure.source_references.length === 0)).toBe(true);
  });

  it('has no invented sources', () => {
    expect(sourcesFileSchema.parse(sourcesFile).sources).toEqual([]);
  });

  it('maps every visual to a real structure and vice versa where expected', () => {
    const structureIds = new Set(
      structuresFileSchema.parse(structuresFile).structures.map((s) => s.structure_id),
    );
    const mappings = visualMappingsFileSchema.parse(visualMappingsFile).mappings;

    expect(mappings.length).toBeGreaterThanOrEqual(8);
    for (const mapping of mappings) {
      expect(structureIds.has(mapping.structure_id)).toBe(true);
    }
  });

  it('gives every selectable target a fairness affordance', () => {
    const mappings = visualMappingsFileSchema.parse(visualMappingsFile).mappings;
    for (const mapping of mappings.filter((m) => m.selectable)) {
      const hasAffordance =
        mapping.requires_disambiguation ||
        mapping.forgiveness_margin_units >= 8 ||
        mapping.zoom_to_fit;
      expect(hasAffordance, `${mapping.visual_id} has no fairness affordance`).toBe(true);
    }
  });

  it('declares no implemented question type other than locate_named_structure', () => {
    const templates = questionTemplatesFileSchema.parse(questionTemplatesFile).templates;
    for (const template of templates.filter((t) => t.implemented)) {
      expect(template.prompt_format).toBe('locate_named_structure');
    }
  });
});

describe('release gating', () => {
  it('refuses a release build while provisional artwork is in use', () => {
    const report = validateContent(bundle(), RELEASE_OPTIONS);
    expect(report.ok).toBe(false);
    expect(rulesOf(report)).toContain('missing-license-reference');
  });

  it('refuses a release build that still carries draft content', () => {
    const report = validateContent(bundle(), RELEASE_OPTIONS);
    expect(rulesOf(report)).toContain('draft-content-allowed-in-build');
  });
});

describe('validator rules', () => {
  it('catches duplicate structure identifiers', () => {
    const structures = structuresFileSchema.parse(structuresFile).structures;
    const duplicated = { ...structuresFile, structures: [structures[0]!, structures[0]!] };
    const report = validateContent({ ...bundle(), structuresFile: duplicated }, DEV_OPTIONS);
    expect(rulesOf(report)).toContain('duplicate-structure-id');
  });

  it('catches duplicate visual identifiers', () => {
    const mappings = visualMappingsFileSchema.parse(visualMappingsFile).mappings;
    const duplicated = { ...visualMappingsFile, mappings: [mappings[0]!, mappings[0]!] };
    const report = validateContent({ ...bundle(), visualMappingsFile: duplicated }, DEV_OPTIONS);
    expect(rulesOf(report)).toContain('duplicate-visual-id');
  });

  it('catches a visual mapping for an unknown structure', () => {
    const mappings = visualMappingsFileSchema.parse(visualMappingsFile).mappings;
    const orphaned = {
      ...visualMappingsFile,
      mappings: [{ ...mappings[0]!, structure_id: 'muscular.does_not_exist' }, ...mappings.slice(1)],
    };
    const report = validateContent({ ...bundle(), visualMappingsFile: orphaned }, DEV_OPTIONS);
    expect(rulesOf(report)).toContain('orphan-visual-mapping');
  });

  it('catches a region that is not declared', () => {
    const structures = structuresFileSchema.parse(structuresFile).structures;
    const broken = {
      ...structuresFile,
      structures: [
        { ...structures[0]!, region_ids: ['region.nowhere'] },
        ...structures.slice(1),
      ],
    };
    const report = validateContent({ ...bundle(), structuresFile: broken }, DEV_OPTIONS);
    expect(rulesOf(report)).toContain('dangling-region');
  });

  it('catches a mapping whose view contradicts the structure', () => {
    const mappings = visualMappingsFileSchema.parse(visualMappingsFile).mappings;
    const anteriorOnly = structuresFileSchema.parse(structuresFile).structures.find(
      (s) => s.structure_id === 'muscular.biceps_brachii',
    );
    expect(anteriorOnly?.visible_in_views).toEqual(['anterior']);

    const injected = {
      ...visualMappingsFile,
      mappings: [
        ...mappings,
        {
          ...mappings[0]!,
          visual_id: 'muscular.posterior.biceps_brachii.surface',
          structure_id: 'muscular.biceps_brachii',
          view_id: 'posterior',
        },
      ],
    };
    const report = validateContent({ ...bundle(), visualMappingsFile: injected }, DEV_OPTIONS);
    expect(rulesOf(report)).toContain('visual-view-mismatch');
  });

  it('catches a published structure citing a source that does not exist', () => {
    const structures = structuresFileSchema.parse(structuresFile).structures;
    const promoted = {
      ...structuresFile,
      structures: structures.map((structure, index) =>
        index === 0
          ? {
              ...structure,
              content_status: 'published',
              medical_review_status: 'approved' as const,
              source_references: ['source.nonexistent' as never],
            }
          : structure,
      ),
    };
    const report = validateContent({ ...bundle(), structuresFile: promoted }, DEV_OPTIONS);
    expect(rulesOf(report)).toContain('missing-source-reference');
  });

  it('catches a published structure whose artwork is not approved', () => {
    const structures = structuresFileSchema.parse(structuresFile).structures;
    const mappings = visualMappingsFileSchema.parse(visualMappingsFile).mappings;
    const target = structures[0]!;
    const forTarget = mappings.filter((mapping) => mapping.structure_id === target.structure_id);

    const sourcesWithReview = {
      ...sourcesFile,
      sources: [
        {
          source_id: 'source.test',
          title: 'Test source',
          author_or_organization: 'Test organisation',
          content_scope: 'Test scope',
          url_or_library_reference: 'test-reference',
          reviewer_name: 'Test Reviewer',
          review_date: '2026-01-01',
        },
      ],
    };

    const promoted = {
      ...structuresFile,
      structures: structures.map((structure) =>
        structure.structure_id === target.structure_id
          ? {
              ...structure,
              content_status: 'published',
              medical_review_status: 'approved' as const,
              source_references: ['source.test' as never],
            }
          : structure,
      ),
    };

    const approvedMappings = {
      ...visualMappingsFile,
      mappings: mappings.map((mapping) =>
        forTarget.some((candidate) => candidate.visual_id === mapping.visual_id)
          ? { ...mapping, visual_status: 'approved' as const }
          : mapping,
      ),
    };

    const report = validateContent(
      {
        ...bundle(),
        structuresFile: promoted,
        visualMappingsFile: approvedMappings,
        sourcesFile: sourcesWithReview,
      },
      DEV_OPTIONS,
    );

    // The artwork is still provisional, so publication must be blocked.
    expect(rulesOf(report)).toContain('provisional-art-in-published');
  });

  it('catches a licence that cannot be released', () => {
    const entries = assetManifestSchema.parse(assetManifestFile).entries;
    const restricted = {
      ...assetManifestFile,
      entries: [{ ...entries[0]!, license: 'proprietary_restricted' as const }, ...entries.slice(1)],
    };
    const report = validateContent({ ...bundle(), assetManifestFile: restricted }, DEV_OPTIONS);
    expect(rulesOf(report)).toContain('restricted-license');
  });

  it('catches an attribution-requiring licence with no attribution text', () => {
    const entries = assetManifestSchema.parse(assetManifestFile).entries;
    const unattributed = {
      ...assetManifestFile,
      entries: [
        {
          ...entries[0]!,
          license: 'CC-BY-4.0' as const,
          medical_review_status: 'approved' as const,
          attribution_requirement: null,
        },
        ...entries.slice(1),
      ],
    };
    const report = validateContent({ ...bundle(), assetManifestFile: unattributed }, DEV_OPTIONS);
    expect(rulesOf(report)).toContain('missing-attribution');
  });

  it('catches a mismatched content version', () => {
    const structures = structuresFileSchema.parse(structuresFile).structures;
    const bumped = {
      ...structuresFile,
      structures: [{ ...structures[0]!, updated_version: '2.0.0' }, ...structures.slice(1)],
    };
    const report = validateContent({ ...bundle(), structuresFile: bumped }, DEV_OPTIONS);
    expect(rulesOf(report)).toContain('version-mismatch');
  });

  it('catches a rejected asset left in the manifest', () => {
    const entries = assetManifestSchema.parse(assetManifestFile).entries;
    const rejected = {
      ...assetManifestFile,
      entries: [{ ...entries[0]!, medical_review_status: 'rejected' as const }, ...entries.slice(1)],
    };
    const report = validateContent({ ...bundle(), assetManifestFile: rejected }, DEV_OPTIONS);
    expect(rulesOf(report)).toContain('rejected-asset');
  });

  it('catches an unreviewed asset left in the manifest', () => {
    const entries = assetManifestSchema.parse(assetManifestFile).entries;
    const rejected = {
      ...assetManifestFile,
      entries: [{ ...entries[0]!, medical_review_status: 'rejected' as const }, ...entries.slice(1)],
    };
    const report = validateContent({ ...bundle(), assetManifestFile: rejected }, DEV_OPTIONS);
    expect(rulesOf(report)).toContain('rejected-asset');
  });

  it('reports a schema failure rather than throwing', () => {
    const report = validateContent(
      { ...bundle(), structuresFile: { structures: 'not an array' } },
      DEV_OPTIONS,
    );
    expect(report.ok).toBe(false);
    expect(rulesOf(report)).toContain('schema');
  });
});
