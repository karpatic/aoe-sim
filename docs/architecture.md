# Architecture

Milestone 3 keeps the runtime split into three small stages.

1. The main thread loads JSON artifacts, owns DOM controls, and renders cloned snapshots.
2. The Web Worker owns `SimulationEngine`, `WorldState`, and the deterministic scheduler.
3. The Canvas renderer draws only the `WorldSnapshot` it receives.

The protocol in `src/protocol.ts` is intentionally narrow: `initialize`, `play`, `pause`, `seek`, `step`, `snapshot`, and `diagnostics`. The main thread never receives mutable engine objects.

Simulation time is integer milliseconds. Positions are stored as fixed-point integers at scale 1000 and converted to tile coordinates for snapshots. Scheduled replay events are ordered by `(timeMs, sourceSequence, insertionOrdinal)` so same-time commands replay consistently.

Seeking resets the world from the initial scenario and replays commands to the requested time. The worker records a repeat-seek checksum diagnostic so the same target time can be checked for deterministic replay.

`tools/build-scenario.mjs` converts the pinned parser `game.json` into `public/fixtures/glade-120x120.scenario.json`. The importer validates the source schema, hashes the parser output and replay bytes, strips machine-local paths, and stores map tiles as row-major terrain/elevation arrays.

`tools/build-ruleset.py` converts the installed Genie DAT plus English localization into `public/rules/ruleset-current.json`. The committed artifact preserves richer DAT-derived sections for later systems, and the browser now retains movement, collision, terrain restriction, and provenance fields needed by the worker. Runtime entity initialization resolves rules by numeric scenario `dataId` first, with string `kind` fallback only for older synthetic fixtures.

Imported replay actions preserve source index, source sequence, raw kind, player, actor IDs, target ID, and destination fields where present. Raw `MOVE` actions with valid in-map top-level positions are promoted to `kind: "move"` and routed as observed intent; `ORDER` and other raw command kinds remain `kind: "observed-intent"` because their position fields can mean gather, attack, repair, walling, garrisoning, or other semantics.

Movement owns a `PathingState` built from the scenario map, the DAT-derived terrain restriction matrices, and initial entity footprints. Static buildings/resources occupy a conservative tile grid with an explicit version number for future construction/gate invalidation. Individual routes use deterministic A* with bounded search and stable tie-breaking, then fixed-point waypoint following. Dynamic unit collision is checked during movement with deterministic bump attempts and replan after repeated obstruction; formation offsets remain deferred.

The Canvas renderer caches the static real terrain layer and uses a dense point rendering path for the 9,806-object replay start state. The detailed original pixel tokens remain active for small scenarios.
