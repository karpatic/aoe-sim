# Provenance

Milestone 1 commits normalized browser artifacts, not raw replay inputs.

- `public/fixtures/glade-120x120.scenario.json` is generated from `game.json` and `game.aoe2record`.
- `public/fixtures/glade-120x120.report.json` reconciles source counts, artifact hashes, terrain IDs, and omitted collections.
- `public/fixtures/scenario.json` remains the handcrafted synthetic tracer fixture.
- `public/rules/ruleset-current.json` remains the tiny synthetic Milestone 0 ruleset.
- No original AoE graphics, audio, raw replay bytes, or raw parser output are committed.

Pinned source hashes:

- `game.aoe2record`: `sha256:67accb2d81fc58f65bfe9696fb783374731b494ca102d78c7f5221c002d628bc`
- `game.json`: `sha256:39b5926f40cd30cc466de87d7a5a5caee32ba5541dfc6fb68dc655e2b4a22727`
- parser script `extract_replay.py`: `sha256:727f14e03429e30913b30a670afd4670191ebf061a4607976d3f3c021cee4831`
- importer `tools/build-scenario.mjs`: recorded inside the generated scenario

Parser identity:

- project: `aoc-mgz`
- package version: `1.8.51`
- immutable commit: `b4a30d8539c2fed4cbfc7b8cfec874e65cdc50a2`
- `aocref` version: `2.0.38`

Replay identity:

- map: Glade, source map ID `188`
- replay version: `101.103.48987.0`
- game version: `VER 9.4`
- save version: `68`
- log version: `5`
- build version: `180059`
- duration: `5,833,099ms`

Generated scenario hash policy:

`provenance.generatedArtifact.sha256` is the SHA-256 of the canonical scenario JSON while that field contains `sha256:self-excluded`. This avoids a self-referential hash loop. The committed file hash is recorded in `glade-120x120.report.json` as `artifact.fileSha256`.

The importer rejects machine-local paths in generated scenario and report data. Source basenames and hashes are retained; absolute source paths from the parser output are not.
