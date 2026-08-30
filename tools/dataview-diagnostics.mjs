#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { generateDataviewGameplayTimeline } from "../src/replay/dataview-gameplay.ts";
import {
  buildDataviewDiagnostics,
  buildDataviewRenderSnapshot,
  exactTypeStackPixelLayout,
  exactTypeStackPixelOffset,
  markerRectsIntersect,
} from "../src/replay/dataview-reconstruction.ts";
import { generateUnitStatsForReplay } from "../src/replay/unit-stats.ts";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseOutputNames = Object.freeze([
  "game.json",
  "schemas.json",
  "lifetimes.json",
  "economy.json",
  "resource_estimates.json",
]);
const derivedOutputNames = Object.freeze(["unit_stats.json", "gameplay_timeline.json"]);
const pipelineStages = Object.freeze([
  {
    label: "extracting replay",
    script: "extract_replay.py",
    args: ({ replayPath, outputs }) => [replayPath, "--output", outputs["game.json"]],
  },
  {
    label: "generating schemas",
    script: "generate_recording_schemas.py",
    args: ({ outputs }) => [outputs["game.json"], "--output", outputs["schemas.json"]],
  },
  {
    label: "inferring lifetimes",
    script: "infer_lifetimes.py",
    args: ({ outputs }) => [outputs["game.json"], "--output", outputs["lifetimes.json"]],
  },
  {
    label: "generating economy",
    script: "generate_economy.py",
    args: ({ outputs, referencePath }) => [
      outputs["game.json"],
      "--output",
      outputs["economy.json"],
      "--reference",
      referencePath,
    ],
  },
  {
    label: "reconstructing resources",
    script: "reconstruct_resources.py",
    args: ({ outputs, referencePath }) => [
      "--game",
      outputs["game.json"],
      "--lifetimes",
      outputs["lifetimes.json"],
      "--economy",
      outputs["economy.json"],
      "--reference",
      referencePath,
      "--output",
      outputs["resource_estimates.json"],
    ],
  },
]);

const options = parseArgs(process.argv.slice(2));
const startedAt = Date.now();

try {
  const diagnostics = await main(options);
  const text = `${JSON.stringify(diagnostics, null, 2)}\n`;
  if (options.out) {
    await mkdir(dirname(options.out), { recursive: true });
    await writeFile(options.out, text);
    console.error(`wrote ${options.out}`);
  } else {
    process.stdout.write(text);
  }
  if (options.check && diagnostics.checks.some((check) => !check.passed)) {
    throw new Error(
      diagnostics.checks
        .filter((check) => !check.passed)
        .map((check) => `${check.name}: ${check.detail}`)
        .join("\n")
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function main(cliOptions) {
  const artifactsDir = resolve(repoRoot, cliOptions.artifacts);
  const replayPath = resolve(repoRoot, cliOptions.replay);
  const rulesetPath = resolve(repoRoot, cliOptions.ruleset);
  const referencePath = resolve(repoRoot, cliOptions.reference);
  const pipelineArchivePath = resolve(repoRoot, cliOptions.pipelineArchive);
  const pipelineRoot = join(artifactsDir, "pipeline-runtime");
  const pipelineDir = join(pipelineRoot, "pipeline");
  const outputs = Object.fromEntries([
    ...baseOutputNames,
    ...derivedOutputNames,
  ].map((name) => [name, join(artifactsDir, name)]));

  await mkdir(artifactsDir, { recursive: true });
  const replayBytes = await readFile(replayPath);
  const replaySha256 = sha256(replayBytes);
  const rulesetBytes = await readFile(rulesetPath);
  const rulesetSha256 = sha256(rulesetBytes);
  const ruleset = parseJsonText(rulesetBytes, rulesetPath);
  const baseArtifactsFresh = await cachedBaseArtifactsFresh(outputs, replaySha256);
  const shouldRunPipeline = cliOptions.refresh || !baseArtifactsFresh;

  if (shouldRunPipeline) {
    console.error(`building parser artifacts in ${artifactsDir}`);
    await rm(pipelineRoot, { recursive: true, force: true });
    await extractPipelineArchive(pipelineArchivePath, pipelineRoot);
    await runPipeline({ pipelineDir, replayPath, referencePath, outputs });
    await sanitizePipelineOutputs({
      outputs,
      replayName: basename(replayPath),
      replaySizeBytes: replayBytes.byteLength,
      replaySha256,
    });
  } else {
    console.error(`using cached parser artifacts in ${artifactsDir}`);
  }

  const game = await readJsonFile(outputs["game.json"]);
  const lifetimes = await readJsonFile(outputs["lifetimes.json"]);
  const economy = await readJsonFile(outputs["economy.json"]);
  const resourceEstimates = await readJsonFile(outputs["resource_estimates.json"]);
  const unitStats = generateUnitStatsForReplay({
    game,
    economy,
    resourceEstimates,
    ruleset,
  });
  await writeJsonFile(outputs["unit_stats.json"], unitStats);
  const gameplayTimeline = generateDataviewGameplayTimeline({
    game,
    lifetimes,
    economy,
    resourceEstimates,
    unitStats,
    ruleset,
    replaySha256,
    rulesetSha256,
  });
  await writeJsonFile(outputs["gameplay_timeline.json"], gameplayTimeline);

  const dimension = numberAt(game, ["match", "map", "dimension"], 120);
  const sampleTimes = cliOptions.times.length
    ? cliOptions.times
    : defaultSampleTimes(gameplayTimeline);
  const pureDiagnostics = buildDataviewDiagnostics({
    gameplayTimeline,
    dimension,
    sampleTimes,
    paritySequence: paritySequenceFor(sampleTimes),
  });
  const synthetic = exactTypeSyntheticDiagnostic();
  const parser = parserDiagnostics({ game, lifetimes, economy, resourceEstimates });
  const gameplay = gameplayDiagnostics(gameplayTimeline);
  const reconstruction = {
    schema: pureDiagnostics.schema,
    sampleTimes: pureDiagnostics.sampleTimes,
    snapshots: pureDiagnostics.snapshots.map(compactSnapshot),
    parity: compactParity(pureDiagnostics.parity),
    checks: pureDiagnostics.checks,
  };
  const checks = [
    ...pureDiagnostics.checks,
    ...focusedChecks({
      parser,
      gameplay,
      reconstruction,
      synthetic,
      gameplayTimeline,
      dimension,
    }),
  ];

  return {
    schema: "aoe-sim.dataview-node-diagnostics/v1",
    generated_utc: new Date().toISOString(),
    elapsed_ms: Date.now() - startedAt,
    source: {
      replay: {
        path: relativeRepoPath(replayPath),
        size_bytes: replayBytes.byteLength,
        sha256: replaySha256,
      },
      ruleset: {
        path: relativeRepoPath(rulesetPath),
        sha256: rulesetSha256,
      },
      pipeline_archive: {
        path: relativeRepoPath(pipelineArchivePath),
        sha256: sha256(await readFile(pipelineArchivePath)),
      },
      artifacts_dir: artifactsDir,
      parser_artifacts_rebuilt: shouldRunPipeline,
      runtime_boundary:
        "Node invokes the same pure TypeScript reconstruction used by the browser worker/viewer; production remains browser-only.",
    },
    parser,
    gameplay,
    reconstruction,
    synthetic,
    checks,
  };
}

function parseArgs(argv) {
  const parsed = {
    replay: "public/glade-default.aoe2record",
    artifacts: "/tmp/aoe-sim-dataview-glade-artifacts",
    ruleset: "public/rules/ruleset-current.json",
    reference: "public/dataview-runtime/aoe2techtree-data.json",
    pipelineArchive: "public/dataview-runtime/aoc-mgz-pipeline.zip",
    times: [],
    out: "",
    check: false,
    refresh: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      index += 1;
      return value;
    };
    if (arg === "--replay") parsed.replay = next();
    else if (arg === "--artifacts") parsed.artifacts = next();
    else if (arg === "--ruleset") parsed.ruleset = next();
    else if (arg === "--reference") parsed.reference = next();
    else if (arg === "--pipeline-archive") parsed.pipelineArchive = next();
    else if (arg === "--times") parsed.times = parseTimes(next());
    else if (arg === "--out") parsed.out = next();
    else if (arg === "--check") parsed.check = true;
    else if (arg === "--refresh") parsed.refresh = true;
    else if (arg === "--help") {
      process.stdout.write([
        "Usage: npm run dataview:diagnostics -- [options]",
        "",
        "Options:",
        "  --replay PATH              .aoe2record to inspect (default: public/glade-default.aoe2record)",
        "  --artifacts DIR            cache/generated JSON directory (default: /tmp/aoe-sim-dataview-glade-artifacts)",
        "  --times CSV                selected seconds for snapshots",
        "  --out PATH                 write JSON diagnostics to a file",
        "  --check                    exit non-zero when focused checks fail",
        "  --refresh                  rebuild parser artifacts before deriving TypeScript outputs",
        "",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return parsed;
}

function parseTimes(value) {
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((time) => Number.isFinite(time) && time >= 0)
    .map((time) => Math.round(time * 1000) / 1000);
}

async function cachedBaseArtifactsFresh(outputs, replaySha256) {
  if (!(await allFilesExist(baseOutputNames.map((name) => outputs[name])))) return false;
  try {
    const game = await readJsonFile(outputs["game.json"]);
    return objectAt(game, ["source_recording"]).sha256 === replaySha256;
  } catch {
    return false;
  }
}

async function allFilesExist(paths) {
  for (const path of paths) {
    try {
      await access(path);
    } catch {
      return false;
    }
  }
  return true;
}

async function extractPipelineArchive(archivePath, targetDir) {
  await mkdir(targetDir, { recursive: true });
  await execFile(
    "python3",
    [
      "-c",
      "import pathlib, sys, zipfile; pathlib.Path(sys.argv[2]).mkdir(parents=True, exist_ok=True); zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])",
      archivePath,
      targetDir,
    ],
    { maxBuffer: 1024 * 1024 }
  );
}

async function runPipeline({ pipelineDir, replayPath, referencePath, outputs }) {
  const env = {
    ...process.env,
    PYTHONPATH: [
      dirname(pipelineDir),
      process.env.PYTHONPATH ?? "",
    ].filter(Boolean).join(":"),
  };
  for (const stage of pipelineStages) {
    console.error(stage.label);
    const scriptPath = join(pipelineDir, stage.script);
    const args = stage.args({ replayPath, outputs, referencePath });
    await execFile("python3", [scriptPath, ...args], {
      cwd: dirname(pipelineDir),
      env,
      maxBuffer: 4 * 1024 * 1024,
    });
  }
}

async function sanitizePipelineOutputs({ outputs, replayName, replaySizeBytes, replaySha256 }) {
  const game = await readJsonFile(outputs["game.json"]);
  game.source_recording = {
    filename: replayName,
    path: `browser-local:${replayName}`,
    original_source: null,
    size_bytes: replaySizeBytes,
    modified_utc: null,
    sha256: replaySha256,
    local_only: true,
  };
  await writeJsonFile(outputs["game.json"], game);

  const economy = await readJsonFile(outputs["economy.json"]);
  economy.source = {
    ...objectAt(economy, ["source"]),
    game_json: "browser-generated:game.json",
    reference_loaded_from: "pinned-public:aoe2techtree-data.json",
  };
  await writeJsonFile(outputs["economy.json"], economy);

  const resourceEstimates = await readJsonFile(outputs["resource_estimates.json"]);
  resourceEstimates.source = {
    ...objectAt(resourceEstimates, ["source"]),
    game_json: "browser-generated:game.json",
    lifetimes_json: "browser-generated:lifetimes.json",
    economy_json: "browser-generated:economy.json",
    reference_json: "pinned-public:aoe2techtree-data.json",
  };
  await writeJsonFile(outputs["resource_estimates.json"], resourceEstimates);
}

function parserDiagnostics({ game, lifetimes, economy, resourceEstimates }) {
  const actions = arrayAt(game, ["match", "actions"]);
  const inputs = arrayAt(game, ["match", "inputs"]);
  const mapEvents = arrayAt(lifetimes, ["map_events"]);
  const lifecycleEvents = arrayAt(lifetimes, ["lifecycle_events"]);
  const actorKeys = new Set();
  for (const event of mapEvents) {
    const row = asRecord(event);
    const player = integer(row.player, null);
    if (player === null) continue;
    for (const objectId of asArray(row.object_ids)) {
      const actorId = integer(objectId, null);
      if (actorId !== null) actorKeys.add(`${player}:${actorId}`);
    }
  }
  return {
    schemas: {
      game: String(game.schema ?? ""),
      lifetimes: String(lifetimes.schema ?? ""),
      economy: String(economy.schema ?? ""),
      resource_estimates: String(resourceEstimates.schema ?? ""),
    },
    players: arrayAt(game, ["match", "players"]).length,
    map_dimension: numberAt(game, ["match", "map", "dimension"], 0),
    duration_seconds: numberAt(game, ["match", "duration"], numberAt(lifetimes, ["duration_seconds"], 0)),
    actions: actions.length,
    inputs: inputs.length,
    map_events: mapEvents.length,
    map_events_by_kind: countBy(mapEvents.map((event) => asRecord(event).kind)),
    observed_actor_keys: actorKeys.size,
    lifecycle_events: lifecycleEvents.length,
    lifecycle_events_by_kind: countBy(lifecycleEvents.map((event) => asRecord(event).kind)),
    objects: arrayAt(lifetimes, ["objects"]).length,
    unit_completions: arrayAt(economy, ["unit_completions"]).length,
    building_placements: arrayAt(economy, ["building_placements"]).length,
    resource_nodes: arrayAt(resourceEstimates, ["resource_nodes"]).length,
    technology_completions: arrayAt(resourceEstimates, ["technology_completions"]).length,
  };
}

function gameplayDiagnostics(gameplayTimeline) {
  const units = asArray(gameplayTimeline.units);
  return {
    schema: String(gameplayTimeline.schema ?? ""),
    counts: asRecord(gameplayTimeline.counts),
    units: units.length,
    birth_kinds: countBy(units.map((unit) => asRecord(unit).birth_kind)),
    reconciliation_statuses: countBy(units.map((unit) => asRecord(asRecord(unit).reconciliation).status)),
    sprite_keys: countBy(units.map((unit) => asRecord(unit).sprite_key)),
    source_actor_units: units.filter((unit) => integer(asRecord(unit).source_actor_id, null) !== null).length,
    terminal_supported_units: units.filter((unit) =>
      number(asRecord(unit).visible_until, Number.POSITIVE_INFINITY) < Number.POSITIVE_INFINITY
      && !String(asRecord(unit).end_reason ?? "").includes("unresolved-through-replay-end")).length,
    stale_position_supported_units: units.filter((unit) =>
      number(asRecord(unit).position_valid_until, Number.POSITIVE_INFINITY) < Number.POSITIVE_INFINITY
      && String(asRecord(unit).position_end_reason ?? "").includes("expired")).length,
  };
}

function compactSnapshot(snapshot) {
  return {
    schema: snapshot.schema,
    seconds: snapshot.seconds,
    checksum: snapshot.checksum,
    diagnostics: snapshot.diagnostics,
    assignments: snapshot.assignments.map((assignment) => ({
      stable_id: assignment.stableId,
      marker_key: assignment.markerKey,
      player: assignment.player,
      source_actor_id: assignment.sourceActorId,
      unit_name: assignment.unitName,
      sprite_key: assignment.spriteKey,
      category: assignment.category,
      evidence_class: assignment.evidenceClass,
      evidence_quality: assignment.evidenceQuality,
      activity_kind: assignment.activityKind,
      activity_time: assignment.activityTime,
      position: assignment.position,
      destination: assignment.commandDestination,
      interpolation_status: assignment.interpolationStatus,
      interpolation_progress: assignment.interpolationProgress,
      birth_time: assignment.birthTime,
      visible_until: assignment.endTime,
      position_valid_until: assignment.positionValidUntil,
      reconciliation_status: assignment.reconciliationStatus,
      map_rendered: assignment.mapRendered,
      stack_anchor_position_key: assignment.stackAnchorPositionKey,
      stack_unit_type_key: assignment.stackUnitTypeKey,
    })),
    marker_groups: snapshot.markerGroups.map((group) => ({
      marker_key: group.markerKey,
      player: group.player,
      unit_name: group.unitName,
      sprite_key: group.spriteKey,
      position: group.position,
      stack_count: group.stackCount,
      stack_member_ids: group.stackMemberIds,
      stack_unit_type_key: group.stackUnitTypeKey,
      stack_layout_index: group.stackLayoutIndex,
      stack_layout_count: group.stackLayoutCount,
      stack_layout_item_counts: group.stackLayoutItemCounts,
      layout_at_fit_scale: layoutDiagnosticForGroup(group, 1),
      evidence_split: group.stackEvidenceSplit,
    })),
  };
}

function layoutDiagnosticForGroup(group, uniformScale) {
  const layout = exactTypeStackPixelLayout(
    asArray(group.stackLayoutItemCounts).map((stackCount) => ({ stackCount })),
    uniformScale,
  );
  const item = layout[group.stackLayoutIndex] ?? exactTypeStackPixelLayout([{ stackCount: group.stackCount }], uniformScale)[0];
  return compactLayoutItem(item ?? {
    offset: exactTypeStackPixelOffset(group.stackLayoutIndex, group.stackLayoutCount, uniformScale),
    spriteRect: null,
    countRect: null,
    footprintRect: null,
  });
}

function compactLayoutItem(item) {
  return {
    offset: item.offset,
    sprite_rect: compactRect(item.spriteRect),
    count_rect: compactRect(item.countRect),
    footprint_rect: compactRect(item.footprintRect),
    count_text: item.countText ?? "",
    count_digits: item.countDigits ?? 0,
    count_width_px: number(item.countWidthPx, 0),
    row_width_px: number(item.rowWidthPx, 0),
    marker_box_size_px: number(item.metrics?.markerBoxSizePx, 0),
    sprite_size_px: number(item.metrics?.spriteSizePx, 0),
    count_font_size_px: number(item.metrics?.countFontSizePx, 0),
    count_gap_px: number(item.metrics?.countGapPx, 0),
    item_gap_px: number(item.metrics?.itemGapPx, 0),
  };
}

function compactRect(rect) {
  return rect ? {
    left: number(rect.left, 0),
    top: number(rect.top, 0),
    right: number(rect.right, 0),
    bottom: number(rect.bottom, 0),
    width: number(rect.width, 0),
    height: number(rect.height, 0),
  } : null;
}

function compactParity(parity) {
  return {
    schema: parity.schema,
    sequence: parity.sequence,
    deterministic: parity.deterministic,
    parity: parity.parity,
    snapshots: parity.snapshots.map((snapshot) => ({
      seconds: snapshot.seconds,
      checksum: snapshot.checksum,
      assignments: snapshot.diagnostics.assignments,
      map_rendered: snapshot.diagnostics.mapRendered,
      marker_groups: snapshot.diagnostics.markerGroups,
      lifecycle_filtered: snapshot.diagnostics.lifecycleFiltered,
      stale_position_filtered: snapshot.diagnostics.stalePositionFiltered,
      activity_counts: snapshot.diagnostics.activityCounts,
      sprite_counts: snapshot.diagnostics.spriteCounts,
    })),
  };
}

function exactTypeSyntheticDiagnostic() {
  const expectedCounts = [7, 12, 123];
  const gameplayTimeline = {
    schema: "aoe-sim.dataview-gameplay-timeline/v1",
    units: [
      ...syntheticStack("archer", expectedCounts[0], 4, "Archer", "ranged", "archer", 1),
      ...syntheticStack("spear", expectedCounts[1], 93, "Spearman", "infantry", "spear", 1),
      ...syntheticStack("knight", expectedCounts[2], 38, "Knight", "cavalry", "knight", 1),
    ],
  };
  const snapshot = buildDataviewRenderSnapshot({ gameplayTimeline, seconds: 10, dimension: 120 });
  const groups = snapshot.markerGroups.slice().sort((a, b) => a.stackLayoutIndex - b.stackLayoutIndex);
  const layout = exactTypeStackPixelLayout(groups.map((group) => ({ stackCount: group.stackCount })), 1);
  const intersections = layoutIntersections(layout);
  const observedCounts = groups.map((group) => group.stackCount);
  const observedCountSet = new Set(observedCounts);
  const observedDigits = layout.map((item) => item.countDigits).filter((digits) => digits > 0);
  return {
    schema: "aoe-sim.dataview-exact-type-synthetic/v1",
    seconds: snapshot.seconds,
    checksum: snapshot.checksum,
    assignments: snapshot.assignments.length,
    expected_stack_counts: expectedCounts,
    marker_groups: groups.map((group) => ({
      marker_key: group.markerKey,
      sprite_key: group.spriteKey,
      stack_count: group.stackCount,
      stack_unit_type_key: group.stackUnitTypeKey,
      stack_layout_index: group.stackLayoutIndex,
      stack_layout_count: group.stackLayoutCount,
      stack_layout_item_counts: group.stackLayoutItemCounts,
      layout_at_fit_scale: layoutDiagnosticForGroup(group, 1),
    })),
    layout_items_at_fit_scale: layout.map(compactLayoutItem),
    footprint_intersections: intersections,
    footprint_intersection_count: intersections.length,
    passed:
      snapshot.assignments.length === expectedCounts.reduce((sum, count) => sum + count, 0)
      && snapshot.markerGroups.length === expectedCounts.length
      && snapshot.diagnostics.mixedPositionGroups === 1
      && expectedCounts.every((count) => observedCountSet.has(count))
      && [1, 2, 3].every((digits) => observedDigits.includes(digits))
      && intersections.length === 0,
  };
}

function syntheticStack(prefix, amount, unitId, name, category, spriteKey, player) {
  return Array.from({ length: amount }, (_, index) =>
    syntheticUnit(`${prefix}-${String(index + 1).padStart(3, "0")}`, unitId, name, category, spriteKey, player));
}

function syntheticUnit(id, unitId, name, category, spriteKey, player) {
  return {
    id,
    stable_id: id,
    player,
    source_actor_id: null,
    unit_id: unitId,
    resolved_unit_id: unitId,
    name,
    normalized_name: name.toLowerCase(),
    category,
    sprite_key: spriteKey,
    worker: false,
    birth_time: 0,
    birth_position: { x: 50, y: 50 },
    birth_evidence_class: "observed",
    birth_kind: "observed_actor",
    birth_confirmation: "synthetic exact-type grouping fixture",
    observations: [],
    position_retirements: [],
    motion_segments: [],
    position_horizon_seconds: 100,
    position_valid_until: 100,
    position_end_reason: "synthetic",
    visible_until: 100,
    end_reason: "synthetic",
    speed: 1,
  };
}

function layoutIntersections(layout) {
  const intersections = [];
  for (let leftIndex = 0; leftIndex < layout.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < layout.length; rightIndex += 1) {
      const left = layout[leftIndex];
      const right = layout[rightIndex];
      if (!left || !right || !markerRectsIntersect(left.footprintRect, right.footprintRect)) continue;
      intersections.push({
        left_index: leftIndex,
        right_index: rightIndex,
        left_rect: compactRect(left.footprintRect),
        right_rect: compactRect(right.footprintRect),
      });
    }
  }
  return intersections;
}

function focusedChecks({ parser, gameplay, reconstruction, synthetic, gameplayTimeline, dimension }) {
  const checks = [];
  const count = (key) => number(asRecord(gameplay.counts)[key], 0);
  const snapshots = reconstruction.snapshots;
  const allAssignments = snapshots.flatMap((snapshot) => snapshot.assignments);
  const allGroups = snapshots.flatMap((snapshot) => snapshot.marker_groups);
  const battleSnapshot = snapshots
    .slice()
    .sort((left, right) =>
      combatSignal(right) - combatSignal(left)
      || right.diagnostics.mapRendered - left.diagnostics.mapRendered)[0];
  const combatSprites = ["archer", "spear", "swordsman", "camel", "knight", "cavalryArcher", "scout"];
  const siegeSprites = ["scorpion", "catapult", "ram", "trebuchet", "bombardCannon"];
  const combatSpriteCount = snapshots.reduce((sum, snapshot) =>
    sum + sumCounts(snapshot.diagnostics.spriteCounts, combatSprites), 0);
  const siegeSpriteCount = snapshots.reduce((sum, snapshot) =>
    sum + sumCounts(snapshot.diagnostics.spriteCounts, siegeSprites), 0);
  const queueUnits = asArray(gameplayTimeline.units)
    .map(asRecord)
    .filter((unit) => unit.birth_kind === "queue_estimate");
  const invalidQueueBirths = queueUnits.filter((unit) => {
    const birthTime = number(unit.birth_time, Number.NaN);
    const estimatedCompletion = number(unit.estimated_completion_time, Number.NaN);
    return Number.isFinite(birthTime)
      && Number.isFinite(estimatedCompletion)
      && birthTime + 0.001 < estimatedCompletion;
  });
  const invalidVisibleAssignments = snapshots.flatMap((snapshot) =>
    snapshot.assignments.filter((assignment) => snapshot.seconds >= assignment.visible_until));
  const invalidMapPositions = allAssignments.filter((assignment) =>
    assignment.map_rendered
    && (!assignment.position
      || assignment.position.x < 0
      || assignment.position.y < 0
      || assignment.position.x > dimension
      || assignment.position.y > dimension));
  const repeatedChecksums = reconstruction.parity.parity
    .filter((row) => row.repeatCount > 1)
    .map((row) => `${row.seconds.toFixed(3)}:${row.checksum}`);

  pushCheck(checks, "parser normalization boundaries",
    parser.players >= 2
      && parser.inputs > 0
      && parser.map_events > 0
      && parser.lifecycle_events > 0
      && parser.observed_actor_keys > 0,
    `players=${parser.players}, inputs=${parser.inputs}, map_events=${parser.map_events}, lifecycle_events=${parser.lifecycle_events}, observed_actor_keys=${parser.observed_actor_keys}`);
  pushCheck(checks, "observed actor materialization",
    count("observed_actor_births") > 0
      && count("positioned_observed_actor_births") > 0
      && gameplay.source_actor_units > 0,
    `observed_actor_births=${count("observed_actor_births")}, positioned=${count("positioned_observed_actor_births")}, source_actor_units=${gameplay.source_actor_units}`);
  pushCheck(checks, "queue inference boundary",
    queueUnits.length > 0 && invalidQueueBirths.length === 0,
    `${queueUnits.length} queue estimates, ${invalidQueueBirths.length} born before estimated completion`);
  pushCheck(checks, "activity and position state",
    Boolean(battleSnapshot)
      && battleSnapshot.diagnostics.mapRendered > 0
      && (number(battleSnapshot.diagnostics.activityCounts.attack, 0) > 0
        || number(battleSnapshot.diagnostics.activityCounts.move, 0) > 0),
    battleSnapshot
      ? `t=${battleSnapshot.seconds}, map=${battleSnapshot.diagnostics.mapRendered}, activities=${JSON.stringify(battleSnapshot.diagnostics.activityCounts)}`
      : "no battle snapshot");
  pushCheck(checks, "soldier markers represented",
    combatSpriteCount > 0,
    `combat_sprites=${combatSpriteCount}, siege_sprites=${siegeSpriteCount}`);
  pushCheck(checks, "lifecycle boundaries",
    snapshots.some((snapshot) => snapshot.diagnostics.lifecycleFiltered > 0)
      && invalidVisibleAssignments.length === 0,
    `life_filtered=${snapshots.map((snapshot) => `${snapshot.seconds}:${snapshot.diagnostics.lifecycleFiltered}`).join(";")}, invalid_visible=${invalidVisibleAssignments.length}`);
  pushCheck(checks, "stale unit removal",
    snapshots.some((snapshot) => snapshot.diagnostics.stalePositionFiltered > 0),
    `stale_filtered=${snapshots.map((snapshot) => `${snapshot.seconds}:${snapshot.diagnostics.stalePositionFiltered}`).join(";")}`);
  pushCheck(checks, "direct seek parity",
    reconstruction.parity.deterministic && repeatedChecksums.length > 0,
    repeatedChecksums.join(";"));
  pushCheck(checks, "exact-type mixed grouping",
    synthetic.passed
      && allGroups.every((group) => group.stack_layout_count >= 1)
      && allGroups.every((group) => group.stack_count >= 1)
      && allGroups.every((group) => asArray(group.stack_layout_item_counts).length === group.stack_layout_count),
    `synthetic=${synthetic.passed}, synthetic_footprint_intersections=${synthetic.footprint_intersection_count}, real_mixed_positions=${snapshots.map((snapshot) => `${snapshot.seconds}:${snapshot.diagnostics.mixedPositionGroups}`).join(";")}`);
  pushCheck(checks, "map-position bounds",
    invalidMapPositions.length === 0,
    `${invalidMapPositions.length} invalid rendered positions`);
  return checks;
}

function pushCheck(checks, name, passed, detail) {
  checks.push({ name, passed: Boolean(passed), detail });
}

function combatSignal(snapshot) {
  return number(snapshot.diagnostics.activityCounts.attack, 0)
    + number(snapshot.diagnostics.activityCounts.move, 0)
    + sumCounts(snapshot.diagnostics.spriteCounts, ["archer", "spear", "swordsman", "knight", "catapult", "ram"]);
}

function sumCounts(counts, keys) {
  const record = asRecord(counts);
  return keys.reduce((sum, key) => sum + number(record[key], 0), 0);
}

function defaultSampleTimes(gameplayTimeline) {
  const units = asArray(gameplayTimeline.units).map(asRecord);
  const duration = Math.max(0, ...units.map((unit) => number(unit.visible_until, 0)).filter(Number.isFinite));
  const attackTimes = units
    .flatMap((unit) => asArray(unit.observations).map(asRecord))
    .filter((row) => ["target", "order", "attack"].includes(String(row.kind ?? "").toLowerCase()))
    .map((row) => number(row.time, Number.NaN))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const battle = attackTimes[Math.floor(attackTimes.length / 2)] ?? duration * 0.45;
  return uniqueTimes([
    60,
    Math.max(120, battle - 120),
    battle,
    battle + 120,
    Math.max(0, duration - 240),
  ]);
}

function paritySequenceFor(sampleTimes) {
  const [early = 0, preBattle = early, battle = preBattle, late = battle] = sampleTimes;
  return [early, preBattle, battle, late, battle, early, battle];
}

function uniqueTimes(times) {
  return [...new Set(times.map((time) => Math.round(Math.max(0, time) * 1000) / 1000))]
    .sort((left, right) => left - right);
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function arrayAt(value, path) {
  let current = value;
  for (const key of path) current = asRecord(current)[key];
  return asArray(current);
}

function objectAt(value, path) {
  let current = value;
  for (const key of path) current = asRecord(current)[key];
  return asRecord(current);
}

function numberAt(value, path, fallback = 0) {
  let current = value;
  for (const key of path) current = asRecord(current)[key];
  return number(current, fallback);
}

function number(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function integer(value, fallback = -1) {
  return Number.isInteger(value) ? value : fallback;
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const key = String(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((left, right) => left[0].localeCompare(right[0])));
}

async function readJsonFile(path) {
  return parseJsonText(await readFile(path), path);
}

function parseJsonText(bytes, label) {
  try {
    return JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString("utf8") : String(bytes));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function writeJsonFile(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function relativeRepoPath(path) {
  const relative = path.startsWith(repoRoot) ? path.slice(repoRoot.length + 1) : path;
  return relative || ".";
}
