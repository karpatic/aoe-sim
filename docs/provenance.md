# Provenance

Milestone 2 commits normalized browser artifacts and DAT-derived factual rules, not raw replay or DAT inputs.

- `public/fixtures/glade-120x120.scenario.json` is generated from `game.json` and `game.aoe2record`.
- `public/fixtures/glade-120x120.report.json` reconciles source counts, artifact hashes, terrain IDs, and omitted collections.
- `public/fixtures/scenario.json` remains the handcrafted synthetic tracer fixture.
- `public/rules/ruleset-current.json` is generated from the installed `empires2_x2_p1.dat` and English localization strings.
- `public/rules/ruleset-current.report.json` records extractor/parser/source hashes, field coverage, and unresolved raw effect diagnostics.
- `public/rules/glade-120x120.coverage.json` resolves the pinned scenario's starting entity data IDs and command unit/building/technology IDs against the full ruleset.
- No original AoE graphics, audio, raw replay bytes, raw DAT bytes, or raw parser output are committed.

Pinned source hashes:

- `game.aoe2record`: `sha256:67accb2d81fc58f65bfe9696fb783374731b494ca102d78c7f5221c002d628bc`
- `game.json`: `sha256:39b5926f40cd30cc466de87d7a5a5caee32ba5541dfc6fb68dc655e2b4a22727`
- parser script `extract_replay.py`: `sha256:727f14e03429e30913b30a670afd4670191ebf061a4607976d3f3c021cee4831`
- importer `tools/build-scenario.mjs`: recorded inside the generated scenario
- DAT `empires2_x2_p1.dat`: `sha256:ce3530df36cf0b333a9751cb0ff94460fe904f811feecec8ae9794701622b4cf`
- localization `key-value-strings-utf8.txt`: `sha256:fa8bc9c0c90cd17e0cfce85db0b9a75c8a6cc67ab580932e86dbaad41df9ae4e`
- Steam appmanifest `appmanifest_813780.acf`: Steam build ID `24094652`
- DAT parser `genieutils.datfile`: pinned commit `e1ff9db0b11442587b96f1a65ffdb972cff2d9fc`
- rules extractor `tools/build-ruleset.py`: recorded inside the generated ruleset

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

Generated ruleset hash policy:

`provenance.generatedArtifact.sha256` is the SHA-256 of the canonical ruleset JSON while that field contains `sha256:self-excluded`. The committed file hash is recorded in `ruleset-current.report.json` as `artifact.fileSha256`.

The importers reject machine-local paths in generated scenario, ruleset, and report data. Source basenames and hashes are retained; absolute source paths from the parser output, Steam install, and Python environment are not.
