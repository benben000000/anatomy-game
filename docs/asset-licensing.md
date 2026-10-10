# Asset Licensing and Medical Review

Status: **no licensed artwork exists in this project.** What ships is provisional placeholder
geometry, recorded as unlicensed. This document explains what must replace it, and the rules
that replacement must satisfy.

---

## 1. The governing constraint

**No anatomical artwork ships with this repository, and none can be generated into a
releasable state by an assistant.**

Not caution for its own sake. A plausible-looking illustration with subtly wrong attachment,
origin or fibre orientation teaches a nursing student something false, and does it
confidently. The cost of a wrong anatomical image is higher than the cost of a missing one.

Therefore:

- Art is **commissioned** or **explicitly licensed**, by a human, with a recorded licence.
- This repository ships **structure and pipeline**, not pictures.
- Development builds use placeholder geometry, clearly labelled, blocked from release by both
  a build flag and validator rules.

---

## 2. Prohibited

- Scraping, screenshotting, tracing, vectorising or extracting anatomy from commercial
  anatomy products, textbooks or atlases without explicit written permission.
- Treating "free to view" as "free to reuse".
- Embedding a commercial product's models, screenshots, illustrations or data without a
  licence permitting exactly the intended use, in exactly the intended channel.
- Using AI-generated anatomy as a release asset without qualified expert review of the
  specific image — and never as a silent default.
- Asserting a licence that has not been read and recorded.

---

## 3. Licence preference order

| Rank | Option | Note |
| --- | --- | --- |
| 1 | Commissioned original art, owned by the project | Clearest and most defensible |
| 2 | Open licence with compatible terms (CC0, CC-BY) | Check the share-alike question below |
| 3 | Open licence with share-alike or non-commercial terms | **Usually incompatible** — see §4 |
| 4 | Licensed commercial asset with written permission | Confirm web delivery, modification, redistribution |

### The share-alike trap

CC-BY-SA artwork used in the app makes derivative assets share-alike. A muscle layer edited
to match the `visual_id` contract is a derivative. If the project cannot accept that
obligation, CC-BY-SA is not an option. The same applies to CC-BY-NC if any intended use is
commercial.

**Decide this before commissioning, not after delivery.**

---

## 4. Required specification

Delivered to the illustrator as a written specification.

### Canvas and geometry

| Property | Value |
| --- | --- |
| ViewBox | `0 0 1000 2200` for both views |
| Midline | `x = 500` |
| Ground contact | `y = 2200` |
| Pose | Neutral anatomical: arms slightly abducted, palms forward in anterior view |
| Scale | Identical across both views, so spatial memory transfers |

Both views must use the same proportions and ground line. If the posterior figure is drawn at
a different height, cross-view learning breaks silently.

### Layer separation

Five deliverables per view:

1. `*-base.svg` — silhouette only, non-interactive
2. `*-muscles.svg` — one `<g>` per structure, named by `visual_id`
3. `*-labels.svg` — text positions only, hidden during quiz mode
4. `*-hit.svg` — not supplied; hit strokes are derived from the muscle paths in code
5. `*-states.svg` — not supplied; state styling is CSS-driven in the app

Deliver a **layered SVG or a vector master that exports clean SVG**. Not PDF. Not a flattened
raster.

### Naming contract

```xml
<g id="muscular.anterior.biceps_brachii.surface"
   data-structure-id="muscular.biceps_brachii"
   data-visual-id="muscular.anterior.biceps_brachii.surface">
```

Non-negotiable. Artwork whose identifiers do not match `visual-mappings.json` fails content
validation and cannot ship.

### Anatomical requirements

- Fibre direction visually correct and consistent with the actual muscle.
- Origins and insertions must not be simplified into positions implying a wrong action.
- Superficial muscles only, unless a structure ships with an explicit layer mode.
- Mirroring must not break laterality.
- No sexualisation, exaggeration, heroic posing, dramatic lighting, or sci-fi treatment.
- Respectful and clinically appropriate; a healthy-body teaching illustration.
- Adjacent muscles must be distinguishable without relying on hue alone.

---

## 5. SVG optimisation rules

Optimisation is required for the performance budget and is also where art gets broken. These
rules are enforced by test, not by discipline.

**Must preserve:** `id`, `data-structure-id`, `data-visual-id`, `data-selection-priority`,
`<title>`, `<desc>`.

**Must strip:** `<script>`, `on*` event handlers, external `href`, `<foreignObject>`, unused
`<defs>`/`<filter>`/`<mask>`, editor metadata, embedded raster images.

**Must not introduce:** path rounding that shifts geometry beyond ~0.5 user units,
`transform` folding that breaks the layer contract, auto-merged paths that destroy
per-structure separation.

`svgo` is pinned to a specific version with a committed preset, because a minor bump can
change path output and break geometry.

---

## 6. Typography, icons and sound

**Fonts.** One family, self-hosted `.woff2`, SIL OFL. **Source Sans 3** or **Inter**. The
licence file ships in `public/licenses/`.

**Icons.** Fourteen purpose-built 24×24 icons drawn in-house at a consistent stroke, so
there is no third-party icon licence question and no default icon set used without thought.
Every icon accompanies a text label or an explicit `aria-label`.

**Sound.** Optional, default **off**, and the app is fully usable with none — an accessibility
requirement. At most three short cues, soft-limited to three concurrent.

---

## 7. Manifest

Every asset needs a complete record in `src/data/manifests/asset-manifest.json`:

`asset_id`, `file_path`, `asset_type`, `associated_system_id`, `associated_structure_id`,
`source_creator`, `source_url_or_reference`, `license`, `attribution_requirement`,
`modification_notes`, `medical_review_status`, `reviewer`, `review_date`, `content_version`.

Validator rules:

- `license: "UNSET"` blocks any published structure that references the asset.
- `proprietary_restricted` blocks release builds.
- `medical_review_status !== "approved"` blocks release builds.
- An attribution-requiring licence with no `attribution_requirement` is an error.

---

## 8. Release gate

A release build fails while any asset referenced by published content has:

- `license: "UNSET"` or `"proprietary_restricted"`
- `medical_review_status` other than `"approved"`
- missing attribution where the licence requires it

And `npm run build:release` fails outright while `PROVISIONAL_ART` or `ALLOW_DRAFT_CONTENT`
is set.

---

## 9. Replacing the placeholder artwork

1. Obtain licensed vector artwork to the specification in §4.
2. Create layered SVG under `src/assets/anatomy/muscular/<view>/`.
3. Point `asset_path` at the new file in `visual-mappings.json`.
4. Record the asset in `asset-manifest.json` with a real licence and attribution text.
5. Set each mapping's `visual_status` to `approved` and its `license_reference`.
6. Update `min_fair_target_px` from measurements **on a real iPad**.
7. Remove `provisional-geometry.data.ts` and its notice from the board.
8. Set `VITE_PROVISIONAL_ART=false`; confirm `npm run build:release` now succeeds.

---

## 10. Acceptance criteria

- [ ] Every shipped asset has a real licence, read and verified for the intended use.
- [ ] No `UNSET` or `proprietary_restricted` licence in any release build.
- [ ] Every asset referenced by published content is `medical_review_status: "approved"`.
- [ ] SVG optimisation preserves all identifiers.
- [ ] No script, handler, `foreignObject` or external reference survives optimisation.
- [ ] Master artwork is layered SVG with per-structure named groups.
- [ ] Anterior and posterior share viewBox, scale and ground line.
- [ ] Adjacent muscles distinguishable without relying on hue.
- [ ] Every published structure has `min_fair_target_px` measured on device.
- [ ] Credits screen renders from the manifest and matches it exactly.
- [ ] Provisional art and draft content are impossible to reach in a release build.
