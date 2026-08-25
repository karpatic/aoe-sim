# Architecture

Milestone 2 keeps the runtime split into three small stages.

1. The main thread loads JSON artifacts, owns DOM controls, and renders cloned snapshots.
2. The Web Worker owns `SimulationEngine`, `WorldState`, and the deterministic scheduler.
3. The Canvas renderer draws only the `WorldSnapshot` it receives.

The protocol in `src/protocol.ts` is intentionally narrow: `initialize`, `play`, `pause`, `seek`, `step`, `snapshot`, and `diagnostics`. The main thread never receives mutable engine objects.

Simulation time is integer milliseconds. Positions are stored as fixed-point integers at scale 1000 and converted to tile coordinates for snapshots. Scheduled replay events are ordered by `(timeMs, sourceSequence, insertionOrdinal)` so same-time commands replay consistently.

Seeking resets the world from the initial scenario and replays commands to the requested time. The worker records a repeat-seek checksum diagnostic so the same target time can be checked for deterministic replay.

`tools/build-scenario.mjs` converts the pinned parser `game.json` into `public/fixtures/glade-120x120.scenario.json`. The importer validates the source schema, hashes the parser output and replay bytes, strips machine-local paths, and stores map tiles as row-major terrain/elevation arrays.

`tools/build-ruleset.py` converts the installed Genie DAT plus English localization into `public/rules/ruleset-current.json`. The committed artifact preserves richer DAT-derived sections for later systems, while the browser validates only compact runtime fields and summary diagnostics before posting a slim rules object to the worker. Runtime entity initialization resolves rules by numeric scenario `dataId` first, with string `kind` fallback only for older synthetic fixtures.

Imported replay actions use `kind: "observed-intent"` and are counted separately from implemented commands. They preserve source index, source sequence, raw kind, player, actor IDs, target ID, and destination fields where present, but they do not mutate world state. The synthetic fixture still uses `kind: "move"` to exercise the current straight-line movement system.

The Canvas renderer caches the static real terrain layer and uses a dense point rendering path for the 9,806-object replay start state. The detailed original pixel tokens remain active for small scenarios.
