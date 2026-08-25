# Fidelity

Milestone 0 is not an AoE II rules simulation. It is a deterministic tracer for the project architecture.

Current support:

- synthetic map bounds;
- starting entities with explicit position evidence;
- observed Move command intent;
- straight-line fixed-point movement;
- immutable snapshots and state checksums.

Current omissions:

- pathfinding, obstruction, formations, and collision;
- economy, production, construction, technology, combat, death, and projectiles;
- direct `.aoe2record` parsing;
- DAT-derived historical rules.

Replay command destinations are stored as intent destinations. They are never promoted into observed continuous positions. Once an entity moves because the simulator advances it, that position evidence is `simulated` unless a later milestone adds an explicit reconciliation event.
