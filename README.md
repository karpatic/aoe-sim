# AoE Sim

Greenfield browser simulation foundation for replay-constrained Age of Empires II reconstruction. The current build adds
local browser-side `.aoe2record` compilation through a commit-pinned MIT `aoe2rec-js` WASM parser, while preserving
deterministic simulation boundaries and the separation between replay observations, simulation state, and rendering.

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
- Playback uses explicit wall-clock synchronized target speeds: 4x by default, with 10x and 30x UI options. Catch-up
  work is bounded so diagnostics report lag instead of allowing a high target to create multi-second worker stalls.
- Separate parser worker for local `.aoe2record` compatibility reports and browser-compiled dataview models. Selected
  recording bytes are read with browser file APIs, transferred to the parser worker, and never uploaded or committed.
  The local path rejects recordings above 128 MiB before `File.arrayBuffer`; compiled maps are bounded to 1024 tiles per
  side and 1,048,576 total tiles, operation streams to 2,000,000 rows, normalized action timelines to 250,000 rows, chat
  previews to 100 rows, and canonical/download JSON to 128 MiB.
- Deterministic event ordering by `(time, sourceSequence, insertionOrdinal)`.
- Integer millisecond simulation time and fixed-point positions.
- Continuous simulation builds one deterministic per-step role context for moving units, active workers, queued
  producers, and attackers. Systems re-check current entity state before acting so task changes during a step do not
  reuse stale membership.
- The persistent active-entity index owns deterministic ID ordering, while villager/siege tree activation refreshes on
  deterministic 500 ms simulation boundaries; forest topology rebuilds remain immediate.
- Real replay fixture import from `game.json` plus compact synthetic economy and combat fixtures.
- Compact 120x120 row-major terrain/elevation inputs interpreted through actor terrain restriction matrices where available.
- All starting Gaia/player objects with stable `obj:<instance_id>` IDs, data IDs, class IDs, owner, and observed starting positions.
- Complete timestamped action tape preserving source index, source sequence, actor IDs, target IDs, destinations where present, and raw action kind.
- Raw `MOVE` actions with valid in-map top-level positions are promoted to movement intent. Supported `ORDER`, gather-point, `BUILD`, `DE_QUEUE`, and `STOP` commands are still preserved as observed intent, then interpreted into simulated worker, resource, construction, production, and ledger state where resolvable.
- DAT-derived `public/rules/ruleset-current.json` with terrain, terrain restrictions, units/buildings/resources, technologies, raw effects, projectiles, production/costs, collision/footprints, movement, and gathering/economy fields exposed by the installed parser.
- Deterministic tile A* with stable tie-breaking, fixed-point waypoint following, static building/resource footprint occupancy, persistent tile-bucketed dynamic collision/bump checks, route invalidation boundaries, and compact route diagnostics. Dynamic blockers use deterministic bump-or-wait behavior because static A* cannot route around moving units.
- Worker gather loops resolve target nodes, gather finite fixed-point resources into carried state, choose drop sites, deposit into player stockpiles, deplete nodes, and deterministically retarget nearby same-family resources.
- Simulated construction spends resource costs, creates foundations, advances multi-worker progress, completes population buildings, and updates static obstruction.
- Simulated production queues spend costs and population headroom, train units from represented rules, spawn stable simulated IDs, and honor resolvable gather points.
- Farms are represented as finite food nodes on completed farm foundations with deterministic reseeding when the player can pay the represented farm cost.
- Per-player economy snapshots expose stockpiles, population, extraction/carry/deposit/spending ledgers, conservation checks, and first divergence diagnostics.
- Observed attack commands create combat intent only; simulated melee contact and projectile impacts apply DAT attack/armor class damage with explicit calculation provenance and represented minimum damage.
- Simulated combat paths actors into legal range, applies reload cadence, launches deterministic projectiles, uses stable retarget candidate ordering, marks simulated deaths, clears dead occupancy, and reconciles later observed activity after incompatible simulated death.
- Combat snapshots and diagnostics expose active episodes, in-flight projectiles, damage events, deaths, retargets, reconciliations, unsupported mechanics, and scoped omissions.
- Direct upload parser pinned to `aoe2rec-js@0.1.22` from `aoe2ct/aoe2rec`, MIT license, immutable package commit
  `a6b8125c1206aa3b0646fbe3eae436d368640e49`, npm tarball SHA-256
  `sha256:39c94c55f7a35a689ad496d2562d29eaab676d3c2aa42f002823d2c7ff2cdb1d`, and WASM SHA-256
  `sha256:cc048829dae76e2e2dbeb90b19271c773b7806345c1192e48adf2663248dd545`. The worker explicitly fetches and
  instantiates the emitted WASM asset before starting wasm-bindgen.
- Local upload report reconciles the known `game.aoe2record` fixture against the committed Glade scenario for replay
  hash/size, build/version, duration, human players, map ID/tiles/terrain/elevation counts, total action count, and
  mapped action-kind counts.
- Browser-compiled replay dataview exposes selected-file provenance, duration/build/settings, supported player results,
  rendered parser terrain/elevation grid, operation/action counts, per-player action summaries, bounded/paged normalized
  action timeline rows, a collapsed bounded chat panel, unsupported evidence, and JSON download.
- The compiled content hash is SHA-256 over an `aoe-sim.stable-json-v1.unsigned-browser-compiled-replay` projection:
  UTF-8 JSON with no whitespace, code-point lexical key order, `undefined` fields omitted, `/provenance/generatedArtifact`
  excluded, and local filename/mtime fields excluded from `/recording` and `/provenance/replay`. The displayed canonical
  content byte count is for that unsigned projection, not the pretty downloaded JSON.
- Starting objects are only partially reconciled through `aoe2rec` `next_object_id = 9806`; per-object owners, data IDs,
  HP, observed positions, lifetimes, current economy, and resource estimates are not confirmed by the local browser
  compiler and are not fetched from per-replay JSON sidecars for the selected recording.
- `public/rules/ruleset-current.report.json` records source hashes, extractor/parser identity, field coverage, and unresolved raw effect operation/attribute diagnostics.
- `public/rules/glade-120x120.coverage.json` resolves every starting entity data ID and every command-referenced unit, building, and technology ID for the replay fixture.
- Renderer receives authoritative immutable snapshots at lifecycle boundaries and time-contiguous dirty-entity render
  deltas during playback. It caches terrain and represented trees locally without mutating simulation state.
- Runtime diagnostics expose bounded last/average/max timing rows for worker simulation batches, commands,
  movement/tree/economy/combat systems, render delta creation, worker posting, main-thread merge, canvas draw, visual
  frame interval, target playback speed, effective speed, and simulated-time lag.
- Evidence classes remain explicit: `observed`, `simulated`, and `reconciled`.

Replay command destinations are observed intent, not observed continuous positions. The path chosen from that intent, intermediate positions, carried resources, deposits, depletion, spending, construction, production, and ledgers are simulated. Timeseries comparisons and first divergence records are diagnostics; they do not silently fit engine state to a known replay outcome.

The current ruleset is labeled `current-rules-approximation`: the replay embeds internal build `180059`, while the
installed DAT comes from Steam build `24094652`; no authoritative mapping between those namespaces has been proven.
Direct local parsing does not turn an uploaded recording into authoritative simulation state yet. Derived output and
export can include player names/profile IDs, terrain/elevation arrays, action object IDs, coordinates, scalar parameters,
and bounded chat text. Raw replay bytes remain local; raw parser objects, original AoE graphics/audio, raw DAT bytes,
and selected-replay sidecar analytics are not committed or silently reused by the upload path.

See [docs/replay-upload.md](docs/replay-upload.md) for the local upload boundary, parser license/provenance, exact fixture reconciliation, and unsupported mappings.
