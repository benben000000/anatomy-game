# Phase 1 — Task List

Status: ready to start on approval of Phase 0

Goal: a running, installable, accessible application shell on iPad. **No anatomy content and no
quiz logic in this phase.**

---

## 1. Phase 1 goal and acceptance

**Goal.** `npm install && npm run dev` opens a working multi-route app with an iPad-first
layout, design tokens, keyboard-navigable components, a valid PWA manifest, a service worker
foundation, and IndexedDB repositories that survive a reload.

**Acceptance.**

- [ ] App runs with `npm run dev` and builds with `npm run build`
- [ ] Routes render: Home, Explore, Practice, Identify, Progress, Settings — as intentional
      placeholders with real layout and real navigation, not lorem text
- [ ] At 1180×820 landscape, the shell matches the three-zone layout with correct safe-area
      padding
- [ ] At 820×1180 portrait, the shell matches the portrait layout
- [ ] Design tokens applied; no hard-coded colours or spacing outside `tokens.css`
- [ ] Drawer, sheet, and modal components work with focus trap and Escape
- [ ] Every interactive control is reachable by Tab and shows a visible focus indicator
- [ ] `manifest.webmanifest` validates and shows correct name, icons, theme colour, display mode
- [ ] Service worker registers and precaches the shell
- [ ] IndexedDB round-trips a record across a reload
- [ ] Corrupted-store recovery path tested
- [ ] `npm run typecheck`, `npm run lint`, `npm test` all green
- [ ] Zero anatomy or quiz logic in the codebase

---

## 2. Tasks

### 2.1 Project scaffold

| # | Task | Notes |
| --- | --- | --- |
| 1.1 | `package.json` | Name `muscle-atlas`, `private`, `type: module`, pinned deps |
| 1.2 | `tsconfig.json` | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, path alias `@/*` |
| 1.3 | `tsconfig.node.json` | For Vite config files |
| 1.4 | `vite.config.ts` | React plugin, PWA plugin, alias, Vitest config, **release build guard** |
| 1.5 | `vitest.config.ts` | Or merged into 1.4; `jsdom`, setup file |
| 1.6 | `playwright.config.ts` | WebKit project for E2E; documented as not a substitute for device testing |
| 1.7 | `.gitignore` | `node_modules`, `dist`, `dev-dist`, `.env`, `*.local` |
| 1.8 | `.env.example` | Documented, empty of secrets |
| 1.9 | `index.html` | `viewport-fit=cover`, **no `maximum-scale`**, `apple-mobile-web-app-*` metas, module script |
| 1.10 | `src/main.tsx` | Root render, error boundary, providers |

### 2.2 Application shell and routing

| # | Task | Notes |
| --- | --- | --- |
| 1.11 | `src/app/App.tsx` | Router outlet |
| 1.12 | `src/app/AppShell.tsx` | Three-zone layout, safe areas, `dvh` fallback chain |
| 1.13 | `src/app/routes.tsx` | Six routes, `React.lazy` for Progress / Settings / Credits |
| 1.14 | `src/app/ErrorBoundary.tsx` | Learner-safe message; no raw error text |
| 1.15 | `src/components/navigation/AppBar.tsx` | Compact, safe-area aware, 44 px targets |
| 1.16 | `src/components/navigation/PrimaryNav.tsx` | Stable, non-cluttered; 5 destinations |
| 1.17 | Route placeholder views | Real headings, real layout, honest "arriving in Phase N" copy |

### 2.3 Design tokens and styles

| # | Task | Notes |
| --- | --- | --- |
| 1.18 | `src/styles/tokens.css` | Colour ramps, spacing scale, radii, type scale, z-index, motion tokens |
| 1.19 | `src/styles/globals.css` | Reset, `box-sizing`, `rem` sizing, `dvh` utilities with `svh`/`vh` fallbacks |
| 1.20 | `src/styles/themes.css` | Light and dark; both contrast-checked |
| 1.21 | `src/styles/motion.css` | Transform/opacity-only transitions; reduced-motion overrides |
| 1.22 | Verify type scale at 200% | Test plan L10–L11 |

**Token decisions made in Phase 0 and locked:**

- One instructional accent. Neutral base ramp. Semantic state colours for
  correct / incorrect / selected / revealed / assisted, each paired with a non-colour cue.
- Spacing scale: `4 8 12 16 20 24 32 40 56` px as rem-based tokens.
- Radii: `4 8 12 px` only. No pill shapes.
- Type: `Source Sans 3` or `Inter`, self-hosted woff2, weights 400 / 600, no all-caps display.
- Motion: `120 ms` micro, `200 ms` panel, `280 ms` viewport. All transform/opacity.

### 2.4 Shared components

| # | Task | Notes |
| --- | --- | --- |
| 1.23 | `Button.tsx` | Variants primary / secondary / ghost; `min-height: 48px` default |
| 1.24 | `IconButton.tsx` | ≥ 44 px; `aria-label` required — no unlabelled icons |
| 1.25 | `VisuallyHidden.tsx`, `LiveRegion.tsx` | Polite and assertive variants |
| 1.26 | `Drawer.tsx` | Non-blocking reference drawer; Escape closes; focus restored |
| 1.27 | `Sheet.tsx` | Portrait bottom sheet; capped height; "back to board" affordance |
| 1.28 | `FocusTrap.tsx`, `Modal.tsx` | Trap only inside modal surfaces |
| 1.29 | `SearchField.tsx` | Labelled, clearable, keyboard operable |
| 1.30 | Icon set | ~14 purpose-built 24×24 SVG icons, `currentColor` |

### 2.5 Configuration and storage foundation

| # | Task | Notes |
| --- | --- | --- |
| 1.31 | `src/config/app-config.ts` | Name, version, build id, content pack id |
| 1.32 | `src/config/build-flags.ts` | `ALLOW_DRAFT_CONTENT`, `PROVISIONAL_ART`, `ENABLE_DEBUG_TOOLS`, `ENABLE_TIMED_CHALLENGE` |
| 1.33 | `src/config/storage-config.ts` | DB name, version, store names |
| 1.34 | `src/config/learning-config.ts` | Scheduling constants, outcome thresholds |
| 1.35 | `src/services/storage/db.ts` | Dexie database, five stores per architecture §7 |
| 1.36 | `src/services/storage/migrations.ts` | Versioned, additive, tested |
| 1.37 | `src/services/storage/corrupted-store-recovery.ts` | Three cases: unknown version, corrupt record, unreadable store |
| 1.38 | `src/features/progress/repositories/SettingsRepository.ts` | First repository against the real DB |
| 1.39 | `src/features/progress/repositories/SessionRepository.ts` | `activeSession` single-record store |
| 1.40 | `src/features/progress/repositories/ProgressRepository.ts` | In place; unused until Phase 4 |
| 1.41 | Repository providers | Context wiring with a test-only in-memory implementation |

### 2.6 PWA

| # | Task | Notes |
| --- | --- | --- |
| 1.42 | `public/manifest.webmanifest` | Name, short name, icons, theme/background colour, `display: standalone`, `start_url`, `scope` |
| 1.43 | `public/offline.html` | States clearly whether anatomy content is cached |
| 1.44 | `public/content-manifest.json` | Versioned, static — design brief C4 |
| 1.45 | Icons 180 / 192 / 512 / 1024 + maskable | Simple, non-anatomical mark; see brief on provisional art |
| 1.46 | `vite-plugin-pwa` configuration | Versioned precache, `skipWaiting: false`, `clientsClaim: false`, runtime cache rules |
| 1.47 | `PWAUpdateService.ts` | `WAITING` message → update-available state; **never auto-reload** |
| 1.48 | `UpdateProvider.tsx` + banner | "A new version is ready. Reload after you finish this round." Reload disabled during a round |
| 1.49 | `AssetAvailabilityService.ts` | `cached` / `missing` / `partial`; no offline error for cached packs |

### 2.7 Accessibility foundation

| # | Task | Notes |
| --- | --- | --- |
| 1.50 | `useFocusTrap.ts` | Restore focus to the invoking element on close |
| 1.51 | `useLiveAnnouncement.ts` | Polite vs assertive, announced once |
| 1.52 | `useReducedMotion.ts` | OS setting as a hard floor |
| 1.53 | `shortcuts.ts` | `Escape`, `R`; must not fire while typing in a field |
| 1.54 | Focus indicators | Visible on every control, ≥ 3:1 |
| 1.55 | Keyboard pass over the shell | Every action reachable without a pointer |

### 2.8 Settings and about

| # | Task | Notes |
| --- | --- | --- |
| 1.56 | `SettingsView.tsx` | Sound (default off), reduced motion, precision mode, default view |
| 1.57 | `StorageSection.tsx` | **Three separate confirmed resets**: progress, cached content, settings |
| 1.58 | `InstallInstructions.tsx` | The exact required wording; no fake install prompt |
| 1.59 | `CreditsView.tsx` | Renders from `asset-manifest.json`; honest provisional-art disclosure |

### 2.9 Tests and quality

| # | Task | Notes |
| --- | --- | --- |
| 1.60 | Vitest setup, jsdom, `fake-indexeddb` | Deterministic |
| 1.61 | Settings repository spec | Round-trip across a simulated reload |
| 1.62 | Migration spec | Old version migrates forward |
| 1.63 | Corrupted-store recovery spec | All three cases |
| 1.64 | Update-deferral spec | Never auto-reloads; reload disabled during a round |
| 1.65 | Component specs | Button, IconButton, Drawer, Sheet focus behaviour |
| 1.66 | Playwright smoke test | App loads, navigates, installs |
| 1.67 | Build-flag guard test | Release build fails with `PROVISIONAL_ART` on |
| 1.68 | Architecture guard test | No muscle name in `domain/` or `features/learning/` |

---

## 3. Verification commands

```bash
npm install
npm run dev            # http://localhost:5173

npm run typecheck      # tsc --noEmit, strict
npm run lint           # eslint, zero warnings tolerated
npm test               # vitest run
npm run test:watch     # vitest
npm run test:e2e       # playwright, WebKit
npm run build          # fails if release flags are enabled
npm run preview        # serve dist with the service worker active
npm run content:validate   # stub in Phase 1; real in Phase 2
```

Manual verification at two viewport sizes:

- **1180 × 820** — iPad Air M4 landscape with browser chrome
- **820 × 1180** — portrait

DevTools device emulation is useful for layout iteration and **is not** the acceptance test
for iPad behaviour. See `docs/ipad-safari-test-plan.md`.

---

## 4. What Phase 1 deliberately does not contain

- No anatomy content, no muscle names, no structures
- No quiz logic, no question generation, no answer evaluation
- No anatomy board implementation
- No learning modes
- No real anatomy assets

The `AnatomyBoardAdapter` contract exists as a type-only file and is not implemented yet.

---

## 5. Changelog

| Date | Change |
| --- | --- |
| 2026-10-09 | Phase 0 complete: design brief, architecture, domain model and schemas, `AnatomyBoardAdapter` contract, SVG board design, asset and licensing pipeline, content-review workflow, iPad Safari test plan, acceptance checklist, Phase 1 task list. Removed an unrelated pre-brief prototype `index.html`. |

---

## 6. Open decisions for approval

| # | Decision | Recommendation |
| --- | --- | --- |
| 1 | Approve the architecture and folder tree? | Yes as written; deviations from the brief's tree are each justified in `01-architecture.md` §4 |
| 2 | Proceed with CSS Modules over Tailwind? | Yes — hierarchy and whitespace are explicit requirements |
| 3 | Curriculum: 12 anterior / 8 posterior, or trim to 10 / 6? | Trim. A smaller honestly-visible set is the better v1 |
| 4 | Erector spinae, soleus, hamstring group in v1? | Exclude unless an explicit layer mode ships with them |
| 5 | Commission illustration now, in parallel with Phase 1? | Yes — this is the critical path |
| 6 | Open-licence art acceptable, or commission? | Decide before commissioning; CC-BY-SA is usually incompatible |
| 7 | Identify a qualified anatomy reviewer? | Required before any content can be published |
| 8 | App display mode: `standalone` only? | Yes; `window-controls-overlay` deferred to v2 |
| 9 | Name "Muscle Atlas" and tagline confirmed? | Yes |
| 10 | Accelerate Phase 1 into two smaller increments? | Optional; Phase 1 is the largest single phase |

---

## 7. Phase 2 preview

**Content Pipeline.** Domain types, Zod schemas, muscular JSON files, `sources.json` (empty),
asset manifest, `ContentRepository`, `ContentValidator` with all 22 rules, a validation report,
and clearly-marked draft placeholders only.

**The correct Phase 2 outcome is a validator that reports zero publishable structures**,
because no sources have been reviewed yet. That is the system working, not the system failing.
