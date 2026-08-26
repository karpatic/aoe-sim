# Fidelity

Milestone 6 provides DAT-informed movement, economy, construction, combat, and local replay compatibility diagnostics, but the simulator is still not an AoE II engine clone.

Current support:

- real 120x120 Glade map bounds with row-major terrain/elevation inputs;
- terrain IDs interpreted through DAT terrain restriction matrices where actor movement data is available;
- all starting Gaia and player objects from parser output with observed positions;
- player, team, civilization, color, replay build, and duration metadata;
- complete timestamped parser action tape with raw `MOVE` commands promoted only when they have valid in-map movement intent;
- supported `ORDER`, gather-point, `BUILD`, `DE_QUEUE`, and `STOP` commands retained as observed intent and interpreted into simulated economy state where their actor, target, and DAT rule context resolve;
- source sequence, source index, actor IDs, target IDs, destination fields, and raw action kinds;
- a full rules artifact covering DAT terrain, units/buildings/resources, technologies, raw effects, attacks/armor vectors, projectiles, production/training/costs, footprints/collision, movement, and gathering/economy fields exposed through `genieutils`;
- explicit unresolved diagnostics for raw effect operation types and attribute IDs not yet interpreted by simulation systems;
- scenario coverage proving the current Glade fixture's 9,806 starting entities and command-referenced unit/building/technology IDs resolve against the ruleset;
- synthetic economy fixture with observed gather, build, gather-point, queue, and farm intent for exercising the implemented vertical slice on a compact map;
- deterministic A* pathfinding with stable tie-breaking, bounded search, fixed-point waypoint following, conservative initial building/resource occupancy, dynamic bump checks, and route failure diagnostics;
- deterministic villager gather/carry/drop-off loops with finite resource nodes, same-family nearby retargeting, farm depletion/reseeding, construction progress, production queues, population accounting, stable simulated entity IDs, and per-player resource conservation ledgers;
- immutable snapshots, state checksums, and repeat-seek diagnostics.
- local `.aoe2record` compatibility parsing in a dedicated worker through `aoe2rec-js@0.1.22`, with selected bytes kept inside the browser.
- fixture comparison for replay identity, build/version, duration, human players, map ID/dimensions/tile terrain/elevation counts, action count, and mapped action-kind counts.

Current omissions:

- exact DAT/rules parity for replay build `180059`;
- exact AoE II pathfinding, formation offsets, command queue timing, gates, terrain/object placement legality, builder diminishing returns, repair/cancel/refund behavior, market mechanics, and civilization/technology economy modifiers;
- full technology, conversion, healing, repair, garrison, market, and resign effects;
- authoritative queue/spawn confirmation from later replay evidence;
- direct scenario import from uploaded `.aoe2record` files;
- starting object table reconciliation through `aoe2rec-js`, beyond the current `next_object_id` proxy;
- use of direct-parser random seeds in simulation; they are reported as parser header facts only.

Ruleset fidelity:

`public/rules/ruleset-current.json` is labeled `current-rules-approximation`. The installed DAT hash matches the local evidence for Steam build `24094652`, but the replay embeds internal build `180059`. Steam depot evidence brackets the replay with manifests from August 18 and August 24, 2026, yet no authoritative internal-replay-build to Steam-build mapping has been proven. Dates, file mtimes, and depot manifests are audit context only.

Imported replay actions are scheduled as command evidence. A raw `MOVE` with valid in-map top-level coordinates is interpreted as observed movement intent and may create a simulated route. Supported economy commands create simulated tasks, carried resources, node depletion, spending, construction, production, and ledgers. Unsupported or unresolved raw actions remain observed intent until their semantics are implemented.

Replay command destinations are stored as intent fields. They are never promoted into observed continuous positions. Chosen paths and intermediate positions are `simulated`; later unresolved actor references, resource shortages, and unsupported command mechanics remain visible diagnostics rather than fabricated entities, deposits, spawns, or deaths.

Known fixture compatibility through `aoe2rec-js@0.1.22`:

- `game.aoe2record` hash and size match the committed Glade scenario source reference.
- Build `180059`, game string `VER 9.4`, save version `68`, log version `5`, and duration `5,833,099ms` match.
- Human players match by player number, name, civilization ID, color ID, and profile ID.
- Map ID `188`, `120x120` dimensions, `14,400` tiles, terrain counts, and elevation counts match.
- `Action = 2455`, `Move = 450`, and all mapped action-kind counts match the committed action vocabulary.
- Starting objects are partial: `replay.next_object_id = 9806` matches the committed total entity count, but the local parser does not expose the per-object starting table needed to verify Gaia/player split, data IDs, HP, or positions.
