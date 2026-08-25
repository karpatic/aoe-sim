# AoE Sim repository guide

## Purpose

Build a greenfield, replay-constrained Age of Empires II simulation engine for the web. The target is defensible best-effort reconstruction of unit positions, economy, construction, and combat from recorded-game commands—not an exact claim of proprietary engine parity.

## Product boundaries

- Keep simulation state independent from DOM and rendering code.
- Use original low-resolution pixel graphics generated for this project; do not copy or redistribute original game graphics or audio.
- Preserve three evidence classes in data and UI: `observed`, `simulated`, and `reconciled`.
- Never promote a replay command destination into an observed continuous position.
- Never promote queue intent into a confirmed spawn without simulation or later evidence.
- Keep replay, parser, DAT/ruleset, and generated-artifact provenance explicit and hash-linked.
- Support one pinned replay build/ruleset coherently before generalizing across game versions.

## Architecture defaults

- TypeScript, Vite, native HTML/CSS, Canvas 2D, and a Web Worker.
- No frontend framework unless a demonstrated requirement justifies it.
- Simulation uses deterministic event ordering, stable entity IDs, fixed-step or event-scheduled integer time, fixed-point quantities where practical, seeded PRNG, state snapshots, and checksums.
- The renderer consumes immutable world snapshots and cannot mutate simulation state.
- `game.json` is an importer for initial state and commands, not authoritative evolving world state.
- Keep hot-path WASM optional. Add Rust/WASM only after browser profiling identifies a real bottleneck or direct replay parsing is enabled.

## Code style

Follow `/home/carlos/Documents/GitHub/services/Agent/Profiles/shared/coding-style.md`. Prefer browser primitives, small custom CSS, direct modules, clear boundaries, and no speculative abstraction.

## Verification

Carlos's automated tests are opt-in. Unless he explicitly requests them, use TypeScript checking, production builds, deterministic runtime diagnostics, and browser verification. Do not create a test suite by default.

## Closeout

Keep changes committed and pushed to the private `karpatic/aoe-sim` repository. Do not deploy into `/home/carlos/Documents/GitHub/www/aoe` until Carlos asks for or accepts a deployable milestone.
