# AoE Replay Simulator Implementation Plan

> **For Hermes:** Execute in vertical milestones, preserving deterministic and provenance boundaries before expanding mechanics.

**Goal:** Build a greenfield browser-compatible engine that reconstructs AoE II replay state as faithfully as available commands and rules permit, with original pixel graphics and explicit uncertainty.

**Architecture:** A build-pinned replay/ruleset importer feeds a deterministic TypeScript simulation running in a Web Worker. The browser renderer consumes immutable snapshots through a narrow protocol and draws an original low-resolution Canvas 2D world. Recorded facts, simulated state, and evidence-based corrections remain separately attributable.

**Tech Stack:** TypeScript, Vite, native HTML/CSS, Canvas 2D, Web Worker, JSON artifacts; optional Rust/WASM later for direct `.aoe2record` parsing or proven hot paths.

---

## 1. Product contract

The project is not a port of `dataview.html`, openage, or freeaoe. Existing code and upstream engines are research inputs only.

The simulator must:

- initialize terrain, resources, players, and starting entities from a normalized replay scenario;
- process a timestamped command tape in deterministic order;
- maintain per-entity position, ownership, task, HP, carried resources, production, and lifecycle state;
- model movement, occupancy, gathering, drop-off, construction, production, technologies, combat, projectiles, and death incrementally;
- support replay-time seeking from periodic checkpoints;
- identify every displayed state as observed, simulated, reconciled, or unknown;
- provide divergence diagnostics rather than silently forcing a desired outcome;
- render original static pixel tokens without original game audio or visual assets.

The simulator must not claim exact AoE II DE engine parity. Fidelity claims must name the replay build, ruleset provenance, unsupported mechanics, and measured comparison evidence.

## 2. Source and license strategy

Use:

- `aoe2rec` (MIT) as the preferred future browser/WASM recording parser after compatibility validation;
- current `aoc-mgz` output as the first scenario/command source because it is already verified against the fixture;
- DAT-derived structured rules generated locally, with source build and hash recorded;
- `genieutils`/`genie-rs` as data-format references when needed.

Treat openage and freeaoe as behavioral and architectural research. Do not copy GPL implementation code unless the repository intentionally adopts GPL and the decision is documented first.

## 3. Repository layout

```text
AGENTS.md
README.md
package.json
vite.config.ts
tsconfig.json
index.html
src/
  app.ts
  style.css
  protocol.ts
  replay/
    model.ts
    import-game-json.ts
    provenance.ts
  engine/
    engine.ts
    scheduler.ts
    world.ts
    checksum.ts
    rng.ts
    systems/
      commands.ts
      movement.ts
      occupancy.ts
      economy.ts
      construction.ts
      production.ts
      technology.ts
      combat.ts
  worker/
    simulation-worker.ts
  render/
    canvas-renderer.ts
    pixel-tokens.ts
  ui/
    timeline.ts
    diagnostics.ts
public/
  fixtures/
    scenario.json
  rules/
    ruleset-current.json
tools/
  build-scenario.mjs
  build-ruleset.py
docs/
  architecture.md
  fidelity.md
  provenance.md
.hermes/plans/
```

## 4. Milestone 0 — runnable deterministic tracer

### Deliverable

A production-built page that starts a worker, initializes a tiny original scenario, advances deterministic simulation time, and renders moving pixel units on a low-resolution canvas.

### Implementation

1. Scaffold Vite + strict TypeScript without a UI framework.
2. Define the worker protocol in `src/protocol.ts`:
   - `initialize`
   - `play`
   - `pause`
   - `seek`
   - `step`
   - `snapshot`
   - `diagnostics`
3. Define stable IDs and integer millisecond simulation time.
4. Implement a deterministic scheduler with ordering by `(time, sourceSequence, insertionOrdinal)`.
5. Implement a minimal world containing map bounds, entities, and commands.
6. Create a tiny original fixture with two teams and several Move commands.
7. Render at a deliberately low internal resolution and scale using nearest-neighbor/pixelated output.
8. Display simulation time, play/pause, seek, and checksum diagnostics.

### Verification

- `npm run typecheck` exits successfully.
- `npm run build` emits the production artifact.
- Browser loads without console errors.
- Play, pause, step, and seek visibly work.
- Repeating the same seek produces the same checksum.
- No original AoE graphics or audio are present.

## 5. Milestone 1 — replay scenario importer and provenance

### Deliverable

Import the existing replay fixture into a compact scenario artifact without inheriting prior inference logic.

### Inputs

- `/home/carlos/Documents/GitHub/www/aoe/game.aoe2record`
- `/home/carlos/Documents/GitHub/www/aoe/game.json`
- generation scripts under `/home/carlos/Documents/hermes-runtime/aoe/replays/`

### Implementation

1. Define `ReplayScenarioV1` with:
   - replay identity and SHA-256;
   - parser identity and immutable commit;
   - game/replay/save/build versions;
   - map dimensions and tile passability inputs;
   - starting Gaia/player entities;
   - normalized command tape;
   - random seeds when available;
   - unsupported/unknown fields.
2. Build `tools/build-scenario.mjs` to validate and compact `game.json`.
3. Preserve command source sequence and distinguish actor IDs, target IDs, and destination positions.
4. Store source hashes in generated output.
5. Reject incompatible schemas instead of guessing.
6. Document that destinations are not continuous position observations.

### Verification

- Scenario counts reconcile with the source for tiles, starting objects, actions, players, and duration.
- Source hashes match the copied fixture.
- The browser loads the generated scenario and renders the correct map bounds/start state.

## 6. Milestone 2 — coherent ruleset extraction

### Deliverable

A versioned rules artifact with explicit historical-parity status.

### Implementation

1. Inventory available DAT/reference sources and build identities.
2. Determine whether replay build `180059` can be matched exactly.
3. Generate rules for terrain, units, buildings, resources, technologies, effects, attacks, armor, projectiles, production, and gathering.
4. Preserve unresolved packed effects rather than silently dropping them.
5. Hash every input and emit tool/source versions.
6. Label the artifact `exact-build`, `mapped-build`, or `current-rules-approximation`.
7. Remove replay-specific filtering; the rules artifact must cover the scenario coherently.

### Verification

- Every starting and commanded entity/technology ID resolves or appears in an explicit unresolved report.
- Ruleset provenance includes DAT path/build/hash and extractor identity.
- Re-running extraction with identical inputs yields byte-stable semantic content, excluding generation time if retained separately.

## 7. Milestone 3 — movement and occupancy

### Deliverable

Replay-selected actors traverse legal routes rather than straight command segments.

### Implementation

1. Build terrain and structure occupancy grids.
2. Represent entity radius/footprint independently from rendering size.
3. Implement deterministic A* with stable tie-breaking.
4. Add waypoint following using fixed-point positions.
5. Add conservative collision/bumping and dynamic obstruction.
6. Add formation destination offsets only after individual movement is stable.
7. Reconcile later observed actor use without calling silence a death.
8. Emit path failure and correction diagnostics.

### Verification

- Units do not cross blocked terrain or occupied building footprints.
- Identical command tapes produce identical paths/checksums.
- Gate and dynamic-building changes invalidate routes deterministically.
- Renderer labels corrected and unknown positions separately.

## 8. Milestone 4 — Villager economy and construction

### Deliverable

Villagers execute complete gather/carry/drop-off and build loops.

### Implementation

1. Model worker task state, carried resource, capacity, rates, and drop sites.
2. Implement resource-node depletion and deterministic retargeting.
3. Add farm creation, depletion, and reseeding generations.
4. Add construction progress with multi-builder contribution.
5. Add costs, affordability, production queues, cancellation/refund rules, and population.
6. Apply technology/civilization modifiers only when represented by the rules artifact.
7. Compare simulated samples against replay timeseries and existing resource bounds without fitting engine state to them silently.

### Verification

- Resource conservation and spending ledgers balance within represented mechanics.
- Worker counts equal explicit task totals plus idle/unknown workers.
- Backward/forward seeks restore node, farm, building, queue, and stockpile state.
- Divergence reports identify unsupported mechanics and first divergence time.

## 9. Milestone 5 — combat

### Deliverable

Units acquire targets, move into range, attack, damage, and die under deterministic rules.

### Implementation

1. Add HP, attack/reload timing, range/minimum range, and attack/armor classes.
2. Add stance and target acquisition with deterministic candidate ordering.
3. Add projectile flight, accuracy, elevation, splash, and minimum-damage rules as supported.
4. Add building attacks and garrison contribution.
5. Add healing, repair, conversion, and special attacks only after core combat is stable.
6. Preserve direct command intent separately from simulated contact/damage/death.
7. Reconcile later actor evidence and aggregate losses through explicit correction events.

### Verification

- Attack intent never directly removes a target.
- Damage calculations cite the applied rules/effects.
- Later observed actor activity invalidates an incompatible simulated death through a visible reconciliation event.
- Repeated battle playback and seeking are checksum-stable.

## 10. Milestone 6 — direct replay upload

### Deliverable

The browser can parse a selected `.aoe2record` locally without uploading it.

### Implementation

1. Pin a specific `aoe2rec` commit/version.
2. Build/integrate its WASM package in a worker.
3. Differentially compare output against the known `aoc-mgz` fixture.
4. Reject unsupported builds with a useful compatibility report.
5. Keep all recording bytes local to the browser.

### Verification

- Known fixture identity, players, map, duration, starting objects, and command counts reconcile.
- Unsupported/corrupt files fail without crashing the page.
- No recording network request occurs.

## 11. Deployment milestone

Do not deploy automatically during the greenfield foundation. Once a coherent vertical slice exists:

1. Build a static production artifact.
2. Stage it beneath `/home/carlos/Documents/GitHub/www/aoe/simulate.html` and a namespaced asset directory.
3. Preserve the canonical source in this private repository.
4. Verify local, Trogdor, and public readback only when Carlos authorizes deployment.

## 12. Quality gates and risks

### Mandatory gates

- deterministic scheduler and checksum before real replay mechanics;
- provenance before fidelity claims;
- simulation/renderer separation;
- build-specific rules before broad mechanic coverage;
- observable divergence instead of hidden fixture tuning;
- no replay-specific IDs, coordinates, timestamps, or expected outcomes inside generic mechanics.

### Principal risks

- Historical DAT for replay build `180059` may be unavailable.
- DE pathfinding, bumping, target acquisition, and RNG streams may remain undocumented.
- Sparse commands cannot independently prove continuous positions or every lifecycle transition.
- GPL code reuse could change distribution obligations.
- Simulation divergence will compound unless correction events remain explicit and conservative.

### Deferred decisions

- Rust/WASM simulation core versus TypeScript hot paths;
- event-scheduled versus fixed-tick execution after first profiling;
- full visibility/fog simulation;
- multiplayer/observer feeds;
- automated tests, which require Carlos's explicit opt-in under his development preference.
