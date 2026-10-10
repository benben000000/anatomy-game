# 3D performance budget

**Status: budget defined from measured source data. No optimised pack exists yet.**

Companion to [`three-d-integration.md`](three-d-integration.md).

---

## Primary target

**iPad Air M4, Safari, held in both hands, used for a study session of 10–30
minutes.**

This is the constraint every number serves. The M4 has ample raw power; the risks
are thermal throttling over a long session, battery, memory ceiling under iPadOS,
and the cost of decoding a large model — not peak frame rate.

Nothing here is a desktop target. A budget that assumes a discrete GPU is worthless.

---

## Budget

| Metric | Budget | Enforcement |
|---|---|---|
| Triangles per pack | 1,500,000 | pre-export check |
| Draw calls | 120 | pre-export check |
| Textures | 16 | pre-export check |
| Largest texture | 1024 px | pre-export check |
| Pack download size | 8 MB | per pack |
| All packs combined | 20 MB | total on-disk |
| Frame time | 16.7 ms (60 fps) | on-device |
| Time to first frame | 3 s | on iPad Air M4 |
| Memory | 400 MB | on iPad Air M4 |
| App bundle, 2D index chunk | 220 kB gzip | **already enforced** |

The 2D budget is enforced in the build. The 3D budgets become enforceable once a
conversion pipeline runs.

---

## Measured source data

From the published archives, 2026-10-10:

| Metric | upper-limb | lower-limb | Budget | Verdict |
|---|---|---|---|---|
| Triangles | 1,368,260 | 1,302,531 | 1,500,000 | just inside |
| Meshes | 532 | 472 | 120 draw calls | **over** |
| Materials | 95 | 68 | — | high |
| Textures | 84 | 63 | 16 | **over** |
| File size | 5.87 MB | 5.72 MB | 8 MB | inside |

**Both packs are individually within budget and collectively far too heavy.**

---

## Why the published files will not hold 60 fps

**Mesh count, not triangle count.** 1.37 M triangles is unremarkable for an M4 on
its own. 532 separate draw calls with 95 materials and 90 textures is not. Per-draw
state changes, shader binds and uniform uploads dominate well before the vertex
shader saturates the GPU.

**Draco decode cost.** Both packs require `KHR_draco_mesh_compression`. Decoding
~1.37 M triangles is a one-time CPU cost paid on the main thread unless it is
deliberately moved off it. On the primary target this is the largest single stall in
the load path and must be measured, not assumed.

**Thermal, not thermal throttling.** Ten to thirty minutes of held-device use is
long enough for sustained load to matter. A benchmark measured in the first ten
seconds says nothing about minute twenty.

---

## Load strategy

1. **Download first, parse never in the main path.** Fetch and cache the raw `.glb`.
2. **Decode off the main thread** via a Web Worker, or accept the stall knowingly
   and measure it.
3. **Time to first frame** means showing the model at a coarse level of detail,
   then refining. A blank canvas for four seconds is a failure.
4. **Progress must be real.** Report bytes fetched, not a synthetic animation.
   See `ModelCacheService.download`.
5. **Cancellation must work.** A learner can navigate away mid-download.

---

## Levers

In rough order of value:

| Lever | Expected effect |
|---|---|
| Trim to mapped structures only | **largest** — removes most of the mesh count |
| Merge meshes per structure | large — collapse draw calls |
| Reduce texture count and size | large |
| Simplify triangle count | moderate |
| Reduce material count | moderate |
| Swap to WebGPU | **not a budget lever** — see below |

### WebGPU is not an optimisation

WebGPU may eventually help, but it is feature-detected and optional, never required.
It cannot appear in the budget as a way to justify accepting an over-budget WebGL
pack, because the primary target may not have it.

---

## Degradation

Measured on device, not assumed:

- Sustained frame rate after the session warms past 10 minutes
- Time to first frame on the M4
- Peak memory
- Behaviour under memory pressure and after backgrounding
- Behaviour on the oldest iPad still supported

If a device cannot hold the budget, the honest response is the fallback: an accurate
explanation and a complete 2D board. Never a reduced-fidelity model presented as
full quality.

`evaluateCapabilities` implements the gate. It blocks below 4 GB `deviceMemory`, but
**treats absence as pass**, because Safari does not implement `deviceMemory` and
failing on absence would disable 3D on the primary target.

---

## Current status

**No optimised pack exists.** No budget has been met, because no derivative has been
produced.

The numbers above are measurements of the *source* files. Reporting them as
performance results would misrepresent the state of the work. Real figures require
Stage 1–4 of [`three-d-asset-pipeline.md`](three-d-asset-pipeline.md) to run, which
requires a licensed asset.

**All 3D performance measurement remains to be done on real iPad Air M4 hardware.**