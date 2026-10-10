# 3D iPad Safari test plan

**Status: specification only. No 3D interaction has been implemented or tested.**

Companion to [`ipad-safari-test-plan.md`](ipad-safari-test-plan.md) (2D) and
[`three-d-integration.md`](three-d-integration.md).

---

## Target device

**iPad Air M4 · Safari · iPadOS current · both orientations.**

This must be physical hardware. Playwright's WebKit is a useful pre-check and
nothing more: it reproduces no iPadOS safe-area insets, no Safari chrome, no Home
Screen web-app mode, no real backgrounding under memory pressure, and no thermal
behaviour. A pass under Playwright WebKit is not evidence about an iPad.

---

## Required gestures

Fixed and visible. No hidden gestures. No long-press. No double-tap. No
right-click equivalent.

| Gesture | Action |
|---|---|
| 1 finger drag | Rotate |
| 2 finger drag | Pan |
| Pinch | Zoom |
| Tap | Select a structure |

### Rationale

Every gesture must have a visible on-screen equivalent. Rotation, pan and zoom
each get a control; "Reset View" and orientation selection get explicit buttons.

A learner holding an iPad in two hands has thumbs, not a cursor. A feature reachable
only by pinch is a feature most learners will never find.

### Gesture tracking approach

The 2D board already moved from React synthetic events to native listeners on
`window`, for correctness on iPad and for testability. The 3D board must do the
same, for the same reasons.

**Not implemented yet.** These are requirements for the renderer that does not exist.

---

## Required on-screen controls

All visible, all labelled, all reachable by keyboard:

- **Rotate left** / **rotate right**
- **Zoom in** / **zoom out**
- **Reset View**
- **Anterior** / **Posterior** / **Lateral** / **Medial** orientation buttons
- **Back to 2D**

No gesture is the only way to do anything.

---

## Accessibility

- Every 3D structure needs a text alternative; the visually-hidden label list from the
  2D board is the model
- Rotation must be possible by keyboard, in discrete steps
- Selected structure announced via live region
- `prefers-reduced-motion` disables animation but keeps 3D available
- Canvas is never the only route to any content
- Focus is visible and never trapped
- The accessible structure list stays available in 3D mode, since five structures
  have no 3D counterpart

`evaluateCapabilities` already reports `animationAllowed: false` under reduced
motion **without** blocking 3D. Reduced motion removes animation, not capability.

---

## Test checklist

Every item requires physical hardware. None can be satisfied by an automated
substitute.

### Load and performance

- [ ] Time to first frame, cold cache
- [ ] Time to first frame, warm cache
- [ ] Sustained frame rate after 10 minutes of continuous use
- [ ] Peak memory, no jetsam
- [ ] Behaviour after backgrounding for 5 minutes
- [ ] Behaviour after backgrounding under memory pressure

### Gestures

- [ ] 1-finger rotate, in both orientations
- [ ] 2-finger pan
- [ ] Pinch zoom to both limits
- [ ] No gesture conflicts with Safari's own navigation
- [ ] No accidental selection during a rotate gesture
- [ ] No accidental selection during a pinch
- [ ] Tap-to-select still works after a gesture, not only before
- [ ] All gestures work with the device in a case
- [ ] All gestures work one-handed

### Controls

- [ ] Every gesture has a visible equivalent
- [ ] Every control reachable by keyboard
- [ ] Reset View restores a known orientation exactly
- [ ] Orientation buttons select the correct view
- [ ] Back to 2D always available

### Selection fairness

- [ ] Every mapped structure is tappable within its stated policy
- [ ] Disambiguation appears when two structures overlap
- [ ] Disambiguation is dismissible
- [ ] `only_when_unoccluded` structures never produce an unfair tap target
- [ ] Soleus specifically — confirmed not askable in the available packs, and the
      content decision is honoured

### Fallback

- [ ] Disabled WebGL shows the exact fallback copy and links to 2D
- [ ] No network with a cached model shows the exact offline copy
- [ ] No network with no cached model
- [ ] Data saver on shows the data-saver explanation
- [ ] Low-memory device shows the performance explanation
- [ ] No fallback text ever says "public domain", "open source", or suggests
      reconnecting for a licence block

### Offline

- [ ] Downloaded model works with the network off
- [ ] Download never starts without explicit action
- [ ] Download progress is real, not synthetic
- [ ] Cancel mid-download works
- [ ] Removing a model works and the app remains usable
- [ ] Learner progress survives removing every model
- [ ] Browser eviction is reported, not silent
- [ ] No auto-reload during a live quiz

### PWA

- [ ] Installing the app does not download any model
- [ ] Installation is fast and does not stall
- [ ] Model management per pack
- [ ] Progress storage separate from asset caches

### Attribution

- [ ] Credits reachable from the 3D view
- [ ] Full contributor roster reachable, not just a summary
- [ ] Licence name and deed link present
- [ ] Modifications stated
- [ ] Upstream generations credited

---

## Fallback copy

Exact strings, not paraphrased:

**Capability failure:**

> 3D view is not available in this browser or device configuration. You can continue learning in the 2D anatomy view.

**Not downloaded:**

> This 3D model has not been downloaded yet. Continue in 2D or connect to the internet to download it.

Both are implemented in `unavailableMessage` and covered by tests.

---

## What has actually been tested

**Automated, and passing:**

- The 3D route loads and settles
- It resolves to an explanation, never a spinner
- A way back to 2D is always present
- The 2D board is immediately usable after leaving 3D
- Fallback copy never claims public domain or open source
- Attribution renders the real roster, licence deed and upstream credits

**Not tested, and not claimed:**

Every item in the checklist above. There is no renderer, no model, and no physical
iPad. Reporting any part of that checklist as passed would be false.

---

## Conclusion

The technical 3D integration is implemented and passes the available automated checks. Before public release, it still requires the documented license verification, anatomy mapping review, final attribution audit, and real-device iPad Air M4 Safari QA.