# 3D asset pipeline

**Status: specification only. No conversion has been run — no asset is licensed.**

Companion to [`three-d-integration.md`](three-d-integration.md).

---

## Why no pipeline has run

The brief is explicit: *"Do not integrate any file before the source/license record
is complete."* Two blocking licence questions are open. Running a conversion would
produce a derivative under an unverified licence, which is the exact outcome the
gate exists to prevent.

This document specifies the pipeline so it can be executed correctly once
licensed. It is not a description of work done.

---

## Preconditions

All must hold before any conversion begins:

- [ ] Q1 resolved — CC BY-SA 4.0 confirmed in force
- [ ] Q2 resolved — licence instrument identified
- [ ] Q3 resolved — owner accepts ShareAlike on the derivative
- [ ] Source archives downloaded and SHA-256 recorded
- [ ] Blender version pinned and recorded
- [ ] Attribution roster captured at the time of download

Source hashes already recorded:

```
upper-limb-glb.zip  5AF0190A6D7BF47393447AC30021E4F3BA619721C7F3A620C39A895947078432
lower-limb-glb.zip  82AD6894BEC6E77BB2ABA970105F6EE7F0F694DE93494932EB634FD0150745C7
```

Re-verify on download. A changed hash means a changed pack and a re-audit.

---

## Directory layout

```
assets-source/open3dmodel/
├── metadata/
│   ├── original-source-record.json      # created — verification record
│   └── download-manifest.json           # to create at download time
├── original/DO_NOT_EDIT/                # empty — no asset acquired
│   └── .gitkeep
├── conversion-notes/
│   ├── 01-inspection.md                 # to create
│   ├── 02-trim.md                       # to create
│   ├── 03-retexture.md                  # to create
│   └── 04-export.md                     # to create
└── LICENSES/
    ├── CC-BY-SA-4.0.txt                 # to create at licensing time
    └── ATTRIBUTION.md                   # generated from the roster

public/models/open3dmodel/
├── manifests/muscular-3d-pack.manifest.json   # created — all packs blocked
├── licenses/                                  # empty — nothing licensed
│   └── .gitkeep
└── muscular/<pack>/                           # empty — no model files
```

The empty directories are intentional and must be committed. They record that the
asset was **not acquired** because of the licence conflict, rather than silently
not existing. A reader should never have to guess whether the omission was an
oversight.

---

## Conversion stages

### Stage 0 — inspection

Non-destructive. Extract the node list, mesh count, triangle count, material and
texture inventory, and extension requirements. Compare against the recorded
inspection and report any difference.

**Gate:** any node rename means re-auditing every mapping before proceeding.

Node inspection was performed on 2026-10-10 and is recorded in
`original-source-record.json`.

### Stage 1 — trim

The packs carry far more than we need. `upper-limb.glb` has 532 meshes for 7 mapped
structures.

Keep: nodes referenced by a mapping, plus their parent chains.

Remove: nerves, arteries, veins, bursae, tendon sheaths, bones, cartilages,
ligaments, and all unmapped muscles.

Risk: a node's parent chain may pull in structures that were meant to be removed.
Verify the final node list after every trim, not just at the end.

**Gate:** `auditNodesAgainstPack` reports zero `missing-node` findings.

### Stage 2 — merge

Merge only where merging cannot affect selection.

Safe: multiple heads of the same muscle that share a `structure_id` and no
distinguishing tap behaviour.

Unsafe: anything where the merge would collapse a disambiguation boundary. A merged
gastrocnemius/soleus would remove the very ambiguity the chooser exists to resolve.

**Gate:** `conflicting-priority` findings stay at zero.

### Stage 3 — retexture

90 textures in the upper-limb pack. For a learning aid viewed at arm's length on a
held device, 4K anatomy textures are wasted bytes.

Reduce to a size that holds up at the smallest expected on-screen size, measured on
device rather than assumed. Record the sizes used and why.

**Gate:** recorded and reviewed. A guess here is not acceptable.

### Stage 4 — export

glTF 2.0, Draco compression. `KHR_draco_mesh_compression` is already in
`extensionsRequired`, so the decoder must be bundled locally from our own origin —
**never** fetched from a third-party CDN at runtime. That would break offline support
and complicate licence hygiene.

Export each pack separately so one pack's size failure cannot mask another's.

### Stage 5 — record

For each output:

- SHA-256 of source archive and of the derived `.glb`
- node count, mesh count, triangle count, texture count
- Blender version and exporter settings
- every modification made, in the words CC BY-SA §3(a)(2) requires
- byte size and download size after compression

Any derivative is an Adapted Material and inherits CC BY-SA 4.0.

---

## Verification gates

A pack may not be marked `verified` unless all hold:

| Gate | Check |
|---|---|
| Source hash matches | SHA-256 recorded at download |
| Licence resolved | `3d-pack-licence-unset` no longer fires |
| Manifest complete | `3d-pack-missing-manifest-entry` passes |
| Attribution recorded | `3d-verified-pack-without-attribution` passes |
| Nodes intact | `auditNodesAgainstPack` reports no `missing-node` |
| Selection unambiguous | No `duplicate-node-claim`, no `conflicting-priority` |
| Within budget | See [`three-d-performance-budget.md`](three-d-performance-budget.md) |
| Attribution shipped | Licence and roster in `public/models/…/licenses/` |

The validator enforces the first five mechanically. The last three require human
judgement.

---

## Attribution requirements

CC BY-SA 4.0 §3(a) requires, in the shipped app and beside the files:

1. A statement that a licence was applied, with a link to it
2. Indication that modifications were made, **with a description of them**
3. A link to the original material
4. Retention of notices about how the material was modified
5. Reasonable identification of the authors — the full roster, not a summary

Plus, because the material is a derivative:

6. Attribution to every upstream generation: BodyParts3D, Z-Anatomy, and the voxel
   source data

`ModelAttributionPanel` implements 1–6 and is covered by E2E tests that assert the
real names and the licence deed link are rendered.

---

## Tooling status

**No Blender or GUI tooling is assumed available in this environment.** No
conversion has been run and none is claimed. The steps above are written to be
executed by whoever has the tooling, with the gates recorded.

If Blender is unavailable, the honest answer is that the pipeline has not been run —
not that a partial result is good enough. The published GLB files are Draco-compressed
already, so a Draco round-trip without Blender risks changing geometry for no gain.

---

## Licensing hygiene

- Never copy `open3dviewer` source (GPL3) into Muscle Atlas (`UNLICENSED`).
- Never fetch the Draco decoder from a third-party CDN.
- Never publish the derived `.glb` under anything other than CC BY-SA 4.0.
- Never reduce the contributor roster to a summary.
- Never describe the material as public domain, as merely "open source", or as
  unmodified.

Each is enforced by a test, a validation rule, or a documented review step.