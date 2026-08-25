# Fidelity

Milestone 1 is a replay scenario importer, not an AoE II rules simulation.

Current support:

- real 120x120 Glade map bounds with row-major terrain/elevation inputs;
- unresolved terrain passability explicitly marked as unresolved;
- all starting Gaia and player objects from parser output with observed positions;
- player, team, civilization, color, replay build, and duration metadata;
- complete timestamped parser action tape as observed intent;
- source sequence, source index, actor IDs, target IDs, destination fields, and raw action kinds;
- synthetic tracer fixture with observed Move command intent and straight-line simulated movement;
- immutable snapshots, state checksums, and repeat-seek diagnostics.

Current omissions:

- direct `.aoe2record` parsing in the browser;
- DAT-derived historical rules for build `180059`;
- pathfinding, obstruction, formations, and collision;
- economy, production, construction, technology, combat, death, projectiles, and resign effects;
- queue intent confirmation or spawned entity creation;
- random seeds, because the current parser output does not expose them.

Imported replay actions are scheduled and counted as `observed-intent`, but they do not mutate world state. A `MOVE`, `BUILD`, `QUEUE`, `ORDER`, `RESEARCH`, or combat-related replay action is therefore visible evidence of intent only. It is not treated as implemented movement, construction, production, economy, or combat.

Replay command destinations are stored as intent fields. They are never promoted into observed continuous positions. Once an entity moves because an implemented simulator system advances it, that position evidence is `simulated` unless a later milestone adds an explicit reconciliation event.
