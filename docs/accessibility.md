# Accessibility

Accessibility here is a functional requirement, not a polish phase. The single most important
consequence: **no learning action requires spatial targeting.** Every question can be answered
from a keyboard-navigable structure list, and is evaluated identically.

---

## 1. What is implemented

| Requirement | Implementation |
| --- | --- |
| Keyboard navigation | Skip link, logical DOM order, full Tab traversal, focus indicators |
| Activation | Enter and Space on every control |
| Escape | Closes drawers, sheets and the disambiguation chooser; restores focus |
| Focus management | `FocusTrap` for modal surfaces only; focus returns to the invoker |
| Visible focus | `:focus-visible`, 3 px outline, offset, token-driven |
| Touch targets | 44 px minimum, 48–56 px for recurring actions; verified by test |
| Colour independence | Every state pairs colour with stroke weight, dash pattern, icon and words |
| Motion | `prefers-reduced-motion` honoured; in-app preference cannot override the OS floor |
| Text scaling | `rem` throughout, `clamp()` and logical properties, no fixed-height clipping |
| Screen reader | Semantic landmarks, live regions, labelled controls, hidden artwork |
| Pointer independence | Touch, Pencil, mouse and trackpad through one Pointer Events model |
| No hover dependency | Hover enhances; every equivalent is reachable by tap |
| Sound independence | Sound defaults off; the app is fully usable muted |

---

## 2. The accessible route to every answer

Two routes exist for every question, and they are treated as equals:

1. **Spatial** — tap the muscle on the board.
2. **Non-spatial** — choose the structure from the list, or navigate it in Explore mode.

The non-spatial route is not a fallback for accessibility. It is what makes a small or
overlapping muscle a *fair* question rather than a blind-tap question, and it is how the
product stays usable with a keyboard, a switch or a screen reader. The evaluator resolves both
to the same `structure_id`.

---

## 3. Board semantics

- The `<svg>` is `role="img"` with `<title>` and `<desc>` naming the view and structure count.
- Each muscle group is `aria-hidden`, because the structure list is the accessible equivalent.
  Announcing a dozen anonymous paths would be noise.
- Visual state is conveyed to assistive technology through the feedback panel's live region,
  not from inside the SVG.
- The board container is a labelled `region`.

---

## 4. Colour independence

Every state pairs a hue with a non-colour cue:

| State | Colour | Stroke weight | Dash pattern | Icon | Text |
| --- | --- | --- | --- | --- | --- |
| Selected | accent | 3 px | solid | — | "You selected …" |
| Correct | green | 4 px | solid | check | "Correct — …" |
| Incorrect | red | 4 px | dashed 10/6 | cross | "Not quite." |
| Revealed | amber | 4 px | dotted 2/5 | eye | "Answer revealed — …" |
| Assisted | blue | 2 px | solid | info | "Correct with a hint — …" |

Under `prefers-contrast: more` and in greyscale, the dash patterns and the panel text still
carry the meaning.

---

## 5. Announcements

| Region | Politeness | Used for |
| --- | --- | --- |
| Question prompt | `assertive` | The new question |
| Feedback panel | `polite` | The outcome and its explanation |
| Round progress | `polite` | Question number and position |
| Progress summary | `polite` | Accuracy and review updates |

Announcements happen **once**. The same message is never re-announced on re-render.

---

## 6. Touch targets

- Ordinary controls: minimum 44 × 44 CSS pixels.
- Recurring actions — Start, Continue, Hint, Skip, view switch, zoom: 48–56 px.
- Muscle hit regions follow the anatomical shape with a **capped** forgiveness margin
  (≤ 16 user units). A generous margin would make a neighbouring muscle selectable in error,
  which is worse than requiring a slightly more accurate tap.
- Every sub-44 px target must declare a fairness affordance; the schema refuses it otherwise.

An end-to-end test measures every rendered control and fails if any is under 44 px.

---

## 7. Reduced motion

The OS setting is a **hard floor**. The in-app preference can ask for less motion; it can
never ask for more. Viewport animation is suppressed entirely, and state changes remain
instant and clear — never removed, only stilled.

---

## 8. Known accessibility limitations

Stated plainly rather than left to be discovered:

| Limitation | Consequence |
| --- | --- |
| jsdom cannot perform real sequential focus navigation | Keyboard traversal is verified in Chromium E2E and on hardware |
| Playwright WebKit on Windows does not implement `Tab` traversal at all | Same |
| Pointer events are simulated in tests because jsdom lacks `PointerEvent` | Real touch and Pencil remain unverified until hardware testing |
| `elementsFromPoint` is stubbed in tests because jsdom has no layout | Multi-candidate resolution is verified as pure logic and on device |

Each of these is a testing-environment limitation, not an application one, and each is
verified on real hardware in [`ipad-safari-test-plan.md`](ipad-safari-test-plan.md).

---

## 9. Automated checks

| Check | Where |
| --- | --- |
| Skip link reachable | `e2e/keyboard.spec.ts`, `App.spec.tsx` |
| Full navigation by Tab alone | `e2e/keyboard.spec.ts` |
| Focus indicator visible | `e2e/keyboard.spec.ts` |
| Enter and Space activation | `e2e/keyboard.spec.ts` |
| Escape closes and restores focus | `shared-ui.spec.tsx` |
| Every control has an accessible name | `e2e/keyboard.spec.ts`, `App.spec.tsx` |
| Touch targets ≥ 44 px | `e2e/app.spec.ts` |
| Colour independence | `quiz-ui.spec.tsx`, `SvgAnatomyBoard.spec.tsx` |
| No emoji in the interface | `App.spec.tsx`, `e2e/app.spec.ts` |
| Focus restoration | `shared-ui.spec.tsx` |
| Board semantics | `SvgAnatomyBoard.spec.tsx` |

---

## 10. Manual verification still required

Automated checks cannot cover VoiceOver, Switch Control, or real contrast on a real display.
See sections 4, 10 and 12 of [`ipad-safari-test-plan.md`](ipad-safari-test-plan.md).
