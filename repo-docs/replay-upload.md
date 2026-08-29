# Local Replay Upload

Local replay upload performs browser-side `.aoe2record` compilation for diagnostics and dataview inspection. The selected
recording is size-checked before `File.arrayBuffer`, transferred to a dedicated module worker, hashed with Web Crypto,
and parsed by the pinned WASM package. The parser worker returns only a compact derived model plus compatibility rows. It
does not initialize simulation state, mutate renderer state, upload bytes, commit replay bytes, return raw parser
objects, or fetch per-replay JSON sidecars for the selected file. Derived output/export can include player names/profile
IDs, terrain/elevation arrays, action object IDs, coordinates, scalar parameters, and bounded chat text; raw replay bytes
remain local.

Pinned parser identity:

- package: `aoe2rec-js@0.1.22`
- upstream project: `aoe2ct/aoe2rec`
- immutable package commit: `a6b8125c1206aa3b0646fbe3eae436d368640e49`
- npm tarball SHA-256: `sha256:39c94c55f7a35a689ad496d2562d29eaab676d3c2aa42f002823d2c7ff2cdb1d`
- npm integrity: `sha512-sLu4n5YpDq5UgSjl31VdH+iQ/wn1LTERNJBYkVbLC5ntQzr9AQRBCFjEMi/WKOBWwkOQLWlV7O6yRYMyKSvmxQ==`
- bundled WASM SHA-256: `sha256:cc048829dae76e2e2dbeb90b19271c773b7806345c1192e48adf2663248dd545`
- license: Apache-2.0, deployed as `public/licenses/aoe2rec-js-0.1.22-APACHE-2.0.txt`, SHA-256 `sha256:8173d5c29b4f956d532781d2b86e4e30f83e6b7878dce18c919451d6ba707c90`

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
| Chat | `Chat` operations with bounded raw parser text and decoded JSON message text when present | Displayed in a collapsed dataview panel; chat is not imported as a simulation command |

Resource and shape limits:

- selected recording: 128 MiB, checked before `File.arrayBuffer` and again in the worker
- map dimensions: positive safe integers, maximum 1024 tiles per side
- map tile grid: `width * height` must be safe, equal `tiles.length`, and at most 1,048,576 tiles
- map tile values: every terrain/elevation value is required, finite, safe, and nonnegative
- parser operations: maximum 2,000,000
- normalized action timeline: maximum 250,000; oversized action streams reject instead of truncating
- chat model: maximum 100 rows, with per-row raw/decoded text and metadata string caps
- canonical/download JSON: maximum 128 MiB before compiled content hashing or Blob download allocation

Browser-compiled dataview model:

- schema: `aoe-sim.browser-compiled-replay.v1`
- provenance: selected replay content hash/size/local-only status, parser package/WASM identity, static ruleset
  reference, compiled content hash, and canonical content byte count
- settings: duration, build/game/save/log fields, replay timers/seeds, and game settings exposed by `aoe2rec-js`
- map: validated parser-exposed row-major terrain/elevation arrays, counts, dimensions, and rendered native Canvas view
- participants: teams, player numbers, names, civ/color/profile IDs, resignation flags, supported winner/loss/resigned
  results, and unknown result where completion evidence is unavailable
- operations/actions: operation-kind counts, action-kind counts, mapped scenario-kind counts, per-player summaries,
  bounded/paged timeline rows, actor/selection IDs, target IDs, destinations, data IDs, and scalar payload parameters
  where exposed
- action semantics: `Research.building_id`/`building_ids` are producer object instances, `Research.technology_type` is
  the technology data ID, `Order.object_ids` are actors, and `Order.building_id` is the target object instance
- chat: parser chat operations where exposed, collapsed by default, with sender/time/raw-vs-decoded evidence and explicit
  omission/truncation counts
- export: the user can download the browser-compiled JSON generated from the selected local bytes

Compiled content hash contract:

`provenance.generatedArtifact.sha256` is the SHA-256 of canonical unsigned content, not a hash of the downloaded pretty
JSON and not a hash that includes itself. The exported model declares the contract as
`aoe-sim.stable-json-v1.unsigned-browser-compiled-replay`: remove `/provenance/generatedArtifact`, remove
`/recording/fileName`, `/recording/lastModifiedUtc`, `/provenance/replay/fileName`, and
`/provenance/replay/lastModifiedUtc`, sort object keys with fixed code-point lexical order, omit `undefined`, encode
UTF-8 JSON without whitespace, and hash those canonical content bytes. Identical replay bytes therefore keep the same
compiled content hash regardless of the selected local filename or file mtime. The download filename remains derived from
the replay content hash.

Error classification:

- WASM fetch/init failures, hashing/reference failures, model validation failures, and compiler failures reject to the
  worker error path; they are not reported as corrupt replays.
- Invalid recorded-game envelopes and summary parse failures produce corrupt-file compatibility reports with parser-stage
  wording.
- Full parse degradation after a usable summary remains explicit as unsupported/partial parser evidence.

Unsupported or partial mappings:

- Starting object tables are not exposed through the pinned JS API: Gaia/player split, data IDs, HP, and observed
  starting positions are not confirmed by local browser compilation.
- Team IDs are parser-specific. The report compares team membership cardinality, not raw team ID numbers.
- Map name `Glade` and size label `Tiny` remain committed scenario metadata; the local parser exposes map ID and
  dimensions.
- Command payloads are normalized for dataview inspection only. The local upload path does not convert a selected replay
  into `ReplayScenarioV1` and does not feed uploaded commands into `SimulationEngine`.
- Queue intent remains intent; it is not promoted into confirmed spawn evidence without simulation or later evidence.
- Sync, Viewlock, Chat, and PostGame records are parser operations, not simulation commands.
- Random seeds exposed by `aoe2rec-js` are reported as parser header facts and are not yet imported into the simulation scenario.
- Lifetimes, current economy, and resource estimates are not fetched from `lifetimes.json`, `economy.json`, or
  `resource_estimates.json` for a selected replay.
- Unsupported or corrupt files produce a compatibility report and do not initialize simulation state.
