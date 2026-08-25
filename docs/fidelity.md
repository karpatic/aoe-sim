# Fidelity

Milestone 3 provides DAT-informed movement and occupancy, but the simulator is still not an AoE II engine clone.

Current support:

- real 120x120 Glade map bounds with row-major terrain/elevation inputs;
- terrain IDs interpreted through DAT terrain restriction matrices where actor movement data is available;
- all starting Gaia and player objects from parser output with observed positions;
- player, team, civilization, color, replay build, and duration metadata;
- complete timestamped parser action tape with raw `MOVE` commands promoted only when they have valid in-map movement intent;
- source sequence, source index, actor IDs, target IDs, destination fields, and raw action kinds;
- a full rules artifact covering DAT terrain, units/buildings/resources, technologies, raw effects, attacks/armor vectors, projectiles, production/training/costs, footprints/collision, movement, and gathering/economy fields exposed through `genieutils`;
- explicit unresolved diagnostics for raw effect operation types and attribute IDs not yet interpreted by simulation systems;
- scenario coverage proving the current Glade fixture's 9,806 starting entities and command-referenced unit/building/technology IDs resolve against the ruleset;
- synthetic tracer fixture with observed Move command intent and deterministic routed movement;
- deterministic A* pathfinding with stable tie-breaking, bounded search, fixed-point waypoint following, conservative initial building/resource occupancy, dynamic bump checks, and route failure diagnostics;
- immutable snapshots, state checksums, and repeat-seek diagnostics.

Current omissions:

- direct `.aoe2record` parsing in the browser;
- exact DAT/rules parity for replay build `180059`;
- exact AoE II pathfinding, formation offsets, command queuing, gates, and construction-driven obstruction updates;
- economy, production, construction, technology, combat, death, projectiles, and resign effects;
- queue intent confirmation or spawned entity creation;
- random seeds, because the current parser output does not expose them.

Ruleset fidelity:

`public/rules/ruleset-current.json` is labeled `current-rules-approximation`. The installed DAT hash matches the local evidence for Steam build `24094652`, but the replay embeds internal build `180059`. Steam depot evidence brackets the replay with manifests from August 18 and August 24, 2026, yet no authoritative internal-replay-build to Steam-build mapping has been proven. Dates, file mtimes, and depot manifests are audit context only.

Imported replay actions are scheduled as command evidence. A raw `MOVE` with valid in-map top-level coordinates is interpreted as observed movement intent and may create a simulated route. A raw `ORDER` is not treated as ordinary movement merely because it carries a position; `BUILD`, `QUEUE`, `ORDER`, `RESEARCH`, `SPECIAL`, `WALL`, and combat-related replay actions remain observed intent until their semantics are implemented.

Replay command destinations are stored as intent fields. They are never promoted into observed continuous positions. Chosen paths and intermediate positions are `simulated`; later unresolved actor references remain visible diagnostics rather than fabricated entities or deaths.
