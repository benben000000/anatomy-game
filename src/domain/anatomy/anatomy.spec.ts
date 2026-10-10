import { describe, expect, it } from 'vitest';
import {
  anatomyStructureSchema,
  visualMappingSchema,
  buildVisualMappingIndex,
} from '@/domain/anatomy/anatomy';
import { sourceReferenceSchema, assetManifestEntrySchema } from '@/domain/content/source-reference';
import { quizSessionSchema, answerRecordSchema } from '@/domain/learning/learning';
import { studyProgressSchema } from '@/domain/progress/progress';
import { userSettingsSchema } from '@/domain/settings/user-settings';

/**
 * Schema acceptance and rejection.
 *
 * The rules that belong to a single record — publishing implies sources and an
 * approved review, a small target must declare a fairness affordance, a
 * forgiveness margin must stay small enough not to capture a neighbour — are
 * enforced by these schemas, and are tested here rather than in the
 * cross-record validator.
 */

const validStructure = {
  structure_id: 'muscular.test_structure',
  system_id: 'muscular',
  canonical_name: 'Test structure',
  display_name: 'Test structure',
  structure_type: 'muscle',
  region_ids: ['region.upper_limb.arm'],
  laterality: 'bilateral',
  visible_in_views: ['anterior'],
  difficulty_tier: 'introductory',
  summary: 'A summary long enough to satisfy the minimum length requirement.',
  function_summary: 'A function summary long enough to satisfy the minimum length.',
  source_references: ['source.test'],
  created_version: '1.0.0',
  updated_version: '1.0.0',
} as const;

const validMapping = {
  visual_id: 'muscular.anterior.test_structure.surface',
  structure_id: 'muscular.test_structure',
  representation_type: 'svg_path',
  body_presentation_id: 'neutral_adult_01',
  view_id: 'anterior',
  layer_id: 'layer.superficial',
  asset_path: '/assets/anatomy/muscular/anterior/anterior-muscles.svg',
  element_id: 'muscular.anterior.test_structure.surface',
  selectable: true,
  min_fair_target_px: 120,
  forgiveness_margin_units: 6,
  license_reference: 'commissioned_owned',
} as const;

describe('anatomyStructureSchema', () => {
  it('accepts a well-formed draft structure', () => {
    const parsed = anatomyStructureSchema.parse(validStructure);
    expect(parsed.content_status).toBe('draft');
    expect(parsed.medical_review_status).toBe('provisional');
    expect(parsed.distinction_notes).toEqual([]);
  });

  it('rejects publishing without a source reference', () => {
    const result = anatomyStructureSchema.safeParse({
      ...validStructure,
      source_references: [],
      content_status: 'published',
      medical_review_status: 'approved',
    });
    expect(result.success).toBe(false);
  });

  it('rejects publishing without an approved medical review', () => {
    const result = anatomyStructureSchema.safeParse({
      ...validStructure,
      content_status: 'published',
      medical_review_status: 'pending',
    });
    expect(result.success).toBe(false);
  });

  it('accepts publishing only with both a source and an approved review', () => {
    const result = anatomyStructureSchema.safeParse({
      ...validStructure,
      content_status: 'published',
      medical_review_status: 'approved',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a summary too short to be useful', () => {
    const result = anatomyStructureSchema.safeParse({ ...validStructure, summary: 'Short' });
    expect(result.success).toBe(false);
  });

  it('rejects an identifier that is not lower_snake_case dot-separated', () => {
    const result = anatomyStructureSchema.safeParse({
      ...validStructure,
      structure_id: 'Muscular Test Structure',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown structure type', () => {
    const result = anatomyStructureSchema.safeParse({
      ...validStructure,
      structure_type: 'tentacle',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown content version format', () => {
    const result = anatomyStructureSchema.safeParse({ ...validStructure, updated_version: 'v1' });
    expect(result.success).toBe(false);
  });
});

describe('visualMappingSchema', () => {
  it('accepts a well-formed mapping', () => {
    expect(visualMappingSchema.safeParse(validMapping).success).toBe(true);
  });

  it('rejects a forgiveness margin large enough to capture a neighbour', () => {
    const result = visualMappingSchema.safeParse({
      ...validMapping,
      forgiveness_margin_units: 40,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a sub-44px target with no fairness affordance', () => {
    const result = visualMappingSchema.safeParse({
      ...validMapping,
      min_fair_target_px: 14,
      requires_disambiguation: false,
      forgiveness_margin_units: 2,
      zoom_to_fit: false,
    });
    expect(result.success).toBe(false);
  });

  it('accepts a sub-44px target once disambiguation is declared', () => {
    const result = visualMappingSchema.safeParse({
      ...validMapping,
      min_fair_target_px: 14,
      requires_disambiguation: true,
      forgiveness_margin_units: 2,
      zoom_to_fit: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a sub-44px target with a generous margin', () => {
    const result = visualMappingSchema.safeParse({
      ...validMapping,
      min_fair_target_px: 14,
      requires_disambiguation: false,
      forgiveness_margin_units: 10,
      zoom_to_fit: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an asset path that is not a supported asset type', () => {
    const result = visualMappingSchema.safeParse({
      ...validMapping,
      asset_path: '/assets/notes.txt',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown representation type', () => {
    const result = visualMappingSchema.safeParse({
      ...validMapping,
      representation_type: 'hologram',
    });
    expect(result.success).toBe(false);
  });
});

describe('sourceReferenceSchema', () => {
  const valid = {
    source_id: 'source.test',
    title: 'A test source',
    author_or_organization: 'A test organisation',
    url_or_library_reference: 'library-reference',
    content_scope: 'Muscles of the upper limb',
  };

  it('accepts a source with no reviewer yet', () => {
    expect(sourceReferenceSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a named reviewer with no review date', () => {
    const result = sourceReferenceSchema.safeParse({ ...valid, reviewer_name: 'A Reviewer' });
    expect(result.success).toBe(false);
  });

  it('rejects a review date with no named reviewer', () => {
    const result = sourceReferenceSchema.safeParse({ ...valid, review_date: '2026-01-01' });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed review date', () => {
    const result = sourceReferenceSchema.safeParse({
      ...valid,
      reviewer_name: 'A Reviewer',
      review_date: '01/01/2026',
    });
    expect(result.success).toBe(false);
  });
});

describe('assetManifestEntrySchema', () => {
  const valid = {
    asset_id: 'asset.test',
    file_path: '/assets/anatomy/muscular/anterior/anterior-muscles.svg',
    asset_type: 'svg',
    source_creator: 'A Creator',
    source_url_or_reference: 'a-reference',
    license: 'CC0-1.0',
    medical_review_status: 'approved',
    content_version: '1.0.0',
  };

  it('accepts an approved, licensed asset', () => {
    expect(assetManifestEntrySchema.safeParse(valid).success).toBe(true);
  });

  it('accepts an unset licence but records it as unset', () => {
    const parsed = assetManifestEntrySchema.parse({ ...valid, license: 'UNSET' });
    expect(parsed.license).toBe('UNSET');
  });

  it('rejects an unknown licence value', () => {
    const result = assetManifestEntrySchema.safeParse({ ...valid, license: 'found-on-the-internet' });
    expect(result.success).toBe(false);
  });
});

describe('progress and session schemas', () => {
  it('rejects outcome tallies that exceed total attempts', () => {
    const result = studyProgressSchema.safeParse({
      profile_id: 'profile.test',
      structure_id: 'muscular.test',
      attempts: 1,
      correct_attempts: 5,
      content_version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a streak longer than the number of correct attempts', () => {
    const result = studyProgressSchema.safeParse({
      profile_id: 'profile.test',
      structure_id: 'muscular.test',
      attempts: 3,
      correct_attempts: 0,
      correct_unassisted_streak: 3,
      content_version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a coherent progress record', () => {
    const result = studyProgressSchema.safeParse({
      profile_id: 'profile.test',
      structure_id: 'muscular.test',
      attempts: 3,
      correct_attempts: 2,
      correct_unassisted_streak: 2,
      mastery_score: 0.66,
      box: 3,
      content_version: '1.0.0',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a session with an empty pool', () => {
    const result = quizSessionSchema.safeParse({
      session_id: 'session.test',
      profile_id: 'profile.test',
      config: { mode: 'identify', target_size: 5 },
      pool_structure_ids: [],
      status: 'in_progress',
      started_at: 0,
      pack_version: '1.0.0',
      schema_version: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative elapsed time on a record', () => {
    const result = answerRecordSchema.safeParse({
      question_id: 'q1',
      structure_id: 'muscular.test',
      selected_structure_id: null,
      outcome: 'skipped',
      elapsed_ms: -1,
      view_id: 'anterior',
      question_type: 'locate_named_structure',
      pack_version: '1.0.0',
      recorded_at: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('userSettingsSchema', () => {
  it('defaults sound to off, so audio is never required', () => {
    const settings = userSettingsSchema.parse({});
    expect(settings.sound_enabled).toBe(false);
    expect(settings.timed_challenge_enabled).toBe(false);
    expect(settings.reduce_motion).toBe(false);
  });

  it('rejects an out-of-range volume', () => {
    expect(userSettingsSchema.safeParse({ sound_volume: 2 }).success).toBe(false);
  });
});

describe('buildVisualMappingIndex', () => {
  it('groups selectable mappings by view and by structure', () => {
    const mappings = [
      visualMappingSchema.parse(validMapping),
      visualMappingSchema.parse({
        ...validMapping,
        visual_id: 'muscular.anterior.test_structure.mirror',
        selectable: false,
      }),
    ];

    const index = buildVisualMappingIndex(mappings);

    expect(index.selectableByView.get('anterior')).toHaveLength(1);
    expect(index.byStructureId.get('muscular.test_structure')).toHaveLength(2);
    expect(index.byVisualId.has('muscular.anterior.test_structure.mirror')).toBe(true);
  });
});
