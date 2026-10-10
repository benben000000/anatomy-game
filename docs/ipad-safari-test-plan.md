# iPad Air M4 Safari Test Plan

Status: **not yet executed.** No iPad Air M4 or iPadOS Safari was available in the build
environment. Every result cell below is blank on purpose and must be filled in by a human with
the hardware.

---

## 0. Why this document exists

Three things in this project cannot be verified by automation:

| Cannot be automated | Why |
| --- | --- |
| Safari on iPadOS | Playwright's WebKit is *approximately* Safari. It is not iPadOS Safari. |
| Home Screen web-app mode | Only exists on real iPadOS hardware. |
| Safe areas, chrome geometry, Pencil, real backgrounding | Only exist on real iPadOS hardware. |

What automation **does** cover is recorded in
[`../README.md`](../README.md#what-is-tested-automatically). This document covers the rest.

Fill in the environment block before starting, and record results per section. A tick without
a recorded environment is not a result.

```
Run date:        YYYY-MM-DD
Tester:          <name>
Device:          iPad Air 11-inch (M4)
iPadOS version:  <version>
Safari version:  <version>
Build id:        <build>
Content version: <version>
```

### Environments

Each section runs in all three. A pass in one is not a pass in another.

| | Launch method | Why it differs |
| --- | --- | --- |
| **A** | Typed or linked URL | Browser chrome expands and collapses; safe areas differ |
| **B** | Added to Home Screen, "Open as Web App" if shown | No browser chrome; different viewport height; separate storage |
| **C** | Safari Private Tab | Storage and service workers are restricted; the app must degrade honestly |

---

## 1. Layout and viewport

| # | Test | Env | Pass criterion | Result |
| --- | --- | --- | --- | --- |
| L1 | Landscape, chrome expanded | A | Board is the largest element; prompt visible | |
| L2 | Landscape, chrome collapsed | A | Layout adapts via `dvh`; nothing clipped | |
| L3 | Portrait | A | Prompt top, board centre, panel below; board still dominant | |
| L4 | Rotate landscape → portrait mid-question | A | Question, view, zoom and answer state preserved | |
| L5 | Rotate portrait → landscape mid-feedback | A | Feedback readable; no lost state | |
| L6 | Rotate while a disambiguation chooser is open | A | Chooser survives or closes cleanly | |
| L7 | Split View at half width | B | Layout survives; controls remain reachable | |
| L8 | Split View at one-third width | B | No overlap; no clipped controls | |
| L9 | Slide Over | B | Usable at a narrow width | |
| L10 | Safe areas | B | Nothing under the home indicator or in the corners | |
| L11 | No `100vh` assumption | A | No jump when chrome collapses mid-round | |
| L12 | Increased text size, five steps | A | No clipped text; controls grow | |
| L13 | Maximum text size | A | Layout reflows; no horizontal scroll | |
| L14 | Bold text accessibility setting | A | Hierarchy holds | |
| L15 | Reduce Motion on | A | No viewport animation; states still clear | |
| L16 | Increase Contrast | A | All states still distinguishable | |
| L17 | Reduce Transparency | A | No information lost | |
| L18 | Dark appearance | A | Contrast holds; anatomy readable | |

---

## 2. Touch input

| # | Test | Env | Pass criterion | Result |
| --- | --- | --- | --- | --- |
| T1 | Tap a large target | A | Selects on release; feedback feels immediate | |
| T2 | Tap a small target (vastus medialis) | A | Reachable, or a fair affordance offers | |
| T3 | Tap between two adjacent muscles | A | Disambiguation chooser, or a correct deterministic pick | |
| T4 | Tap empty board | A | No selection, no error, no state change | |
| T5 | Tap the same structure twice | A | Idempotent; not double-counted | |
| T6 | Quick tap with a ~10 px wobble | A | Still counts as a tap | |
| T7 | Slow deliberate tap | A | Still counts as a tap | |
| T8 | One-finger drag at fit scale | A | No pan, no selection, page scroll unaffected | |
| T9 | One-finger drag when zoomed | A | Pans the board | |
| T10 | Two-finger pinch in | A | Zooms the board only | |
| T11 | Two-finger pinch out from fit | A | Cannot zoom out past fit | |
| T12 | Pinch and pan simultaneously | A | Both work together | |
| T13 | Pinch outside the board | A | Browser zoom still works — not hijacked | |
| T14 | Page-zoom gesture over the board | A | Browser zoom still reachable | |
| T15 | Three-finger gesture | A | Ignored; no error | |
| T16 | Rapid repeated taps | A | No stuck state; no dropped selection | |
| T17 | Double tap | A | No required behaviour; browser default intact | |
| T18 | Long press on a muscle | A | No context menu blocking; no accidental answer | |
| T19 | Target size audit | A | All controls ≥ 44 px | |
| T20 | Feedback latency | A | Visually immediate (budget < 100 ms) | |

---

## 3. Apple Pencil

| # | Test | Env | Pass criterion | Result |
| --- | --- | --- | --- | --- |
| P1 | Pencil tap | A | Selects precisely | |
| P2 | Pencil precision mode on | A | Exact hit required; small targets easier | |
| P3 | Pencil precision mode off | A | Forgiveness margin applies | |
| P4 | Pencil hover preview | A | Ring previews; tapping works identically without hover | |
| P5 | Pencil with no hover support | A | Tap still selects | |
| P6 | Pencil then finger in one gesture | A | No crash; state recovers | |
| P7 | Pencil on the accessible structure list | A | Same result as tapping on the board | |

---

## 4. Keyboard and trackpad

Requires a hardware or paired keyboard.

| # | Test | Env | Pass criterion | Result |
| --- | --- | --- | --- | --- |
| K1 | Tab through all controls | B | Logical order; everything reachable | |
| K2 | Shift+Tab backwards | B | Reverses cleanly | |
| K3 | Focus visibility | B | Indicator visible on every control, ≥ 3:1 | |
| K4 | Enter on a structure in the list | B | Selects without spatial targeting | |
| K5 | Space on a button | B | Activates; does not scroll | |
| K6 | Escape closes the drawer | B | Closes; focus returns to the invoker | |
| K7 | Escape closes the disambiguation chooser | B | Closes; nothing selected | |
| K8 | `R` resets the view | B | Resets; documented in About | |
| K9 | `R` while typing in a field | B | Types `r`; does not reset the view | |
| K10 | Arrow keys in lists | B | Move within the list | |
| K11 | Trackpad click | B | Works with no desktop-only UI | |
| K12 | Trackpad hover | B | Enhancement only; nothing hover-only | |
| K13 | Full round, keyboard only | B | Complete without a single pointer event | |
| K14 | VoiceOver rotor | B | Board described; structures listed | |
| K15 | VoiceOver on the feedback panel | B | Outcome announced once, politely | |

---

## 5. PWA installation and updates

| # | Test | Env | Pass criterion | Result |
| --- | --- | --- | --- | --- |
| I1 | Add to Home Screen | B | Installs with correct name and icon | |
| I2 | "Open as Web App" toggle | B | Launches standalone; no browser chrome | |
| I3 | Standalone safe areas | B | Nothing under the home indicator | |
| I4 | Standalone viewport height | B | No bottom cutoff — the `dvh` path works | |
| I5 | No install prompt appears | A | No `beforeinstallprompt`-style UI anywhere | |
| I6 | Play without installing | A | Full functionality | |
| I7 | About → install wording | B | Matches the required text exactly | |
| I8 | Relaunch from Home Screen | B | Progress intact | |
| I9 | Launch offline from Home Screen | B | Boots to a usable board | |
| I10 | Private browsing launch | C | Degrades honestly; no silent data loss | |
| U1 | Deploy a new build mid-round | A | No reload; no state loss; banner appears | |
| U2 | Banner wording | A | "A new version is ready. Reload after you finish this round." | |
| U3 | Banner during a question | A | Non-blocking; never steals focus | |
| U4 | Reload control during a round | A | Disabled until the round ends | |
| U5 | Tap reload | A | Controlled reload; session state intact | |
| U6 | Two open tabs, update arrives | A | Active tab unaffected | |
| U7 | Update on the results screen | A | Allowed; the round has finished | |
| U8 | Cache cleanup | A | Old caches removed; no storage leak | |

---

## 6. Offline behaviour

| # | Test | Env | Pass criterion | Result |
| --- | --- | --- | --- | --- |
| O1 | First load online | A | Shell and pack cached | |
| O2 | Wi-Fi off, cached pack | A | Full play; **no offline indicator at all** | |
| O3 | Complete a round offline | A | Results and progress saved | |
| O4 | Reload while offline | A | Boots from cache | |
| O5 | Open a not-yet-cached pack | A | "Needs one internet connection to download first." | |
| O6 | Offline indicator | A | Only when actionable; never over the board | |
| O7 | Offline mid-round, then online | A | Seamless | |
| O8 | Network loss during asset load | A | Recoverable message; retry works | |
| O9 | Update check while offline | A | Fails silently | |
| O10 | Airplane Mode, full round | A | Completes with no visible disruption | |

---

## 7. Interruption and persistence

| # | Test | Env | Pass criterion | Result |
| --- | --- | --- | --- | --- |
| R1 | Background mid-question | A | Round restored on return | |
| R2 | Lock the device mid-answer | A | State restored; no phantom selection | |
| R3 | Switch apps for five minutes | A | Restored | |
| R4 | Safari tab discard and restore | A | Restored where the system allows | |
| R5 | Force-quit and relaunch | A | Round or results restored | |
| R6 | Rotate while backgrounded | A | Restored in the new orientation | |
| R7 | Background during pinch-zoom | A | Zoom restored; no stuck gesture | |
| R8 | Incoming call during a tap | A | `pointercancel` handled; no accidental answer | |
| R9 | Background during a round, then update deploys | A | Round never lost | |
| R10 | Twenty questions, then background | A | All records intact | |
| R11 | Low storage, then study | A | Honest message; app still usable | |

---

## 8. Performance

Measured on device, not emulated.

| # | Test | Budget | Result |
| --- | --- | --- | --- |
| F1 | First contentful paint | < 900 ms | |
| F2 | Time to interactive board | < 1.8 s | |
| F3 | First-route transfer | < 220 KB gzip | |
| F4 | Tap to visible feedback | < 100 ms | |
| F5 | Pan smoothness when zoomed 3× | 60 fps | |
| F6 | Pinch smoothness | 60 fps | |
| F7 | Twenty-question round, front to back | No progressive slowdown | |
| F8 | Memory across twenty questions | Within 5% of start | |
| F9 | Long tasks during a round | Zero over 50 ms | |
| F10 | Ten minutes idle on a question | No growing timers; no CPU spin | |
| F11 | Low Power Mode | No measurable regression | |
| F12 | Second load, fully cached | Noticeably faster | |
| F13 | Throttled network | Honest loading state | |

---

## 9. Content correctness

Run per published structure, not as a sample.

| # | Test | Pass criterion | Result |
| --- | --- | --- | --- |
| C1 | Prompt text matches `canonical_name` exactly | No discrepancy | |
| C2 | Prompt target and selectable path are the same structure | No off-by-one | |
| C3 | Label text matches `canonical_name` | No discrepancy | |
| C4 | Structure genuinely visible in the view asked | Confirmed by reviewer | |
| C5 | Hit region matches the illustrated shape | No rectangular mismatch | |
| C6 | `min_fair_target_px` recorded for every mapping | Present | |
| C7 | Fairness affordance present where under 44 px | Required and working | |
| C8 | No unintended overlap producing a random selection | Deterministic outcome always | |
| C9 | Anterior and posterior mapping consistent | Correct in both | |
| C10 | Laterality renders correctly | Mirroring does not break identity | |
| C11 | Source recorded and visible in Credits | Not learner-facing; present | |
| C12 | No draft content anywhere | Confirmed by validation report | |
| C13 | Disambiguation chooser never names structures in blind mode | Verified by eye | |

---

## 10. Accessibility

| # | Test | Pass criterion | Result |
| --- | --- | --- | --- |
| A1 | Full round without colour perception | States distinguishable by shape and text | |
| A2 | All controls labelled | No unlabelled icon button | |
| A3 | Live region announcements | Announced once; no double or missed | |
| A4 | Focus never trapped unintentionally | Escape and Tab always work | |
| A5 | No learning flow requires spatial targeting | Keyboard path completes every mode | |
| A6 | Reduced motion | No viewport animation | |
| A7 | Sound never required | Fully usable muted | |
| A8 | VoiceOver labels | No raw path identifiers read aloud | |
| A9 | 200% text size | No loss of function | |
| A10 | Contrast | Text ≥ 4.5:1; non-text ≥ 3:1 | |

---

## 11. Content and ethics

| # | Test | Pass criterion | Result |
| --- | --- | --- | --- |
| E1 | No diagnostic, treatment or injury language | Confirmed | |
| E2 | No fabricated statistics or clinical panels | Confirmed | |
| E3 | No AI assistant or chatbot surface | Confirmed | |
| E4 | No streak, currency, energy or reward systems | Confirmed | |
| E5 | No confetti for routine correctness | Confirmed | |
| E6 | No emoji in product UI | Confirmed | |
| E7 | No "mastered" claim | Confirmed | |
| E8 | Credits screen complete and manifest-accurate | Confirmed | |
| E9 | No unauthorised asset, licence or invented source | Confirmed | |
| E10 | Provisional art visibly labelled everywhere it appears | Confirmed | |

---

## 12. Storage corruption and reset

| # | Test | Pass criterion | Result |
| --- | --- | --- | --- |
| S1 | Corrupt one progress record | That record discarded; rest intact; message shown | |
| S2 | Corrupt `activeSession` | Round reported unrecoverable; progress untouched | |
| S3 | Unknown schema version | Migrate or offer reset; never a silent wipe | |
| S4 | Storage unavailable (private mode) | App runs; explains persistence is unavailable | |
| S5 | Reset learning progress | Confirmation required; settings and cache untouched | |
| S6 | Clear round history | Confirmation required | |
| S7 | Clear cached content record | Confirmation required; progress untouched | |
| S8 | Reset settings | Confirmation required | |
| S9 | Storage quota exceeded | Honest message; play continues | |

The three resets stay separate. Clearing cached artwork must not cost learning history.

---

## 13. Release gate

A release candidate may not ship until:

- [ ] Every test in sections 1–12 executed on real hardware, in environments A and B.
- [ ] No open blocker or critical failure.
- [ ] Failures recorded with detail, not just a tick.
- [ ] Content validation passes with real reviewed data.
- [ ] Licence review complete for every shipped asset.
- [ ] Accessibility audit passed on device.
- [ ] Performance budget met on device.
- [ ] Provisional art and draft content impossible to reach.

**Until sections 1–12 are executed on an iPad Air M4, no claim of iPad Air M4 support
exists.**
