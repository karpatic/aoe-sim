# Standalone Dataview Preprocessing

`/dataview.html` keeps the original single-game dataview product identity while moving replay preprocessing into the
browser. The selected `.aoe2record` is read with `File.arrayBuffer`, transferred to a one-shot Web Worker, written to
Pyodide's in-memory filesystem, and never copied into the repository source tree or generated `docs/` artifact.

The worker emits generated UTF-8 JSON buffers only:

- `game.json`
- `schemas.json`
- `lifetimes.json`
- `economy.json`
- `resource_estimates.json`
- `unit_stats.json`, calculated for every selected replay from its players, civilizations, produced units, and reconstructed research timeline
- `gameplay_timeline.json`, calculated in the same worker from `game.json`, `lifetimes.json`, `economy.json`,
  `resource_estimates.json`, `unit_stats.json`, and the pinned ruleset; it estimates building availability, producer
  queues, produced-unit birth points, whole-replay backward actor reconciliation, observed actor materialization, bounded
  lifecycle disappearance, and straight-line motion segments

`src/replay/dataview-reconstruction.ts` is the environment-neutral reconstruction boundary consumed by both the browser
viewer and the Node diagnostic harness. It turns `gameplay_timeline.json` into immutable per-timestamp render snapshots:
active unit identity, evidence class, interpolated position, activity state, lifecycle/stale-position filtering, exact-type
marker groups, and deterministic seek checksums. The checked-in browser shim
`public/dataview-runtime/dataview-reconstruction.js` is generated from that TypeScript module by
`npm run build:dataview-reconstruction-runtime`.

For development, `npm run dataview:diagnostics -- --check` runs the same pure TypeScript unit-stat, gameplay, and render
snapshot logic in Node against the bundled Glade replay, emitting compact JSON diagnostics. The companion Python validator
only audits that machine-readable output; it does not parse replays or duplicate lifecycle/position inference.

The viewer iframe does not fetch private/static sidecars. Each selection creates a fresh `allow-scripts`-only sandboxed
iframe with an opaque origin. A nonce-bound ready/transfer handshake validates the exact iframe window, parent origin,
output names, byte sizes, SHA-256 strings, and transferred `ArrayBuffer`s before JSON decoding.

## Runtime Assets

`pyodide@0.28.3` is pinned as an exact npm dependency. `npm run prepare:dataview-runtime` copies these package assets
from `node_modules/pyodide` and verifies their hashes:

| File | SHA-256 |
| --- | --- |
| `pyodide.js` (identical upstream `pyodide.mjs` bytes, deployment-compatible MIME extension) | `635a6da3218fe4e5668da595acfe8b5ce77453d597d602f19a423dd250653441` |
| `pyodide.asm.js` | `b22e5831eade9ff10e6fe2c811c68688cd91f10154377b4f80debcf5bafa1e56` |
| `pyodide.asm.wasm` | `5effb6a1a6cc4a1a85bec4622701aa797c031e1de923cbbaf2ad47abdc4ab325` |
| `python_stdlib.zip` | `71fee17f88a6260ec8c9c7c063533ee59c021fdc88a1ce76247378d3c4a35f4c` |
| `pyodide-lock.json` | `f6e6f42f451f42affbbcddb00e8c9a3278dcbf399f57aab9f3f568839a7ff4a6` |
| `libopenssl-1.1.1w.zip` | `48965994b6ace00d3ebbc2dc1b65c11978582620f4ef6c71a50d9ea4c5fc7437` |
| `hashlib-1.0.0-cp313-cp313-pyodide_2025_0_wasm32.whl` | `b5c736c84ce26cba4e5096c6b9d173a357666af5993cc08395bfb8bac997bb98` |

Pyodide is MPL-2.0; the exact text is deployed at `public/licenses/pyodide-0.28.3-MPL-2.0.txt`, and its source is available
from the versioned upstream repository at `https://github.com/pyodide/pyodide/tree/0.28.3`. The Python packages are loaded
from same-origin files, not a runtime CDN. Verified runtime fetches
include the expected SHA-256 as a cache key, preventing a newly built worker from receiving stale same-path assets.

## Replay Pipeline

`public/dataview-runtime/aoc-mgz-pipeline.zip`
`sha256:bab3345c2f8128350ce64090c73eb1088cc229af94a0add698be046233a26ffc` contains the original pipeline scripts with narrow browser-compatibility patches recorded in
`pipeline/PATCHES.md`:

- `extract_replay.py`
- `generate_recording_schemas.py`
- `infer_lifetimes.py`
- `generate_economy.py`
- `reconstruct_resources.py`

The patches replace workstation-specific defaults with relative paths, normalize nullable/omitted parser labels, provide
deterministic mixed-type sorting, and coalesce only incompatible same-timestamp worker states using the pipeline's
existing last-command-wins assignment semantics. The representative replay's gameplay-derived outputs are unchanged.

The archive also contains these pure-Python dependencies:

| Package | Version | Source / License Evidence |
| --- | --- | --- |
| `mgz` (`aoc-mgz`) | `1.8.51` | MIT, commit `b4a30d8539c2fed4cbfc7b8cfec874e65cdc50a2` |
| `aocref` | `2.0.38` | `SiegeEngineers/aoc-reference-data`; the included wheel metadata does not declare a license |
| `construct` | `2.8.16` | MIT |
| `tabulate` | `0.10.0` | MIT |

The pinned tech-tree reference is `public/dataview-runtime/aoe2techtree-data.json`
`sha256:4e2f85b39e39078cdee71bdbaf2c36a8f0b50202de4032df7ba8e2c36c6049c4`.

## Sanitization

The worker sanitizes browser-generated provenance before downstream scripts consume generated `game.json`, then sanitizes
later source labels before transfer. It rejects generated payload text containing local home-directory paths, temporary
directory paths, Pyodide work paths, file URL schemes, Windows absolute paths, or URL credential patterns.

Unit statistics and gameplay timelines are not bundled as replay-specific sidecars. The worker loads the generic public derived ruleset and calculates fresh `aoe2-unit-stats/v1` and `aoe-sim.dataview-gameplay-timeline/v1` artifacts for every replay selection. Civilization and allied team effects are applied at time zero; observed research effects and unit-line upgrades are applied at that replay's reconstructed completion times. Unsupported relevant effect operations remain explicitly unresolved rather than guessed.

## Icons

No original AoE graphics, audio, or locally extracted game GIFs are copied into this repository. Dataview map units render
as individual project-original static DOM markers for Villagers, infantry, archers, cavalry, siege, monks, and
replay-evidenced ships. They do not use animated GIF/WebP bytes or animated sprite frames. Commit
`3e2afe1f2961642ce4b4ee1327a3255b1a82beb8` is the historical reference for the category/marker treatment and behavior,
not a source of exact sprite asset bytes. Reachable history has no standalone GIF/WebP sprite assets; generated SVG icons
remain static marker recreations for this project.

Where the old dataview uses towncenter/SiegeEngineers-style HUD and building icons, the viewer points to immutable
upstream URLs from `TimMikeladze/towncenter` commit `8e42a41642b9bdd697037f9ec6a7e975537fb3b0` under `public/img/`.
The upstream code license is MIT, but its own notice says:

`Game Icons © Hidden Path Entertainment, Forgotten Empires, SkyBox Labs, Ensemble Studios`

That game-icon notice is separate from the code license, and the viewer falls back to generated markers when those images
are unavailable.
