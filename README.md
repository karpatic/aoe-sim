# AoE Sim

Greenfield browser simulation foundation for replay-constrained Age of Empires II reconstruction. Milestone 2 adds a deterministic DAT-derived rules contract for the pinned Glade replay fixture while keeping unsupported replay commands as observed intent.

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
- Compact 120x120 row-major terrain/elevation inputs with unresolved passability.
- All starting Gaia/player objects with stable `obj:<instance_id>` IDs, data IDs, class IDs, owner, and observed starting positions.
- Complete timestamped action tape as observed intent preserving source index, source sequence, actor IDs, target IDs, destinations where present, and raw action kind.
- DAT-derived `public/rules/ruleset-current.json` with terrain, terrain restrictions, units/buildings/resources, technologies, raw effects, projectiles, production/costs, collision/footprints, movement, and gathering/economy fields exposed by the installed parser.
- `public/rules/ruleset-current.report.json` records source hashes, extractor/parser identity, field coverage, and unresolved raw effect operation/attribute diagnostics.
- `public/rules/glade-120x120.coverage.json` resolves every starting entity data ID and every command-referenced unit, building, and technology ID for the replay fixture.
- Renderer consumes snapshots only and cannot mutate simulation state.
- Evidence classes remain explicit: `observed`, `simulated`, and `reconciled`.

Replay actions in the imported fixture do not mutate simulation state yet. The synthetic trace remains available from the scenario selector for exercising implemented straight-line movement.

The current ruleset is labeled `current-rules-approximation`: the replay embeds internal build `180059`, while the installed DAT comes from Steam build `24094652`; no authoritative mapping between those namespaces has been proven. No original AoE graphics, audio, raw replay bytes, raw DAT bytes, or raw parser output are committed.
