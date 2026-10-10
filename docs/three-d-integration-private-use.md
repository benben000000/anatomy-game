# 3D integration addendum — private local use

**Status update 2026-10-10: the renderer, gestures, and real model loading are now
implemented and tested. The main
[three-d-integration.md](three-d-integration.md) is the architecture record;
this addendum records what changed after the private-asset decision.**

The main document describes the state before the project owner decided to proceed
with **private local use only**. That decision changed what was possible without
resolving the licence questions:

- CC BY-SA's ShareAlike condition attaches on **distribution**. Nothing here is
  distributed — the app is personal, unpublished, and unshared — so private use
  does not trigger it. This is a legal-structure observation, **not** a claim that
  the licence is verified. `LICENCE_VERIFIED` remains `false` and every warning
  stays visible.
- The owner's own instruction ("keep model binaries and derivatives out of any
  public/release build by default") is enforced in code, not just documented.

## What changed from the architecture-only record

### Assets acquired privately, originals immutable

The official GLB packs for upper-limb and lower-limb were downloaded from the URLs
recorded in `docs/open3dmodel-license-and-attribution.md` and stored under
`private/assets/open3dmodel/original/`, byte-for-byte unchanged, hash-verified
against [PROVENANCE.json](../private/assets/open3dmodel/PROVENANCE.json). The
directory is git-ignored (`.gitignore` entry under `private/`), excluded from any
build, and protected by a global `*.glb` ignore rule.

No thorax/abdomen/back pack exists at the source — this was verified, and is the
reason 5 of 19 structures have no 3D counterpart even with the packs present.

### Derivatives: lossless trim, no re-encode

`npm run build:3d-derivatives` produces the runtime packs:

| File | Original | Derived | Reduction |
|---|---|---|---|
| `upper-limb-muscles.glb` | 6,911,588 B | 90,080 B | -99% |
| `lower-limb-muscles.glb` | 6,546,756 B | 57,556 B | -99% |

Both are **structural trims only**: keep the mapped muscle nodes and their parent
group nodes, rewrite the glTF index tables, strip every texture reference (materials
keep flat `baseColorFactor` colours). **No geometry is decoded, altered, or
re-encoded** — both packs are Draco-compressed throughout, and re-encoding would
risk silently altering anatomical surfaces. Textures were dropped because the
renderer always overrides base colours with quiz state colours, so the photographic
textures were never displayed — and carrying them pulled a real decode bug
(`GLTFTextureBasisUExtension` failure) into the load path.

`npm run verify:3d-assets` checks after every build: original hash integrity,
derivative parse validity and index range checks, kept-node fidelity against the
original node list, exclusion of every forbidden node (tendon, bursa, overlay
part), and buffer-slice equality proving no fabricated geometry. Currently OK.

### Renderer implemented

`ThreeDAnatomyBoard` implements the full `AnatomyBoardAdapter` contract on the real
model. It is reached only through a dynamic `import('three')` inside
`ThreeDViewer`'s effect, so the 2D bundle never includes three.js (confirmed: the
render loop is stopped when nothing is dirty — no continuous repaint while the
learner studies one muscle).

Gestures, all with visible button equivalents: one-finger rotate, two-finger
pan+pinch, wheel/trackpad-pinch zoom, tap-with-threshold raycast selection,
pointer capture and cancellation, `gesturestart/gesturechange` prevention for
iPadOS Safari. Apple Pencil is reported as `pen` and behaves as a precise pointer.

Selection disambiguation, per-structure neutral tinting (stable per-id colours so
adjacent muscles are distinguishable — uniform whitening was a real bug observed
and fixed), correct/incorrect/focus/dim visual states, camera orbit driven from
orbit state every frame, reset and view buttons (anterior/posterior/lateral/medial).
Explicit `forceContextLoss` on destroy, because iOS Safari holds WebGL contexts
until GC and repeated mounts exhaust the browser's live-context limit.

### Three-gate enablement

`resolvePrivateThreeD` requires **all three**: `VITE_PRIVATE_3D=true` at build
time, the runtime switch in Settings (`localStorage
muscle-atlas.private-3d`), and every pack present and verified in the manifest.
The licence is deliberately **not** a load gate for private use with the
ShareAlike reasoning above — but it does gate **disclosure**, and the attribution
panel and every warning are driven by `LICENCE_VERIFIED = false`, which is where it
stays until the source project answers Q1/Q2 in writing.

Model files are served at `/private-models/*` by a dev-server plugin
(`plugins/private-model-assets.ts`) reading from `private/assets/open3dmodel/derived/`.
They are never copied into a build; there is no way to obtain one from a
production bundle.

### What is still missing and honest about it

- **Real-device testing**: all WebGL tests run headless Chromium at iPad
  viewports. The manual checklist in
  [three-d-ipad-safari-test-plan.md](three-d-ipad-safari-test-plan.md) has not been
  executed on an iPad Air M4.
- **Mapping review**: all 13 mappings are `draft`; no mapping is `published`.
- **Measured tap radii**: still `null` everywhere.
- **Trunk pack**: nonexistent at source; rectus abdominis, external oblique,
  erector spinae, frontalis, and sternocleidomastoid remain 2D-only.
- **Quiz-integrated 3D inspection** ("View in 3D" from a finished question):
  architected, not wired to the identify feedback screen yet.

## Test counts at time of writing

- Unit/integration: **448 tests across 22 files** (up from the 375 in the main
  document). Cover the new explore-view gating tests, fallback-state tests,
  private-mode gates, mesh mapper with real node names, camera maths, capability
  detection, and cache service.
- E2E: **102 tests across four Playwright projects** (ipad-landscape,
  ipad-portrait, keyboard, private-3d). The private-3d project loads the real
  derived model and draws pixels, and asserts the licence is never described as
  verified while the model is visible.
- Coverage: 71.33% statements, 81.88% branches, 68.52% functions, above every
  configured threshold.
