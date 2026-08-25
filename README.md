# AoE Sim

Greenfield browser simulation foundation for replay-constrained Age of Empires II reconstruction. Milestone 3 adds deterministic movement routing and occupancy for defensible raw MOVE intent while keeping unsupported replay commands as observed intent.

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
- Real replay fixture import from `game.json` plus the original synthetic trace fixture.
- Compact 120x120 row-major terrain/elevation inputs interpreted through actor terrain restriction matrices where available.
- All starting Gaia/player objects with stable `obj:<instance_id>` IDs, data IDs, class IDs, owner, and observed starting positions.
- Complete timestamped action tape preserving source index, source sequence, actor IDs, target IDs, destinations where present, and raw action kind.
- Raw `MOVE` actions with valid in-map top-level positions are promoted to movement intent; `ORDER`, `SPECIAL`, `WALL`, queue, economy, construction, and combat commands remain observed intent only.
- DAT-derived `public/rules/ruleset-current.json` with terrain, terrain restrictions, units/buildings/resources, technologies, raw effects, projectiles, production/costs, collision/footprints, movement, and gathering/economy fields exposed by the installed parser.
- Deterministic tile A* with stable tie-breaking, fixed-point waypoint following, static building/resource footprint occupancy, dynamic collision/bump checks, route invalidation boundaries, and compact route diagnostics.
- `public/rules/ruleset-current.report.json` records source hashes, extractor/parser identity, field coverage, and unresolved raw effect operation/attribute diagnostics.
- `public/rules/glade-120x120.coverage.json` resolves every starting entity data ID and every command-referenced unit, building, and technology ID for the replay fixture.
- Renderer consumes snapshots only and cannot mutate simulation state.
- Evidence classes remain explicit: `observed`, `simulated`, and `reconciled`.

Replay command destinations are observed intent, not observed continuous positions. The path chosen from that intent and all intermediate positions are simulated. The synthetic trace remains available from the scenario selector for exercising implemented movement on a small map.

The current ruleset is labeled `current-rules-approximation`: the replay embeds internal build `180059`, while the installed DAT comes from Steam build `24094652`; no authoritative mapping between those namespaces has been proven. No original AoE graphics, audio, raw replay bytes, raw DAT bytes, or raw parser output are committed.
