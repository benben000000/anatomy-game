# Phase 0 — Medical Content Review Workflow

Status: complete, awaiting approval

---

## 1. Purpose

A written procedure for getting anatomical content from "written down" to "may be shown to a
learner", with every step attributable to a named person.

The workflow exists so that no fact reaches a learner without a source, and no structure
becomes a quiz target without someone qualified having said it is correct.

---

## 2. Roles

| Role | Responsibility | May sign off |
| --- | --- | --- |
| Author | Writes structure records, summaries, distinction notes | No |
| Illustrator | Produces layered vector art to spec | No (art accuracy only) |
| Art reviewer | Checks art matches the intended structure | Art only |
| **Anatomy reviewer** | Qualified anatomist or medically trained educator | **Facts and art-to-structure mapping** |
| Maintainer | Runs the validator, merges, builds | No |
| Release approver | Confirms the checklist | Process only |

One person may hold several roles, but **the author of a record may not be the sole reviewer
of that record**. Self-review does not count as review.

---

## 3. Content status lifecycle

```
   ┌───────┐  author submits    ┌──────────┐  reviewer approves  ┌───────────┐
   │ draft │───────────────────>│ reviewed │────────────────────>│ published │
   └───┬───┘                    └────┬─────┘                     └─────┬─────┘
       ▲                             │ (rejected)                      │
       │                             v                                  │ (retired)
       └────────────────────────  draft / rejected            ┌───────▼────────┐
                                                                    │    retired    │
                                                                    └────────────────┘
```

| Status | Meaning | In gameplay | In Explore |
| --- | --- | --- | --- |
| `draft` | Being written, unverified | Never | Never |
| `reviewed` | Reviewer approved facts; art mapping may still be pending | Never | Never |
| `published` | Facts approved, art approved, mapping approved, licence recorded | Yes | Yes |
| `retired` | Withdrawn from curriculum | Never | Never, history kept |

A structure is invisible to learners in every mode until `published`. There is no "show me
drafts" path in a production build, and no beta content leak.

---

## 4. Per-structure review procedure

### Step 1 — Author drafts the record

Required before submission:

- `canonical_name` and standard anatomical spelling
- `region_ids` matching `regions.json`
- `laterality`
- `visible_in_views`
- `difficulty_tier`
- `summary` — where it is, in one or two sentences
- `function_summary` — what it does, in plain language
- Optional `origin_summary`, `insertion_summary`, `innervation_summary` — only if sourced
- `action_tags` — controlled vocabulary, no invented terms
- `distinction_notes` — at least one against each easily-confused neighbour
- `source_references` — at least one

Authoring rules:

- Plain language. A second-year nursing student should read it without a dictionary.
- No unexplained abbreviations. "External oblique" may be named; "TA" may not, unexpanded.
- Location first, then function. Learners are being asked to locate.
- No diagnosis, no injury, no clinical advice, even in the summary.
- No claim of completeness. This is a simplified teaching figure.

### Step 2 — Validator runs

```bash
npm run content:validate
```

Author resolves every error before a reviewer sees it. A record with validation errors is not
ready for review, and time spent on it is wasted reviewer time — which is the scarcest
resource in this project.

### Step 3 — Anatomy reviewer checks facts

The reviewer confirms, per structure:

| Check | Question |
| --- | --- |
| Name | Correct anatomical name and spelling? |
| Location | Does the summary describe where it actually is? |
| Function | Is the function summary accurate, and free of overstatement? |
| Origin/insertion | If present, correct? If absent, is absence acceptable? |
| Innervation | If present, correct? |
| Laterality | `laterality` correct? |
| Views | Is it genuinely visible in each listed view? |
| Difficulty | Appropriate tier? |
| Granularity | Is this a muscle or a group, and is it consistent with the rest of the pool? |
| Distinctions | Do the `distinction_notes` actually separate it from its confusable neighbours? |
| Safety | Any diagnosis, treatment, or injury implication? Must be none. |
| Sources | Do the cited sources support the claims made? |

Reviewer records: `reviewer_name`, `reviewer_credentials`, `review_date`, and sets
`content_status: 'reviewed'`.

A reviewer may also reject with a note. Rejection returns the record to `draft` with the
reason retained in `review_notes`. Rejection is a normal outcome, not a failure.

### Step 4 — Art review

Art reviewer confirms, per structure:

| Check | Question |
| --- | --- |
| Mapping | Does the `visual_id` layer actually depict the intended structure? |
| Completeness | Is the whole muscle shown, or only part of it? |
| Fibre direction | Plausible and consistent with the real muscle? |
| Attachment | Does origin and insertion read as implied? |
| Occlusion | Is a neighbouring muscle hiding a meaningful portion? |
| Selectability | Can it be fairly selected? How large is it in viewBox units? |
| Left/right | Does laterality render correctly? |
| Terminology | Do labels match `canonical_name`? |

This step produces the `min_fair_target_px` and `forgiveness_margin_units` values in
`visual-mappings.json`, and flags any structure needing `requires_disambiguation`.

### Step 5 — Licence recorded

Maintainer confirms `asset-manifest.json` has a real, read licence for every asset, that it
permits web delivery and modification, and that attribution requirements are captured for the
Credits screen.

### Step 6 — Publish

Maintainer sets `content_status: 'published'` and sets every referenced asset's
`medical_review_status: 'approved'` with reviewer and date.

Validation then enforces, mechanically:

1. ≥ 1 source reference
2. every source has reviewer name and review date
3. ≥ 1 selectable approved mapping for every view in `visible_in_views`
4. every referenced asset `medical_review_status: 'approved'`
5. no `UNSET` or `proprietary_restricted` licence
6. any sub-44 px target has a fairness affordance
7. no overlapping mapping without a resolution strategy

If any check fails, publication is impossible. This is the point of the validator.

---

## 5. Reviewer sign-off record format

`sources.json`:

```json
{
  "$schema": "./sources.schema.json",
  "sources": [
    {
      "source_id": "source.FILL",
      "title": "FILL",
      "author_or_organization": "FILL",
      "edition_or_version": null,
      "publication_year": null,
      "url_or_library_reference": "FILL",
      "accessed_date": null,
      "license_notes": null,
      "content_scope": "FILL",
      "reviewer_name": null,
      "reviewer_credentials": null,
      "review_date": null
    }
  ]
}
```

And per structure, sign-off is recorded in the record itself:

```json
{
  "structure_id": "muscular.FILL",
  "content_status": "reviewed",
  "review_notes": "Fact review: FILL (reviewer, YYYY-MM-DD). Art mapping: FILL. Outstanding: none."
}
```

The `review_notes` field is the human-readable audit trail. It is never shown to learners.

**This file ships empty or with clearly-marked placeholders during Phase 2.** A validator
report stating "0 publishable structures — sources.json has no approved sources" is the
correct and expected Phase 2 outcome. Inventing plausible sources would be worse than useless.

---

## 6. What must never enter published content

- Any fact without a source reference
- Any anatomical claim about a structure no reviewer has checked
- A muscle identification on an illustration where the muscle is mostly hidden
- A group name and an individual name in the same question pool without explicit design
- An abbreviation without expansion on first use
- A claim about pathology, injury, treatment, or diagnosis
- A "mastery" claim derived from one correct answer
- An AI-generated illustration unverified by a human reviewer
- Anatomically wrong art, however attractive

---

## 7. Change control after publication

| Change type | Process |
| --- | --- |
| Typo in display name | Maintainer. No re-review needed; IDs unchanged. |
| Improved summary wording, no factual change | Reviewer confirms. Fast path. |
| **Any** factual change to summary, function, origin, insertion, innervation | Full re-review. |
| Adding a view to `visible_in_views` | Art review + anatomy review for that view. |
| Retiring a structure | Maintainer sets `retired`; history preserved; reviewer note explaining why. |
| Licence change on an asset | Full re-check of the licence obligations and the Credits screen. |
| Changing `structure_id` | Forbidden. It is a permanent identifier. Migrate instead. |

Published content is not silently edited. Learner progress is keyed by `structure_id`, so
identifier drift would orphan real learning history.

---

## 8. Curriculum review cadence

- Before each release: validate the whole pack.
- Annually, or on publication of a major new anatomy reference: re-check published summaries.
- Immediately on any errata notice in a cited source.
- Track corrections in a `CHANGELOG.md` entry naming the structure, what was wrong, and when
  it was fixed. If a learner was taught something wrong, that correction is visible rather
  than quietly applied.

---

## 9. Reviewer checklist (printable)

Per structure:

```
[ ] Name correct and spelled to standard terminology
[ ] Summary describes real location
[ ] Function summary accurate, no overstatement
[ ] Origin/insertion/innervation correct, or intentionally absent
[ ] laterality correct
[ ] visible_in_views correct — genuinely visible in each
[ ] difficulty_tier appropriate
[ ] Not a group mixed among individuals (or intentionally so, with design note)
[ ] distinction_notes separate it from each confusable neighbour
[ ] No diagnosis, treatment, or injury content
[ ] Plain language, no unexplained abbreviations
[ ] Location described before function
[ ] At least one source cited, and the source supports the claim

Art:
[ ] visual_id layer depicts the intended structure
[ ] Whole muscle shown
[ ] Fibre direction plausible
[ ] Origin/insertion read as implied
[ ] Not mostly occluded
[ ] Fairly selectable — size recorded
[ ] Left/right correct
[ ] Labels match canonical_name
[ ] Adjacent muscles distinguishable without relying on hue

Licence:
[ ] Real licence recorded and read
[ ] Permits web delivery and modification
[ ] Attribution requirement captured for Credits screen
[ ] Modification notices recorded
```

---

## 10. Phase 2 acceptance for this workflow

- [ ] `ContentValidator` mechanically enforces every publication rule above.
- [ ] `npm run content:validate` reports 0 publishable structures on the placeholder pack,
      with a message pointing at this document.
- [ ] Draft content cannot appear in any mode, in any build.
- [ ] A record with a missing source, unreviewed asset, or sub-44 px target without a
      fairness affordance cannot be published.
- [ ] `sources.json` contains no invented entries.
- [ ] The reviewer checklist exists as a file in `docs/` for actual use.

**Reviewer sign-off itself is not achievable in Phase 2 and is not claimed.**
