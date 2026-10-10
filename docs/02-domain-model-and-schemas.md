# Phase 0 — Domain Model and Schemas

Status: complete, awaiting approval
Note: this document specifies schemas. The Zod files themselves are created in Phase 2.
Branded IDs are specified here because the adapter contract in Phase 0 depends on them.

---

## 1. Branded identifiers

Display names are never identifiers. Every cross-reference between content, mapping, and
learning logic uses a branded string, so a `StructureId` cannot be passed where a `VisualId`
is expected.

```ts
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type SystemId      = Brand<string, 'SystemId'>;      // "muscular"
export type StructureId   = Brand<string, 'StructureId'>;   // "muscular.biceps_brachii"
export type VisualId      = Brand<string, 'VisualId'>;      // "muscular.anterior.biceps_brachii.surface"
export type ViewId        = Brand<string, 'ViewId'>;        // "anterior" | "posterior"
export type LayerId       = Brand<string, 'LayerId'>;       // "superficial" | "deep"
export type RegionId      = Brand<string, 'RegionId'>;      // "region.upper_limb.arm.anterior"
export type QuestionId    = Brand<string, 'QuestionId'>;
export type TemplateId    = Brand<string, 'TemplateId'>;
export type SourceId      = Brand<string, 'SourceId'>;
export type AssetId       = Brand<string, 'AssetId'>;
export type ProfileId     = Brand<string, 'ProfileId'>;
export type SessionId     = Brand<string, 'SessionId'>;
```

### Naming conventions

```
system_id      <system>                                       "muscular"
structure_id   <system>.<structure_snake_case>                "muscular.rectus_abdominis"
visual_id      <system>.<view>.<structure>.<representation>   "muscular.anterior.rectus_abdominis.surface"
region_id      region.<system_part>.<region>[.<subregion>]    "region.upper_limb.arm.anterior"
```

IDs are **immutable once published**. Renaming a display name never touches an ID. Retiring a
structure sets `content_status: 'retired'`; it does not delete the record, because historical
progress references it.

---

## 2. Content status

The single most important gate in the product.

```ts
export const ContentStatus = z.enum(['draft', 'reviewed', 'published', 'retired']);
export type ContentStatus = z.infer<typeof ContentStatus>;

export const MedicalReviewStatus = z.enum([
  'provisional',      // placeholder or generated; never shippable
  'pending',          // authored, awaiting qualified review
  'approved',         // reviewer signed off; recorded in sources.json
  'rejected',         // reviewer declined; must not ship
]);
```

Transitions, and who may make them:

```
draft ──(author submits)──> reviewed ──(qualified reviewer approves)──> published
  ▲                              │                                        │
  │                    (rejected) ▼                                        ▼
  └────────────────────── draft / rejected                           retired
```

Validator rules that enforce this in code:

1. A structure may only enter a question pool when `content_status === 'published'`.
2. Publishing requires `source_references.length >= 1`.
3. Publishing requires every referenced source to have `reviewer_name` and `review_date`.
4. Publishing requires at least one `visual_mapping` with `selectable: true` and
   `visual_status: 'approved'` for every view listed in `visible_in_views`.
5. `medical_review_status` of every referenced asset must be `approved`.
6. `retired` structures never appear in pools but keep their progress history.

---

## 3. `AnatomySystem`

```ts
export const AnatomySystemSchema = z.object({
  system_id: SystemIdSchema,
  display_name: z.string().min(2).max(80),
  description: z.string().min(10).max(600),
  status: z.enum(['planned', 'authoring', 'in_review', 'released', 'retired']),
  supported_learning_modes: z.array(z.enum([
    'explore', 'identify', 'learn_then_test', 'review', 'timed_challenge',
  ])).min(1),
  default_views: z.array(ViewIdSchema).min(1),
  content_version: ContentVersionSchema,          // "1.0.0"
  future: z.object({
    renderer_baseline: z.enum(['svg_2d']).default('svg_2d'),
    optional_accelerated_renderer: z.literal('webgl').nullable().default(null),
    acceleration_is_optional: z.literal(true),
  }).optional(),
});
```

---

## 4. `AnatomyStructure`

```ts
export const AnatomyStructureSchema = z.object({
  structure_id: StructureIdSchema,
  system_id: SystemIdSchema,
  canonical_name: z.string().min(2).max(80),      // preferred display form
  display_name: z.string().min(2).max(80),
  aliases: z.array(z.string().min(1)).default([]),
  latin_name: z.string().min(2).max(120).nullable().default(null),

  structure_type: z.enum(['muscle', 'muscle_group', 'ligament', 'bone', 'organ', 'vessel', 'nerve']),
  parent_structure_id: StructureIdSchema.nullable().default(null),

  region_ids: z.array(RegionIdSchema).min(1),
  laterality: z.enum(['left', 'right', 'bilateral', 'midline', 'not_applicable']),
  visible_in_views: z.array(ViewIdSchema).min(1),
  difficulty_tier: z.enum(['introductory', 'intermediate', 'advanced']),

  summary: z.string().min(20).max(400),
  function_summary: z.string().min(20).max(400),

  origin_summary: z.string().max(300).nullable().default(null),
  insertion_summary: z.string().max(300).nullable().default(null),
  innervation_summary: z.string().max(300).nullable().default(null),

  action_tags: z.array(z.string().min(2).max(40)).default([]),
  relation_ids: z.array(StructureIdSchema).default([]),

  distinction_notes: z.array(z.object({          // used for incorrect-answer coaching
    against_structure_id: StructureIdSchema,
    note: z.string().min(10).max(240),
  })).default([]),

  source_references: z.array(SourceIdSchema).default([]),
  content_status: ContentStatusSchema.default('draft'),
  review_notes: z.string().max(1000).nullable().default(null),
  created_version: ContentVersionSchema,
  updated_version: ContentVersionSchema,
}).superRefine((s, ctx) => {
  // LD-3 / rule 2: publishing requires sources
  if (s.content_status === 'published' && s.source_references.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['source_references'],
      message: `Structure ${s.structure_id} is published but has no source references.`,
    });
  }
  // Layer rule: a muscle must not be asked on a superficial illustration
  if (s.structure_type === 'muscle' && s.structure_type === 'muscle' && !s.layer_hint) {
    // intentionally non-blocking; layer is carried by VisualMapping
  }
});
```

---

## 5. `VisualMapping` — the heart of the system

This is what makes a 2D SVG, a future canvas region, and a future 3D mesh collider
interchangeable. Learning logic only ever sees `structure_id`.

```ts
export const VisualMappingSchema = z.object({
  visual_id: VisualIdSchema,
  structure_id: StructureIdSchema,

  representation_type: z.enum([
    'svg_path', 'svg_group', 'canvas_region', '3d_mesh', '3d_collider',
  ]),

  body_presentation_id: z.string().min(1),   // "neutral_adult_01" — independent of structure IDs
  view_id: ViewIdSchema,
  layer_id: LayerIdSchema,                    // "layer.superficial"

  asset_path: z.string().regex(/^\/?[\w\-./]+\.(svg|png|webp|glb|gltf)$/),
  element_id: z.string().min(1).nullable(),   // DOM id inside the SVG asset

  selectable: z.boolean(),
  visible_by_default: z.boolean().default(true),

  // Fairness affordances — the board MUST honour these for small targets
  min_fair_target_px: z.number().int().positive().default(0),
  forgiveness_margin_units: z.number().min(0).max(16).default(6),
  requires_disambiguation: z.boolean().default(false),
  zoom_to_fit: z.boolean().default(true),

  // Deterministic tie-break when multiple candidates sit under one point
  selection_priority: z.number().int().min(0).max(1000).default(500),

  occlusion_notes: z.string().max(300).nullable().default(null),
  visual_status: z.enum(['provisional', 'pending', 'approved', 'rejected']).default('provisional'),
  art_source_reference: SourceIdSchema.nullable().default(null),
  license_reference: z.string().min(3).default('UNSET'),
  bounding_box: z.object({
    x: z.number(), y: z.number(), width: z.number().min(1), height: z.number().min(1),
  }).nullable().default(null),               // required for focusStructure() to work well
}).superRefine((m, ctx) => {
  if (m.license_reference === 'UNSET') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['license_reference'],
      message: `Visual ${m.visual_id} has no recorded license reference.`,
    });
  }
  // Small muscles must declare a fairness affordance
  if (m.selectable && m.min_fair_target_px > 0 && m.min_fair_target_px < 44) {
    if (!m.requires_disambiguation && m.forgiveness_margin_units < 8 && !m.zoom_to_fit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['selectable'],
        message:
          `Visual ${m.visual_id} is a sub-44px target with no fairness affordance. ` +
          `Set requires_disambiguation, increase forgiveness_margin_units, or enable zoom_to_fit.`,
      });
    }
  }
});
```

`forgiveness_margin_units` is capped at 16 viewBox units by the schema itself, and further
capped per structure in data. This is the machine-enforced half of design brief C3.

---

## 6. `QuestionTemplate`

```ts
export const QuestionTemplateSchema = z.object({
  template_id: TemplateIdSchema,
  mode: z.enum(['explore', 'identify', 'learn_then_test', 'review', 'timed_challenge']),
  prompt_format: z.enum([
    'locate_named_structure',
    'identify_highlighted_structure',
    'which_structure_performs_action',
    'select_correct_label',
    'compare_nearby_structures',
    'type_structure_name',
    'identify_body_region',
    'identify_origin_insertion',
    'identify_innervation',
    'layer_comparison',
  ]),
  expected_answer_type: z.enum(['structure_id', 'text']),
  valid_structure_types: z.array(z.enum([
    'muscle', 'muscle_group', 'ligament', 'bone', 'organ', 'vessel', 'nerve',
  ])).min(1),
  required_visual_representation: z.enum(['any_selectable', 'svg_only']),
  difficulty_range: z.tuple([
    z.enum(['introductory', 'intermediate', 'advanced']),
    z.enum(['introductory', 'intermediate', 'advanced']),
  ]),
  allowed_views: z.array(ViewIdSchema).min(1),
  distractor_rules: z.object({
    mode: z.enum(['none', 'spatial_neighbours', 'same_region', 'confusable_pairs']),
    max_confusability_risk: z.number().min(0).max(1).default(0),
  }).default({ mode: 'none', max_confusability_risk: 0 }),
  hint_policy: z.object({
    levels: z.array(z.enum(['region', 'approximate_area', 'reveal'])).default([]),
    unlimited: z.literal(true).default(true),
    cost: z.literal('none').default('none'),
  }).default({ levels: ['region', 'approximate_area', 'reveal'], unlimited: true, cost: 'none' }),
  explanation_policy: z.enum(['function_summary', 'location_summary', 'distinction_note', 'combined']),
  implemented: z.boolean().default(false),   // only 'locate_named_structure' is true in v1
});
```

---

## 7. Outcomes

```ts
export const AnswerOutcomeSchema = z.enum([
  'correct',      // correct, unassisted
  'incorrect',
  'skipped',
  'revealed',     // answer was shown by hint level 3
  'assisted',     // correct after hint level 1 or 2
  'abandoned',    // session ended before an answer was committed
]);

export interface AnswerRecord {
  readonly question_id: QuestionId;
  readonly structure_id: StructureId;          // the prompt target
  readonly selected_structure_id: StructureId | null;
  readonly outcome: AnswerOutcome;
  readonly hints_used: HintLevel[];            // ordered, may be []
  readonly elapsed_ms: number;
  readonly view_id: ViewId;
  readonly region_ids: readonly RegionId[];
  readonly question_type: QuestionPromptFormat;
  readonly pack_version: ContentVersion;
  readonly recorded_at: number;
}
```

Invariant enforced by `AnswerEvaluator`: `outcome === 'correct'` requires
`hints_used.length === 0`. Anything else that selected the right structure is `assisted`.
This is LD-8 and is unit-tested.

---

## 8. `StudyProgress`

```ts
export const StudyProgressSchema = z.object({
  profile_id: ProfileIdSchema,
  structure_id: StructureIdSchema,

  attempts: z.number().int().min(0).default(0),
  correct_attempts: z.number().int().min(0).default(0),
  incorrect_attempts: z.number().int().min(0).default(0),
  skipped_attempts: z.number().int().min(0).default(0),
  assisted_attempts: z.number().int().min(0).default(0),
  revealed_attempts: z.number().int().min(0).default(0),

  last_seen_at: z.number().int().nullable().default(null),
  next_review_at: z.number().int().nullable().default(null),
  last_outcome: AnswerOutcomeSchema.nullable().default(null),

  box: z.number().int().min(1).max(5).default(1),
  correct_unassisted_streak: z.number().int().min(0).default(0),
  mastery_score: z.number().min(0).max(1).default(0),

  misconception_tags: z.array(z.string().min(2).max(60)).default([]),
  preferred_view_performance: z.record(ViewIdSchema, ViewPerformance).default({}),
  question_type_performance: z.record(z.string(), QuestionTypePerformance).default({}),
  content_version: ContentVersionSchema,
}).superRefine((p, ctx) => {
  const sum = p.correct_attempts + p.incorrect_attempts + p.skipped_attempts
            + p.assisted_attempts + p.revealed_attempts;
  if (sum > p.attempts) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['attempts'],
      message: 'Outcome tallies exceed total attempts for this structure.',
    });
  }
});
```

### Mastery bands

| `mastery_score` | Band | Learner-facing wording |
| --- | --- | --- |
| 0 | New | "Not seen yet" |
| < 0.34 | Learning | "Seen a few times" |
| < 0.67 | Consolidating | "Recalled correctly without hints, a few times" |
| < 1 | Reliable | "Recalled unassisted across several sessions" |
| 1 | Reliable+ | "Recalled unassisted repeatedly over time" |

The word "mastered" is not used anywhere in the product.

---

## 9. `QuizSession`

```ts
export const QuizSessionSchema = z.object({
  session_id: SessionIdSchema,
  profile_id: ProfileIdSchema,
  mode: z.enum(['identify', 'learn_then_test', 'review', 'timed_challenge']),
  view_filter: z.enum(['anterior', 'posterior', 'mixed']),
  region_filter: z.array(RegionIdSchema).default([]),
  difficulty_filter: z.array(z.enum(['introductory', 'intermediate', 'advanced'])).default([]),
  target_size: z.number().int().min(1).max(200),

  pool_structure_ids: z.array(StructureIdSchema).min(1),
  records: z.array(AnswerRecordSchema).default([]),
  current_question_id: QuestionIdSchema.nullable().default(null),
  current_structure_id: StructureIdSchema.nullable().default(null),
  current_view_id: ViewIdSchema.nullable().default(null),

  status: z.enum(['in_progress', 'completed', 'abandoned']),
  started_at: z.number().int(),
  ended_at: z.number().int().nullable().default(null),

  pack_version: ContentVersionSchema,
  schema_version: z.literal(1),
});
```

`activeSession` holds exactly one record keyed `'current'`, overwritten on every mutation.
This is what makes interruption recovery a read rather than a reconstruction.

---

## 10. `SourceReference`

```ts
export const SourceReferenceSchema = z.object({
  source_id: SourceIdSchema,
  title: z.string().min(3).max(300),
  author_or_organization: z.string().min(2).max(200),
  edition_or_version: z.string().max(120).nullable().default(null),
  publication_year: z.number().int().min(1800).max(2200).nullable().default(null),
  url_or_library_reference: z.string().min(3).max(600),
  accessed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  license_notes: z.string().max(600).nullable().default(null),
  content_scope: z.string().min(3).max(400),
  reviewer_name: z.string().min(2).max(160).nullable().default(null),
  reviewer_credentials: z.string().max(200).nullable().default(null),
  review_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
}).superRefine((s, ctx) => {
  if (s.reviewer_name && !s.review_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['review_date'],
      message: `Source ${s.source_id} names a reviewer but no review date.`,
    });
  }
});
```

**This file must never contain invented entries.** During Phase 2, `sources.json` ships empty
or with clearly-marked placeholders, and the validator reports zero publishable structures.
That is the correct Phase 2 outcome.

---

## 11. `AssetManifestEntry`

```ts
export const AssetManifestEntrySchema = z.object({
  asset_id: AssetIdSchema,
  file_path: z.string().min(3),
  asset_type: z.enum(['svg', 'png', 'webp', 'woff2', 'glb', 'gltf', 'mp3', 'ogg']),
  associated_system_id: SystemIdSchema.nullable().default(null),
  associated_structure_id: StructureIdSchema.nullable().default(null),

  source_creator: z.string().min(2).max(200),
  source_url_or_reference: z.string().min(3).max(600),
  license: z.enum([
    'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0',
    'public_domain', 'proprietary_permitted', 'proprietary_restricted',
    'commissioned_owned', 'UNSET',
  ]),
  attribution_requirement: z.string().max(600).nullable().default(null),
  modification_notes: z.string().max(600).nullable().default(null),

  medical_review_status: z.enum(['provisional', 'pending', 'approved', 'rejected']),
  reviewer: z.string().max(160).nullable().default(null),
  review_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),

  content_version: ContentVersionSchema,
});
```

Validator rules:

- `license: 'UNSET'` blocks any published structure that references the asset.
- `proprietary_restricted` blocks release builds.
- `medical_review_status !== 'approved'` blocks release builds.
- `attribution_requirement` must be non-null when the license requires attribution, and the
  Credits view renders it verbatim.

---

## 12. `ContentPackManifest`

```ts
export const ContentPackManifestSchema = z.object({
  pack_id: SystemIdSchema,                    // "muscular"
  pack_version: ContentVersionSchema,
  built_at: z.string(),
  structure_count: z.number().int().min(0),
  published_structure_count: z.number().int().min(0),
  views: z.array(ViewIdSchema),
  regions: z.array(RegionIdSchema),
  asset_ids: z.array(AssetIdSchema),
  files: z.array(z.object({
    path: z.string(),
    sha256: z.string().length(64).optional(),
    bytes: z.number().int().nonnegative().optional(),
  })),
  content_status_summary: z.object({
    draft: z.number().int().min(0),
    reviewed: z.number().int().min(0),
    published: z.number().int().min(0),
    retired: z.number().int().min(0),
  }),
});
```

This file is copied to `public/content-manifest.json` so the client can check for a newer
pack without a backend (design brief C4).

---

## 13. `UserSettings`

```ts
export const UserSettingsSchema = z.object({
  schema_version: z.literal(1),
  reduced_motion: z.boolean().default(false),
  sound_enabled: z.boolean().default(false),          // default OFF: never make audio required
  labels_visible_explore: z.boolean().default(true),
  haptic_feedback: z.boolean().default(true),
  default_view: ViewIdSchema.default('anterior'),
  timed_challenge_enabled: z.boolean().default(false),
  scheduled_review_enabled: z.boolean().default(true),
});
```

`reduce motion` reads both the OS setting and this preference; the OS setting is a hard floor
that the user cannot switch off in-app.

---

## 14. Validation rules index

The `ContentValidator` runs these as named rules so failures are actionable rather than a
stack trace.

| Rule | Checks |
| --- | --- |
| `duplicate-structure-id` | unique `structure_id` |
| `duplicate-visual-id` | unique `visual_id` |
| `duplicate-template-id` | unique `template_id` |
| `duplicate-source-id` | unique `source_id` |
| `missing-system` | `system_id` resolves |
| `dangling-parent` | `parent_structure_id` resolves |
| `dangling-region` | every `region_id` resolves in `regions.json` |
| `missing-source` | published structure has ≥ 1 source |
| `source-review-missing` | referenced source has reviewer + review date |
| `published-without-selectable-visual` | ≥ 1 selectable approved mapping per `visible_in_views` entry |
| `orphan-visual-mapping` | `structure_id` resolves |
| `visual-view-mismatch` | mapping `view_id` ∈ structure `visible_in_views` |
| `invalid-asset-path` | asset path matches a known file and is in the manifest |
| `missing-license-entry` | asset in manifest with a real license |
| `provisional-art-in-published` | published structure references an asset that is not `approved` |
| `restricted-license-in-release` | `proprietary_restricted` in a release build |
| `invalid-representation` | `representation_type` known for this renderer |
| `unfair-small-target` | sub-44 px target with no fairness affordance |
| `ambiguous-overlap` | two selectable mappings overlap with neither `requires_disambiguation` nor distinct `selection_priority` |
| `layer-inconsistency` | deep-layer structure mapped onto a superficial-only illustration |
| `draft-in-question-pool` | pool contains a non-published structure |
| `unaskable-target` | pool target has no selectable mapping in the round's view |
| `template-unsupported-view` | template `allowed_views` not covered by any mapping |
| `laterality-mismatch` | mapping laterality contradicts structure laterality where data supports the check |

Output is a `ValidationReport`:

```ts
interface ValidationReport {
  readonly ok: boolean;
  readonly errors:   ReadonlyArray<{ rule: string; path: string; message: string }>;
  readonly warnings: ReadonlyArray<{ rule: string; path: string; message: string }>;
  readonly stats: {
    systems: number; structures: number; published: number;
    mappings: number; selectable: number; approvedAssets: number;
  };
}
```

`ok: false` fails the build. Warnings are reported in development and in the debug panel.

---

## 15. Example content records (structural examples only)

These show shape. **They are not anatomical content.** Values are deliberately generic
placeholders, marked `draft`, with empty sources, which the validator rejects for publication
— exactly as it should.

```json
// data/systems/muscular/structures.json
{
  "$schema": "./structures.schema.json",
  "system_id": "muscular",
  "content_version": "1.0.0",
  "structures": [
    {
      "structure_id": "muscular.example_placeholder",
      "system_id": "muscular",
      "canonical_name": "Example placeholder",
      "display_name": "Example placeholder",
      "aliases": [],
      "latin_name": null,
      "structure_type": "muscle",
      "parent_structure_id": null,
      "region_ids": ["region.upper_limb.arm.anterior"],
      "laterality": "bilateral",
      "visible_in_views": ["anterior"],
      "difficulty_tier": "introductory",
      "summary": "PLACEHOLDER — replace with a reviewed summary before publication.",
      "function_summary": "PLACEHOLDER — replace with a reviewed function summary before publication.",
      "origin_summary": null,
      "insertion_summary": null,
      "innervation_summary": null,
      "action_tags": [],
      "relation_ids": [],
      "distinction_notes": [],
      "source_references": [],
      "content_status": "draft",
      "review_notes": "Structural example only. Not anatomical content. Not publishable.",
      "created_version": "1.0.0",
      "updated_version": "1.0.0"
    }
  ]
}
```

```json
// data/systems/muscular/visual-mappings.json
{
  "system_id": "muscular",
  "content_version": "1.0.0",
  "mappings": [
    {
      "visual_id": "muscular.anterior.example_placeholder.surface",
      "structure_id": "muscular.example_placeholder",
      "representation_type": "svg_path",
      "body_presentation_id": "neutral_adult_01",
      "view_id": "anterior",
      "layer_id": "layer.superficial",
      "asset_path": "/assets/anatomy/muscular/anterior/anterior-muscles.svg",
      "element_id": "muscular.anterior.example_placeholder.surface",
      "selectable": true,
      "visible_by_default": true,
      "min_fair_target_px": 12,
      "forgiveness_margin_units": 10,
      "requires_disambiguation": true,
      "zoom_to_fit": true,
      "selection_priority": 500,
      "occlusion_notes": null,
      "visual_status": "provisional",
      "art_source_reference": null,
      "license_reference": "UNSET",
      "bounding_box": { "x": 0, "y": 0, "width": 0, "height": 0 }
    }
  ]
}
```

Expected validator output for this state:

```
ok: false
errors:
  - [license-entry] /assets/anatomy/muscular/anterior/anterior-muscles.svg
        Asset is not present in asset-manifest.json with a verified license.
  - [provisional-art-in-published] (not yet triggered; content is draft)
  - [published-count] muscular: 0 publishable structures.
        sources.json contains no approved sources. This is the correct
        state until a qualified anatomy reviewer signs off. See
        docs/05-content-review-workflow.md.
```
