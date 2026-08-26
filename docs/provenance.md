# Provenance

Milestone 6 commits normalized browser artifacts, DAT-derived factual rules, deterministic simulation diagnostics, and local replay compatibility diagnostics, not raw replay or DAT inputs.

- `public/fixtures/glade-120x120.scenario.json` is generated from `game.json` and `game.aoe2record`.
- `public/fixtures/glade-120x120.report.json` reconciles source counts, promoted MOVE counts, resolved/unresolved MOVE actor references, artifact hashes, terrain IDs, and omitted collections.
- `public/fixtures/scenario.json` is the handcrafted synthetic economy fixture for the Milestone 4 vertical slice.
- `public/rules/ruleset-current.json` is generated from the installed `empires2_x2_p1.dat` and English localization strings.
- `public/rules/ruleset-current.report.json` records extractor/parser/source hashes, field coverage, and unresolved raw effect diagnostics.
- `public/rules/glade-120x120.coverage.json` resolves the pinned scenario's starting entity data IDs and command unit/building/technology IDs against the full ruleset.
- `src/worker/replay-parser-worker.ts` parses selected local `.aoe2record` files with the pinned `aoe2rec-js` WASM package and returns only derived compatibility data to the UI.
- `docs/replay-upload.md` records the direct parser identity, license evidence, known fixture reconciliation, and unsupported mappings.
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
- local upload parser package `aoe2rec-js@0.1.22`: `sha256:39c94c55f7a35a689ad496d2562d29eaab676d3c2aa42f002823d2c7ff2cdb1d`
- local upload parser WASM `aoe2rec_js_bg.wasm`: `sha256:cc048829dae76e2e2dbeb90b19271c773b7806345c1192e48adf2663248dd545`
- local upload parser license file: `sha256:8173d5c29b4f956d532781d2b86e4e30f83e6b7878dce18c919451d6ba707c90`

Scenario parser identity:

- project: `aoc-mgz`
- package version: `1.8.51`
- immutable commit: `b4a30d8539c2fed4cbfc7b8cfec874e65cdc50a2`
- `aocref` version: `2.0.38`

Local upload parser identity:

- project: `aoe2rec`
- package: `aoe2rec-js`
- version: `0.1.22`
- immutable package commit: `a6b8125c1206aa3b0646fbe3eae436d368640e49`
- distribution: npm tarball pinned by exact version and lockfile integrity
- license: MIT
- source URL: `https://github.com/aoe2ct/aoe2rec.git`

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

Current generated scenario artifact:

- semantic hash: `sha256:d497773d9a38113092ec16fe2eb8d9533c165207da30422407083b46974ddbad`
- file hash: `sha256:91f071825273bcd28760399c2f3930015f6a78d1ac1c2636adc4a5c655f72fef`
- importer hash: `sha256:331f433950c18fc9dfb64d38096008c057aa8d6ef0c4b15edbf5bfdca6b81f3d`

Generated ruleset hash policy:

`provenance.generatedArtifact.sha256` is the SHA-256 of the canonical ruleset JSON while that field contains `sha256:self-excluded`. The committed file hash is recorded in `ruleset-current.report.json` as `artifact.fileSha256`.

The importers reject machine-local paths in generated scenario, ruleset, and report data. Source basenames and hashes are retained; absolute source paths from the parser output, Steam install, and Python environment are not.

Known local replay compatibility:

- The browser upload path compares selected files against the committed Glade scenario reference, not against raw replay bytes in the repository.
- The known local fixture at `/home/carlos/Documents/GitHub/www/aoe/game.aoe2record` has `sha256:67accb2d81fc58f65bfe9696fb783374731b494ca102d78c7f5221c002d628bc` and reconciles with `aoe2rec-js@0.1.22` for identity, versions, duration, players, map tile counts, terrain/elevation counts, total actions, and mapped action-kind counts.
- Starting objects reconcile only as the `next_object_id = 9806` proxy. The per-object table remains sourced from the committed `aoc-mgz` scenario until the direct parser exposes or maps it.
- Unsupported or corrupt local files produce compatibility reports and do not initialize simulation state.
