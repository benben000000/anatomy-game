import { describe, expect, it } from 'vitest';
import { validateContent, type ContentBundle, type ValidateOptions } from './ContentValidator';
import { threeDMappingsFileSchema } from '@/domain/anatomy/three-d-mapping';

import systemFile from '@/data/systems/muscular/anatomy-system.json';
import regionsFile from '@/data/systems/muscular/regions.json';
import structuresFile from '@/data/systems/muscular/structures.json';
import visualMappingsFile from '@/data/systems/muscular/visual-mappings.json';
import questionTemplatesFile from '@/data/systems/muscular/question-templates.json';
import sourcesFile from '@/data/systems/muscular/sources.json';
import assetManifestFile from '@/data/manifests/asset-manifest.json';
import threeDMappingsFile from '@/data/systems/muscular/three-d-visual-mappings.json';
import threeDPackManifestFile from '@/models/open3dmodel/muscular-3d-pack.manifest.json';

/**
 * The 3D validation rules.
 *
 * Each test asserts one rule that exists to stop a specific, realistic failure.
 * They use the shipped 3D data as the baseline and perturb only the thing under
 * test, so a rule that silently stops firing is caught.
 */

const DEV_OPTIONS = { provisionalArt: true, allowDraftContent: true } as const;
const RELEASE_OPTIONS = { provisionalArt: false, allowDraftContent: false } as const;

function bundle(overrides: Partial<ContentBundle> = {}): ContentBundle {
  return {
    systemFile,
    regionsFile,
    structuresFile,
    visualMappingsFile,
    questionTemplatesFile,
    sourcesFile,
    assetManifestFile,
    threeDMappingsFile,
    threeDPackManifestFile,
    ...overrides,
  };
}

/** A structurally valid copy of the mappings file, for the caller to perturb. */
function mappings(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...(threeDMappingsFile as Record<string, unknown>), ...overrides };
}

const firstMapping = () => ({ ...(threeDMappingsFile as { mappings: unknown[] }).mappings[0] as object });

function errorsFor(
  overrides: Partial<ContentBundle>,
  options: ValidateOptions = DEV_OPTIONS,
) {
  return validateContent(bundle(overrides), options).errors;
}

function hasRule(errors: readonly { rule: string }[], rule: string) {
  return errors.some((error) => error.rule === rule);
}

describe('3D validation is opt-in', () => {
  it('validates a pack that contains no 3D at all', () => {
    // Optional inputs must stay optional: 2D-only content must not break.
    const report = validateContent(
      bundle({ threeDMappingsFile: undefined, threeDPackManifestFile: undefined }),
      DEV_OPTIONS,
    );
    expect(report.errors.some((e) => e.rule.startsWith('3d-'))).toBe(false);
  });

  it('passes on the shipped 3D data', () => {
    const errors = errorsFor({});
    expect(errors.filter((e) => e.rule.startsWith('3d-'))).toEqual([]);
  });
});

describe('3d-mapping-unknown-structure', () => {
  it('rejects a mapping pointing at a structure that does not exist', () => {
    const errors = errorsFor({
      threeDMappingsFile: mappings({
        mappings: [{ ...firstMapping(), structure_id: 'muscular.not_a_real_muscle' }],
      }),
    });

    expect(hasRule(errors, '3d-mapping-unknown-structure')).toBe(true);
  });

  it('rejects a mapping that silently disagrees with the 2D source of truth', () => {
    // Typos in structure ids are the failure this catches: the mapping would
    // otherwise validate and then never resolve to anything.
    const errors = errorsFor({
      threeDMappingsFile: mappings({
        mappings: [{ ...firstMapping(), structure_id: 'muscular.deltiod' }],
      }),
    });
    expect(hasRule(errors, '3d-mapping-unknown-structure')).toBe(true);
  });
});

describe('3d-mapping-unknown-pack', () => {
  it('rejects a mapping referring to a pack the manifest does not declare', () => {
    const errors = errorsFor({
      threeDMappingsFile: mappings({
        mappings: [{ ...firstMapping(), model_pack_id: 'open3dmodel.does_not_exist' }],
      }),
    });
    expect(hasRule(errors, '3d-mapping-unknown-pack')).toBe(true);
  });
});

describe('3d-node-claimed-twice', () => {
  it('rejects two mappings claiming one mesh node', () => {
    const errors = errorsFor({
      threeDMappingsFile: mappings({
        mappings: [
          firstMapping(),
          {
            ...firstMapping(),
            visual_id: 'muscular.3d.conflict.surface',
            structure_id: 'muscular.pectoralis_major',
          },
        ],
      }),
    });

    expect(hasRule(errors, '3d-node-claimed-twice')).toBe(true);
  });
});

describe('an overlay part is never selectable as a whole muscle', () => {
  it('refuses a mapping whose overlay parts claim they are always visible', () => {
    // The mapping schema rejects this before any cross-file rule runs, which is
    // the stronger place to catch it: the file never becomes loadable content.
    const result = threeDMappingsFileSchema.safeParse(
      mappings({ mappings: [{ ...firstMapping(), occlusion_policy: 'always' }] }),
    );
    expect(result.success).toBe(false);
  });

  it('accepts an overlay mapping that declares itself peelable', () => {
    const result = threeDMappingsFileSchema.safeParse(
      mappings({ mappings: [{ ...firstMapping(), occlusion_policy: 'peel' }] }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects the whole content pack, not just the mapping file', () => {
    // Belt and braces: even if the schema were relaxed, validation must not pass.
    const report = validateContent(
      bundle({
        threeDMappingsFile: mappings({ mappings: [{ ...firstMapping(), occlusion_policy: 'always' }] }),
      }),
      DEV_OPTIONS,
    );
    expect(report.ok).toBe(false);
  });
});

describe('3d-mapping-ahead-of-structure', () => {
  it('rejects a published 3D mapping on an unpublished structure', () => {
    const errors = errorsFor({
      threeDMappingsFile: mappings({
        mappings: [
          {
            ...firstMapping(),
            mapping_status: 'published',
            reviewer: 'A Reviewer',
            review_date: '2026-01-01',
            fair_target_radius_m: 0.02,
            content_source_references: ['source.any'],
          },
        ],
      }),
    });

    expect(hasRule(errors, '3d-mapping-ahead-of-structure')).toBe(true);
  });
});

describe('3d-pack-missing-manifest-entry', () => {
  it('rejects a pack with no asset manifest entry', () => {
    const manifest = threeDPackManifestFile as { packs: { asset_path: string }[] };
    const errors = errorsFor({
      threeDPackManifestFile: {
        ...threeDPackManifestFile,
        packs: manifest.packs.map((pack) => ({ ...pack, asset_path: '/somewhere/else.glb' })),
      },
    });

    expect(hasRule(errors, '3d-pack-missing-manifest-entry')).toBe(true);
  });
});

describe('3d-pack-licence-unset', () => {
  it('warns in a development build so the block is visible while working', () => {
    const report = validateContent(bundle({}), DEV_OPTIONS);
    expect(hasRule(report.warnings, '3d-pack-licence-unset')).toBe(true);
  });

  it('becomes an error in a release build', () => {
    // A licence that is merely unset may be tolerated while developing. It may
    // never be tolerated in a release, where it would ship unverified terms.
    const report = validateContent(bundle({}), RELEASE_OPTIONS);
    expect(hasRule(report.errors, '3d-pack-licence-unset')).toBe(true);
  });

  it('stops complaining once the licence is actually recorded', () => {
    const entries = (assetManifestFile as { entries: Record<string, unknown>[] }).entries.map(
      (entry) =>
        entry.file_path?.toString().startsWith('/private-models/')
          ? { ...entry, license: 'CC-BY-SA-4.0' }
          : entry,
    );

    const report = validateContent(
      bundle({ assetManifestFile: { ...(assetManifestFile as object), entries } }),
      DEV_OPTIONS,
    );

    expect(hasRule(report.warnings, '3d-pack-licence-unset')).toBe(false);
  });
});

describe('3d-verified-pack-without-attribution', () => {
  it('rejects a verified pack whose manifest entry states no attribution', () => {
    // Clear the attribution text on the matching manifest entries, and give the
    // packs a real licence, so this rule is the only one that can fire.
    const entries = (assetManifestFile as { entries: Record<string, unknown>[] }).entries.map(
      (entry) =>
        entry.file_path?.toString().startsWith('/private-models/')
          ? { ...entry, license: 'CC-BY-SA-4.0', attribution_requirement: null }
          : entry,
    );

    const manifest = threeDPackManifestFile as { packs: Record<string, unknown>[] };
    const errors = errorsFor(
      {
        assetManifestFile: { ...(assetManifestFile as object), entries },
        threeDPackManifestFile: {
          ...threeDPackManifestFile,
          packs: manifest.packs.map((pack) => ({
            ...pack,
            integration_status: 'verified',
          })),
        },
      },
      RELEASE_OPTIONS,
    );

    expect(hasRule(errors, '3d-verified-pack-without-attribution')).toBe(true);
  });

  it('does not complain about the shipped packs, which do carry attribution', () => {
    const manifest = threeDPackManifestFile as { packs: Record<string, unknown>[] };
    const errors = errorsFor(
      {
        threeDPackManifestFile: {
          ...threeDPackManifestFile,
          packs: manifest.packs.map((pack) => ({ ...pack, integration_status: 'verified' })),
        },
      },
      DEV_OPTIONS,
    );

    expect(hasRule(errors, '3d-verified-pack-without-attribution')).toBe(false);
  });
});

describe('mapping file shape', () => {
  it('rejects a mappings file that is not an array of mappings', () => {
    const result = threeDMappingsFileSchema.safeParse({ mappings: 'nope' });
    expect(result.success).toBe(false);
  });

  it('rejects a mapping with no structure id', () => {
    const { structure_id: _removed, ...withoutStructure } = firstMapping() as Record<string, unknown>;
    const result = threeDMappingsFileSchema.safeParse({ mappings: [withoutStructure] });
    expect(result.success).toBe(false);
  });
});