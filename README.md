# Muscle Atlas

> Learn the body by locating it.

An interactive anatomy study instrument for the muscular system, built as an installable
Progressive Web App and designed first for iPad Air (M4) on iPadOS Safari.

---

## Status

**The technical MVP is complete and passes every available automated check. It is not
releasable.**

Three things require human input that has not happened:

1. **Anatomy content is unreviewed.** Every structure is `draft`, `sources.json` is empty, and
   no qualified anatomy reviewer has signed off. Nothing can be asked about anything.
2. **Artwork is provisional.** The illustration is placeholder geometry, not a medical
   illustration, and is licensed `UNSET`.
3. **Real-device testing has not been performed.** No iPad Air M4 or iPadOS Safari was
   available in the build environment.
4. **The 3D model is not integrated.** The licence for the Open 3D Model could not be
   fully verified, so no model file ships and the 3D route explains itself honestly
   instead. See [3D anatomy](#3d-anatomy-optional) below.

These are enforced, not merely documented. `npm run build:release` refuses to produce a build
while the first two are true, the third is tracked in
[`docs/ipad-safari-test-plan.md`](docs/ipad-safari-test-plan.md), and the fourth is enforced
by the `3d-pack-licence-unset` validation rule, which is currently an error in any release
build.

---

## 3D anatomy (optional, private local use)

An optional 3D view of the [Open 3D Model for
Education](https://anatomytool.org/open3dmodel) — a university-developed, anatomically
reviewed model whose licence is stated as CC BY-SA but **not verified** — is now
**implemented against the real model files for private local use only**.

**Licence state:** the source project's landing page describes the licence in the future
tense ("the model *will be* licensed under CC BY-SA"), and the published archives contain
no licence file, README or attribution notice. This app is personal use, never published,
sold, hosted, or shared: nothing is distributed, so CC BY-SA's ShareAlike condition is
not triggered. That makes private use low-risk — it does **not** make the licence
verified. `LICENCE_VERIFIED` stays `false`, the attribution panel and every licence
warning stay visible, and no model file is ever copied into a build.

**What exists:** the lazy-loaded Three.js renderer and gestures behind two gates + pack
verification; official originals immutably archived and hash-tracked under
`private/assets/open3dmodel/original/` (git-ignored, excluded from every build); lossless
structural-trim derivatives (-99%, no geometry re-encode) with node-level verification;
real node-name mappings for 14 of 19 structures, all `draft` pending human anatomy
review; attribution roster; and the fallback/return-to-2D flow. Soleus is visible but
inspect-only, never a blind question, because gastrocnemius occludes it in the only
posterior view these packs provide.

**What does not exist:** trunk pack coverage (none released at source — rectus
abdominis, external oblique, erector spinae, frontalis and sternocleidomastoid remain
2D-only), measured on-device performance, real tap radii, or real-device QA. Every
automated WebGL test runs in headless Chromium; Safari on iPadOS is covered only by the
manual checklist.

The 2D board is the complete route to every structure regardless — 5 of 19 structures have
no sourceable 3D counterpart at all, because the source project has not released a
thorax/abdomen/back muscle pack.

| Document | Covers |
|---|---|
| [`docs/open3dmodel-license-and-attribution.md`](docs/open3dmodel-license-and-attribution.md) | The licence verification, evidence and open questions |
| [`docs/three-d-integration.md`](docs/three-d-integration.md) | Architecture, what was built, what remains |
| [`docs/three-d-integration-private-use.md`](docs/three-d-integration-private-use.md) | The private-use addendum: renderer, assets, derivatives, current state |
| [`docs/three-d-asset-pipeline.md`](docs/three-d-asset-pipeline.md) | Conversion pipeline specification and gates |
| [`docs/three-d-performance-budget.md`](docs/three-d-performance-budget.md) | Budgets and measured source data |
| [`docs/three-d-ipad-safari-test-plan.md`](docs/three-d-ipad-safari-test-plan.md) | Real-device checklist |
| [`docs/three-d-content-mapping-guide.md`](docs/three-d-content-mapping-guide.md) | Mapping rules and anatomy findings |

---

## Commands

```bash
npm install          # install dependencies
npm run dev          # development server, http://localhost:5173

npm run lint         # ESLint, zero warnings tolerated
npm run typecheck    # tsc --noEmit, strict + noUncheckedIndexedAccess
npm run validate:content   # validate the anatomy content pack, non-zero on failure
npm run test              # 448 unit and integration tests
npm run test:coverage     # coverage with thresholds
npm run test:e2e    # 102 end-to-end tests across four browser projects
npm run build        # production build (development-quality: provisional art, draft content)
npm run preview      # serve the production build with the service worker active
npm run validate:all # the full gate, in order: lint, types, content, tests, build, e2e

npm run build:release    # REFUSES to build until content is reviewed and art is licensed
npm run build:3d-derivatives   # build optimised derivatives from private originals
npm run verify:3d-assets       # verify originals intact + derivatives valid (run after any build:3d-derivatives)
npm run dev:3d                 # development server with private 3D assets enabled
npm run validate:icons   # regenerate the PWA icon set
```

`npm run build` succeeds and prints a prominent warning. That build is a **development
build**: it carries placeholder artwork and unreviewed text, it says so on every screen, and
it must not be published.

---

## What is implemented

| Area | Status |
| --- | --- |
| Explore mode | Complete — tap, labels, details, sources, practice-this handoff |
| Identify mode | Complete — round setup, 5/10/20/endless, hints, skip, reveal, results |
| Learn Then Test | Complete — labelled introduction then unlabelled recall |
| Review weak areas | Complete — documented priority rule with plain-language reasons |
| Progress | Complete — accuracy, breakdown, review queue, improving list, resets |
| SVG anatomy board | Complete — anterior and posterior, pointer events, pinch, pan, reset, disambiguation |
| Content pipeline | Complete — schemas, 20+ validator rules, CLI, repository |
| Persistence | Complete — IndexedDB, migrations, corruption recovery, session restore |
| PWA | Complete — manifest, icons, service worker, versioned caches, deferred updates |
| Accessibility | Baseline complete — keyboard route to every answer, focus management, reduced motion |
| Offline | Complete — availability service, calm messaging, no nag when cached |
| 3D viewer | **Architecture only** — mapping, capability detection, cache, fallback, attribution. No renderer, no model, licence gate open |

---

## What is tested automatically

Run `npm run validate:all` to reproduce. All of the following currently pass.

| Suite | Count | Covers |
| --- | --- | --- |
| Unit and integration | 375 | Schemas, validator, eligibility, evaluation, scheduling, mastery, persistence, migrations, viewport maths, hit resolution, board interaction, quiz flow, app shell, 3D mapping, capability detection, model cache |
| End-to-end | 87 | Navigation, layout invariants, board controls, content safety, orientation, persistence, keyboard, 3D route and attribution |

Coverage: 78.3% statements, 81.5% branches, 65.2% functions.

### Coverage the automation genuinely does not provide

Stated plainly, because pretending otherwise would be misleading:

- **Sequential keyboard focus.** Playwright's WebKit on Windows does not implement `Tab`
  traversal at all — Safari's behaviour depends on macOS Full Keyboard Access, which that
  build does not model. Keyboard traversal runs under Chromium instead, at the iPad viewport.
- **Real touch and Apple Pencil input.** jsdom has no `PointerEvent` and no layout, so the
  board's gestures are driven with synthesised events and `elementsFromPoint` is stubbed. The
  tap-versus-pan and multi-candidate logic are tested as pure functions.
- **Safari on iPadOS.** WebKit is approximately Safari. It is not iPadOS Safari.
- **VoiceOver, Switch Control, real contrast on a real display.**
- **Performance on device.** Budgets are defined in `src/config/app-config.ts`; measurements
  require hardware.
- **Any 3D rendering.** There is no renderer and no model. The 3D tests cover the mapping
  layer, the availability decision, the cache, and the honest-failure flow. They do not
  cover a model being displayed, because none exists.

---

## Documentation

| Document | Purpose |
| --- | --- |
| [`docs/ipad-safari-test-plan.md`](docs/ipad-safari-test-plan.md) | Real-device QA checklist — **not yet executed** |
| [`docs/content-authoring.md`](docs/content-authoring.md) | Taking a structure from draft to published |
| [`docs/reviewer-workflow.md`](docs/reviewer-workflow.md) | Medical review procedure and sign-off checklist |
| [`docs/asset-licensing.md`](docs/asset-licensing.md) | Artwork specification, licensing rules, release gate |
| [`docs/accessibility.md`](docs/accessibility.md) | Accessibility implementation and its known limits |
| [`docs/future-3d-and-body-systems.md`](docs/future-3d-and-body-systems.md) | 3D adapter design, adding a new body system, pack migration |
| [`docs/release-checklist.md`](docs/release-checklist.md) | What must be true before publishing |
| [`docs/00-design-brief.md`](docs/00-design-brief.md) | Product brief, personas, flows, learning rules, conflicts |
| [`docs/01-architecture.md`](docs/01-architecture.md) | Architecture, dependency rules, directory tree |
| [`docs/02-domain-model-and-schemas.md`](docs/02-domain-model-and-schemas.md) | Domain model and schema design |
| [`docs/03-anatomy-board.md`](docs/03-anatomy-board.md) | Board design, hit resolution, pointer model |
| [`docs/07-mvp-acceptance.md`](docs/07-mvp-acceptance.md) | MVP acceptance criteria and their real state |
| [`CHANGELOG.md`](CHANGELOG.md) | What changed |

---

## Reading before trusting any content or art

Three things in this project cannot be generated and must not be faked:

1. **Anatomy illustration.** No anatomical art ships here. Art must be commissioned or
   explicitly licensed.
2. **Medical facts.** Every summary is unreviewed draft text. Draft content is blocked from
   gameplay by the validator.
3. **Reviewer sign-off.** No structure is `published`, so no question can be asked.

Until those are real, the honest deliverable is a working instrument with clearly-labelled
provisional content — not a released anatomy product.

---

## Licence and medical disclaimer

Muscle Atlas is an educational study aid. It does not provide diagnosis, treatment advice, or
clinical decision support, and it does not replace anatomy laboratory instruction or
professional education. Illustrations are simplified teaching figures and do not represent the
full complexity of human anatomy.
