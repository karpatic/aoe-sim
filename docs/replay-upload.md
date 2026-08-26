# Local Replay Upload

Milestone 6 adds browser-side `.aoe2record` parsing for compatibility diagnostics. The selected recording is read with `File.arrayBuffer`, transferred to a dedicated module worker, hashed with Web Crypto, and parsed by the pinned WASM package. The parser worker returns only derived metadata, counts, hashes, and comparison rows. It does not initialize simulation state, mutate renderer state, upload bytes, or commit replay bytes.

Pinned parser identity:

- package: `aoe2rec-js@0.1.22`
- upstream project: `aoe2ct/aoe2rec`
- immutable package commit: `a6b8125c1206aa3b0646fbe3eae436d368640e49`
- npm tarball SHA-256: `sha256:39c94c55f7a35a689ad496d2562d29eaab676d3c2aa42f002823d2c7ff2cdb1d`
- npm integrity: `sha512-sLu4n5YpDq5UgSjl31VdH+iQ/wn1LTERNJBYkVbLC5ntQzr9AQRBCFjEMi/WKOBWwkOQLWlV7O6yRYMyKSvmxQ==`
- bundled WASM SHA-256: `sha256:cc048829dae76e2e2dbeb90b19271c773b7806345c1192e48adf2663248dd545`
- license: MIT, license file SHA-256 `sha256:8173d5c29b4f956d532781d2b86e4e30f83e6b7878dce18c919451d6ba707c90`

Known fixture differential:

| Area | `aoe2rec-js@0.1.22` exposure | Reconciliation with committed Glade scenario |
| --- | --- | --- |
| Recording identity | Browser SHA-256 and byte length | Matches `game.aoe2record`, `sha256:67accb2d81fc58f65bfe9696fb783374731b494ca102d78c7f5221c002d628bc`, `2,163,013` bytes |
| Versions | build, game string, save version, log version | Matches build `180059`, `VER 9.4`, save `68`, log `5` |
| Duration | summary duration and post-game world time | Matches `5,833,099ms` |
| Players | human player names, numbers, civ IDs, color IDs, profile IDs, resignation/winner flags | Matches `BingoDabber`/Italians/color `7`/profile `1385305` and `Peaches`/Magyars/color `0`/profile `870212`; two one-player teams match by membership cardinality |
| Map | selected/resolved map ID, square map size, tile array, terrain/elevation IDs | Matches map ID `188`, `120x120`, `14,400` tiles, terrain counts, and elevation counts |
| Starting objects | `replay.next_object_id` | `next_object_id = 9806` matches the committed total entity count only as a contiguous-ID proxy |
| Commands | operation count, `Action` count, parser action-kind names | `Action = 2455` matches committed command count; all `aoe2rec` action-kind counts map to the committed `aoc-mgz` action vocabulary with no count diffs |

Unsupported or partial mappings:

- Starting object tables are not exposed through the pinned JS API: Gaia/player split, data IDs, HP, and observed starting positions still come from the committed `aoc-mgz` scenario.
- Team IDs are parser-specific. The report compares team membership cardinality, not raw team ID numbers.
- Map name `Glade` and size label `Tiny` remain committed scenario metadata; the local parser exposes map ID and dimensions.
- Command payloads are not converted into `ReplayScenarioV1` by the local upload path. The report compares counts only.
- Sync, Viewlock, Chat, and PostGame records are parser operations, not simulation commands.
- Random seeds exposed by `aoe2rec-js` are reported as parser header facts and are not yet imported into the simulation scenario.
- Unsupported or corrupt files produce a compatibility report and do not initialize simulation state.
