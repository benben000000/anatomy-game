# Open 3D Model — licence and attribution verification

**Status: INCOMPLETE — asset integration is blocked.**
**Verified:** 2026-10-10 · **Source:** official project pages only
**Machine-readable record:** [`assets-source/open3dmodel/metadata/original-source-record.json`](../assets-source/open3dmodel/metadata/original-source-record.json)

This document is the Phase A gate. It records what was read, from where, and what
remains unresolved. Nothing here is inferred from memory or from third-party
summaries.

---

## Summary

| Question | Answer | Confidence |
|---|---|---|
| What licence does the project state? | CC BY-SA 4.0 | High, but see LIC-AMB-1 |
| Is it in force today? | **Unclear** — the landing page uses the future tense | **Blocking** |
| Does the licence ship with the files? | **No** — archives contain one `.glb` and nothing else | **Blocking** |
| Is CC BY-SA compatible with `UNLICENSED`? | Yes, **only if the model derivative is kept under CC BY-SA** and separated | Conditional |
| Are real files available? | Yes — 3 muscle-relevant packs, verified by download | High |
| Does the muscle content cover our curriculum? | Partially — 14 of 19 structures | High |

**Verdict: do not integrate. Two blocking licence questions remain open.**

---

## Pages read

All accessed 2026-10-10:

- `https://anatomytool.org/open3dmodel` — overview, licence intent, roadmap
- `https://anatomytool.org/open3dmodel-about` — licence chain, provenance, review method
- `https://anatomytool.org/open3dmodel-create` — source files and selection models
- `https://anatomytool.org/open3dmodel-learn` — learning material
- `https://anatomytool.org/open3dmodel-credit` — contributor roster
- `https://anatomytool.org/legal-information` — platform Terms of Service

The embedded viewer was **not** scraped. Downloads were taken only from the
official file links published on the create page.

---

## The licence

The About page states the project was created to "further develop an open-licensed
(Creative Commons Attribute ShareAlike CC BY SA) 3D model of human anatomy", with a
direct link to `https://creativecommons.org/licenses/by-sa/4.0/`.

It also states:

> "The creation and distribution of any derivative materials from the
> open3dmodel should comply with the Creative Commons license's requirements
> stated with the material."

That last clause is the problem. Nothing is stated with the material.

### LIC-AMB-1 — future tense *(blocking)*

The landing page says:

> "The model **will be** licensed under Creative Commons Attribution ShareAlike
> (CC BY SA)"

Future tense. The About page is more affirmative. Whether a licence is currently
in force or merely planned determines whether obligations apply today or later,
and that cannot be settled from the published pages.

### LIC-AMB-2 — no licence in the archive *(blocking)*

Downloaded and inspected `upper-limb-glb.zip`:

```
SHA-256  5AF0190A6D7BF47393447AC30021E4F3BA619721C7F3A620C39A895947078432
Size     6,160,131 bytes
Contents upper-limb.glb (6,911,588 bytes)   ← one entry, nothing else
```

No licence file, no README, no attribution notice. CC BY-SA 4.0 §3(a) requires the
licence to accompany the material. As shipped, it does not.

### LIC-AMB-3 — "Non-commercial" *(advisory)*

The AnatomyTOOL landing page self-describes as "Non-commercial, University based."
This describes the **platform**, not the model. CC BY-SA 4.0 itself permits
commercial reuse. No model-specific non-commercial restriction was found. Confirm
before any commercial release.

### LIC-AMB-4 — three generations of ShareAlike *(advisory)*

```
Voxel data (2003–04) → BodyParts3D → Z-Anatomy (~2021) → Open3Dmodel
                       CC BY-SA      CC BY-SA        CC BY-SA
```

ShareAlike is transitive. Attribution must credit **all** generations, not just the
most recent.

---

## The ShareAlike question

The project is `"license": "UNLICENSED"`, `private: true` — all rights reserved.

The common assumption is that this is an automatic conflict. It is not, and getting
this right matters.

**CC BY-SA 4.0 §3(b)(1)** requires that a *Shared* Adapted Material be licensed under
CC BY-SA 4.0. Creative Commons' own guidance is explicit that the ShareAlike condition
attaches to **the adapted material, not the larger work** into which it is
incorporated.

So the compliant arrangement is:

| Artefact | Licence |
|---|---|
| Muscle Atlas application source | `UNLICENSED` (unchanged) |
| The modified `.glb` model | **CC BY-SA 4.0** |
| Attribution and licence copy | Shipped alongside the model, in-app and in `public/models/…/licenses/` |

**What would be incompatible:** shipping the modified model under `UNLICENSED`,
under a more restrictive licence, or with the attribution stripped or reduced to a
summary.

**Decision owner: the project owner and their legal counsel.** This is a business
decision, not an engineering one. The build is set up so that either answer is
implementable, and set up so that an unverified asset cannot ship by accident.

---

## Required attribution

Under CC BY-SA 4.0 §3(a), a redistribution must state that a licence was applied and
link it, indicate that modifications were made and describe them, link to the
material, and retain notices about how it was modified.

For a project of this provenance, a reasonable reading of "identify the author(s)"
requires reproducing the roster, not summarising it. The full roster is captured
verbatim in [`src/data/manifests/open3dmodel-attribution.json`](../src/data/manifests/open3dmodel-attribution.json)
and is rendered by `ModelAttributionPanel`.

Must **not** be described as public domain, as merely "open source", or as unmodified.

---

## Provenance

| Generation | Period | Origin | Licence |
|---|---|---|---|
| Voxel models | 2003–04 | Japanese MRI-derived voxel data | not stated |
| BodyParts3D | 2003–08 | Database Center for Life Science, Japan | CC BY-SA |
| Z-Anatomy | ~2021 | Modified BodyParts3D | CC BY-SA |
| **Open3Dmodel** | 2022– | Built on Z-Anatomy | CC BY-SA 4.0 *(see ambiguities)* |

Stated modifications made by the Open3Dmodel project: all structures remeshed to
remove surface artefacts; each structure reviewed by 1–3 anatomists; an estimated 70%
of shapes changed; muscles, tendons and aponeuroses added; joint capsules,
cartilages, bursae and synovial sheaths modelled; upper and lower limb vessels and
nerves newly modelled; textures applied.

The project states: *"Despite our best efforts, some errors may still be present."*
That caveat is carried into the app's credits panel rather than dropped.

**Separate licence, easy to confuse:** the web viewer (`open3dviewer`) is **GPL3**.
That is a code licence for the viewer only. It does not apply to the model, and
Muscle Atlas is not GPL3 — viewer source must not be copied in.

---

## Available packs

Verified from the create page. Directory listing is disabled (HTTP 403); files are
reachable by direct link only.

| Pack | Formats | Stated date | Size (verified) | Muscle-relevant |
|---|---|---|---|---|
| upper-limb | blend / obj / glb | July 2025 | glb 5.87 MB, blend 28.59 MB | **yes** |
| lower-limb | blend / obj / glb | July 2025 | glb 5.72 MB, blend 25.89 MB | **yes** |
| hand | blend / obj / glb | July 2025 | glb 2.75 MB | yes, but unmapped |
| overview-skeleton, vertebrae, skull packs, subject | blend / obj / glb | Jun–Jul 2025 | glb 2.96 MB | no |

### No trunk pack exists

The landing page lists "Muscles of thorax, abdomen and back (March 2026)" as a
workstream item, not a released pack. **There is no downloadable thorax, abdomen or
back pack.** Five structures therefore have no sourceable 3D counterpart:
`frontalis`, `sternocleidomastoid`, `rectus_abdominis`, `external_oblique`,
`erector_spinae`.

This is why the 2D board must remain complete and must remain the only route to
those structures.

---

## Technical inspection

`upper-limb.glb`:

```
glTF 2.0 · Khronos glTF Blender I/O v4.4.56
575 nodes · 532 meshes · 95 materials · 90 textures · 84 images
~760,842 vertices · ~1,368,260 triangles
extensionsUsed     KHR_draco_mesh_compression, KHR_materials_clearcoat,
                   KHR_materials_specular, KHR_materials_ior
extensionsRequired KHR_draco_mesh_compression
```

`lower-limb.glb`: 472 meshes, ~1,302,531 triangles, Draco required. 1,044 unique
nodes across both packs.

Three findings that shaped the design:

**Draco is mandatory.** It appears in `extensionsRequired`, so the decoder must be
bundled locally. Fetching it from a third-party CDN at runtime would break offline
support and complicate licence hygiene.

**1.37 M triangles is at the budget ceiling.** At 500+ meshes and 90 textures per
pack, the published files will not hold 60 fps on an iPad Air M4 as-is. A
region-trimmed derivative is required — see
[`three-d-performance-budget.md`](three-d-performance-budget.md).

**Node names are Terminologia Anatomica with a laterality suffix**, e.g.
`Long head of biceps brachii.r`. Three consequences, all verified against the real
node lists:

1. **One structure maps to many nodes.** Trapezius spans *Ascending*, *Descending*
   and *Transverse* parts; deltoid spans *Acromial*, *Clavicular* and *Spinal*.
2. **Parents and parts coexist.** `Deltoid muscle.r` exists *and* so do its three
   parts. This is the source project's overlay technique. Selecting a part must not
   silently answer for the parent — hence `occlusion_policy: 'peel'`.
3. **Substring search produces false positives.** Searching "oblique" returns only
   unrelated structures (radio-ulnar syndesmosis, oblique ligament of the 1st
   finger, oblique head of adductor pollicis). Searching "serratus" returns the
   muscle *and* two bursae. Every mapping is therefore an explicit, human-confirmed
   allowlist, never a match.

---

## Coverage of the Muscle Atlas curriculum

**14 of 19 structures** have a candidate 3D counterpart:

deltoid · pectoralis major · serratus anterior · biceps brachii · rectus femoris ·
vastus lateralis · vastus medialis · tibialis anterior · trapezius ·
triceps brachii · latissimus dorsi · gluteus maximus · gastrocnemius · soleus

**5 do not:** frontalis · sternocleidomastoid · rectus abdominis ·
external oblique · erector spinae

Coverage is partial, not complete. The 2D board remains the complete route.

---

## What was and was not done

**Not done, deliberately:**

- No model file was committed to the repository.
- No derivative was produced.
- No model is served at runtime.
- The packs remain `blocked-pending-licence`.

Archives were downloaded to a temporary directory for inspection and discarded. The
lower-limb pack was inspected at header level only.

The integration brief is explicit: *"Do not integrate any file before the
source/license record is complete."* Two blocking questions are open, so the record
is not complete.

**Done:** the licence record, the attribution roster, real node-name mappings,
validation rules that refuse to ship an unlicensed pack, capability detection, the
fallback flow, and cache management.

---

## Outstanding questions

| # | Question | Owner | Blocking |
|---|---|---|---|
| Q1 | Is CC BY-SA 4.0 in force now, or intended for a future release? | Open3Dmodel project | yes |
| Q2 | What licence instrument accompanies the downloadable files, given none ships inside them? | Open3Dmodel project | yes |
| Q3 | Does the owner accept distributing the model derivative under CC BY-SA 4.0 while keeping the app `UNLICENSED`? | Project owner / counsel | yes |

Contact: `https://anatomytool.org/open3dmodel-contact`, or the Nederlandse
Anomen Vereniging (NAV).

None of these can be inferred. None has a workaround.