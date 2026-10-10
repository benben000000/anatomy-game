# Content Authoring Guide

How to take a muscle from nothing to something a learner can be asked about.

---

## 1. The one rule that governs everything

**A structure is invisible to learners until `content_status` is `published`, and it cannot
be published without a source reference, an approved medical review, a selectable visual
mapping for every view it may be asked in, and a recorded licence for the artwork it points
at.**

This is enforced mechanically by `ContentValidator`, not by discipline. If you are unsure
whether something is allowed, run:

```bash
npm run validate:content
```

The report names the failing rule, the path, and what to change.

---

## 2. Files you will touch

| File | What it holds |
| --- | --- |
| `src/data/systems/muscular/structures.json` | The anatomy itself: names, descriptions, status |
| `src/data/systems/muscular/visual-mappings.json` | How each structure is drawn and hit |
| `src/data/systems/muscular/regions.json` | The region vocabulary |
| `src/data/systems/muscular/sources.json` | Educational citations. **Currently empty** |
| `src/data/manifests/asset-manifest.json` | Artwork provenance and licences |
| `src/features/anatomy-board/board-2d-svg/provisional-geometry.data.ts` | Placeholder geometry, generated |

Generated files (`provisional-geometry.data.ts`, `region-descriptions.data.ts`) are produced
by `node scripts/generate-board-data.mjs`. Edit the generator, not the output, when changing
geometry — and see [Replacing the placeholder art](#7-replacing-the-placeholder-artwork).

---

## 3. Adding a structure, step by step

### Step 1 — draft the record

Add an entry to `structures.json`:

```json
{
  "structure_id": "muscular.brachialis",
  "system_id": "muscular",
  "canonical_name": "Brachialis",
  "display_name": "Brachialis",
  "aliases": [],
  "latin_name": "M. brachialis",
  "structure_type": "muscle",
  "parent_structure_id": null,
  "region_ids": ["region.upper_limb.arm"],
  "laterality": "bilateral",
  "visible_in_views": ["anterior"],
  "difficulty_tier": "intermediate",
  "summary": "Where it is, in one or two plain sentences.",
  "function_summary": "What it does, in plain language.",
  "origin_summary": null,
  "insertion_summary": null,
  "innervation_summary": null,
  "action_tags": [],
  "relation_ids": [],
  "distinction_notes": [
    {
      "against_structure_id": "muscular.biceps_brachii",
      "note": "What separates the two, visually or functionally."
    }
  ],
  "source_references": [],
  "content_status": "draft",
  "medical_review_status": "provisional",
  "review_notes": null,
  "created_version": "1.0.0",
  "updated_version": "1.0.0"
}
```

Rules for the prose:

- **Location first, then function.** Learners are being asked to locate.
- **Plain language.** A second-year nursing student should read it without a dictionary.
- **No unexplained abbreviations.** `External oblique` may be named; `TA` may not.
- **No clinical claims.** No diagnosis, no injury, no treatment — not even in passing.
- **No claim of completeness.** This is a simplified teaching figure.

### Step 2 — give it a hit region

Add an entry to `visual-mappings.json` and a matching shape to the generator table in
`scripts/generate-board-data.mjs`, then run the generator.

```json
{
  "visual_id": "muscular.anterior.brachialis.surface",
  "structure_id": "muscular.brachialis",
  "representation_type": "svg_path",
  "body_presentation_id": "neutral_adult_provisional_01",
  "view_id": "anterior",
  "layer_id": "layer.superficial",
  "asset_path": "/assets/anatomy/muscular/anterior/anterior-muscles.svg",
  "element_id": "muscular.anterior.brachialis.surface",
  "selectable": true,
  "visible_by_default": true,
  "min_fair_target_px": 40,
  "forgiveness_margin_units": 10,
  "requires_disambiguation": true,
  "zoom_to_fit": true,
  "selection_priority": 600,
  "occlusion_notes": null,
  "visual_status": "provisional",
  "art_source_reference": null,
  "license_reference": "UNSET",
  "bounding_box": { "x": 372, "y": 700, "width": 44, "height": 90 }
}
```

The fairness fields are not optional bookkeeping. A structure whose smallest side is under
44 px must offer at least one of:

| Field | Meaning |
| --- | --- |
| `requires_disambiguation` | Overlapping neighbours; the learner is asked which they meant |
| `forgiveness_margin_units` | Extra reach around the shape, capped at 16 user units |
| `zoom_to_fit` | The board can frame it on request |

Set `min_fair_target_px` from the **rendered** size on an iPad, not from the viewBox units.
The schema refuses a sub-44 px target that offers none of these, so an unfair target cannot
be authored by accident.

### Step 3 — validate

```bash
npm run validate:content
```

Fix every error before asking for review. Time spent on a reviewer is the scarcest resource
in this project.

### Step 4 — review

See [`reviewer-workflow.md`](reviewer-workflow.md). Reviewer sign-off records the facts and
the art-to-structure mapping.

### Step 5 — publish

Set `content_status: "published"`, `medical_review_status: "approved"`, set
`visual_status: "approved"` on every mapping, and set a real `license_reference`. The
validator refuses anything less.

---

## 4. Identifier rules

```
system_id      muscular
structure_id   muscular.<snake_case>
visual_id      muscular.<view>.<structure>.<representation>
region_id      region.<area>.<region>[.<subregion>]
```

- Identifiers are **immutable once published**. Renaming a display name never touches an
  identifier. Retiring a structure sets `content_status: "retired"`; it does not delete the
  record, because historical progress references it.
- Never use a display name as an identifier.
- Never put a muscle name in `src/domain/**` or `src/features/learning/**`. Those modules are
  generic and must work for the skeletal system too.

---

## 5. Status lifecycle

```
draft ──(author submits)──> reviewed ──(reviewer approves)──> published
  ▲                            │                                   │
  │                     (rejected)                                   │ (retired)
  └────────────────────── draft                                          ▼
                                                                     retired
```

| Status | In gameplay | In Explore | Notes |
| --- | --- | --- | --- |
| `draft` | Never | Development preview only | Unverified |
| `reviewed` | Never | Development preview only | Facts approved, art pending |
| `published` | Yes | Yes | The only state a learner sees |
| `retired` | Never | Never | History preserved |

---

## 6. Validation rules

Every rule is named in the report.

| Rule | Catches |
| --- | --- |
| `duplicate-structure-id` | Two records sharing an identifier |
| `duplicate-visual-id` | Two mappings sharing an identifier |
| `dangling-region` | A region not declared in `regions.json` |
| `dangling-relation`, `dangling-distinction` | References to structures that do not exist |
| `orphan-visual-mapping` | A mapping for an unknown structure |
| `visual-view-mismatch` | A mapping for a view the structure does not list |
| `missing-source-reference` | A published structure citing an undeclared source |
| `source-review-missing` | A cited source with no reviewer or review date |
| `published-without-selectable-visual` | No approved selectable mapping for a listed view |
| `missing-license-entry`, `published-without-license` | Artwork absent or unreleasable |
| `provisional-art-in-published` | A published structure pointing at unapproved artwork |
| `restricted-license`, `rejected-asset` | Licence or review state that must not ship |
| `missing-attribution` | An attribution-requiring licence with no attribution text |
| `missing-license-reference` | A mapping whose licence is unset in a release build |
| `unfair-small-target` | Sub-44 px with no fairness affordance (schema level) |
| `excessive-forgiveness-margin` | A margin that could capture a neighbour (schema level) |
| `version-mismatch` | A structure or asset on a different content version |
| `draft-content-allowed-in-build` | Draft data in a build that forbids it |
| `template-unsupported-view` | A template allowing a view no mapping covers |

Intra-record rules — publishing implying sources and an approved review, the forgiveness cap,
the fairness requirement — live in the Zod schemas. See `src/domain/anatomy/anatomy.ts` and
`src/domain/anatomy/anatomy.spec.ts`.

---

## 7. Replacing the placeholder artwork

The current artwork is **provisional placeholder geometry**: rounded shapes marking roughly
where each muscle is expected to sit. It is not a medical illustration and is labelled as
such everywhere it appears.

To replace it:

1. Obtain licensed vector artwork — see [`asset-licensing.md`](asset-licensing.md).
2. Create layered SVG under `src/assets/anatomy/muscular/<view>/`, with one named group per
   structure, using `visual_id` as the element `id`.
3. Point `asset_path` at the new file.
4. Record the asset in `asset-manifest.json` with a real licence.
5. Set each mapping's `visual_status` to `approved` and its `license_reference`.
6. Update `min_fair_target_px` from measurements on a real iPad.
7. Remove the provisional artwork and its notice.
8. Set `VITE_PROVISIONAL_ART=false` and verify `npm run build:release` now succeeds.

Steps 6–8 are not optional. A release build that still reports provisional artwork is
refused by `vite.config.ts`, by design.

---

## 8. Adding a question type

Only `locate_named_structure` ships in v1. Others are architectured but deliberately not
implemented, because shipping an unproven question mechanic would be worse than not shipping
it.

To add one:

1. Add the prompt format to `questionTemplatePromptSchema`.
2. Add a template to `question-templates.json` with `implemented: false`.
3. Extend `AnswerEvaluator` with the answer type it needs. Correctness stays keyed on
   `structure_id` wherever an answer names a structure.
4. Only then set `implemented: true`.

---

## 9. Checklist before asking for review

- [ ] `structure_id` follows the naming rule and will never need to change
- [ ] Summary describes real location, in plain language
- [ ] Function summary is accurate and does not overstate
- [ ] No clinical, diagnostic, treatment or injury content
- [ ] `distinction_notes` separate it from each easily-confused neighbour
- [ ] At least one source exists and supports the claims
- [ ] `region_ids` exist in `regions.json`
- [ ] A selectable mapping exists for every `visible_in_views` entry
- [ ] `min_fair_target_px` measured on a real iPad, not estimated
- [ ] A fairness affordance exists if under 44 px
- [ ] `npm run validate:content` is clean
