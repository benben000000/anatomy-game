# Phase 0 — MVP Acceptance Checklist

Status: complete, awaiting approval

This maps the 25 definition-of-done conditions to their current state, with the evidence that
would close each one.

Legend: `[ ]` open · `[~]` partially done · `[x]` done and verifiable

Three conditions cannot be closed by engineering work alone. They are marked `[ ]` and called
out in §3, because closing them dishonestly would mean inventing art, inventing medical
facts, or inventing reviewer sign-off.

---

## 1. Application and platform

| # | Condition | State | Closes when |
| --- | --- | --- | --- |
| 1 | Runs as a browser application | `[ ]` | Phase 1 shell runs via `npm run dev` |
| 2 | Works in Safari on iPad Air M4 | `[ ]` | Real-device test plan section 3–13 executed and recorded |
| 3 | Works in Safari browser mode and installs as a Home Screen web app | `[ ]` | Test plan P1–P8 pass on device |
| 4 | Supports offline play once content is cached | `[ ]` | Test plan O1–O10 pass |
| 5 | Optimised for landscape, usable in portrait | `[ ]` | Test plan L1–L15 pass |
| 6 | Functional Explore Mode | `[ ]` | Phase 5 |
| 7 | Functional Identify Mode | `[ ]` | Phase 4 |
| 8 | 5- and 10-question rounds complete | `[ ]` | Phase 4 |
| 9 | Anterior and posterior views supported | `[ ]` | Phase 3, with real art |
| 10 | ≥ 8 approved, published, individually selectable structures | `[ ]` | **Blocked — see §3.1** |
| 11 | Every target has source, review state, licence record, mapping | `[ ]` | **Blocked — see §3.1** |
| 12 | Every active muscle selectable via intentional SVG path | `[ ]` | **Blocked — see §3.1** |
| 13 | Answers evaluated by stable structure ID | `[~]` | Contract designed in `anatomy-board-adapter.ts`; implemented Phase 4 |
| 14 | Six outcomes distinct | `[~]` | Schemas designed; implemented Phase 4 |
| 15 | Feedback immediate, calm, instructive, non-punitive | `[~]` | Copy designed; implemented Phase 4 |
| 16 | Progress persists in IndexedDB, survives restart | `[ ]` | Phase 4, verified by test plan I9–I10 |
| 17 | Interrupted session restorable | `[ ]` | Phase 6 |
| 18 | Results show accuracy and review recommendations | `[ ]` | Phase 5 |
| 19 | Content externalised, validated, separate from logic | `[~]` | Schemas specified; implemented Phase 2 |
| 20 | Debug validation catches broken mappings | `[~]` | 22 rules specified; implemented Phase 2 |
| 21 | Touch, Pencil, keyboard, trackpad all work | `[ ]` | Phase 3, verified on device |
| 22 | Accessibility basics implemented | `[~]` | Architecture specified; Phase 7 |
| 23 | UI does not look AI-generated | `[ ]` | Phase 7 design review against the prohibited-pattern list |
| 24 | No unauthorized assets, fabricated facts, fake review claims | `[ ]` | Gated by build flags and validator; verified at release |
| 25 | Architecture supports 3D and new systems without engine changes | `[~]` | Adapter contract written; proven by the fake-board conformance suite in Phase 3 |

---

## 2. Phase 0 deliverables

| Deliverable | State | File |
| --- | --- | --- |
| Design brief | `[x]` | `docs/00-design-brief.md` |
| Learner personas | `[x]` | `docs/00-design-brief.md` §3 |
| Learning goals | `[x]` | `docs/00-design-brief.md` §4 |
| Non-goals | `[x]` | `docs/00-design-brief.md` §1 |
| Core user flows | `[x]` | `docs/00-design-brief.md` §5 |
| UX rules | `[x]` | `docs/00-design-brief.md` §7 |
| iPad behaviour rules | `[x]` | `docs/00-design-brief.md` §8 |
| Technical architecture | `[x]` | `docs/01-architecture.md` |
| Architecture diagram | `[x]` | `docs/01-architecture.md` §3 (Mermaid) |
| Exact folder tree | `[x]` | `docs/01-architecture.md` §4 |
| Domain model | `[x]` | `docs/02-domain-model-and-schemas.md` |
| Zod schema design | `[x]` | `docs/02-domain-model-and-schemas.md` |
| `AnatomyBoardAdapter` contract | `[x]` | `src/features/anatomy-board/contracts/anatomy-board-adapter.ts` |
| SVG asset pipeline | `[x]` | `docs/04-asset-pipeline-and-licensing.md` |
| Asset/licence manifest template | `[x]` | `docs/04-asset-pipeline-and-licensing.md` §10 |
| Content-review workflow | `[x]` | `docs/05-content-review-workflow.md` |
| iPad Air M4 test plan | `[x]` | `docs/ipad-safari-test-plan.md` |
| MVP acceptance criteria | `[x]` | this file |
| Phase 1 task list | `[x]` | `docs/08-phase1-tasks.md` |
| Conflicts identified and resolved | `[x]` | `docs/00-design-brief.md` §9 |
| Run instructions | `[ ]` | Added per phase from Phase 1 onward |

---

## 3. Blockers that engineering cannot close

### 3.1 Conditions 10, 11, 12 — real art, real review

Closing these needs, before any code can help:

1. **Commissioned or licensed vector anatomical illustration**, anterior and posterior, neutral
   pose, layered SVG with per-structure named groups.
2. **A qualified anatomy reviewer** who checks facts and the art-to-structure mapping, and
   signs off in `sources.json` and `structures.json`.
3. **A licence** covering web delivery, modification, and distribution, recorded in
   `asset-manifest.json`.
4. **Verified source references** for every published structure.

What can be built meanwhile: the complete application, with `draft` content and watermarked
provisional geometry, fully testable in every other respect.

What cannot be done: shipped. A build containing provisional art and draft text must not reach
a learner, and the build flags and validator rules exist specifically to make that impossible
rather than merely discouraged.

**This is the critical path and should start in parallel with Phase 1, not after it.**

### 3.2 Condition 2 — real-device verification

Needs physical hardware. Playwright WebKit and Chrome device emulation do not substitute.
The test plan is written and ready; the Result columns stay empty until someone runs it.

### 3.3 Approved educational sources

`sources.json` ships empty. Inventing plausible-looking textbook citations would be worse than
having none: a fabricated citation in a study aid is a fabrication the learner cannot detect,
and it undermines every real citation beside it.

---

## 4. Quality gates per phase

### Every phase

- [ ] `npm run typecheck` clean under `strict` + `noUncheckedIndexedAccess`
- [ ] `npm run lint` clean
- [ ] `npm test` green
- [ ] No muscle name in `src/domain/**` or `src/features/learning/**`
- [ ] No draft content reachable
- [ ] No `console.log` outside the dev-only logger
- [ ] Keyboard path works for anything mouse/touch can do
- [ ] Reduced-motion path works
- [ ] Performance budget not regressed

### Phase 2 additionally

- [ ] Invalid data fails validation cleanly, with an actionable message
- [ ] Draft content cannot enter gameplay
- [ ] Validator catches broken mappings, with a test for each rule

### Phase 3 additionally

- [ ] Adapter conformance suite passes against the fake board
- [ ] ≥ 8 demo targets accurately tappable
- [ ] Debug overlay confirms mappings
- [ ] No structural DOM mutation outside the CSS state map

### Phase 6 additionally

- [ ] Cached content plays offline
- [ ] Active round survives interruption
- [ ] Updates never interrupt
- [ ] `skipWaiting` is not automatic
- [ ] Reload requires an explicit tap

### Phase 7 additionally

- [ ] All 25 conditions above verified or explicitly, honestly reported as open
- [ ] Test plan executed on device
- [ ] Credits screen matches the manifest exactly
- [ ] Documentation current for content authors and reviewers

---

## 5. Anti-slop verification

Reviewed at Phase 7 by walking the running app. Any hit is a release blocker.

- [ ] No emoji or emoticon in product UI
- [ ] No chatbot or AI assistant surface
- [ ] No motivational filler
- [ ] No fake clinical charts, scans, patient files, or statistics
- [ ] No stock doctor, lab, DNA, or brain imagery
- [ ] No cyberpunk, neon, or sci-fi treatment
- [ ] No giant gradient blobs
- [ ] No excessive glassmorphism or blur
- [ ] No glow on every element
- [ ] No rainbow accents
- [ ] No dashboard wall of floating rounded cards
- [ ] No oversized pills, tags, badges, or chips
- [ ] No excessive rounded rectangles
- [ ] No decorative badges without learning meaning
- [ ] No confetti for routine correctness
- [ ] No streaks, currency, energy, loot boxes, or pay-to-win
- [ ] No ads, fake testimonials, or urgency
- [ ] No intrusive modals for ordinary actions
- [ ] No hidden essential controls
- [ ] No tiny low-contrast labels
- [ ] No unexplained infinite loading spinner
- [ ] No `alert()` for feedback
- [ ] No default icon set used thoughtlessly
- [ ] Anatomy board is the largest, most prominent element
- [ ] Exactly one obvious primary action per screen
