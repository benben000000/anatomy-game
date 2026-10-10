# Release Checklist

Muscle Atlas is **not releasable today.** This checklist states exactly what must be true, and
which items are currently blocking.

---

## 1. Blocking items

These three are the whole of the blocker. Everything else is ready.

| # | Blocker | Who | Evidence required |
| --- | --- | --- | --- |
| B1 | **Anatomy content reviewed.** A qualified anatomy reviewer has checked every published structure's location and function, and signed off. | Anatomy reviewer | `sources.json` non-empty with reviewer name, credentials and review date on each entry; `structures.json` shows `published` / `approved` |
| B2 | **Artwork licensed and reviewed.** Licensed vector anatomy replacing the placeholder geometry, mapped to `visual_id`, and confirmed by an art reviewer. | Asset owner + anatomy reviewer | Real licence in `asset-manifest.json`; `medical_review_status: "approved"`; `license_reference` set on every mapping |
| B3 | **Real-device QA on iPad Air M4.** The full matrix in the test plan, executed in Safari browser mode and Home Screen web-app mode. | QA | Completed `docs/ipad-safari-test-plan.md` with recorded results |

`npm run build:release` refuses to run while B1 and B2 are unsatisfied. B3 is enforced by
policy, not by tooling, because it requires hardware.

---

## 2. Automated gate

Must be green. Currently green.

- [x] `npm run lint` — zero warnings tolerated
- [x] `npm run typecheck` — strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- [x] `npm run validate:content` — valid, with zero publishable structures pending B1
- [x] `npm run test` — 299 unit and integration tests
- [x] `npm run test:coverage` — thresholds met
- [x] `npm run build` — production build succeeds
- [x] `npm run test:e2e` — 63 end-to-end tests across three projects
- [x] `npm run validate:all` — the whole gate, in order

---

## 3. Content

- [ ] Every published structure cites at least one source
- [ ] Every source records a reviewer name, credentials and review date
- [ ] Every published structure has an approved, selectable mapping per view
- [ ] Every referenced asset is approved and licensed
- [ ] No `UNSET` or `proprietary_restricted` licence anywhere
- [ ] Attribution captured and rendered by the Credits screen
- [ ] No draft or retired content reachable in any mode
- [ ] Curriculum decisions recorded for serratus anterior, vastus medialis, erector spinae,
      soleus and the hamstring group (see `docs/04-asset-pipeline-and-licensing.md` §3)

---

## 4. Artwork

- [ ] Layered SVG master with one named group per structure, named by `visual_id`
- [ ] Anterior and posterior share viewBox, scale and ground line
- [ ] Adjacent muscles distinguishable without relying on hue
- [ ] `min_fair_target_px` measured on a real iPad for every mapping
- [ ] Fairness affordance confirmed on device for every sub-44 px target
- [ ] SVG optimisation preserves all identifiers; no script, handler or external reference
- [ ] Provisional artwork removed, and its notice removed with it

---

## 5. Quality

- [ ] No production route depends on a test fixture
- [ ] No development fixture reachable in a release build
- [ ] No dead code, unfinished required UI, broken route or unresolved warning
- [ ] No AI-generated anatomy presented as reviewed content
- [ ] Anti-slop checklist in `docs/07-mvp-acceptance.md` §5 walked on the running app
- [ ] Build output is production-ready and cache sizes are recorded

---

## 6. Legal and privacy

- [ ] Every asset licence read and verified for web delivery, modification and distribution
- [ ] Share-alike obligations assessed and satisfied, or the licence rejected
- [ ] Credits screen renders from the manifest and matches it exactly
- [ ] Font licence shipped
- [ ] No personal data collected; no accounts; no analytics; no network calls
- [ ] Privacy statement accurate: local-only, nothing leaves the device

---

## 7. The honest closing sentence

The project is release-ready only when **all** of the following are true:

- B1, B2 and B3 are complete.
- Every section above is checked.
- `npm run validate:all` is green on the release branch.
- `npm run build:release` succeeds.

Until B3 is complete, no claim of iPad Air M4 support exists, and this document must not be
marked complete.
