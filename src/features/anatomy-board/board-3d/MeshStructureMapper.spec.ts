import { describe, expect, it } from 'vitest';
import {
  MeshStructureMapper,
  auditMappings,
  computePackAvailability,
  normaliseMeshName,
  resolveRaycastHits,
  structuresNeedingTwoDimensionalFallback,
  unavailableMessage,
} from './MeshStructureMapper';
import { threeDVisualMappingSchema, type ThreeDVisualMapping } from '@/domain/anatomy/three-d-mapping';
import { threeDMappingsFile } from './threeDMappings';

/**
 * Mesh mapping against the REAL node names read from the published GLB packs.
 *
 * These tests deliberately use the verified names — "Deltoid muscle.r",
 * "Acromial part of deltoid muscle.r" — rather than tidy invented ones, because
 * the whole point of the mapping layer is that it copes with the source
 * project's real naming conventions.
 */

const realMappings = threeDMappingsFile.mappings;

function mapper(allowOverlaySelection = false): MeshStructureMapper {
  return new MeshStructureMapper({ mappings: realMappings, allowOverlaySelection });
}

describe('three.js name sanitisation', () => {
  /*
   * Regression test for the bug that made the whole renderer inert.
   *
   * three.js rewrites glTF node names through
   * PropertyBinding.sanitizeNodeName: whitespace becomes "_" and the characters
   * [ ] . : / are deleted. "Deltoid muscle.r" therefore arrives as
   * "Deltoid_muscler".
   *
   * The allowlist is written with the real anatomical spelling, so exact
   * matching found nothing. The model rendered and the board reported zero
   * structures — visible, and completely dead to touch.
   */
  const cases: readonly [string, string][] = [
    ['Deltoid muscle.r', 'Deltoid_muscler'],
    ['Long head of triceps brachii.r', 'Long_head_of_triceps_brachiir'],
    ['Serratus anterior muscle.r', 'Serratus_anterior_muscler'],
    ['Pectoralis major.r', 'Pectoralis_majorr'],
    ['Trapezius muscle.r', 'Trapezius_muscler'],
    ['Rectus femoris.r', 'Rectus_femorisr'],
  ];

  for (const [anatomical, asThreeSeesIt] of cases) {
    it(`resolves "${anatomical}" under the name three.js reports`, () => {
      expect(normaliseMeshName(anatomical)).toBe(asThreeSeesIt);
      const result = mapper().resolveNode(asThreeSeesIt);
      expect(result).not.toBeNull();
      expect(result?.selectable).toBe(true);
    });

    it(`still resolves "${anatomical}" under its real spelling`, () => {
      expect(mapper().resolveNode(anatomical)?.selectable).toBe(true);
    });
  }

  it('leaves the laterality suffix distinguishable', () => {
    // The sanitiser strips the dot, so right and left must not collide. If they
    // ever did, a tap could silently select the wrong side.
    const right = normaliseMeshName('Deltoid muscle.r');
    const left = normaliseMeshName('Deltoid muscle.l');
    expect(right).not.toBe(left);
  });

  it('does not merge genuinely different structures', () => {
    // Guards against a future "normalise more aggressively" change.
    const names = [
      'Biceps brachii.r',
      'Brachialis muscle.r',
      'Brachioradialis muscle.r',
      'Biceps tendon sheath.r',
    ].map(normaliseMeshName);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('MeshStructureMapper against real node names', () => {
  it('resolves a whole-muscle node to its stable structure id', () => {
    const result = mapper().resolveNode('Deltoid muscle.r');
    expect(result?.structureId).toBe('muscular.deltoid');
    expect(result?.selectable).toBe(true);
  });

  it('resolves a part node to the same structure as its parent', () => {
    const parent = mapper().resolveNode('Deltoid muscle.r');
    const part = mapper(true).resolveNode('Clavicular part of deltoid muscle.r');

    expect(parent?.structureId).toBe('muscular.deltoid');
    expect(part?.structureId).toBe('muscular.deltoid');
  });

  it('leaves overlay parts inert by default', () => {
    // Selecting "the clavicular head" must not silently answer for "the deltoid".
    const result = mapper().resolveNode('Clavicular part of deltoid muscle.r');
    expect(result?.selectable).toBe(false);
    expect(result?.structureId).toBeNull();
  });

  it('enables overlay parts only when explicitly asked', () => {
    const result = mapper(true).resolveNode('Clavicular part of deltoid muscle.r');
    expect(result?.selectable).toBe(true);
    expect(result?.structureId).toBe('muscular.deltoid');
  });

  it('maps several heads of one muscle to one structure', () => {
    for (const nodeName of [
      'Long head of triceps brachii.r',
      'Lateral head of triceps brachii.r',
      'Medial head of triceps brachii.r',
    ]) {
      expect(mapper().resolveNode(nodeName)?.structureId).toBe('muscular.triceps_brachii');
    }
  });

  it('refuses to map a tendon or bursa to its muscle', () => {
    // These exist in the pack and are near the muscles. Mapping them would let a
    // learner be marked wrong for tapping a tendon when asked for the muscle.
    for (const nodeName of [
      'Common tendon of biceps brachii.r',
      'Common tendon of triceps brachii.r',
      'Subtendinous bursa of triceps brachii.r',
      'Subacromial-subdeltoid bursa.r',
      'Tibialis anterior tendon sheath.r',
      'Long head of biceps brachii tendon sheath.r',
    ]) {
      expect(mapper().resolveNode(nodeName)).toBeNull();
    }
  });

  it('resolves nothing for a node it has never seen', () => {
    expect(mapper().resolveNode('Something nobody mapped')).toBeNull();
  });

  it('reports selectable node names for a raycast whitelist', () => {
    const names = mapper().selectableNodeNames();
    expect(names).toContain('Deltoid muscle.r');
    expect(names).not.toContain('Clavicular part of deltoid muscle.r');
  });

  it('lists structures available in a given view', () => {
    const anterior = mapper().structureIdsForView('anterior');
    expect(anterior).toContain('muscular.rectus_femoris');
    const posterior = mapper().structureIdsForView('posterior');
    expect(posterior).toContain('muscular.gluteus_maximus');
  });
});

describe('raycast resolution reuses the 2D rule', () => {
  it('selects when a raycast strikes exactly one muscle', () => {
    const outcome = resolveRaycastHits(['Soleus muscle.r'], mapper());
    expect(outcome.resolution).toBe('direct');
    expect(outcome.selected?.structureId).toBe('muscular.soleus');
  });

  it('asks rather than guesses when the raycast strikes two structures', () => {
    // The calf genuinely has two muscles under one point in a real model. The
    // honest answer is to ask, not to pick whichever happened to render first.
    const outcome = resolveRaycastHits(
      ['Lateral head of gastrocnemius.r', 'Soleus muscle.r'],
      mapper(),
    );
    expect(outcome.needsDisambiguation).toBe(true);
    expect(outcome.candidates).toHaveLength(2);
  });

  it('ignores unmapped nodes without producing a false answer', () => {
    const outcome = resolveRaycastHits(
      ['Ulnar nerve.r', 'Radial bone.r', 'Common tendon of biceps brachii.r'],
      mapper(),
    );
    expect(outcome.selected).toBeNull();
    expect(outcome.candidates).toHaveLength(0);
  });

  it('never names a raw mesh identifier in its candidates', () => {
    const outcome = resolveRaycastHits(
      ['Long head of gastrocnemius.r', 'Soleus muscle.r'],
      mapper(),
    );
    for (const candidate of outcome.candidates) {
      expect(candidate.structureId).toMatch(/^muscular\./);
      expect(candidate.visualId).toMatch(/^muscular\.3d\./);
    }
  });
});

describe('mapping schema rejects unsafe publications', () => {
  const base = realMappings[0]!;

  it('refuses to publish without a reviewer', () => {
    const result = threeDVisualMappingSchema.safeParse({
      ...base,
      mapping_status: 'published',
      reviewer: null,
      review_date: null,
    });
    expect(result.success).toBe(false);
  });

  it('refuses to publish without a measured tap radius', () => {
    const result = threeDVisualMappingSchema.safeParse({
      ...base,
      mapping_status: 'published',
      reviewer: 'A Reviewer',
      review_date: '2026-01-01',
      fair_target_radius_m: null,
    });
    expect(result.success).toBe(false);
  });

  it('refuses to publish without an educational source', () => {
    const result = threeDVisualMappingSchema.safeParse({
      ...base,
      mapping_status: 'published',
      reviewer: 'A Reviewer',
      review_date: '2026-01-01',
      fair_target_radius_m: 0.02,
      content_source_references: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a fully evidenced publication', () => {
    const result = threeDVisualMappingSchema.safeParse({
      ...base,
      mapping_status: 'published',
      reviewer: 'A Reviewer',
      review_date: '2026-01-01',
      fair_target_radius_m: 0.02,
      content_source_references: ['source.test'],
    });
    expect(result.success).toBe(true);
  });

  it('refuses an overlay mapping that claims it is always visible', () => {
    // An overlay sits on top of its parent. Selecting it answering for the
    // parent would silently accept a wrong structure.
    const result = threeDVisualMappingSchema.safeParse({
      ...base,
      parts: [{ node_name: 'Overlay part.r', is_parent_overlay: true, selection_priority: 400 }],
      occlusion_policy: 'always',
    });
    expect(result.success).toBe(false);
  });

  it('refuses the same node listed twice', () => {
    const result = threeDVisualMappingSchema.safeParse({
      ...base,
      parts: [
        { node_name: 'Same.r', is_parent_overlay: false, selection_priority: 500 },
        { node_name: 'Same.r', is_parent_overlay: false, selection_priority: 400 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('refuses a mapping with no parts', () => {
    const result = threeDVisualMappingSchema.safeParse({ ...base, parts: [] });
    expect(result.success).toBe(false);
  });
});

describe('node auditing', () => {
  const realNodeNames = [
    'Deltoid muscle.r',
    'Acromial part of deltoid muscle.r',
    'Clavicular part of deltoid muscle.r',
    'Spinal part of deltoid muscle.r',
    'Rectus femoris.r',
    'Something unrelated',
  ];

  it('reports a mapping referring to a node the pack no longer has', () => {
    // Simulates a re-export that renames nodes.
    const reduced = realNodeNames.filter((name) => name !== 'Rectus femoris.r');
    const findings = auditMappings(realMappings, 'open3dmodel.lower_limb.v1', reduced);

    expect(findings.some((finding) => finding.kind === 'missing-node')).toBe(true);
    expect(findings.some((finding) => finding.nodeName === 'Rectus femoris.r')).toBe(true);
  });

  it('reports two mappings claiming one node', () => {
    const conflicting: ThreeDVisualMapping = threeDVisualMappingSchema.parse({
      ...realMappings[0]!,
      visual_id: 'muscular.3d.conflict.surface',
      parts: [{ node_name: 'Deltoid muscle.r', is_parent_overlay: false, selection_priority: 500 }],
      occlusion_policy: 'always',
    });

    const findings = auditMappings(
      [realMappings[0]!, conflicting],
      'open3dmodel.upper_limb.v1',
      realNodeNames,
    );

    expect(findings.some((finding) => finding.kind === 'duplicate-node-claim')).toBe(true);
  });

  it('reports nodes in the pack that no mapping claims', () => {
    const findings = auditMappings([], 'open3dmodel.upper_limb.v1', realNodeNames);
    const unmapped = findings.filter((finding) => finding.kind === 'unmapped-node');
    expect(unmapped.length).toBeGreaterThan(0);
  });

  it('reports selectable parts sharing a selection priority', () => {
    // Two overlapping parts with identical priority cannot resolve
    // deterministically, so the tap would depend on render order.
    const ambiguous: ThreeDVisualMapping = threeDVisualMappingSchema.parse({
      ...realMappings[0]!,
      visual_id: 'muscular.3d.ambiguous.surface',
      parts: [
        { node_name: 'A.r', is_parent_overlay: false, selection_priority: 500 },
        { node_name: 'B.r', is_parent_overlay: false, selection_priority: 500 },
      ],
      occlusion_policy: 'always',
    });

    const findings = auditMappings([ambiguous], 'open3dmodel.upper_limb.v1', ['A.r', 'B.r']);
    expect(findings.some((finding) => finding.kind === 'conflicting-priority')).toBe(true);
  });
});

describe('pack availability', () => {
  const packs = [
    {
      modelPackId: 'blocked',
      displayName: 'Blocked',
      assetPath: '/a.glb',
      sizeBytes: 1,
      requiresDraco: true,
      integrationStatus: 'blocked-pending-licence' as const,
    },
    {
      modelPackId: 'verified',
      displayName: 'Verified',
      assetPath: '/b.glb',
      sizeBytes: 2,
      requiresDraco: true,
      integrationStatus: 'verified' as const,
    },
  ];

  const published = (packId: string): ThreeDVisualMapping =>
    threeDVisualMappingSchema.parse({
      ...realMappings[0]!,
      visual_id: `muscular.3d.${packId}.surface`,
      model_pack_id: packId,
      mapping_status: 'published',
      reviewer: 'A Reviewer',
      review_date: '2026-01-01',
      fair_target_radius_m: 0.02,
      content_source_references: ['source.test'],
    });

  it('offers nothing while every pack is licence-blocked', () => {
    const availability = computePackAvailability({
      packs: [
        {
          modelPackId: 'blocked-a',
          displayName: 'A',
          assetPath: '/a.glb',
          sizeBytes: 1,
          requiresDraco: true,
          integrationStatus: 'blocked-pending-licence',
        },
        {
          modelPackId: 'blocked-b',
          displayName: 'B',
          assetPath: '/b.glb',
          sizeBytes: 2,
          requiresDraco: true,
          integrationStatus: 'blocked-pending-licence',
        },
      ],
      mappings: [],
      isPackCachedLocally: () => true,
    });
    expect(availability.hasAnyUsablePack).toBe(false);
    expect(availability.allPacksLicenceBlocked).toBe(true);
    expect(availability.blockedByLicence).toHaveLength(2);
  });

  it('treats a verified pack with only draft mappings as unusable', () => {
    // This is the safeguard that stops 3D shipping before anyone reviewed it.
    const availability = computePackAvailability({
      packs,
      mappings: [realMappings[0]!],
      isPackCachedLocally: () => true,
    });
    expect(availability.usable).toHaveLength(0);
    expect(availability.blockedByMapping).toContain('verified');
  });

  it('offers a verified, published, cached pack', () => {
    const availability = computePackAvailability({
      packs,
      mappings: [published('verified')],
      isPackCachedLocally: () => true,
    });
    expect(availability.usable).toHaveLength(1);
    expect(availability.usable[0]?.modelPackId).toBe('verified');
  });

  it('does not offer a verified pack that is not cached locally', () => {
    const availability = computePackAvailability({
      packs,
      mappings: [published('verified')],
      isPackCachedLocally: () => false,
    });
    expect(availability.usable).toHaveLength(0);
  });
});

describe('learner-facing messages', () => {
  it('separates what the learner can fix from what they cannot', () => {
    expect(unavailableMessage('no-cached-pack').canUserFix).toBe(true);
    expect(unavailableMessage('reduced-data-saver').canUserFix).toBe(true);
    expect(unavailableMessage('pack-licence-blocked').canUserFix).toBe(false);
    expect(unavailableMessage('no-webgl').canUserFix).toBe(false);
  });

  it('tells the learner a licence block is not a connection problem', () => {
    const message = unavailableMessage('pack-licence-blocked');
    expect(message.detail).toMatch(/licensing decision/i);
    expect(message.detail).not.toMatch(/connect to the internet/i);
  });

  it('never describes the model as public domain or merely open source', () => {
    for (const reason of [
      'no-cached-pack',
      'pack-licence-blocked',
      'no-webgl',
      'reduced-data-saver',
      'insufficient-performance',
    ] as const) {
      const text = `${unavailableMessage(reason).headline} ${unavailableMessage(reason).detail}`;
      expect(text.toLowerCase()).not.toContain('public domain');
      expect(text.toLowerCase()).not.toMatch(/\bopen source\b/);
    }
  });
});

describe('2D fallback coverage', () => {
  it('names the structures that have no 3D counterpart', () => {
    const all = [
      'muscular.deltoid',
      'muscular.pectoralis_major',
      'muscular.rectus_abdominis',
      'muscular.frontalis',
      'muscular.erector_spinae',
    ];
    const uncovered = structuresNeedingTwoDimensionalFallback(all, mapper());

    expect(uncovered).toContain('muscular.rectus_abdominis');
    expect(uncovered).toContain('muscular.frontalis');
    expect(uncovered).toContain('muscular.erector_spinae');
    expect(uncovered).not.toContain('muscular.deltoid');
    expect(uncovered).not.toContain('muscular.pectoralis_major');
  });
});