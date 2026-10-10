# Phase 0 — Anatomy Board Design

Status: complete, awaiting approval
Deliverables: [`src/features/anatomy-board/contracts/anatomy-board-adapter.ts`](../src/features/anatomy-board/contracts/anatomy-board-adapter.ts) and this document.

---

## 1. Division of responsibility

The single most important boundary in the product.

```
Board                        Learning engine
──────────────────────       ─────────────────────────────
reports WHICH structure      decides IF it was correct
was selected                 decides what it means
accepts visual state         decides what state to show
knows about geometry         knows nothing about geometry
knows about hit regions      knows only structure_id
```

The board must never be able to make a learner right or wrong. `AnswerEvaluator` compares
`structureId` values and requires no knowledge of the input surface. That is what makes a
future 3D renderer a drop-in change rather than a rewrite.

---

## 2. Coordinate systems

| Space | Unit | Used by |
| --- | --- | --- |
| ViewBox space | SVG user units | Geometry, `bounding_box`, pan/zoom transform |
| Screen space | CSS px | Touch thresholds, tap detection, magnifier placement |
| Board space | ViewBox units via inverse transform | Pointer → structure hit testing, focus targets |

Both anterior and posterior use the same viewBox, `0 0 1000 2200`, and are drawn at the same
scale, so a structure's position is comparable across views and a learner's spatial memory
transfers. Body centre line is `x = 500`. Ground contact is `y = 2200`.

Conversion on pointer-up:

```ts
const rect = svg.getBoundingClientRect();
const vb = viewport.viewBox;
const scale = Math.max(vb.width / rect.width, vb.height / rect.height); // uniform preserveAspectRatio
const ux = (event.clientX - rect.left) * scale - vb.x;
const uy = (event.clientY - rect.top)  * scale - vb.y;
```

`preserveAspectRatio="xMidYMid meet"` plus a uniform scale keeps the math in one place.
The inverse transform is then applied to reach the structure layer beneath the viewport group.

---

## 3. SVG layer structure

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 2200"
     preserveAspectRatio="xMidYMid meet" role="img"
     aria-labelledby="boardTitle boardDesc">
  <title id="boardTitle">Anterior view of the human muscular system</title>
  <desc id="boardDesc">
    Twelve selectable superficial muscles. Every structure is also selectable
    from the accessible structure list.
  </desc>

  <g data-viewport>                              <!-- single pan/zoom transform -->
    <g data-layer="base" pointer-events="none">  <!-- silhouette -->
    <g data-layer="muscle">                      <!-- one <g> per structure -->
    <g data-layer="hit">                         <!-- forgiving strokes -->
    <g data-layer="state" pointer-events="none"> <!-- highlights, driven by app state -->
    <g data-layer="isolate" pointer-events="none"><!-- dimming veil -->
    <g data-layer="labels" pointer-events="none">
    <g data-layer="debug" pointer-events="none" data-build="dev-only">
  </g>
</svg>
```

Per-structure markup inside `data-layer="muscle"`:

```xml
<g id="muscular.anterior.biceps_brachii.surface"
   data-structure-id="muscular.biceps_brachii"
   data-visual-id="muscular.anterior.biceps_brachii.surface"
   data-visual-state="neutral"
   data-selection-priority="500">
  <path class="muscle__fill" d="..." fill="var(--muscle-base)"/>
  <path class="muscle__edge" d="..." fill="none"
        stroke="var(--muscle-edge)" stroke-width="1.5"/>
  <!-- fibre striations, purely decorative -->
  <g class="muscle__fibre" pointer-events="none" aria-hidden="true"> ... </g>
</g>
```

And its forgiving hit region in `data-layer="hit"`:

```xml
<path class="hit" d="..."
      data-for="muscular.anterior.biceps_brachii.surface"
      fill="transparent"
      stroke="transparent"
      stroke-width="12"
      pointer-events="fill stroke"/>
```

`stroke-width` on a duplicated `d` gives a forgiving margin of `stroke-width / 2` user units
on each side **without changing the visible artwork**, and — crucially — without inflating the
muscle itself.

---

## 4. Small-target fairness

This is the hardest requirement in the brief: forgiving targets and honest targeting pull in
opposite directions. Design brief conflict **C3** resolves it with four mechanisms working
together.

### 4.1 Capped forgiveness margin

- `stroke-width` from `VisualMapping.forgiveness_margin_units × 2`.
- Schema caps the value at 16 units; data caps it per structure.
- With a 1000-unit-wide viewBox on a ~1100 px board, 1 unit ≈ 1.1 px, so a margin of 12 units
  is roughly 13 px of extra reach on each side. Enough for a fingertip, not enough to swallow
  a neighbour.

### 4.2 Multi-candidate resolution

On `pointerup`, if movement stayed under the tap threshold, collect every candidate:

```ts
function resolveCandidate(
  elements: readonly Element[],          // from elementsFromPoint, in z-order
  visualIndex: ReadonlyMap<VisualId, VisualMapping>,
): CandidateHit[] { /* dedupe by structure_id, keep best priority per structure */ }
```

Then:

| Candidates | Action | Reason |
| --- | --- | --- |
| 0 | No selection; keep the tap alive so a pan was not misread | tapping empty board should not error |
| 1 | Select directly (`resolution: 'direct'`) | unambiguous |
| >1, one is `requiresDisambiguation` | Emit `disambiguation-requested` | the data already knows this spot is crowded |
| >1, priorities differ | Select the highest priority, report all candidates (`resolution: 'priority'`) | deterministic and never random |
| >1, priorities tie | Emit `disambiguation-requested` | never guess silently |

`elementsFromPoint` is supported on iPadOS Safari. It is wrapped in a feature check with a
geometric fallback (bounding-box + path `isPointInFill` via `SVGGeometryElement`) so a future
browser gap degrades rather than breaks.

### 4.3 Disambiguation chooser

Shown as a small sheet anchored near the tap, never full-screen. In **blind quiz mode** the
entries are anatomical descriptions, never names:

```
Which muscle did you mean?

  Front of the upper arm
  Front of the shoulder
  Outer thigh

  Cancel
```

In **Explore mode** entries show names. Naming them in blind mode would leak the answer;
describing them preserves the question while making the input fair.

### 4.4 Keyboard and combobox equivalent

Not an accessibility afterthought — a functional requirement of the input contract. Every
published structure is available from an accessible list in Explore mode and a combobox in
Identify mode, so no learning flow requires spatial targeting. This also means the keyboard
path reports `inputType: 'keyboard'` and `resolution: 'accessible-list'`, and is evaluated
identically by `AnswerEvaluator`.

### 4.5 Automatic regional zoom

`focusStructure` frames the target's bounding box with padding. Offered as an explicit
**"Show me the region"** control on hint level 1, and available via the magnifier for targets
below `min_fair_target_px`. It is never automatic on question load, because moving the board
under the learner's finger at the wrong moment is worse than a slightly larger tap target.

---

## 5. Pointer interaction model

One handler set for touch, Pencil, mouse, and trackpad. No input-type branching except for
cursor styling and hover affordances.

### 5.1 Pointer bookkeeping

```ts
interface TrackedPointer {
  id: number;
  startX: number; startY: number;   // screen px
  lastX: number; lastY: number;
  startTime: number;
  inputType: PointerInputType;
}
```

`activePointers: Map<number, TrackedPointer>`, capped at 2 — a third finger is ignored
rather than treated as a gesture. `touch-action` is set dynamically:

| Pointer count | `touch-action` | Browser behaviour |
| --- | --- | --- |
| 0 | `pan-y pinch-zoom` | page scroll and browser zoom both allowed |
| 1 | `pan-y` | vertical page scroll allowed; horizontal is ours |
| 2 | `none` | pinch-zoom entirely ours, inside the board only |

Browser zoom is never globally disabled: `viewport-fit=cover`, no `maximum-scale`, and the
document keeps `user-select: auto` and normal scrolling. Only the board element's
`touch-action` changes, and only while pointers are down on it.

### 5.2 Tap versus pan

```ts
const TAP_SLOP_PX        = 10;   // generous: a fingertip wobble is not a pan
const TAP_MAX_DURATION_MS = 700;  // beyond this it is a press, not a tap
const PAN_REQUIRES_ZOOM  = true; // one-finger drag does nothing at fit scale
```

`PAN_REQUIRES_ZOOM = true` is the important one. At fit scale a single finger never pans, so
a one-finger drag can never be mistaken for a selection and can never accidentally scroll the
board away from the learner mid-question. Panning at fit scale requires the explicit
navigation mode toggle or the on-screen pan button, which keeps the rule "the main learning
flow requires no drag gestures" from becoming false in practice.

Resolution happens on `pointerup`:

```
pointerdown      → record pointer, emit interaction
pointermove      → if travel > TAP_SLOP_PX, mark gesture as pan
                     · 2 pointers  → pinch zoom + pan
                     · 1 pointer   → pan only if scale > 1 or navigation mode
pointerup        → if never exceeded slop AND duration under max → attempt selection
pointercancel    → drop the pointer, revert any pressed state, never select
```

Selection is attempted synchronously on `pointerup`. No `setTimeout`, no debounce, no
"are you sure". Feedback latency is budgeted at under 100 ms and this is where it is spent.

### 5.3 Apple Pencil

A Pencil is a precise pointer and needs no special code path. It improves accuracy naturally
because the hit region is the real anatomical path. Two refinements:

- **Precision mode.** While `pointerType === 'pen'`, drop `forgiveness_margin_units` to 0 and
  require an exact fill hit. The learner has chosen a precision instrument, so it is used
  precisely. Toggleable in Settings, default on.
- **Hover.** While `pointerType === 'pen'` and the device reports hover, a subtle
  `data-visual-state="hover"` ring previews the target. Pencil hover is the one case where
  hover reveals information, and it is safe because hover is not required — the Pencil tip
  taps identically. Touch and mouse get no hover-only affordances; everything hover reveals is
  also reachable by tapping.

### 5.4 Cancellation

`pointercancel` fires for system gestures, incoming calls, and Safari interruptions. It must
clear pressed state, drop tracked pointers, and exit pinch mode without selecting. Interruption
safety here is what makes "lock the device mid-tap" safe.

---

## 6. Visual state machine

State lives in app state; the board renders it. No component writes styles directly.

```ts
type StructureVisualState =
  | 'neutral' | 'hover' | 'focus' | 'pressed' | 'selected'
  | 'correct' | 'incorrect' | 'revealed' | 'assisted' | 'dimmed' | 'hidden';
```

Transitions are driven by `QuizSessionManager`:

```
prompted                     → neutral (all), labels hidden
pointer-down on target       → pressed
pointer-up, selection made   → selected
evaluate → correct           → correct, then cleared on continue
evaluate → incorrect         → incorrect on selected, correct on true target
hint 3 (reveal)              → revealed
hint 1–2 then correct         → assisted
continue / next question     → clearVisualStates()
explore selection            → selected, panel syncs
focusRegion                  → others dimmed
```

Styling is pure CSS on `data-visual-state`, using design tokens:

```css
[data-visual-state='correct'] .muscle__fill { fill: var(--state-correct); }
[data-visual-state='correct'] .muscle__edge { stroke: var(--state-correct-edge); stroke-width: 4; }
[data-visual-state='incorrect'] .muscle__edge {
  stroke: var(--state-incorrect-edge);
  stroke-width: 4;
  stroke-dasharray: 10 6;               /* shape cue, not colour alone */
}
[data-visual-state='revealed'] .muscle__edge { stroke-dasharray: 2 5; }
[data-visual-state='selected'] .muscle__edge { stroke-width: 3; }
[data-visual-state='dimmed']    { opacity: 0.35; }
```

Hatching for incorrect is an SVG `<pattern>` on the state layer, not a CSS filter — patterns
are cheap and GPU-friendly, `backdrop-filter` is not.

---

## 7. Performance

| Technique | Detail |
| --- | --- |
| Single transform | One `transform` on `data-viewport`, updated inside a single `requestAnimationFrame` |
| No redraw loops | rAF is scheduled on demand and stops immediately after commit; there is no idle loop |
| No React state per pan frame | Pan/zoom lives in a mutable ref + imperative attribute write; React re-renders only on gesture end |
| Containment | `contain: layout paint` on the board wrapper |
| Layer promotion | `will-change: transform` on `data-viewport` only while a gesture is active |
| Cull offscreen | `visibleBounds` hides structures outside the viewport when zoomed in |
| No filters | No blur, no drop-shadow filters on the board; highlights are strokes and pattern fills |
| Pause when hidden | All rAF work and transition work halts on `visibilitychange` |
| Reduced motion | `focusStructure` jumps instead of animating |

Target: pan and zoom hold 60 fps on iPad Air M4 with 20 structures. A frame does one attribute
write and nothing else.

---

## 8. Accessibility of the board

- The `<svg>` is `role="img"` with `<title>` and `<desc>` naming the view and structure count.
- Every structure group carries `data-structure-id`, and the accessible list exposes a real
  `<button>` per structure with `aria-pressed` reflecting selection.
- Structural state changes are announced once, through a polite live region in the feedback
  panel. Announcing from inside the SVG would be noisy and unreliable.
- The board container is focusable (`tabindex="0"`) with a described shortcut hint, and
  Escape returns focus to the invoking control.
- Zoom controls are real buttons with labels, not gestures.
- Every published structure is reachable without spatial targeting (see §4.4).

---

## 9. Debug overlay (development only)

`setDebugOverlay(mode)` renders, in the `data-layer="debug"` group:

| Mode | Shows |
| --- | --- |
| `hit-regions` | Every hit stroke in a translucent debug colour, so overlap is visible |
| `ids` | `structure_id` and `visual_id` at each structure's bounding-box centre |
| `eligible-targets` | Outline only on structures eligible for the current round |
| `off` | Nothing |

Dev-only entry points, gated behind `ENABLE_DEBUG_TOOLS` and stripped by
`build-flags.ts` in production bundles:

- Run content validation and print the report.
- Cycle published structures.
- Simulate correct / incorrect / revealed outcomes without a real session.
- Reset local development data.
- Inspect IndexedDB store contents read-only.
- Inspect cache and content-pack availability.

---

## 10. Adapter conformance tests (Phase 3)

A fake in-memory board implementing `AnatomyBoardAdapter` runs the entire quiz flow. Because
the engine depends only on the contract, this proves renderer independence before the 3D
renderer exists. Required cases:

1. Full round completes against the fake board.
2. Every outcome type recorded correctly.
3. Renderer throwing `board-error` produces a recoverable UI, not a crash.
4. Replaced renderer mid-round (swap SVG → canvas) loses no session state.
5. `focusStructure` for a structure with a null `bounding_box` degrades to `zoom_to_fit` bounds.

---

## 11. Phase 3 acceptance criteria

- [ ] Anterior and posterior views render from layered SVG assets.
- [ ] ≥ 8 demo targets selectable via accurate hit regions.
- [ ] Touch and Pencil selection both work.
- [ ] Tap versus pan distinguishable; one-finger pan disabled at fit scale.
- [ ] Pinch zoom scoped to the board; page scroll still works.
- [ ] Reset View button and `R` both reset.
- [ ] Disambiguation chooser appears for `requires_disambiguation` mappings.
- [ ] All 12 visual states render, none conveyed by colour alone.
- [ ] `setVisualStates` batch applies without per-path React renders.
- [ ] Debug overlay shows mappings and hit regions.
- [ ] No muscle name appears anywhere in `features/anatomy-board` or `features/learning`.
- [ ] Adapter conformance suite passes against the fake board.
