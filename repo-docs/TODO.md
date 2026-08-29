# TODO

## Terrain-Aware Dataview Motion

- Add terrain-aware pathfinding only after the replay-constrained straight-line timeline has enough diagnostics to show
  where it is misleading.
- Consider bounded activation instead of whole-replay pathing: grouped movement episodes, simple maps with low obstacle
  density, or time windows with low active-character counts are the first candidates.
- Keep the pathing result labeled `simulated`; replay command destinations must remain observed intent, not observed
  continuous positions.
- Preserve deterministic tie-breaking, stable entity IDs, reversible seeks, and browser-worker-only computation.
- Do not block the current static-marker dataview on this work.
