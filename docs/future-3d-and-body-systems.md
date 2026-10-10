# Future 3D and New Body Systems

**Superseded in part.** The speculative design below remains accurate about the adapter
invariant and about new body systems. The 3D section has since been replaced by work that
was actually carried out and verified:

| Read this instead | Covers |
| --- | --- |
| [`open3dmodel-license-and-attribution.md`](open3dmodel-license-and-attribution.md) | Verified licence evidence, provenance, and three open questions |
| [`three-d-integration.md`](three-d-integration.md) | What was built, what deliberately was not, what remains |
| [`three-d-content-mapping-guide.md`](three-d-content-mapping-guide.md) | Mapping rules and the real anatomy findings |
| [`three-d-asset-pipeline.md`](three-d-asset-pipeline.md) | Conversion pipeline specification |
| [`three-d-performance-budget.md`](three-d-performance-budget.md) | Budgets and measured source data |
| [`three-d-ipad-safari-test-plan.md`](three-d-ipad-safari-test-plan.md) | Real-device checklist, not yet executed |

Two findings from that work contradict assumptions made in this document and are worth
stating here:

1. **A real model was located and inspected.** The Open 3D Model for Education has
   downloadable GLB packs covering 14 of our 19 structures. Its licence could not be fully
   verified, so nothing ships. This document's framing of 3D as purely hypothetical is no
   longer accurate.
2. **The packs exceed a naive performance expectation.** 1.37M triangles and 532 meshes per
   pack, with mandatory Draco compression. A region-trimmed derivative is required before any
   pack is viable on an iPad Air M4.

The invariant below is unchanged and still correct.

---

Design documentation only. No 3D renderer is implemented, no 3D dependency is installed, and
none is required. This document exists so that adding either later does not require rewriting
the learning engine, and so that nobody adds a heavy renderer before the 2D loop is proven.

---

## 1. The invariant that makes this safe

The learning engine depends on exactly one thing from the board:

```ts
interface AnatomyBoardAdapter {
  // ...
  subscribe(handler: (event: AnatomyBoardEvent) => void): () => void;
  listAvailableStructureIds(): readonly StructureId[];
  setActiveView(viewId: ViewId): void;
  setInteractionEnabled(enabled: boolean): void;
  focusStructure(structureId: StructureId, options?: FocusOptions): void;
  resetViewport(): void;
}
```

The engine never sees a mesh, a raycast, a camera, or a renderer. A selection arrives as a
`structureId`. Correctness is decided by comparing identifiers. This is proven in the test
suite: the full quiz flow runs against an in-memory fake board, so renderer independence is a
tested property rather than an aspiration.

**Any renderer that implements the adapter can replace the SVG board without a single change
to the learning engine, the content pipeline, the progress model, or the quiz flow.**

---

## 2. 3D adapter plan

### Structure

```
src/features/anatomy-board/board-3d-future/
  README.md                    # this document's sibling notes
  contracts/
    collider-mapping.ts        # mesh/collider → structure_id
    camera-policy.ts           # orbit, zoom, pan limits for touch
  loaders/
    gltf-loader.ts             # GLB/glTF ingestion, versioned
    collider-index.ts          # spatial index for pick queries
  renderers/
    ThreeAnatomyBoard.ts       # implements AnatomyBoardAdapter
  shaders/
    highlight.ts               # state visualisation matching the 2D states
```

### Loading strategy

- **Format:** glTF 2.0 binary (`.glb`). Single file, no external buffers, no runtime
  compilation.
- **Delivery:** the 3D route is `React.lazy` and **never** in the first route bundle. It is
  fetched only when a learner opens a 3D view.
- **Decoding:** meshes arrive compressed; `Draco` or `meshopt` decompression, chosen once and
  pinned. Budget: under 8 MB for a whole-body figure at usable fidelity.
- **Progressive:** show the 2D board immediately, swap to 3D when the model resolves. A
  learner is never blocked on a download.
- **Failure:** if the 3D asset is unavailable, the 2D board stays. There is no state in which
  the only way to study is broken.

### Collider-to-structure mapping

```ts
interface ColliderMapping {
  readonly structure_id: string;          // stable, matches VisualMapping.structure_id
  readonly node_name: string;             // glTF node name, must equal the visual_id
  readonly triangle_group: number;        // index into the collider index
  readonly fair_target_radius_m: number;  // real-world radius, for tap fairness
  readonly layer_id: string;
  readonly occlusion_policy: 'always' | 'only_when_unoccluded' | 'peel';
  readonly bbox: { min: [number, number, number]; max: [number, number, number] };
}
```

Rules:

- **One mapping per selectable structure per layer.** The same rule as the 2D board, enforced
  by the same validator.
- `node_name` must equal `visual_id`. A mismatch fails validation, exactly as in 2D.
- `fair_target_radius_m` is measured against a real hand, not a mouse. A muscle that is 6 mm
  across in 3D is *not* tappable and must declare a fairness affordance or be excluded.
- Deep structures use `occlusion_policy: "only_when_unoccluded"` or a layer mode. A learner
  is never asked to identify something they cannot see.

### Interaction

Raycast from the pointer through the camera. Resolve multiple hits with the **same**
`resolveCandidates` logic used in 2D: one candidate selects; several prompt; ties never guess.
This is why that logic was extracted as a pure function — it is renderer-independent and
already tested.

Pencil behaves identically to finger: a precise ray, no forgiveness margin, precision mode
on by default.

### Camera, zoom and pan

- Orbit is **not** the primary interaction. A drag pans; two fingers pinch-zoom; rotation is
  an explicit mode or a two-finger rotate.
- **Double-tap to reset is forbidden.** Safari gesture behaviour varies, and the product's
  rules prohibit making any action depend on it.
- Zoom limits mirror the 2D board, and the visible structure count stays inside a reviewed
  budget rather than depending on device pixel ratio.
- One-finger pan requires a confirmed pan intent, so it can never be mistaken for a selection.
- Reset restores a documented default orientation, and `R` does the same.

### Performance budget for 3D

| Metric | Budget |
| --- | --- |
| Initial route bundle increase | **0 bytes** — 3D is a separate lazy chunk |
| 3D chunk size (compressed) | Under 8 MB |
| First frame after model ready | Under 1.5 s on iPad Air M4 |
| Steady-state frame rate | 60 fps with the highlight layer, 30 fps minimum |
| Draw calls | Under 200 |
| Triangles | Under 1.5 M |
| Peak memory | Under 400 MB |
| Long tasks | Zero over 50 ms during a round |

Techniques, in order of preference: instancing for repeated geometry, merged static meshes,
`frustumCulled` layers, a single shared material with per-instance state attributes, and
explicit disposal on unmount. No post-processing stack; no realtime shadows; no transmission
or refraction materials.

---

## 3. WebGL and WebGPU policy

**WebGL is the 3D baseline. WebGPU is optional and feature-detected. Neither is required for
the 2D experience, and neither is in the main bundle.**

```ts
// Feature detection, never user-agent sniffing.
const renderer = supportsWebGL2() ? 'webgl2' : supportsWebGL() ? 'webgl1' : 'none';
```

Rules:

- The 2D SVG board is complete on its own. If WebGL is unavailable, there is no 3D view and
  nothing breaks.
- WebGPU, where available, may replace the renderer behind the same adapter. A feature test
  must prove a context can actually be created, not merely that `navigator.gpu` exists.
- No build-time requirement on either. No conditional compilation.
- A 3D renderer failure falls back to the 2D board with a calm explanation, never a crash and
  never a blank screen.

This is recorded in `AnatomySystem.renderer_baseline`, `accelerated_renderer` and
`acceleration_is_optional`, so the intent is data, not comment.

---

## 4. Adding a new body system: the skeletal system

The architecture is deliberately generic. A new system is **content**, not new code.

### Step 1 — create the pack directory

```
src/data/systems/skeletal/
  anatomy-system.json
  structures.json
  visual-mappings.json
  question-templates.json
  sources.json
  regions.json
```

### Step 2 — declare the system

```json
{
  "system_id": "skeletal",
  "display_name": "Skeletal system",
  "description": "Bones of the adult skeleton, anterior and posterior views.",
  "status": "authoring",
  "supported_learning_modes": ["explore", "identify", "learn_then_test", "review"],
  "default_views": ["anterior", "posterior"],
  "content_version": "1.0.0",
  "renderer_baseline": "svg_2d",
  "accelerated_renderer": null,
  "acceleration_is_optional": true
}
```

### Step 3 — author structures

Example shape only. **This is a schema example, not verified content**, and it must go
through the same review workflow as any other structure before it can be published.

```json
{
  "structure_id": "skeletal.femur",
  "system_id": "skeletal",
  "canonical_name": "Femur",
  "display_name": "Femur",
  "aliases": [],
  "latin_name": "Os femoris",
  "structure_type": "bone",
  "parent_structure_id": null,
  "region_ids": ["region.lower_limb.thigh"],
  "laterality": "bilateral",
  "visible_in_views": ["anterior", "posterior"],
  "difficulty_tier": "introductory",
  "summary": "PLACEHOLDER — not verified content. Replace before publication.",
  "function_summary": "PLACEHOLDER — not verified content. Replace before publication.",
  "origin_summary": null,
  "insertion_summary": null,
  "innervation_summary": null,
  "action_tags": [],
  "relation_ids": [],
  "distinction_notes": [],
  "source_references": [],
  "content_status": "draft",
  "medical_review_status": "provisional",
  "review_notes": "Schema example only. Not content. Not publishable.",
  "created_version": "1.0.0",
  "updated_version": "1.0.0"
}
```

Note `structure_type: "bone"` — already in the shared vocabulary. `structure_type` is the only
place a system's nature is expressed, and no generic code branches on it beyond eligibility.

### Step 4 — wire the repository

```ts
// src/features/content/repository/ContentRepository.ts
export const SYSTEM_PACKS = {
  muscular: () => import('@/data/systems/muscular/structures.json'),
  skeletal: () => import('@/data/systems/skeletal/structures.json'),
} as const;
```

Dynamic import per pack, so **only the muscular pack is in the first route bundle**. Other
systems are fetched on demand and cached — never preloaded.

### Step 5 — confirm no generic code changed

This is the acceptance test for "the architecture is generic":

```bash
git diff --stat -- src/domain src/features/learning src/features/anatomy-board/contracts
```

If the skeletal system required a change in `src/domain/**` or `src/features/learning/**`,
the abstraction was wrong and should be fixed before the new system is added — not worked
around.

The only structural guards a new pack must satisfy:

- [ ] No muscle name anywhere in `src/domain/**` or `src/features/learning/**`
- [ ] All `region_id`s declared in its own `regions.json`
- [ ] Every structure has a selectable mapping for each `visible_in_views` entry
- [ ] `npm run validate:content` passes for every pack
- [ ] The new pack does not enter the first route bundle

---

## 5. Verification checklist for adding any anatomy structure

Applies to every structure in every system, without exception.

- [ ] Stable `structure_id` following the naming rule; will never need to change
- [ ] Valid `system_id`, `region_id`s, `laterality`, `visible_in_views`, `difficulty_tier`
- [ ] Accurate location and function summaries, in plain language
- [ ] No diagnosis, treatment or injury content
- [ ] At least one source reference, with a reviewer and a review date
- [ ] Selectable visual mapping for every listed view
- [ ] `min_fair_target_px` measured on a real iPad, not estimated
- [ ] A fairness affordance if under 44 px
- [ ] Distinction notes for every easily-confused neighbour
- [ ] Artwork licence recorded and verified for the intended use
- [ ] Artwork medically reviewed and recorded as approved
- [ ] `npm run validate:content` clean
- [ ] Reviewed, then published — in that order

---

## 6. Content-pack versioning and migration

Content packs are versioned independently of the app.

| Rule | Detail |
| --- | --- |
| Version format | Semver in `content_version` |
| Identity | `structure_id` is immutable; never renumber, never reuse |
| Additive only | A published pack is never edited destructively |
| Deprecation | `content_status: "retired"`, history preserved |
| Content migration | A script transforms records and records the mapping; identity is never rewritten |
| Schema migration | Stored data carries a version; a newer app migrates on read |
| Unknown versions | Refuse to read, explain, offer a reset — never a silent wipe |
| Cache | Cache names include the pack version; old caches cleaned on activation |
| Update discovery | Opportunistic, on focus and idle, non-blocking |

### Adding a field

1. Make it optional with a default.
2. Ship the app that reads it.
3. Only then start writing it.

Reversing that order breaks every stored record. This is why `progressSchema` and
`userSettingsSchema` use defaults throughout, and why `schema_version` is a literal with a
default rather than a required field.

### Renaming a display name

Safe. Change `display_name`; identifiers and stored progress are unaffected.

### Changing a `structure_id`

Forbidden. Progress is keyed by it. Retiring the old record and creating a new one is correct;
silently rewriting history is not.

---

## 7. What this document deliberately does not contain

- No 3D code, and no 3D dependency.
- No GLB assets.
- No promises about a 3D timeline.
- No claim that 3D improves learning. It might not; the 2D SVG board is a complete product.

The order is fixed: prove the 2D loop, then consider 3D as an option — not a requirement.
