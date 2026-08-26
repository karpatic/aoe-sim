# Architecture

Milestone 6 keeps the runtime split into four small stages.

1. The main thread loads JSON artifacts, owns DOM controls, and renders authoritative snapshots plus playback deltas.
2. The Web Worker owns `SimulationEngine`, `WorldState`, and the deterministic scheduler.
3. A separate parser worker owns local `.aoe2record` parsing and compatibility reports.
4. The Canvas renderer resets from immutable `WorldSnapshot` values and applies time-contiguous render-only playback
   frames. A frame gap fails closed by requesting another authoritative snapshot.

The protocol in `src/protocol.ts` is intentionally narrow: `initialize`, `play`, `pause`, `seek`, `step`, `snapshot`, and
`diagnostics`, plus worker-originated playback frames. Play requests carry an explicit wall-clock playback speed; the
worker targets `startSimTime + elapsedWall * speed` at 4x by default, with 10x and 30x options, and still advances the
engine through deterministic fixed steps and exact scheduled events. Catch-up work is sliced under a bounded wall-time
budget so an unattainable target rate increases the reported lag instead of freezing the worker for seconds. Ordinary playback frames contain only changed
renderer-visible entities and current projectiles; they do not build, checksum, freeze, or transfer the complete world.
Ready, pause, step, seek, explicit Sync, and terminal boundaries still return authoritative checksummed snapshots. The
main thread never receives mutable engine objects.

Local replay upload uses a separate protocol in `src/replay/local-recording.ts` and worker entrypoint
`src/worker/replay-parser-worker.ts`. The main thread reads the selected file with `File.arrayBuffer`, transfers that
`ArrayBuffer` to the parser worker, and receives only derived parser output: hashes, metadata, compact map arrays,
operation/action summaries, normalized action timeline rows, chat rows where exposed, comparison rows, and unsupported
evidence notes. The browser-compiled model is displayed and downloadable from the native dataview UI, but it is not fed
into `SimulationEngine`. The read is guarded before `File.arrayBuffer` by a 128 MiB recording limit, then guarded again
inside the worker. Model allocation is bounded by 1024-tile map dimensions, 1,048,576 tiles, 2,000,000 operations,
250,000 normalized actions, 100 chat preview rows, and 128 MiB canonical/download JSON.

Simulation time is integer milliseconds. Positions are stored as fixed-point integers at scale 1000 and converted to tile coordinates for snapshots. Scheduled replay events are ordered by `(timeMs, sourceSequence, insertionOrdinal)` so same-time commands replay consistently.

Seeking resets the world from the initial scenario and replays commands to the requested time. The worker records a repeat-seek checksum diagnostic so the same target time can be checked for deterministic replay.

`tools/build-scenario.mjs` converts the pinned parser `game.json` into `public/fixtures/glade-120x120.scenario.json`. The importer validates the source schema, hashes the parser output and replay bytes, strips machine-local paths, and stores map tiles as row-major terrain/elevation arrays.

Direct upload parsing is pinned to `aoe2rec-js@0.1.22`, built from upstream commit
`a6b8125c1206aa3b0646fbe3eae436d368640e49`. The parser worker imports the wasm-bindgen JS bindings directly, fetches
the emitted `aoe2rec_js_bg.wasm` asset URL, instantiates it inside the worker, calls `__wbg_set_wasm`, then starts the
module. This avoids the brittle direct `.wasm` dependency-prebundle path that could leave the externref table unset in
some Vite worker startup paths.

`tools/build-ruleset.py` converts the installed Genie DAT plus English localization into `public/rules/ruleset-current.json`. The committed artifact preserves richer DAT-derived sections for later systems, and the browser now retains movement, collision, terrain restriction, and provenance fields needed by the worker. Runtime entity initialization resolves rules by numeric scenario `dataId` first, with string `kind` fallback only for older synthetic fixtures.

Imported replay actions preserve source index, source sequence, raw kind, player, actor IDs, target ID, and destination fields where present. Raw `MOVE` actions with valid in-map top-level positions are promoted to `kind: "move"` and routed as observed intent. Supported economy commands remain `kind: "observed-intent"` in the command tape, then `systems/economy.ts` resolves actor/target/rules context into simulated work only when defensible.

Each continuous step builds one `SimulationStepContext` from the tree-filtered active set. The context records sorted
moving units, workers, queued producers, and attackers once for that step. Systems still check current lifecycle/task
state before acting, and production can expose deterministic same-step spawns to later active-target scans without
adding them to the already-running role loops.

Movement owns a `PathingState` built from the scenario map, the DAT-derived terrain restriction matrices, and initial entity footprints. Static buildings/resources occupy a conservative tile grid with an explicit version number for future construction/gate invalidation. Individual routes use deterministic A* with bounded search and stable tie-breaking, then fixed-point waypoint following. A persistent tile-bucket dynamic collision index narrows collision checks to nearby units and updates incrementally for movement, spawn, death, reconciliation, and occupancy-kind changes. The final blocker decision still lives in `PathingState`, which preserves the lowest-id deterministic collision ordering. Dynamic blockers use deterministic bump attempts and wait when no bump is legal; static A* replanning is reserved for represented static obstruction changes because it cannot route around moving units. Formation offsets remain deferred.

Economy owns worker task state, carry state, finite resource nodes, construction state, production queues, population, and player ledgers. Gatherers route to a resolved resource node, gather fixed-point amounts into carry, route to the nearest represented drop site, deposit into stockpiles, and retarget deterministically when a same-family node depletes. Construction creates simulated foundations with stable IDs, spends represented costs, advances progress from assigned workers, and updates static obstruction when complete. Production spends represented unit costs and population headroom, trains queued units, spawns stable simulated IDs, and applies resolvable gather points to new workers.

WorldState also owns a deterministic tree active set for simulation-system iteration. All represented tree resources remain in the entity map, resource-node map, static occupancy grid, snapshots, and checksums. Live represented trees are dormant by default. Live represented villagers activate exposed live trees within six tiles, where exposure means the tree's tile lacks at least one live-tree neighbor in the eight surrounding tile positions. Live represented onagers and siege onagers that satisfy the conservative tree-cutting capability rule activate every live tree within ten tiles, including fully surrounded interior trees. Tree depletion rebuilds the live-tree tile index so the next forest layer can become exposed, but those newly exposed trees stay dormant until a qualifying villager sees them or capable siege is nearby. Tree activation refresh is dirty-gated and runs on deterministic 500 ms simulation boundaries after relevant qualifying
unit movement or lifecycle changes. Represented-tree mutations that require rebuilding the live forest index remain
immediate. This replaces unconditional per-system refreshes without changing the engine's 50 ms movement/economy/combat
step.

Local parser compatibility checks reconcile the known recording against the committed `aoc-mgz` scenario where
`aoe2rec` exposes equivalent facts: recording identity, build/version, duration, human players, map
ID/dimensions/tile counts, terrain/elevation counts, total actions, and action-kind counts. The dataview model does not
reuse the committed scenario as selected-replay truth. Starting objects remain partial because the pinned JS API exposes
`replay.next_object_id` but not per-object owner/data/position tables.

The browser-compiled replay model is versioned as `aoe-sim.browser-compiled-replay.v1`. It hash-links the selected
recording, parser package/WASM, static ruleset reference, and compiled content hash. The hash contract is declared in the
model as `aoe-sim.stable-json-v1.unsigned-browser-compiled-replay`: verifiers remove `/provenance/generatedArtifact`,
remove local filename/mtime fields from `/recording` and `/provenance/replay`, sort object keys by code-point order,
omit `undefined`, encode UTF-8 JSON without whitespace, and SHA-256 those canonical content bytes. Static DAT/ruleset
data may help label or interpret facts, but unsupported initial-object-derived analytics, lifetimes, current economy,
and resource estimates are explicitly reported as unsupported instead of fetched from `game.json`, `lifetimes.json`,
`economy.json`, or `resource_estimates.json` for the selected replay.

Action extraction is intentionally kind-aware where payload semantics are proven. `Research.building_id` and
`Research.building_ids` are producer object instances; `Research.technology_type` is the technology data ID.
`Order.object_ids` are actor object instances and `Order.building_id` is the target object instance. Other scalar fields
remain parameters or unsupported evidence unless their DAT/object-instance meaning has been proven.

Winner/loss display depends on an authoritative completion signal. Resignation can be shown from the parser summary, but
non-resigned players are only labeled winner/loss when a post-game world-time block is present and the summary exposes a
winner team; otherwise the result is unknown.

Resource conservation is explicit in snapshots. Extraction increases node `extracted` and worker/player carry, deposits transfer carry into stockpiles, and spending reduces stockpiles through ledgers. Divergence diagnostics record the first unsupported or inconsistent economy condition without mutating state to fit expected replay timeseries.

The Canvas renderer caches the static real terrain and represented-tree layers and uses a dense point rendering path for
the 9,806-object replay start state. Tree cache identity comes from the engine's represented-resource classification,
not display-name heuristics. Ordinary playback draws only cached trees and current non-tree entities; tree appearance
updates invalidate the tree layer. Render deltas are driven by explicit dirty entity IDs sorted deterministically, with
the previous render signature retained only as a correctness guard for dirty candidates. The detailed original pixel
tokens and depth ordering remain active for small scenarios.

Performance diagnostics use bounded rolling samples. The worker records simulation batch time, command handling,
movement, tree activation, economy, combat, render delta creation, postMessage enqueue approximation, target/effective
speed, and simulated-time lag. The main thread merges in render-state application time, canvas draw time, and visual
frame interval before displaying concise diagnostics rows.
