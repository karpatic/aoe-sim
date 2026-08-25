# Fidelity

Milestone 2 provides a DAT-derived rules contract, but the simulator is still not an AoE II engine clone.

Current support:

- real 120x120 Glade map bounds with row-major terrain/elevation inputs;
- terrain IDs plus DAT terrain restriction matrices for later passability interpretation;
- all starting Gaia and player objects from parser output with observed positions;
- player, team, civilization, color, replay build, and duration metadata;
- complete timestamped parser action tape as observed intent;
- source sequence, source index, actor IDs, target IDs, destination fields, and raw action kinds;
- a full rules artifact covering DAT terrain, units/buildings/resources, technologies, raw effects, attacks/armor vectors, projectiles, production/training/costs, footprints/collision, movement, and gathering/economy fields exposed through `genieutils`;
- explicit unresolved diagnostics for raw effect operation types and attribute IDs not yet interpreted by simulation systems;
- scenario coverage proving the current Glade fixture's 9,806 starting entities and command-referenced unit/building/technology IDs resolve against the ruleset;
- synthetic tracer fixture with observed Move command intent and straight-line simulated movement;
- immutable snapshots, state checksums, and repeat-seek diagnostics.

Current omissions:

- direct `.aoe2record` parsing in the browser;
- exact DAT/rules parity for replay build `180059`;
- pathfinding, obstruction, formations, and collision;
- economy, production, construction, technology, combat, death, projectiles, and resign effects;
- queue intent confirmation or spawned entity creation;
- random seeds, because the current parser output does not expose them.

Ruleset fidelity:

`public/rules/ruleset-current.json` is labeled `current-rules-approximation`. The installed DAT hash matches the local evidence for Steam build `24094652`, but the replay embeds internal build `180059`. Steam depot evidence brackets the replay with manifests from August 18 and August 24, 2026, yet no authoritative internal-replay-build to Steam-build mapping has been proven. Dates, file mtimes, and depot manifests are audit context only.

Imported replay actions are scheduled and counted as `observed-intent`, but they do not mutate world state. A `MOVE`, `BUILD`, `QUEUE`, `ORDER`, `RESEARCH`, or combat-related replay action is therefore visible evidence of intent only. It is not treated as implemented movement, construction, production, economy, or combat.

Replay command destinations are stored as intent fields. They are never promoted into observed continuous positions. Once an entity moves because an implemented simulator system advances it, that position evidence is `simulated` unless a later milestone adds an explicit reconciliation event.
