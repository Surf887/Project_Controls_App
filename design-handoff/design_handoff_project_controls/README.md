# Handoff: Project Controls — Shared Sidebar + 7-Screen Design System

## Overview
This package documents the visual + structural design for the Project Controls workspace (Marlin LNG · Train 2): a dark **sidebar shell** plus a light **workspace canvas**, applied consistently across 7 screens.

The headline change in this round of design work: the sidebar was a **hand-copied block duplicated into several screens** (drifting apart). It is now a **single reusable component** driven by two inputs (`active`, `stage`) so every screen renders the correct navigation + monthly-cycle progress from one source of truth. The implementation task is to mirror that: build **one `Sidebar` component** in the app and pass props per route — not re-paste sidebar markup per page.

## About the Design Files
The files in `screens/` are **design references created in HTML** (`.dc.html` prototypes). They show the intended look, layout, and behavior. They are **not production code to copy directly**.

The target app is **React + TypeScript** (`Project Controls App/src/...`, screens live in `src/views/*.tsx`). The task is to **recreate these designs in that existing React/TS codebase** using its established component patterns, routing, and styling approach — not to ship the HTML. (The `.dc.html` format is a prototyping wrapper; ignore the `<x-dc>` / `dc-import` / `renderVals()` scaffolding and reproduce the resulting UI in React.)

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, and interaction styling. Recreate pixel-accurately using the codebase's existing libraries/patterns. Exact hex, font, and spacing values are listed under **Design Tokens**.

---

## The Sidebar Component (primary deliverable)

A single component, rendered as the left column of every screen. Reference file: `screens/Sidebar.dc.html`.

### Props
| Prop | Type | Values | Drives |
|---|---|---|---|
| `active` | string | `dashboard` `accruals` `costsheet` `contingency` `changes` `forecast` `approval` `portfolio` | Which **Pinned** item is highlighted |
| `stage` | number (1–5) | current step of the monthly control cycle | The **workflow stepper** states + the **period-progress %** |

### Per-screen prop mapping (apply per route)
| Screen | `active` | `stage` |
|---|---|---|
| Command Center | `dashboard` | `3` |
| Accruals | `accruals` | `1` |
| Cost Sheet | `costsheet` | `2` |
| Contingency & MR | `contingency` | `3` |
| Change Register | `changes` | `3` |
| Forecast Engine | `forecast` | `4` |
| Forecast Approval | `approval` | `5` |

> `stage` reflects where the **monthly cycle** sits for that screen. Cycle screens (Accruals→Forecast Approval = 1→5) set their own step active. Non-cycle overview screens (Command Center, Change Register) show the current real cycle position (3 = Contingency in progress).

### Layout (top → bottom), width **288px**, full viewport height, `position: sticky; top: 0`
1. **Brand row** — 40×40 accent rounded square reading `PC` (mono), beside "Project Controls" / "Marlin LNG · Train 2".
2. **Connection chip** — pulsing green dot (`@keyframes` opacity/scale, 1.6s) + "Connected to API" / "Changes persist on server".
3. **Period progress** — mono eyebrow "This period · Jun 2026" + accent-colored `{pct}` on the right; below it a "Close workspace" button (accent-tinted) containing a progress bar filled to `{pct}`.
4. **Workflow stepper** — ordered list of the 5 cycle steps (see below).
5. **Search all modules** button with `⌘K` kbd.
6. **Pinned** group — eyebrow + 4 buttons (Cost Sheet, Change Register, Forecast Engine, Portfolio Compare); the one matching `active` gets the highlight style.
7. **User footer** (pushed to bottom with `margin-top:auto`) — `JA` avatar + "J. Adeyemi" / "Cost Controller".

### Workflow stepper logic (the core of `stage`)
Five fixed steps, in order: **Accruals(1), Cost Sheet(2), Contingency & MR(3), Forecast Engine(4), Forecast Approval(5).** For a given `stage` N:

- **Steps `< N` → DONE**: green check badge (`✓`, bg `rgba(55,200,113,.18)`, fg `#5fd98f`); name `#cfcfc9`; green sub-label `#5f9d72`.
- **Step `== N` → ACTIVE**: accent badge (solid `--ac`, white number); row gets accent-tinted bg+border (`color-mix(in srgb, var(--ac) 16%, transparent)` / `…34%…`); name white bold; sub-label `color-mix(in srgb, var(--ac) 45%, #fff)`.
- **Steps `> N` → PENDING**: gray number badge (bg `rgba(255,255,255,.07)`, fg `#9b9b95`, 1px `rgba(255,255,255,.14)` border); name `#cfcfc9`; sub-label `#73736d`.
  - **Exception — step 5 (Forecast Approval) while pending is a GATE**: amber badge (`!`, bg `rgba(180,105,14,.2)`, fg `#e0a24e`) + amber sub-label `#c9913f`.

Sub-label text per step + status:
| Step | done | active | pending |
|---|---|---|---|
| Accruals | Posted & locked | Drafting accruals | Awaiting period open |
| Cost Sheet | Rev C locked | Editing Rev C | Awaiting accruals |
| Contingency & MR | Reserves reconciled | Drawing CN-014 | Awaiting cost sheet |
| Forecast Engine | Rev 4 run complete | Running forecast | Ready to run |
| Forecast Approval | Approved | Awaiting Director sign-off | Awaiting forecast run |

Progress `pct` by stage: `1→15%`, `2→30%`, `3→45%`, `4→65%`, `5→80%`. Used for both the eyebrow percentage text and the progress-bar fill width.

Row hover: active rows `color-mix(…24%…)`; all other rows `rgba(255,255,255,.06)`.

### Accent theming
The sidebar background and accent are CSS variables set by the **parent screen** and inherited:
- `--ac` (accent) and `--side` (sidebar bg). Four curated pairs:

| Theme | `--ac` | `--side` |
|---|---|---|
| Signal Blue (default) | `#2d5bd7` | `#16161a` |
| Petrol | `#0f6e6b` | `#112523` |
| Industrial Amber | `#b4690e` | `#1c1814` |
| Navy & Coral | `#ec6a4a` | `#18253f` |

In React, expose these as a theme context / CSS custom properties on the app shell; the Sidebar reads `var(--ac)` / `var(--side)` with fallbacks.

---

## Screens / Views
All 7 share the same shell: `display:grid; grid-template-columns: 288px 1fr; min-height:100vh`. Left = `<Sidebar>`; right = a `.workspace` canvas (`padding: 26px 32px 40px; display:flex; flex-direction:column; gap: var(--gap)`).

Every workspace opens with a **topbar**: mono uppercase breadcrumb eyebrow → `<h1>` (27px/700) → right-aligned action buttons.

| Screen | File | Purpose | Distinct content |
|---|---|---|---|
| **Command Center** | `Command Center.dc.html` | Portfolio/period overview dashboard | KPI row, 45% cycle progress bar, monthly-cycle stepper (large), activity/attention lists |
| **Accruals** | `Accruals.dc.html` | Draft & post period accruals | Accrual register table, post/period-lock controls |
| **Cost Sheet** | `Cost Sheet.dc.html` | Budget/cost line editing (Rev C) | WBS cost table, totals |
| **Contingency & MR** | `Contingency & MR.dc.html` | Reserve pools, draws, depletion | Two reserve-pool hero cards (CN.00 / MR.00), WBS reserve ledger, draw register, burn-down SVG, draw-rules toggles |
| **Change Register** | `Change Register.dc.html` | Change orders / variances | Summary strip (4), legend, sortable CO table with status pills |
| **Forecast Engine** | `Forecast Engine.dc.html` | Scenario forecasting (P10/P50/P90) | 3 scenario cards, EAC build-up contribution bars, ETC spread bar chart, assumptions + run-status panels |
| **Forecast Approval** | `Forecast Approval.dc.html` | Director sign-off gate | Approval banner, 4 KPI cards (BAC/EAC/VAC/Δ), waterfall bridge SVG, prior-packages table, approval timeline, sign-off checklist |

Read each file for exact component composition; all use the tokens below.

## Interactions & Behavior
- **Density toggle**: every screen has a `density` prop (`Comfortable` | `Compact`) setting two CSS vars — `--gap` (`20px` / `14px`) and card `--pad` (`22px` / `16px`). Replicate as a workspace-level setting.
- **Accent switch**: `accentColor` prop (the 4 themes above) rewrites `--ac` / `--side`.
- **Hover states**: buttons listed under Components; sidebar rows per stepper logic; table rows hover `#faf9f6`.
- **Nav**: sidebar Pinned items + stepper items + "Close workspace" route to their respective screens.
- No async loading/error states are designed in these mocks — wire to the app's existing data layer (`src/views` already fetch real data per the codebase).

## State Management
- `accentColor: 'Signal Blue' | 'Petrol' | 'Industrial Amber' | 'Navy & Coral'` — app-shell theme.
- `density: 'Comfortable' | 'Compact'` — app-shell layout density.
- Sidebar `active` + `stage` — derive from the **current route** and the **current monthly-cycle position** (a server/store value), per the mapping table. `stage` is data-driven in production (where the cycle actually is), not hard-coded per page — the table values are the design's representative state.

## Design Tokens

### Color
| Role | Hex |
|---|---|
| Canvas bg | `#f5f4f1` |
| Card / surface | `#ffffff` |
| Card border | `#e7e4dd` · hairline `#f0eee9` |
| Card shadow | `0 1px 2px rgba(28,27,24,.05)` |
| Ink primary | `#1c1b18` |
| Ink secondary | `#4a4842` |
| Ink muted | `#6b6862` |
| Ink faint | `#97938b` · `#aaa49a` |
| Input border | `#ddd9d1` · hover `#c2bdb2` |
| Accent (default) | `#2d5bd7` |
| Positive (green) | fg `#1f7a4d` on `#e3f3ea` |
| Warning (amber) | fg `#b4690e` / `#9a5a0c` on `#fbeede` / `#fdf6f5`-warm |
| Critical (red) | fg `#c0392b` on `#fae3e0` / `#fdf6f5` |
| Sidebar text | `#e9e7e2` / `#cfcfc9` / `#8a8780` / `#6f6f78` |

### Typography
- **IBM Plex Sans** — all UI text (400/500/600/700).
- **IBM Plex Mono** — labels, numbers, codes, KPIs, status pills, timestamps, kbd (400/500/600).
- Eyebrow: Mono · 10.5–11px · 600 · `letter-spacing:.08–.11em` · uppercase · `#97938b` (light) / `#6f6f78` (dark).
- Page title `h1`: 27px / 700 / `-.025em`.
- Card title `h3`: 16px / 600 / `-.01em`.
- Body: 14px / 1.55. Big metric: Mono 24–29px / 600 / `-.02em`.

### Spacing & geometry
- Radii: cards `10px`, buttons/inputs `8px`, badges `7px`, pills `99px`, avatars/dots `50%`.
- Card padding `22px` (Comfortable) / `16px` (Compact). Grid gap `20px` / `14px`.
- Layout: `288px` sidebar + `1fr`. Workspace padding `26px 32px 40px`. KPI row `repeat(4, minmax(0,1fr))`, gap `14px`.

### Component patterns
- **Status pill**: mono 11px/600, `padding:2–3px 8–10px`, radius 99, semantic bg+fg pair.
- **Buttons**: primary = `--ac` bg / white / 600, hover `filter:brightness(.92)`; secondary = white + 1px `#ddd9d1`, hover border `#c2bdb2`; ghost = transparent, hover `#faf9f6`. Approve = green `#1f7a4d`; Reject = white + red border/text.
- **Progress bar**: track `#ece9e3`, fill `--ac`, 5–10px, radius 99.
- **Charts**: inline SVG (polylines stroke 2–3, bars `rx:2`, gridlines `#f0eee9`). No gradients/3D.

## Assets
None external. Logo is a CSS box (`PC`). Icons are unicode glyphs (`✓ ! → ⌕ ⌘ ⚠ ●○`) — substitute the codebase's existing icon set. Fonts load from Google Fonts (IBM Plex Sans + Mono); use the app's existing font-loading mechanism.

## Files
- `screens/Sidebar.dc.html` — the shared sidebar (build this first).
- `screens/Command Center.dc.html`
- `screens/Cost Sheet.dc.html`
- `screens/Accruals.dc.html`
- `screens/Contingency & MR.dc.html`
- `screens/Forecast Engine.dc.html`
- `screens/Forecast Approval.dc.html`
- `screens/Change Register.dc.html`

Open any file in a browser to see the rendered design. Corresponding app screens live in `Project Controls App/src/views/` (e.g. `accruals.tsx`, `costStructure.tsx`, `forecast.tsx`, `forecastApproval.tsx`, `contingency.tsx`, `registers.tsx`, `pmoDashboard.tsx`).
