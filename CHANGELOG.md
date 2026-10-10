# Changelog

All notable changes to Muscle Atlas.

This project follows the shape of [Keep a Changelog](https://keepachangelog.com/), and the
project records content corrections here rather than applying them quietly: if a learner was
taught something wrong, that correction must be visible.

---

## [Unreleased]

### Added — optional 3D anatomy (architecture, gated)

**Deliberately not shipped: no model file is integrated.** The Open 3D Model licence could
not be fully verified, so all three packs are `blocked-pending-licence` and
`/explore/3d` explains why rather than pretending.

- Verified licence, provenance and attribution record from the official project pages,
  including two blocking ambiguities: the licence is described in the future tense, and
  the published archives contain no licence file, README or attribution notice.
- Full contributor roster captured verbatim from the project's credit page, rendered by
  `ModelAttributionPanel`, with upstream generations (BodyParts3D, Z-Anatomy, voxel
  source) credited as required for a share-alike derivative.
- `ThreeDVisualMapping` schema covering many-nodes-to-one-structure mappings, overlay
  parts, selection priority, occlusion policy, and publication gates requiring a reviewer,
  a review date, a measured tap radius and an educational source.
- 13 draft mappings built from real published node names read out of the official GLB
  packs — 1,044 nodes inspected across upper-limb and lower-limb.
- `MeshStructureMapper`, which reuses the 2D `resolveCandidates` rule so 3D selection
  asks rather than guesses when geometry overlaps.
- `auditNodesAgainstPack`, reporting missing nodes, duplicate claims and ambiguous
  priorities so a stale mapping fails loudly.
- Capability detection that is pure, testable, feature-detected only, never
  user-agent sniffed, and treats the absence of `deviceMemory` as a pass so Safari is not
  excluded.
- `ModelCacheService`: explicit-download only, no precache, versioned keys, progress kept
  separate from asset caches, and browser eviction surfaced rather than absorbed.
- `ThreeDViewerFallback` distinguishing what the learner can fix from what they cannot, so
  a licence block never tells someone to check their connection.
- Seven new content-validation rules covering unknown structures, unknown packs,
  duplicate node claims, mappings ahead of content, missing manifest entries, unset
  licences (an error in release builds) and missing attribution.
- Six documents: licence verification, integration, asset pipeline, performance budget,
  iPad Safari test plan, content mapping guide.

### Changed

- Content validation now optionally accepts 3D mapping and pack manifest files, so 2D-only
  content packs still validate unchanged.

---

## 1.0.0 technical MVP

### Added

**Application**

- React 19 + TypeScript + Vite application shell with a three-zone iPad-first layout.
- Six routes: Home, Explore, Practice, Identify, Progress, Settings, plus Credits.
- Responsive landscape and portrait layouts, safe-area insets, and a `dvh` â†’ `svh` â†’ `vh`
  viewport strategy with no bare `100vh` assumption.
- Design tokens, light and dark themes, and reduced-motion support.
- Development error boundary; no raw internal error is ever shown to a learner.

**Learning**

- Explore mode: tap, labels, sourced details, and a "practice this muscle" handoff.
- Identify mode: round setup, 5/10/20/endless rounds, hints, skip, reveal, and an honest
  results screen.
- Learn Then Test and Review weak areas, with a documented, inspectable priority rule.
- Outcomes `correct`, `incorrect`, `skipped`, `revealed`, `assisted` and `abandoned`, tracked
  distinctly. A revealed answer can never count as unassisted.
- Leitner-style scheduling with intervals of 10 minutes, 1, 3, 7 and 21 days, and a mastery
  band that requires three separate unassisted successes.

**Anatomy board**

- SVG board with anterior and posterior views, one pointer-events model for touch, Pencil,
  mouse and trackpad.
- Tap-versus-pan with a movement threshold; one-finger panning disabled at fit scale so a drag
  can never be mistaken for a selection.
- Pinch zoom scoped to the board, with visible zoom and reset controls.
- Multi-candidate resolution: one candidate selects, several prompt, ties never guess.
- A disambiguation chooser that describes positions and never names structures in blind mode.
- All twelve visual states driven by `data-visual-state` and rendered in CSS.

**Content and safety**

- Zod schemas for every external JSON boundary.
- Twenty-plus named validator rules, a CLI (`npm run validate:content`), and a report that
  states plainly why nothing is publishable yet.
- Build flags that default to describing the bundle truthfully, and a release guard that
  refuses to build while artwork is provisional or content is draft.
- Credits screen generated from the asset manifest rather than hand-written.

**Persistence and offline**

- IndexedDB via Dexie, with versioned stores, migrations, and three distinct storage-recovery
  paths.
- Unfinished rounds persisted after every answer and flushed on visibility change, so an
  interruption loses nothing.
- Service worker with versioned caches, deferred updates, and a banner that never reloads
  during a round.
- Asset availability service that stays silent when content is cached and explains a first
  download clearly when it is not.

**Tests and tooling**

- 299 unit and integration tests; 63 end-to-end tests across three browser projects.
- Coverage thresholds enforced at 65% functions, 70% statements and lines, 70% branches.
- Generated PWA icons written by a dependency-free PNG encoder.
- Generated anatomy geometry and mappings, kept in step by a single generator.

### Fixed during development

Recorded because each was a real defect found by a test, not a hypothetical.

- **A first-ever answer could not be saved.** New progress records were created with an empty
  `profile_id`, so the very first question of every round failed to persist.
- **A restored round showed the wrong question number.** After one answer, a resumed round
  displayed "Question 1" while the learner was on question 2.
- **Panning moved the artwork opposite to the finger**, and zoom-around-origin and
  focus-to-structure had inverted signs, so a focused structure was framed to the wrong place.
- **The queue shuffle could produce adjacent duplicates.** A swap-based fix moved the problem
  rather than removing it; replaced with an alternating-slot algorithm that cannot.
- **A skip doubled its own review timestamp**, pushing the structure a year into the future.
- **The first answer after promotion jumped straight to a one-day interval.** The scheduler now
  schedules from the current box and only then advances it.
- **Two IndexedDB tables were named in kebab-case**, which Dexie does not map to camelCase
  properties, so those stores were unreachable.
- **`activeSession` clobbered a round's identity** by overwriting `session_id` with its storage
  key. Rounds are now keyed by their own id, and "the active session" is the most recently
  started unfinished round.
- **The production build was unusable.** `ALLOW_DRAFT_CONTENT` defaulted to false in production,
  so the shipped development build failed content validation and rendered a raw validator dump
  instead of the app.
- **A content-load failure crashed every screen**, because consumers received a `null`
  repository. They now receive a genuinely empty one and show a calm message.
- **The drawer announced two controls named "Close reference"**, because its backdrop was
  exposed to assistive technology. The backdrop is now hidden from it.
- **The focus trap filtered on `offsetParent`**, which is null for every element in a DOM-less
  environment and unreliable for fixed-position subtrees in a real browser.
- **Board gestures were lost when a finger slid off the board**, because moves were bound as
  React synthetic events on the board element. Gestures are now tracked on `window` natively.
- **`T` typing in a field also reset the view**, before the shortcut guard existed.

### Known limitations

- Anatomy content is unreviewed draft text; `sources.json` is empty; nothing is publishable.
- Artwork is provisional placeholder geometry with an unset licence.
- No iPad Air M4 or iPadOS Safari testing has been performed.
- Keyboard traversal is verified under Chromium because Playwright's WebKit on Windows does
  not implement `Tab` navigation.
- Touch and Pencil gestures are verified against synthesised events, because jsdom has no
  `PointerEvent` and no layout engine.
- Timed challenge is defined and defaulted off, but its countdown is not yet wired into the
  round.

---

## [0.1.0] â€” Phase 0 blueprint

### Added

- Product brief, learner personas, user-flow map, learning-design rules, UX rules and iPad
  behaviour rules.
- Technical architecture, dependency boundaries, exact directory tree and a Mermaid diagram.
- Domain model and Zod schema design for all seven entity types.
- `AnatomyBoardAdapter` contract, written as a real type-only file.
- SVG board design including the multi-candidate hit-resolution strategy.
- Asset pipeline, licensing rules, and a manifest template.
- Medical content-review workflow with a printable reviewer checklist.
- iPad Safari test plan, written before any code and explicitly marked unexecuted.
- MVP acceptance checklist with blockers left visibly open.
- Five conflicts between the brief and reality, each resolved rather than ignored.

### Removed

- An unrelated prototype `index.html` written before the specification existed.
