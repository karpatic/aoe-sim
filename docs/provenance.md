# Provenance

Milestone 0 uses original synthetic artifacts only.

- `public/fixtures/scenario.json` is a handcrafted scenario fixture for exercising the deterministic tracer.
- `public/rules/ruleset-current.json` is a tiny synthetic ruleset for token movement speeds and renderer-independent unit shape metadata.
- No original AoE graphics, audio, replay bytes, parser output, or DAT-derived data are included.

The scenario artifact records references for replay, parser, ruleset, and generated artifact identities. The replay and parser references are marked synthetic or manual because no real replay importer is active in this milestone. Milestone 1 will replace this with hash-linked `game.json` import provenance.

The scenario `generatedArtifact.sha256` value records the SHA-256 of `public/fixtures/scenario.json` after the ruleset hash was finalized and while `generatedArtifact.sha256` still held `sha256:pending`. This avoids a self-referential hash loop while preserving a stable semantic content link for this handcrafted fixture.
