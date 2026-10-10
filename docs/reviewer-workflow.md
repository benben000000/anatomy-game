# Reviewer Workflow

For the qualified anatomy reviewer who signs content off, and for the art reviewer who
confirms that each drawn layer depicts the structure it claims to.

---

## 1. Current state

**No structure in this project has been reviewed. `sources.json` is empty and every structure
is `draft` with `medical_review_status: "provisional"`.**

That is not an oversight. It means nothing has been claimed that has not been checked. The
validator reports zero publishable structures and says so in plain language, and a release
build is refused outright.

Nothing in this document has been performed. It describes what a reviewer must do.

---

## 2. Roles

| Role | Responsibility | May sign off |
| --- | --- | --- |
| Author | Writes structure records and summaries | No |
| Illustrator | Produces layered vector art to specification | No |
| Art reviewer | Confirms each layer depicts the right structure | Art only |
| **Anatomy reviewer** | Qualified anatomist or medically trained educator | **Facts and mapping** |
| Maintainer | Runs the validator, merges, builds | No |
| Release approver | Confirms the checklist | Process only |

One person may hold several roles, but **the author of a record may not be its sole reviewer**.
Self-review does not count.

---

## 3. Before review: the author's job

The validator must be clean before a reviewer is asked. Every unresolved error wastes the
reviewer's time, which is the scarcest resource in this project.

```bash
npm run validate:content
```

---

## 4. Facts review

For each structure under review, confirm:

| Check | Question |
| --- | --- |
| Name | Correct anatomical name and spelling? |
| Location | Does the summary describe where it actually is? |
| Function | Is the function summary accurate, and free of overstatement? |
| Origin / insertion | If present, correct? If absent, is absence acceptable? |
| Innervation | If present, correct? |
| Laterality | Is `laterality` correct? |
| Views | Is it genuinely visible in each listed view? |
| Difficulty | Is the tier appropriate? |
| Granularity | Is this a muscle or a group, consistent with the rest of the pool? |
| Distinctions | Do the `distinction_notes` actually separate it from confusable neighbours? |
| Safety | Any diagnosis, treatment or injury implication? Must be none. |
| Sources | Do the cited sources support the claims made? |

Record: reviewer name, credentials, review date, and set `content_status: "reviewed"`.

A reviewer may also **reject**, with a reason. Rejection returns the record to `draft` with
the note retained. Rejection is a normal outcome, not a failure.

---

## 5. Art review

| Check | Question |
| --- | --- |
| Mapping | Does the `visual_id` layer depict the intended structure? |
| Completeness | Is the whole muscle shown, or only part of it? |
| Fibre direction | Plausible and consistent with the real muscle? |
| Attachment | Do origin and insertion read as implied? |
| Occlusion | Is a neighbour hiding a meaningful portion? |
| Selectability | Can it be fairly selected? How large is it, in rendered pixels? |
| Left / right | Does laterality render correctly? |
| Terminology | Do labels match `canonical_name`? |
| Legibility | Are adjacent muscles distinguishable without relying on hue? |

This review produces `min_fair_target_px` and `forgiveness_margin_units`, and flags any
structure that needs `requires_disambiguation`.

**Measured on a real iPad, not estimated from the source file.** A shape that is comfortable
on a 27-inch monitor can be a 14-pixel target on an iPad in landscape.

---

## 6. Recording a source

`sources.json` is currently empty. Each entry needs a real, readable source:

```json
{
  "source_id": "source.<slug>",
  "title": "Full title as published",
  "author_or_organization": "Author or organisation",
  "edition_or_version": "Edition",
  "publication_year": 2020,
  "url_or_library_reference": "DOI, ISBN, or library reference",
  "accessed_date": "2026-01-15",
  "license_notes": null,
  "content_scope": "Which structures this source supports",
  "reviewer_name": "Full name",
  "reviewer_credentials": "Qualification",
  "review_date": "2026-01-15"
}
```

The schema rejects a named reviewer with no review date, and a review date with no named
reviewer. A half-recorded review is not a review.

**Never invent a citation.** A fabricated reference in a study aid is a fabrication the
learner cannot detect, and it undermines every real citation beside it. An empty
`sources.json` with an honest validator message is strictly better than a plausible-looking
fake.

---

## 7. Publishing

Set, per structure:

- `content_status: "published"`
- `medical_review_status: "approved"`
- `source_references` to at least one reviewed source
- `review_notes` describing what was reviewed, by whom, and when

And per mapping:

- `visual_status: "approved"`
- `license_reference` naming a real licence

And per asset in `asset-manifest.json`:

- `medical_review_status: "approved"`, with `reviewer` and `review_date`

The validator then enforces, mechanically:

1. At least one source reference.
2. Every source has a reviewer name and a review date.
3. An approved, selectable mapping for every listed view.
4. Every referenced asset approved and licensed.
5. No `UNSET` or `proprietary_restricted` licence.
6. A fairness affordance for any sub-44 px target.
7. Content versions all matching the pack version.

If any check fails, publication is impossible. That is the point.

---

## 8. Change control after publication

| Change | Process |
| --- | --- |
| Typo in a display name | Maintainer. No re-review; identifiers unchanged. |
| Improved wording, no factual change | Reviewer confirms. Fast path. |
| **Any** factual change to summary, function, origin, insertion or innervation | Full re-review. |
| Adding a view to `visible_in_views` | Art review and anatomy review for that view. |
| Retiring a structure | Maintainer sets `retired`, with a reviewer note explaining why. |
| Licence change on an asset | Full re-check of obligations and the Credits screen. |
| Changing `structure_id` | Forbidden. Migrate instead. |

Published content is not silently edited. Learner progress is keyed by `structure_id`, so
identifier drift would orphan real learning history.

---

## 9. Cadence

- Before each release: validate the whole pack.
- Annually, or on publication of a major new anatomy reference: re-check published summaries.
- Immediately on any errata notice in a cited source.
- Corrections appear in `CHANGELOG.md`, naming the structure, what was wrong and when it was
  fixed. If a learner was taught something wrong, that correction is visible rather than
  quietly applied.

---

## 10. Reviewer checklist

Printable, per structure.

### Facts

- [ ] Name correct and spelled to standard terminology
- [ ] Summary describes real location
- [ ] Function summary accurate, no overstatement
- [ ] Origin / insertion / innervation correct, or intentionally absent
- [ ] `laterality` correct
- [ ] `visible_in_views` correct — genuinely visible in each
- [ ] `difficulty_tier` appropriate
- [ ] Not a group mixed among individuals, or intentionally so with a design note
- [ ] `distinction_notes` separate it from each confusable neighbour
- [ ] No diagnosis, treatment or injury content
- [ ] Plain language, no unexplained abbreviations
- [ ] Location described before function
- [ ] At least one source cited, and it supports the claim

### Art

- [ ] `visual_id` layer depicts the intended structure
- [ ] Whole muscle shown
- [ ] Fibre direction plausible
- [ ] Origin and insertion read as implied
- [ ] Not mostly occluded
- [ ] Fairly selectable — size **measured on a real iPad**
- [ ] Left and right correct
- [ ] Labels match `canonical_name`
- [ ] Adjacent muscles distinguishable without relying on hue

### Licence

- [ ] Real licence recorded and read
- [ ] Permits web delivery and modification
- [ ] Attribution requirement captured for the Credits screen
- [ ] Modification notices recorded

### Sign-off

- [ ] `content_status` set to `reviewed` or `published`
- [ ] `reviewer_name` and `review_date` recorded on the source
- [ ] `review_notes` explains what was checked
