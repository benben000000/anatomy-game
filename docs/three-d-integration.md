# 3D anatomy integration

**Status: architecture complete and tested; asset integration blocked on licence.**

Last updated 2026-10-10. See
[`open3dmodel-license-and-attribution.md`](open3dmodel-license-and-attribution.md)
for the licence gate.

---

## What this document is

The design and implementation record for optional 3D anatomy in Muscle Atlas. It
covers what was built, why, and exactly what remains before a model can ship.

---

## Design rules

### 3D is additive, never a prerequisite

The 2D board is the complete route to every structure. A learner must never hit a
dead end, a spinner, or a paywall-like wall because 3D failed. Every failure path
returns to 2D with the same content available.

This is not a fallback for convenience. Five of nineteen structures have no sourceable
3D counterpart at all, so 3D could never be the primary route for them.

### The renderer knows nothing about muscles

The learning engine resolves structures through `AnatomyBoardAdapter` and never
imports anything from the board implementations. There is no muscle-specific logic
in any renderer file. `MeshStructureMapper` turns raw glTF node names into stable
`structure_id` values and imports no Three.js, so it is testable without a GPU
context and cannot accidentally pull a renderer into the 2D bundle.

### Never block the 2D quiz

3D is lazily loaded, mounted on its own route, and fails independently. A slow or
failing model can never delay or interrupt a quiz.

---

## What was built

| Module | Path | Purpose |
|---|---|---|
| Mapping schema | `src/domain/anatomy/three-d-mapping.ts` | Zod schemas + node audit |
| Capability detection | `…/board-3d/capabilities.ts` | Pure, testable, no renderer import |
| Mesh mapper | `…/board-3d/MeshStructureMapper.ts` | Node → structure resolution |
| Mapping data | `src/data/systems/muscular/three-d-visual-mappings.json` | 13 drafts, real node names |
| Pack manifest | `public/models/open3dmodel/manifests/…` | All packs blocked, with reasons |
| Cache service | `src/services/assets/ModelCacheService.ts` | Explicit-download offline storage |
| Fallback UI | `src/components/anatomy/ThreeDViewerFallback.tsx` | Honest failure, always a way back |
| Attribution panel | `src/components/anatomy/ModelAttributionPanel.tsx` | CC BY-SA compliance |
| Route | `src/features/three-d/ThreeDExploreView.tsx` | Lazy entry point |

### Bundle isolation

The 3D route is a separate lazy chunk. Measured from the production build:

```
assets/index-*.js                    480.31 kB │ gzip: 136.44 kB
assets/ThreeDExploreView-*.js         22.10 kB │ gzip:   7.52 kB
```

The 2D index chunk is unchanged and stays within the 220 kB budget. No Three.js is
imported anywhere today, because no model ships.

### Code splitting confirmed

`npm run build` produces `ThreeDExploreView-*.js` as its own chunk. Opening
`/explore/3d` fetches it on demand; the 2D flow never downloads it.

---

## Selection resolution

A 3D model places muscles on top of each other constantly — deltoid over
supraspinatus, biceps over brachialis, gastrocnemius over soleus.

The tempting implementation is "closest raycast hit wins". That is wrong in a way
that silently corrupts assessment: a learner tapping the calf is marked wrong for
tapping the soleus, when the honest answer is that the model shows both and they
overlap.

So 3D selection routes through the **same** `resolveCandidates` function the 2D board
uses, and inherits the same guarantees — one candidate selects, several prompt,
ties never guess. The same disambiguation chooser renders for both renderers because
the outcome type is shared.

Tested:

- one node struck → `direct` selection
- two structures struck → `needsDisambiguation` with both candidates
- unmapped nodes struck → no selection, no false answer
- candidates never expose raw mesh identifiers

---

## Overlay handling

The source project models named parts of continuous structures as separate objects
**above** the parent. Verified in the published node lists:

- `Deltoid muscle.r` exists alongside `Acromial part of deltoid muscle.r` et al.
- `Pectoralis major.r` exists alongside its abdominal, clavicular and sternocostal heads
- `Trapezius muscle.r` exists alongside its ascending, descending and transverse parts

If selecting a part silently answered for the parent, a learner aiming at "the
clavicular head" would be scored as having identified the whole deltoid. That is a
wrong answer recorded as a right one.

Mitigation: parts carry `is_parent_overlay: true`, the mapping declares
`occlusion_policy: 'peel'`, and overlay nodes are inert unless a future mode
explicitly enables them. Three independent layers reject a mapping that combines
overlays with `occlusion_policy: 'always'` — the Zod schema, the content validator,
and the mapper's default.

---

## Tapping fairness

Structures differ enormously in how fairly they can be tapped in 3D.

| Structure | Policy | Reason |
|---|---|---|
| rectus femoris, vastus lateralis, tibialis anterior, gluteus maximus | `always` | Large, anterior or posterior, unobstructed |
| serratus anterior | `requires_disambiguation` | Small area against the rib cage, partly hidden by the scapula |
| vastus medialis | `requires_disambiguation` | Abuts rectus femoris |
| soleus | `only_when_unoccluded`, draft | Largely covered by gastrocnemius in the only posterior view this pack provides — **not fairly askable from behind** |

That last row is a real content finding, not a limitation of the code. Soleus is
marked draft pending a reviewer decision, mirroring the same question raised for the
2D board. It is left visible and honest rather than quietly removed.

`fair_target_radius_m` is `null` for every mapping and **cannot be null on a
published mapping**. Real-world tap radii must be measured on device, not guessed.

---

## Availability decision

`evaluateCapabilities` checks in this order, and the order is deliberate:

1. **Licence** — a technically perfect device with an unverified asset must still be
   blocked. Offering it would present unlicensed content as a finished feature.
2. **WebGL** — requires a *created context*, not merely the presence of
   `getContext`. iPadOS may expose the API while refusing the context.
3. **Data saver** — respects `navigator.connection.saveData`.
4. **Performance** — `deviceMemory` below 4 GB blocks. **Absence is not failure**:
   Safari does not implement `deviceMemory`, and treating its absence as a failure
   would disable 3D on the primary target device.
5. **Cached pack** — nothing downloads implicitly.

WebGPU is probed by requesting an adapter, never by checking for `navigator.gpu`
(an adapter request commonly fails on Safari even when the object exists). It is
reported as an enhancement and is **never** a gate.

### Feature detection only

No user-agent sniffing anywhere. An iPad on iPadOS 18 and an iPad on iPadOS 26 are
both "an iPad", and the WebGL situation differs between them.

### Messages that distinguish what the learner can fix

| Reason | Learner can fix it? |
|---|---|
| `no-cached-pack` | yes — download once |
| `reduced-data-saver` | yes — turn off data saver |
| `no-webgl` | no |
| `insufficient-performance` | no |
| `pack-licence-blocked` | **no** |

This distinction is the point. Telling someone to check their connection when a
licence is the blocker wastes their time and teaches them the app is unreliable. A
test asserts the licence message never suggests reconnecting, and that no message
ever says "public domain" or "open source".

---

## Offline behaviour

Implemented in `ModelCacheService`:

- **Nothing downloads without explicit action.** No precache, no speculative fetch.
  A learner on a metered connection is never surprised by a 6 MB transfer.
- **Progress is never stored in a cache.** Progress lives in IndexedDB, so cache
  eviction can never cost learning history.
- **Versioned keys.** A new pack never overwrites an old one; superseded versions are
  detected and reported as `stale`.
- **Browser eviction is surfaced, not absorbed.** Silently losing a 6 MB download is
  exactly what makes a PWA feel broken.
- **No auto-reload during a live quiz.**

The production build precaches 29 entries totalling 699 KiB. **No model is
precached**, and none should be added to that list.

---

## Validation

New rules in `ContentValidator`, all tested:

| Rule | Prevents |
|---|---|
| `3d-mapping-unknown-structure` | Mapping silently disagreeing with the 2D source of truth |
| `3d-mapping-unknown-pack` | Mapping pointing at an undeclared pack |
| `3d-node-claimed-twice` | Two mappings claiming one node — ambiguous by construction |
| `3d-mapping-ahead-of-structure` | Unreviewed geometry ahead of unreviewed content |
| `3d-pack-missing-manifest-entry` | A 3D asset with no creator, licence or modification note |
| `3d-pack-licence-unset` | Shipping unverified terms — **warning in dev, error in release** |
| `3d-verified-pack-without-attribution` | A share-alike asset with no attribution requirement |

Plus seven schema-level rules, including: no publication without a reviewer, review
date, measured tap radius and educational source; no duplicate parts; no empty
parts list.

`3d-pack-licence-unset` was not theoretical — it fires on the current build, for all
three packs, which is the correct state.

The rules also caught a genuine defect during development: the hand pack had no
asset manifest entry, and the validator refused to pass until it did.

---

## Tests

**76 new unit and integration tests**, bringing the total to 375 across 18 files.
**24 new E2E tests**, across landscape and portrait.

The mapper tests use the **real published node names** — `Deltoid muscle.r`,
`Acromial part of deltoid muscle.r` — rather than tidy invented ones, because
coping with the source project's actual naming is the whole job.

Particular tests:

- tendon and bursa nodes resolve to nothing, so a learner is never marked wrong for
  tapping a tendon when asked for the muscle
- structures with no 3D counterpart are named explicitly
- the schema refuses a published mapping with no reviewer, tap radius or source
- node drift is reported rather than silently becoming unselectable
- the licence message never suggests reconnecting

---

## What is NOT built

Stated plainly, because the gap is easy to overstate:

- **No Three.js renderer.** No scene, camera, raycaster or render loop exists.
- **No model file.** No `.glb` in the repository or served at runtime.
- **No Draco decoder.** Required by both packs; must be bundled locally, never
  fetched from a CDN.
- **No gesture handling.** 1-finger rotate, 2-finger pan and pinch zoom are
  specified in the test plan and **not implemented**, because there is nothing to
  manipulate. Implementing them against placeholder geometry would produce code
  tested against a fiction.
- **No measured tap radii.** All `null`, blocking publication.
- **No WebGPU path.** Probed and reported only.
- **No trunk-pack coverage.** Unavailable upstream.

---

## Remaining work

### Blocking — licence

1. Resolve Q1 and Q2 with the Open3Dmodel project.
2. Obtain the project's written ShareAlike decision (Q3).
3. Record the licence in the manifest; this flips `3d-pack-licence-unset` to pass.

### Blocking — content review

4. Confirm each of the 13 mappings against the actual geometry. A node name that
   reads correctly may still be the wrong mesh. **No mapping may be published by
   machine.**
5. Measure real tap radii on an iPad Air M4.
6. Resolve soleus, which is not fairly askable in the available packs.
7. Review the seven structures with no 3D counterpart and confirm the 2D-only path.

### After licensing

8. Build the conversion pipeline — trimming, merging, texture reduction, Draco
   verification. See [`three-d-asset-pipeline.md`](three-d-asset-pipeline.md).
9. Implement the renderer and gestures. See
   [`three-d-ipad-safari-test-plan.md`](three-d-ipad-safari-test-plan.md).
10. Re-measure against the performance budget.
11. Real-device iPad Air M4 Safari QA.

Steps 8–11 require licensed assets and cannot begin before then. The tests written
for them will be the specification they are built against.

---

## Conclusion

The technical 3D integration is implemented and passes the available automated checks. Before public release, it still requires the documented license verification, anatomy mapping review, final attribution audit, and real-device iPad Air M4 Safari QA.