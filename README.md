# AoE Sim

Greenfield browser simulation foundation for replay-constrained Age of Empires II reconstruction. Milestone 5 adds deterministic combat intent, range, reload, projectile, damage, death, retargeting, and reconciliation diagnostics while preserving replay commands as observed intent and simulated execution as separate evidence.

## Commands

```sh
npm install
npm run build:ruleset
npm run build:scenario
npm run typecheck
npm run build
npm run dev
```

Carlos has not opted into automated tests for this repository. This milestone uses TypeScript checking, production builds, runtime diagnostics, and browser verification.

## Current Scope

- Strict TypeScript, Vite, native HTML/CSS, Canvas 2D, and a Web Worker.
- Worker protocol for `initialize`, `play`, `pause`, `seek`, `step`, `snapshot`, and `diagnostics`.
- Deterministic event ordering by `(time, sourceSequence, insertionOrdinal)`.
- Integer millisecond simulation time and fixed-point positions.
- Real replay fixture import from `game.json` plus compact synthetic economy and combat fixtures.
- Compact 120x120 row-major terrain/elevation inputs interpreted through actor terrain restriction matrices where available.
- All starting Gaia/player objects with stable `obj:<instance_id>` IDs, data IDs, class IDs, owner, and observed starting positions.
- Complete timestamped action tape preserving source index, source sequence, actor IDs, target IDs, destinations where present, and raw action kind.
- Raw `MOVE` actions with valid in-map top-level positions are promoted to movement intent. Supported `ORDER`, gather-point, `BUILD`, `DE_QUEUE`, and `STOP` commands are still preserved as observed intent, then interpreted into simulated worker, resource, construction, production, and ledger state where resolvable.
- DAT-derived `public/rules/ruleset-current.json` with terrain, terrain restrictions, units/buildings/resources, technologies, raw effects, projectiles, production/costs, collision/footprints, movement, and gathering/economy fields exposed by the installed parser.
- Deterministic tile A* with stable tie-breaking, fixed-point waypoint following, static building/resource footprint occupancy, dynamic collision/bump checks, route invalidation boundaries, and compact route diagnostics.
- Worker gather loops resolve target nodes, gather finite fixed-point resources into carried state, choose drop sites, deposit into player stockpiles, deplete nodes, and deterministically retarget nearby same-family resources.
- Simulated construction spends resource costs, creates foundations, advances multi-worker progress, completes population buildings, and updates static obstruction.
- Simulated production queues spend costs and population headroom, train units from represented rules, spawn stable simulated IDs, and honor resolvable gather points.
- Farms are represented as finite food nodes on completed farm foundations with deterministic reseeding when the player can pay the represented farm cost.
- Per-player economy snapshots expose stockpiles, population, extraction/carry/deposit/spending ledgers, conservation checks, and first divergence diagnostics.
- Observed attack commands create combat intent only; simulated melee contact and projectile impacts apply DAT attack/armor class damage with explicit calculation provenance and represented minimum damage.
- Simulated combat paths actors into legal range, applies reload cadence, launches deterministic projectiles, uses stable retarget candidate ordering, marks simulated deaths, clears dead occupancy, and reconciles later observed activity after incompatible simulated death.
- Combat snapshots and diagnostics expose active episodes, in-flight projectiles, damage events, deaths, retargets, reconciliations, unsupported mechanics, and scoped omissions.
- `public/rules/ruleset-current.report.json` records source hashes, extractor/parser identity, field coverage, and unresolved raw effect operation/attribute diagnostics.
- `public/rules/glade-120x120.coverage.json` resolves every starting entity data ID and every command-referenced unit, building, and technology ID for the replay fixture.
- Renderer consumes snapshots only and cannot mutate simulation state.
- Evidence classes remain explicit: `observed`, `simulated`, and `reconciled`.

Replay command destinations are observed intent, not observed continuous positions. The path chosen from that intent, intermediate positions, carried resources, deposits, depletion, spending, construction, production, and ledgers are simulated. Timeseries comparisons and first divergence records are diagnostics; they do not silently fit engine state to a known replay outcome.

The current ruleset is labeled `current-rules-approximation`: the replay embeds internal build `180059`, while the installed DAT comes from Steam build `24094652`; no authoritative mapping between those namespaces has been proven. No original AoE graphics, audio, raw replay bytes, raw DAT bytes, or raw parser output are committed.
