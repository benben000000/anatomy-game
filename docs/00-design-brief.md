# Phase 0 — Design Brief

Status: complete, awaiting approval
Applies to: Muscle Atlas v1, muscular system

---

## 1. Product purpose

Muscle Atlas teaches the human muscular system through **visual identification**: the learner
sees an anatomical body view and must locate a named muscle by selecting it.

The primary learning outcome is a single skill, stated precisely:

> The learner can name the location of a major superficial skeletal muscle on an
> anterior or posterior body view, and retrieve that knowledge under mild time pressure
> and mild distraction.

Everything in the product either serves that outcome or is deferred.

### What this product is not

- Not a diagnosis tool, treatment advice, or clinical decision support.
- Not a replacement for anatomy laboratory instruction.
- Not a claim of medical completeness. One simplified 2D illustration is a teaching
  abstraction, and the product says so.
- Not a clinical simulator and not a "professional" or "certified" credential.
- Not a game with anatomy decoration. The learning mechanic is the product; points,
  streaks, badges, and leaderboards are not.

---

## 2. Central product principle

**Build an anatomy study instrument that happens to be game-like.**

Practical consequences, which are used as review criteria for every design and code decision:

| Principle | What it forbids | What it requires |
| --- | --- | --- |
| Instrumentation over gamification | Streak pressure, coins, loot boxes, confetti on routine correctness | Calm feedback, legible progress, a single obvious next action |
| The board is the interface | A dashboard of floating cards that shrink the anatomy view | The anatomy board gets the largest area in every layout |
| Facts must be sourced | Authoritative-sounding unverified anatomy text | Every published fact carries a source reference and a reviewer |
| Fairness of input | A blind-tap quiz on a 9-pixel structure | Regional zoom, magnifier, disambiguation, or Pencil precision |
| Honest state | "Mastered", "AI confidence", invented statistics | Named states, plain-language review reasons, no competency claims |
| Cached means available | "Offline error" over content that is already on the device | Local-first play, silent when the selected pack is cached |

---

## 3. Learner personas

### Persona A — Priya, second-year nursing student

- Context: revising for a spot-check practical in four weeks. Studying on a shared iPad Air
  M4 in landscape, often in short sessions between placements.
- Needs: to be shown where a named muscle is, repeatedly, with enough explanation to
  connect the name to the location. Wants to be told plainly what she got wrong.
- Friction to avoid: gamified pressure, ambiguous feedback, progress that resets when she
  closes the tab.
- Success looks like: correctly locating 80% of the assigned muscle list without hints.

### Persona B — Tomas, kinesiology student

- Context: desktop and iPad. Uses a trackpad at a desk and Pencil on the iPad.
- Needs: fast navigation, keyboard reachability, and the ability to drill a specific region
  repeatedly without re-answering what he already knows.
- Friction to avoid: hidden gestures, multi-step wizards, content he cannot skip.
- Success looks like: a review queue that reflects what he actually missed.

### Persona C — Dr. Ines, anatomy instructor

- Context: projecting or demonstrating to a class; may later assign the app.
- Needs: a pressure-free Explore mode for live demonstration, and confidence that what is
  on screen is reviewed and sourced.
- Friction to avoid: unreviewed claims, controls that are hard to explain to a room.
- Success looks like: demonstrating the illustration without an awkward control panel.

### Persona D — Sam, curious general learner

- Context: no anatomy background, exploring for an afternoon, often in portrait.
- Needs: a low-pressure entry point, short explanations, and no sense of being tested
  against a standard they never agreed to.
- Friction to avoid: an intimidating muscle wall, failure states, gamified pressure.
- Success looks like: leaving able to say where the biceps brachii is and what it does.

### Persona E — the offline learner (any of the above, on a train)

- Context: study location with unreliable connectivity.
- Needs: the app to work fully, with no nagging network state, once the content is cached.
- Friction to avoid: an offline error over content that is already downloaded.
- Success looks like: a round completed in aeroplane mode with no visible disruption.

---

## 4. Learning goals

Stated as observable learner behaviours.

### G1 — Recognition

Given an anatomical body view with a muscle label list hidden, the learner locates a named
superficial muscle within a reasonable number of attempts.

### G2 — Discrimination

Given two nearby or similar muscles (for example deltoid and pectoralis major), the learner
distinguishes them rather than guessing between adjacent shapes.

### G3 — Bidirectional link

Given a highlighted region, the learner names the muscle. *Architected in Phase 0, implemented
after identification is proven.*

### G4 — Retention across time

The learner re-encounters structures they missed, after an interval, without prompting.

### G5 — Self-directed study

The learner can explore without being scored, and can narrow practice to a region or to
their own weak items without editing configuration.

### Non-goals as learning outcomes

No clinical reasoning, no diagnosis, no surgical simulation, no claim that v1 produces
competency. Learn Then Test must not describe a single correct answer as mastery.

---

## 5. Core user flows

### 5.1 First launch

```
App opens
  → Title + one sentence: "Practice locating major muscles through interactive anatomy."
  → Three entry points:
        Explore anatomy        (no score, pressure-free)
        Beginner practice      (Learn Then Test, guided, ~4 minutes)
        Quick identification   (Identify mode, straight to a round)
  → Settings / About (subtle, secondary)
```

Rules: no account, no onboarding carousel, no data requests, no permission prompts,
no network gate. First launch must be usable with the network off once the pack is cached.

### 5.2 Explore mode

```
Explore
  → Pick view: Anterior | Posterior
  → Board renders with optional labels (default: labels off in quiz, on optional in explore)
  → Tap any muscle
      → Panel shows: canonical name
                     → location summary
                     → basic function summary
                     → "View details" expansion (origin/insertion/innervation when sourced)
      → Highlight follows panel selection (bidirectional highlight)
  → "Practice this muscle" → jumps into a focused Identify round containing it
  → No score. No failure state. No timer.
```

### 5.3 Identify mode (the core loop)

```
Choose mode
  → Optional configuration: view (Anterior | Posterior | Mixed)
                             region (All | Head & Neck | Shoulder | Arm | Thorax | Abdomen | Leg)
                             round size (5 | 10 | 20 | Endless)
  → Question pool built from eligible structures only
  → Prompt appears: "Locate the biceps brachii."
  → Learner selects a structure on the board
      → Evaluator compares structure IDs
      → Feedback panel shows outcome, one short sourced fact
      → Continue / Inspect / Add to review / Hint
  → Session ends
  → Results: accuracy, per-item outcomes, recommended next practice action
  → Repeat | Review weak areas | Explore | Home
```

### 5.4 Learn Then Test mode

```
Select 3–8 structures (default: a sensible anterior set)
  → Labelled walkthrough with one sourced explanation per structure
  → Learner explores freely; no score
  → "Start recall round"
      → Same structures, labels hidden, unassisted identification
  → Friendly summary
  → Note shown: "You answered these once. Come back later to check retention."
```

Rule: results use "first-encounter accuracy", never "mastered".

### 5.5 Review weak areas

```
Review
  → Ordered list of structures needing attention, each with a plain-language reason:
        "You missed this in a recent session."
        "You revealed this instead of selecting it."
        "Not seen yet."
        "Due for another look."
  → Practise all | Practise one
  → Focused round; repeats allowed here by design
```

### 5.6 Optional timed challenge

Explicitly labelled **Speed practice**. Off by default. Disableable in Settings.
Copy states it is not a measure of learning. Slow learners are never penalised; the
result screen reports accuracy separately from time.

### 5.7 Standard question lifecycle

```
eligible → prompted → answered (correct | incorrect | skipped | revealed | assisted)
        → inspected → continued
        → persisted → outcome drives scheduler
```

Outcomes stay distinct in progress data. Revealed and assisted answers never count as
unassisted correct.

---

## 6. Learning-design rules

These are implementation rules, not intentions.

| ID | Rule |
| --- | --- |
| LD-1 | Evaluate by `structure_id` only. Never by display name, label text, or path string. |
| LD-2 | A structure is eligible only if: published, in the active system, has source references, has a `selectable` visual mapping in the active view/layer, and its assets are locally available. |
| LD-3 | Draft, reviewed-but-unpublished, and retired content can never enter a question pool. Enforced in the validator and re-checked at generation time. |
| LD-4 | A structure with no fair input path in the active view is not eligible. If it cannot be tapped, it is not asked. |
| LD-5 | No immediate repeat of the same structure in a normal round. Review mode may repeat by design. |
| LD-6 | Incorrect, revealed, and assisted outcomes re-enter the queue sooner than unassisted correct ones. |
| LD-7 | High review priority requires multiple unassisted successes across separate sessions. One correct answer is not mastery. |
| LD-8 | Hints are unlimited and free. They change the recorded outcome, never the score. |
| LD-9 | Feedback names the selected structure and the correct structure explicitly on a miss. Ambiguity is never left for the learner to infer. |
| LD-10 | Every corrective feedback message draws only from sourced content. No generated improvisation. |
| LD-11 | Question pool composition is logged and inspectable, so a round can be explained. |
| LD-12 | Review logic is a documented rule set. Do not describe rule-based scheduling as adaptive, AI, or personalised. |

### Scheduling rules (transparent, documented, not adaptive)

`box` in `[1..5]`, `correct_unassisted_streak` in `[0..∞)`.

| Outcome | Effect | Next interval |
| --- | --- | --- |
| Correct, unassisted | `box + 1` (cap 5), streak `+1` | `[10 min, 1 d, 3 d, 7 d, 21 d][box]` |
| Assisted (hint used, then correct) | `box` unchanged | 10 min |
| Revealed | `box = 1` | 10 min |
| Incorrect | `box = 1` | 10 min |
| Skipped | no progress change | unchanged |
| Abandoned (session ended mid-round) | session record only | unchanged |

`mastery_score` in `[0,1]` = `min(1, correct_unassisted_streak / 3)`, displayed as bands:
`New` → `Learning` → `Consolidating` → `Reliable`. Copy must describe these as review-priority
signals, never as competency.

Review priority is a documented weighted sum, surfaced to the learner in plain language:

```
priority = 1.0  never_seen
         + 0.9  incorrect_in_last_5_attempts
         + 0.8  revealed_in_last_5_attempts
         + 0.6  skipped_last_attempt
         + 0.5 * min(days_overdue / 14, 1)
         - 0.4 * min(unassisted_streak, 3) / 3
```

---

## 7. UX rules

### Layout — landscape (primary, iPad Air M4)

Three stable zones, no permanent oversized sidebar:

```
┌────────────────────────────────────────────────────────────┐
│ ZONE 1  Compact app bar                                    │  ~52–60 px + safe-area top
│         Title · progress · view switch · reset · settings   │
├──────────────────────────────────────────────┬─────────────┤
│                                              │             │
│ ZONE 2  ANATOMY BOARD  (largest area, ≥62%)  │ ZONE 3      │
│         prompt bar floats ABOVE the figure,   │ Contextual  │
│         never over the anatomical target      │ feedback    │
│                                              │ panel       │
│         zoom controls, bottom-right of board │ 300–380 px  │
├──────────────────────────────────────────────┴─────────────┤
│ ZONE 4  Collapsible reference drawer (overlay, non-modal-   │
│         blocking for the board)                             │
└────────────────────────────────────────────────────────────┘
```

### Layout — portrait (secondary)

```
┌───────────────────────────┐
│ Prompt + compact progress │  top
├───────────────────────────┤
│                           │
│     ANATOMY BOARD         │  middle, always visible
│                           │
├───────────────────────────┤
│ Feedback / actions        │  bottom sheet, appears only after a
│ (collapsed by default)    │  selection, capped at ~42% height,
│                           │  never covers the selected muscle
└───────────────────────────┘
```

A persistent "back to board" affordance is required while the sheet is expanded.

### Layout invariants

- Board receives the largest area in every layout and breakpoint.
- The prompt is always visible and never overlaps the anatomical target region.
- No essential control within 24 px of the bottom edge, or behind iPadOS browser chrome.
- Use `env(safe-area-inset-*)`; use `100dvh` with `100svh`/`100vh` fallback chain;
  never a bare `100vh` layout assumption.
- Reference and credits content live in a collapsible drawer, never a permanent sidebar.

### Visual direction

Professional, calm, educational. One instructional accent. Correct / incorrect / selected /
revealed states distinguishable by **colour, text, and shape** — never colour alone.
Deliberate whitespace. Icons used only where they aid comprehension, always paired with a label.

### Prohibited

No emojis or emoticons in product UI. No chatbot panel or assistant persona. No motivational
filler. No fake clinical charts, scans, patient files, or invented statistics. No neon,
hologram, or scan-line effects. No gradient blobs. No glassmorphism. No glow on every element.
No rainbow accents. No confetti for routine correctness. No streak, energy, currency, or
reward systems. No ads. No fake testimonials. No urgency. No default-browser alerts. No
infinite decorative animation. No stock doctor/lab/DNA imagery.

---

## 8. iPad-specific behaviour rules

| ID | Rule |
| --- | --- |
| IP-1 | One Pointer Events model for touch, Pencil, mouse, trackpad. No input-type branching except as a visual refinement. |
| IP-2 | Minimum target 44×44 px; 48–56 px for recurring actions (Next, view switch, hints). |
| IP-3 | Muscle hit regions may follow anatomy shape, with a **capped** forgiveness margin — never large enough to make a neighbour selectable in error. |
| IP-4 | Where regions are small or overlapping, at least one fair-precision affordance is required: regional zoom, magnifier, isolate mode, or nearby-target disambiguation. |
| IP-5 | Tap threshold is movement-based and short; a tap with minimal movement must feel immediate. No artificial delay. |
| IP-6 | Pinch-zoom is two-pointer and scoped to the board only. One-finger pan only when zoomed or in navigation mode. |
| IP-7 | No double-tap, long-press, or hidden gesture is required for any action. Every action has a visible control. |
| IP-8 | Browser pinch-zoom is not disabled globally. `touch-action` is scoped to the board, and global zoom accessibility is preserved. |
| IP-9 | Visible Reset View control always present; `R` shortcut also documented and implemented. |
| IP-10 | Pencil is a precise pointer. No pressure, tilt, or handwriting dependency. Any future ink mode is a separate mode that cannot submit answers. |
| IP-11 | Keyboard: Tab/Shift+Tab, Enter/Space, Escape, `R`, arrow navigation in lists. Focus indicators visible and high contrast. |
| IP-12 | Active round persists on `visibilitychange`, `pagehide`, `orientationchange`, and after every answer. |
| IP-13 | Rotation between landscape and portrait preserves question, board state, and answer state. |
| IP-14 | Increased text size must not break the layout or clip critical controls. |
| IP-15 | Non-essential animation pauses when the document is hidden. |

---

## 9. Conflicts found in the brief, and how they are resolved

Rule 14 of the working style requires flagging conflicts with accessibility, licensing,
medical accuracy, performance, or maintainability. Five real conflicts exist.

### C1 — "8 published, licensed, reviewer-verified muscles" versus shipping an MVP

MVP DoD items 10–12 require eight published structures, each with a valid source, a review
state, a licensed/approved asset record, and a selectable mapping. Meeting that requires
commissioned vector anatomy art plus a qualified anatomy reviewer — real schedule weeks and
real cost.

I cannot generate acceptable anatomy art, and I cannot invent reviewer sign-off.

**Resolution.** Ship the app, gate the content. All art and content begin
`content_status: draft` with `medical_review_status: provisional`, and the validator blocks
them from gameplay. A `PROVISIONAL_ART` build flag produces a clearly-labelled developer
build for interaction testing. Release builds fail content validation until real reviewed
data exists. DoD items 10–12 stay open, visibly, on the checklist until they are genuinely met.

**Consequence.** Phases 1–6 are buildable now; the *release* is blocked. This is the single
largest schedule risk and should be resolved in parallel with Phase 1, not after it.

### C2 — "Verified function and location summaries" versus generated text

Summaries for twenty-odd muscles can be drafted, but a plausible-sounding function statement
is not a verified fact, and an unverifiable one is worse than an absent one.

**Resolution.** Draft summaries exist in the content pack with `content_status: draft` and
`source_references: []`. Validation refuses to publish a structure with an empty source list.
No generated text reaches a learner in a release build.

### C3 — Forgiving hit regions versus "no misleading overlap"

These directly oppose each other. A generous hit margin makes small muscles tappable and
simultaneously makes a learner's finger select the neighbouring muscle.

**Resolution.** Both, plus disambiguation. A capped stroke-based forgiveness margin
(≈8–12 viewBox units, hard-capped per structure) is applied. On pointer-up, all candidates
under the point are collected via `elementsFromPoint`. Exactly one candidate → select it.
Multiple candidates → deterministic tie-break by `selection_priority`, or a compact
disambiguation chooser listing **anatomical descriptions, never names**, in blind mode.
This satisfies fairness without fabricating certainty about what the learner intended.

### C4 — "Check for updated content without interrupting" without a backend

The MVP has no backend. Periodic synchronisation implies one, and Background Sync is not
reliably supported on iPadOS Safari.

**Resolution.** Content updates ship as a static, versioned `content-manifest.json` beside the
build. The client checks it opportunistically on app focus and idle, non-blocking, and the
only benefit is cache warming for a later visit. No Background Sync, no push, no server.
Documented as a deliberate simplification, not an oversight.

### C5 — Board pinch-zoom versus preserved browser zoom

Implementing pinch-to-zoom on the board while keeping global browser zoom accessible is a
genuine tension.

**Resolution.** The board uses `touch-action: pan-y pinch-zoom` semantics negotiated per
pointer count, and only intercepts a two-pointer gesture after the second pointer lands.
Single-finger movement is never `preventDefault`ed, so page scrolling, text selection, and
accessibility behaviour remain intact. `maximum-scale` is never set to 1 in the viewport
meta. If Safari proves the interception unreliable in testing, the fallback is visible
on-screen zoom buttons only, and pinch is disabled rather than hijacking scroll.

### Additional note — standalone mode safe areas

Known iPadOS behaviour: `100vh` can exceed the visible area in Home Screen web-app mode.
Handled by preferring `100dvh`, falling back to `100svh` then `100vh`, and additionally
padding with `env(safe-area-inset-*)`. The `window-controls-overlay` display mode is
deliberately **not** enabled in v1: it relocates chrome into the system title bar and would
require reworking the entire layout, for a marginal gain. Recorded as a v2 experiment.

---

## 10. Success criteria for Phase 0

Phase 0 is done when:

- [x] Design brief, personas, contexts, and non-goals documented.
- [x] User-flow map covering all five v1 modes plus the optional timed challenge.
- [x] Learning-design rules and transparent scheduling rules specified.
- [x] UX rules, landscape/portrait layout invariants, and prohibited-pattern list written.
- [x] iPad-specific behaviour rules numbered and enforceable in review.
- [x] Technical architecture, dependency boundaries, and exact directory tree produced.
- [x] Domain model and Zod schema design produced.
- [x] `AnatomyBoardAdapter` contract written as a real type-only file.
- [x] SVG asset pipeline and licensing manifest template produced.
- [x] Medical content-review workflow produced.
- [x] iPad Air M4 Safari test plan produced.
- [x] MVP acceptance checklist produced with open items visible.
- [x] Conflicts with accessibility, licensing, medical accuracy, performance, and
      maintainability identified and resolved rather than silently ignored.
- [x] Phase 1 task list produced.

Not satisfied, and not claimed:

- [ ] Real anatomical art — blocked on C1.
- [ ] Verified medical content — blocked on C2.
- [ ] Reviewer sign-off — blocked on C1/C2.
- [ ] Real-device iPad test results — these require hardware this environment does not have.
