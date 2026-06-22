# Complete Project Controls Platform — Build Plan
## Problem statement
The current app is a credible MVP (CSV ingestion → review → cost sheet + EVM/charts), but it is not a complete project controls tool. The user needs feature parity with how EcoSys / Oracle Unifier / AACE-aligned workflows actually operate: separate phase workspaces for Engineering / Procurement / Construction / Commissioning, a forecast engine that knows about change-order status (approved/pending/rejected), cost-type segregation (CAPEX/OPEX/Owner cost/contingency), the full project-controls log family (Risks + Issues + Opportunities + Change Register + Action Items + Decisions + Lessons Learned), what-if sensitivity and Monte Carlo predictive analysis, and CSV WBS upload.
## Industry research baseline
The build is grounded in: EcoSys cost sheet structure (Original Budget → Current Budget → Commitments → Actuals → Current Forecast); Oracle Unifier business processes (Estimate / Fund Appropriation / Initial Budget / Budget Change / Budget Transfer / Forecast / Commitment / Change Request / Change Order / PCO / Actual / Invoice / Issue / Risk); AACE RPs 34R-05 (Basis of Estimate including Risks & Opportunities), 40R-08 / 44R-08 / 65R-11 / 118R-21 / 123R-22 (contingency by expected value + Monte Carlo); ISO 31000:2018 fields (cause/event/impact, inherent + residual, owner, response strategy); oil & gas TECOP + NTR categorisation. The product owns this terminology, not invents new names.
## Architecture
Keep React + Vite + TypeScript single-page app, no backend. Reorganise by domain modules under `src/modules/` so each phase workspace is self-contained. Shared types and stores in `src/store/` so the forecast engine can read every module's contributions. localStorage persistence already exists for cost sheet; extend it to cover all new modules.
## Module surface
The app gains the following modules, grouped in the sidebar.
Project setup
* `WBS Manager` — upload CSV/JSON WBS, edit hierarchy in place, set cost-type tags (CAPEX / OPEX / Owner Cost / Contingency / Management Reserve), phase tags (Engineering / Procurement / Construction / Commissioning), and discipline. Mirrors EcoSys Project Structure.
* `Basis of Estimate` — AACE 34R-05 sections (scope, methodology, design basis, allowances, exclusions, risks/opportunities) attached to the active baseline.
Phase workspaces (each with its own EcoSys-style cost sheet, scoped to its phase tag)
* `Engineering` — cost sheet filtered to phase=Engineering, plus deliverables register (drawings/specs progress weighting).
* `Procurement` — PO register, contract register, RFQ/bid log, expediting status, commitment vs invoice reconciliation, currency basis. Mirrors Unifier RFB → Contract → PO → Invoice flow.
* `Construction` — subcontract register, progress measurement by rule-of-credit, labour productivity (planned vs earned hrs), daily report stub, field-observation stub.
* `Commissioning` — punch list, system turnover packages, completion checklists.
Cost & forecast
* `Cost Sheet` — existing module, kept; column set extended with `Cost Type` and `Phase` so users can pivot.
* `Change Register` — change requests with status (`Draft / Submitted / Pending / Approved / Rejected / Withdrawn`), originator, value, schedule impact, basis, linked WBS rows. Drives the forecast engine.
* `Forecast Engine` — produces three deterministic scenarios per WBS row using approved/pending/rejected change states, plus a sensitivity / Monte Carlo what-if workspace.
Risk & log family
* `Risk Register` — threats + opportunities in one ISO 31000 register with inherent and residual scores, response strategy, owner, KRI, cost/schedule exposure that flows into the forecast engine.
* `Issues Log` — currently realised problems with severity, status, owner, due date.
* `Opportunities Log` — upside actions with realisation status and target capture date.
* `Action Items` — RACI rows linked to risks/issues/changes/decisions.
* `Decision Log` — date / decision / decided by / rationale / link to artefact.
* `Lessons Learned` — closeout learning items, taggable.
Existing modules (Ingestion, Review Desk, Validation, Lineage, EVM Controls, Predictive signals, Engineering intelligence, Model, Reality, Governance, Decisions) stay but are regrouped into a clearer sidebar.
## Data model additions (`src/data/` + `src/store/`)
New types: `WbsNode` (with `costType`, `phase`, `discipline`); `Contract`, `PurchaseOrder`, `Invoice`, `Subcontract`, `LabourEntry`, `Deliverable`, `PunchListItem`; `ChangeOrder` (with `status: 'draft'|'submitted'|'pending'|'approved'|'rejected'|'withdrawn'` and `costDelta`, `scheduleDeltaDays`, `probability`, `affectedWbs[]`); `Risk` (threat + opportunity union with ISO 31000 fields); `Issue`, `Opportunity`, `ActionItem`, `Decision`, `LessonLearned`. A small in-file `useProjectStore` (React context + reducer + localStorage middleware) so every module reads/writes through a single state tree — required because the forecast engine cross-references almost everything.
## Forecast engine (`src/engine/forecast.ts`)
For every WBS row the engine computes:
* `eacBase = actualsToDate + remainingBudget` (current-budget driven)
* `approvedChangesDelta = Σ approved change costDelta where affectedWbs contains row`
* `pendingChangesExpectedDelta = Σ pending change costDelta × probability`
* `riskExposure = Σ residual probability × cost impact (threats minus opportunities)`
* `eacBestCase = eacBase + approvedChangesDelta`
* `eacMostLikely = eacBase + approvedChangesDelta + pendingChangesExpectedDelta + riskExposure`
* `eacWorstCase = eacBase + approvedChangesDelta + Σ pending costDelta (full) + Σ open-risk worst-case impact`
The engine is pure (input state → output forecast snapshot) so the same function powers the cost sheet's EAC column, the EVM dashboard, and the what-if workspace.
## What-if + Monte Carlo (`src/engine/scenario.ts` + `src/modules/Predictive/`)
The Predictive workspace exposes sliders that mutate scenario inputs without touching real state:
* productivity factor (0.7 – 1.3)
* escalation rate (% applied to FTC)
* scope growth (% added to remaining budget)
* schedule extension (months → time-dependent cost burn × monthly rate)
* change-approval probability override (replaces individual change probabilities)
* contingency draw-down %
For each scenario the engine runs a Monte Carlo simulation (`N=2000`, triangular distributions on cost ranges in the Change Register and Risk Register, productivity factor sampled from the slider's range) and reports P10/P50/P90 EAC, a histogram, a tornado chart of the top sensitivity drivers, and a CDF curve. Pure JS, no external libs; SVG charts already present.
## WBS upload
`WBS Manager` accepts a CSV in the format `wbs,parentWbs,description,costType,phase,discipline,originalBudget,currency`. Parser already exists for CSV import — extend it. After upload the user is taken to the cost sheet, which renders the uploaded hierarchy with all formula columns recalculated.
## UI changes
Sidebar regrouped into: `Project Setup`, `Cost & Forecast`, `Phase Workspaces`, `Risk & Logs`, `Analytics`, `Document Intelligence`, `Governance`. Each group collapsible. The existing top-bar gets a project selector and baseline indicator. Each module reuses the existing `cs-` grid CSS for its registers/sheets to keep visual consistency.
## Validation
`npm run build` after each major module to keep type-errors local. After the full build, manually open every new view in dev and confirm no runtime errors. Smoke-test the forecast engine with a Vitest unit test for `computeForecast` (deterministic) and `runMonteCarlo` (range-check P10 < P50 < P90).
## Scope discipline
No external libraries beyond what is already installed (React 19, Vite). No backend, no auth, no real document storage. The engine is mathematically faithful to AACE; it is not a substitute for a real risk consultant's Monte Carlo tool. All currency is USD for v1; multi-currency stays a roadmap item.
## Out of scope (explicitly)
Real P6 / SAP / EcoSys integration; live document storage; multi-user collaboration; role-based access control; multi-currency; tax/withholding logic; Primavera P6 schedule import (the schedule module is stub-only); IFC/CAD parsing (already seeded only); cross-project portfolio analytics.
## Execution sequence
1. Add new types + store + persistence — no UI changes yet, build green.
2. WBS Manager + CSV upload — first user-visible addition.
3. Change Register + forecast engine wiring — cost sheet EAC now reflects change states.
4. Risk Register (threats + opportunities) + risk impact into forecast.
5. Phase workspaces (Engineering / Procurement / Construction / Commissioning).
6. Issues / Opportunities / Actions / Decisions / Lessons Learned (smaller registers, reuse grid).
7. Predictive what-if workspace + Monte Carlo + tornado chart.
8. Sidebar regroup, polish, final build.
