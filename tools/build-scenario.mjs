#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaults = {
  gameJson: fileURLToPath(new URL("../../../www/aoe/game.json", import.meta.url)),
  recording: fileURLToPath(new URL("../../../www/aoe/game.aoe2record", import.meta.url)),
  extractor: fileURLToPath(new URL("../../../../hermes-runtime/aoe/replays/extract_replay.py", import.meta.url)),
  output: resolve(repoRoot, "public/fixtures/glade-120x120.scenario.json"),
  report: resolve(repoRoot, "public/fixtures/glade-120x120.report.json"),
  ruleset: resolve(repoRoot, "public/rules/ruleset-current.json")
};

const colorById = new Map([
  [0, "#3f7ecb"],
  [1, "#b84d4a"],
  [2, "#51a64d"],
  [3, "#d7c450"],
  [4, "#4fb9c6"],
  [5, "#7b58b8"],
  [6, "#8f8f86"],
  [7, "#d0803d"]
]);

const payloadParameters = [
  "amount",
  "building",
  "building_id",
  "command",
  "command_id",
  "formation",
  "formation_id",
  "order",
  "order_id",
  "resource",
  "resource_id",
  "slot_id",
  "stance",
  "stance_id",
  "target_type",
  "technology",
  "technology_id",
  "unit",
  "unit_id"
];

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const gameJsonBytes = await readFile(options.gameJson);
  const recordingBytes = await readFile(options.recording);
  const extractorBytes = await readFile(options.extractor);
  const importerBytes = await readFile(fileURLToPath(import.meta.url));
  const rulesetBytes = await readFile(options.ruleset);
  const source = parseJson(gameJsonBytes, options.gameJson);
  const rulesetSource = parseJson(rulesetBytes, options.ruleset);

  validateSourceDocument(source);
  const rulesetId = requireString(rulesetSource.rulesetId, "ruleset.rulesetId");

  const recordingStat = await stat(options.recording);
  const gameJsonStat = await stat(options.gameJson);
  const replaySha = sha256(recordingBytes);
  const gameJsonSha = sha256(gameJsonBytes);
  const extractorSha = sha256(extractorBytes);
  const importerSha = sha256(importerBytes);
  const rulesetSha = sha256(rulesetBytes);

  if (source.source_recording.sha256 !== replaySha) {
    throw new Error("source_recording.sha256 does not match game.aoe2record");
  }

  if (source.source_recording.size_bytes !== recordingStat.size) {
    throw new Error("source_recording.size_bytes does not match game.aoe2record");
  }

  const match = source.match;
  const map = buildMap(match.map);
  const players = buildPlayers(match.players);
  const teams = buildTeams(match.teams, players);
  const entities = buildEntities(match.gaia, match.players);
  const commands = buildCommands(match.actions, map.widthTiles, map.heightTiles);
  const commandKinds = countBy(commands, (command) => command.rawKind);
  const durationMs = parseTimestamp(match.duration, "match.duration");
  const replayVersion = replayVersionFromSource(source.source_recording.original_source) ?? match.version;
  const scenarioId = `replay-${String(match.guid).slice(0, 8)}-glade-120x120`;

  const scenario = {
    schemaVersion: "aoe-sim.scenario.v1",
    scenarioId,
    displayName: "Glade 1v1 replay fixture",
    durationMs,
    versions: dropUndefined({
      replayVersion,
      gameVersion: match.game_version,
      saveVersion: match.save_version,
      logVersion: match.log_version,
      buildVersion: match.build_version,
      dataset: match.dataset,
      datasetId: match.dataset_id
    }),
    map,
    players,
    teams,
    entities,
    commands,
    randomSeeds: [],
    unsupported: {
      commandKinds,
      commandCount: commands.length,
      implementedCommandKinds: ["move"],
      unresolved: [
        "Imported replay actions are observed intent only in Milestone 1.",
        "Replay command destinations are not continuous observed positions.",
        "Queue, economy, construction, combat, death, and spawn mechanics are not imported.",
        "Map terrain passability is unresolved until a pinned ruleset provides terrain semantics.",
        "The parser output does not expose replay random seeds."
      ]
    },
    provenance: {
      replay: {
        id: basename(options.recording),
        sha256: `sha256:${replaySha}`,
        sizeBytes: recordingStat.size
      },
      gameJson: {
        id: basename(options.gameJson),
        sha256: `sha256:${gameJsonSha}`,
        sizeBytes: gameJsonStat.size
      },
      parser: dropUndefined({
        id: `${source.parser.project}@${source.parser.version}`,
        sha256: `sha256:${extractorSha}`,
        sizeBytes: extractorBytes.length,
        project: source.parser.project,
        distribution: source.parser.distribution,
        version: source.parser.version,
        commit: source.parser.commit,
        sourceUrl: source.parser.source_url,
        aocrefVersion: source.parser.aocref_version
      }),
      ruleset: {
        id: rulesetId,
        sha256: `sha256:${rulesetSha}`,
        sizeBytes: rulesetBytes.length
      },
      importer: {
        id: "tools/build-scenario.mjs",
        sha256: `sha256:${importerSha}`,
        sizeBytes: importerBytes.length
      },
      generatedArtifact: {
        id: scenarioId,
        sha256: "sha256:self-excluded"
      }
    }
  };

  assertNoPathLeaks(scenario, "scenario");
  scenario.provenance.generatedArtifact.sha256 = `sha256:${sha256(Buffer.from(stableJson(scenario)))}`;

  const scenarioText = stableJson(scenario) + "\n";
  const artifactSha = sha256(Buffer.from(scenarioText));
  const report = buildReport({
    source,
    scenario,
    options,
    replaySha,
    gameJsonSha,
    extractorSha,
    importerSha,
    rulesetSha,
    artifactSha,
    artifactSize: Buffer.byteLength(scenarioText)
  });

  assertNoPathLeaks(report, "report");
  await writeFile(options.output, scenarioText, "utf8");
  await writeFile(options.report, stableJson(report) + "\n", "utf8");
  printSummary(report);
}

function parseArgs(args) {
  const options = { ...defaults };

  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    const value = args[index + 1];
    if (!name.startsWith("--") || !value) {
      throw new Error(`Usage: node tools/build-scenario.mjs [--game-json path] [--recording path] [--out path]`);
    }

    index += 1;
    switch (name) {
      case "--game-json":
        options.gameJson = resolve(value);
        break;
      case "--recording":
        options.recording = resolve(value);
        break;
      case "--extractor":
        options.extractor = resolve(value);
        break;
      case "--out":
        options.output = resolve(value);
        break;
      case "--report":
        options.report = resolve(value);
        break;
      case "--ruleset":
        options.ruleset = resolve(value);
        break;
      default:
        throw new Error(`Unknown argument ${name}`);
    }
  }

  return options;
}

function validateSourceDocument(value) {
  const root = requireRecord(value, "root");
  requireLiteral(root.schema, "aoe2-single-game-dataview/v1", "root.schema");
  requireString(root.generated_utc, "root.generated_utc");
  requireRecord(root.collection_paths, "root.collection_paths");

  const parser = requireRecord(root.parser, "root.parser");
  requireLiteral(parser.project, "aoc-mgz", "root.parser.project");
  requireString(parser.version, "root.parser.version");
  requireString(parser.commit, "root.parser.commit");
  requireString(parser.aocref_version, "root.parser.aocref_version");

  const sourceRecording = requireRecord(root.source_recording, "root.source_recording");
  requireString(sourceRecording.filename, "root.source_recording.filename");
  requireString(sourceRecording.sha256, "root.source_recording.sha256");
  requirePositiveInteger(sourceRecording.size_bytes, "root.source_recording.size_bytes");

  const summary = requireRecord(root.summary, "root.summary");
  const counts = requireRecord(summary.counts, "root.summary.counts");
  requirePositiveInteger(counts.map_tiles, "root.summary.counts.map_tiles");
  requirePositiveInteger(counts.gaia_objects, "root.summary.counts.gaia_objects");
  requirePositiveInteger(counts.actions, "root.summary.counts.actions");
  requirePositiveInteger(counts.players, "root.summary.counts.players");

  const match = requireRecord(root.match, "root.match");
  requireArray(match.players, "root.match.players");
  requireArray(match.teams, "root.match.teams");
  requireArray(match.gaia, "root.match.gaia");
  requireArray(match.actions, "root.match.actions");
  requireRecord(match.map, "root.match.map");
  requireString(match.guid, "root.match.guid");
  requireString(match.duration, "root.match.duration");
  requireString(match.version, "root.match.version");
  requireString(match.game_version, "root.match.game_version");
  requireInteger(match.save_version, "root.match.save_version");
  requireInteger(match.log_version, "root.match.log_version");
  requireInteger(match.build_version, "root.match.build_version");
}

function buildMap(sourceMap) {
  const map = requireRecord(sourceMap, "match.map");
  const dimension = requirePositiveInteger(map.dimension, "match.map.dimension");
  const tiles = requireArray(map.tiles, "match.map.tiles");

  if (dimension !== 120) {
    throw new Error(`Expected pinned 120x120 map, received ${dimension}x${dimension}`);
  }

  if (tiles.length !== dimension * dimension) {
    throw new Error(`Expected ${dimension * dimension} map tiles, received ${tiles.length}`);
  }

  const terrainIds = new Array(tiles.length);
  const elevations = new Array(tiles.length);
  const seen = new Set();

  for (const [sourceIndex, tileValue] of tiles.entries()) {
    const tile = requireRecord(tileValue, `match.map.tiles[${sourceIndex}]`);
    const position = requireRecord(tile.position, `match.map.tiles[${sourceIndex}].position`);
    const x = requireInteger(position.x, `match.map.tiles[${sourceIndex}].position.x`);
    const y = requireInteger(position.y, `match.map.tiles[${sourceIndex}].position.y`);
    const terrain = requireNonNegativeInteger(tile.terrain, `match.map.tiles[${sourceIndex}].terrain`);
    const elevation = requireInteger(tile.elevation, `match.map.tiles[${sourceIndex}].elevation`);

    if (x < 0 || x >= dimension || y < 0 || y >= dimension) {
      throw new Error(`match.map.tiles[${sourceIndex}] is outside the ${dimension}x${dimension} map`);
    }

    const rowMajorIndex = y * dimension + x;
    if (seen.has(rowMajorIndex)) {
      throw new Error(`Duplicate map tile at ${x},${y}`);
    }
    seen.add(rowMajorIndex);
    terrainIds[rowMajorIndex] = terrain;
    elevations[rowMajorIndex] = elevation;
  }

  if (seen.size !== tiles.length || terrainIds.some((item) => item === undefined)) {
    throw new Error("Map tile grid is incomplete");
  }

  return dropUndefined({
    widthTiles: dimension,
    heightTiles: dimension,
    sourceMapId: optionalInteger(map.id, "match.map.id"),
    name: optionalString(map.name, "match.map.name"),
    size: optionalString(map.size, "match.map.size"),
    tileGrid: {
      encoding: "row-major-terrain-elevation-v1",
      widthTiles: dimension,
      heightTiles: dimension,
      terrainIds,
      elevations,
      passability: "unresolved"
    }
  });
}

function buildPlayers(sourcePlayers) {
  const players = [
    {
      id: "gaia",
      name: "Gaia",
      team: 0,
      color: "#8f8f86",
      playerNumber: 0,
      colorId: 6
    }
  ];

  for (const [index, playerValue] of sourcePlayers.entries()) {
    const player = requireRecord(playerValue, `match.players[${index}]`);
    const number = requirePositiveInteger(player.number, `match.players[${index}].number`);
    const team = readFirstNumber(player.team_id ?? player.team, `match.players[${index}].team_id`);
    const colorId = optionalInteger(player.color_id, `match.players[${index}].color_id`);
    const position = requireRecord(player.position, `match.players[${index}].position`);

    players.push(dropUndefined({
      id: playerId(number),
      name: requireString(player.name, `match.players[${index}].name`),
      team,
      color: colorById.get(colorId ?? -1) ?? "#aeb8a4",
      playerNumber: number,
      colorId,
      civilization: optionalString(player.civilization, `match.players[${index}].civilization`),
      civilizationId: optionalInteger(player.civilization_id, `match.players[${index}].civilization_id`),
      profileId: optionalInteger(player.profile_id, `match.players[${index}].profile_id`),
      startPosition: {
        x: requireNumber(position.x, `match.players[${index}].position.x`),
        y: requireNumber(position.y, `match.players[${index}].position.y`)
      }
    }));
  }

  return players;
}

function buildTeams(sourceTeams, players) {
  const teams = [
    {
      id: "team-0",
      playerIds: ["gaia"],
      sourceTeamIds: [0]
    }
  ];
  const playerByNumber = new Map(players.flatMap((player) => (
    player.playerNumber === undefined ? [] : [[player.playerNumber, player]]
  )));

  for (const [index, teamValue] of sourceTeams.entries()) {
    const members = requireArray(teamValue, `match.teams[${index}]`).map((member, memberIndex) =>
      requirePositiveInteger(member, `match.teams[${index}][${memberIndex}]`)
    );
    const playerIds = members.map((member) => {
      const player = playerByNumber.get(member);
      if (!player) {
        throw new Error(`match.teams[${index}] references missing player ${member}`);
      }
      return player.id;
    });
    const sourceTeamId = index + 1;

    teams.push({
      id: `team-${sourceTeamId}`,
      playerIds,
      sourceTeamIds: [sourceTeamId]
    });
  }

  return teams;
}

function buildEntities(gaiaObjects, sourcePlayers) {
  const entities = [];

  for (const [sourceIndex, objectValue] of gaiaObjects.entries()) {
    entities.push(buildEntity(objectValue, sourceIndex, "gaia", `match.gaia[${sourceIndex}]`));
  }

  let sourceIndex = gaiaObjects.length;
  for (const [playerIndex, playerValue] of sourcePlayers.entries()) {
    const player = requireRecord(playerValue, `match.players[${playerIndex}]`);
    const ownerId = playerId(requirePositiveInteger(player.number, `match.players[${playerIndex}].number`));
    const objects = requireArray(player.objects, `match.players[${playerIndex}].objects`);

    for (const [objectIndex, objectValue] of objects.entries()) {
      entities.push(
        buildEntity(objectValue, sourceIndex, ownerId, `match.players[${playerIndex}].objects[${objectIndex}]`)
      );
      sourceIndex += 1;
    }
  }

  entities.sort(
    (left, right) => left.sourceInstanceId - right.sourceInstanceId || left.sourceIndex - right.sourceIndex
  );
  return entities;
}

function buildEntity(objectValue, sourceIndex, ownerId, path) {
  const object = requireRecord(objectValue, path);
  const position = requireRecord(object.position, `${path}.position`);
  const instanceId = requireInteger(object.instance_id, `${path}.instance_id`);
  const dataId = requireInteger(object.object_id, `${path}.object_id`);
  const classId = requireInteger(object.class_id, `${path}.class_id`);
  const label = optionalString(object.name, `${path}.name`);

  return dropUndefined({
    id: entityId(instanceId),
    kind: label ? slug(label) : `data-${dataId}`,
    playerId: ownerId,
    hp: null,
    position: {
      x: requireNumber(position.x, `${path}.position.x`),
      y: requireNumber(position.y, `${path}.position.y`),
      evidence: "observed"
    },
    evidence: "observed",
    dataId,
    classId,
    sourceInstanceId: instanceId,
    sourceIndex,
    label
  });
}

function buildCommands(actions, widthTiles, heightTiles) {
  return actions.map((actionValue, sourceIndex) => {
    const path = `match.actions[${sourceIndex}]`;
    const action = requireRecord(actionValue, path);
    const payload = requireRecord(action.payload, `${path}.payload`);
    const rawKind = requireString(action.type, `${path}.type`);
    const sourceSequence = requireInteger(payload.sequence, `${path}.payload.sequence`);
    const sourceActorIds = readIntegerArray(payload.object_ids ?? [], `${path}.payload.object_ids`);
    const sourceTargetId = optionalInteger(payload.target_id, `${path}.payload.target_id`);
    const destination = readDestination(payload, `${path}.payload`, widthTiles, heightTiles);
    const parameters = readPayloadParameters(payload);
    const playerNumber = optionalInteger(action.player, `${path}.player`);

    return dropUndefined({
      id: `action-${String(sourceIndex + 1).padStart(4, "0")}`,
      kind: "observed-intent",
      rawKind,
      issuedAtMs: parseTimestamp(requireString(action.timestamp, `${path}.timestamp`), `${path}.timestamp`),
      sourceSequence,
      sourceIndex,
      playerId: playerNumber === undefined ? undefined : playerId(playerNumber),
      actorIds: sourceActorIds.map(entityId),
      sourceActorIds,
      targetId: sourceTargetId === undefined || sourceTargetId < 0 ? undefined : entityId(sourceTargetId),
      sourceTargetId,
      destination,
      parameters,
      evidence: "observed"
    });
  });
}

function readDestination(payload, path, widthTiles, heightTiles) {
  if (payload.x !== undefined || payload.y !== undefined) {
    const x = requireNumber(payload.x, `${path}.x`);
    const y = requireNumber(payload.y, `${path}.y`);
    return {
      x,
      y,
      source: "point",
      evidence: "observed",
      isMapCoordinate: x >= 0 && y >= 0 && x < widthTiles && y < heightTiles
    };
  }

  if (payload.x_end !== undefined || payload.y_end !== undefined) {
    const x = requireNumber(payload.x_end, `${path}.x_end`);
    const y = requireNumber(payload.y_end, `${path}.y_end`);
    return {
      x,
      y,
      source: "wall-end",
      evidence: "observed",
      isMapCoordinate: x >= 0 && y >= 0 && x < widthTiles && y < heightTiles
    };
  }

  return undefined;
}

function readPayloadParameters(payload) {
  const parameters = {};

  for (const key of payloadParameters) {
    const value = payload[key];
    if (value === undefined) {
      continue;
    }

    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new Error(`Unsupported payload parameter ${key}`);
    }

    parameters[key] = value;
  }

  return Object.keys(parameters).length ? parameters : undefined;
}

function buildReport(context) {
  const { source, scenario, options, artifactSha, artifactSize } = context;
  const counts = source.summary.counts;
  const gaiaEntities = scenario.entities.filter((entity) => entity.playerId === "gaia").length;
  const playerEntities = scenario.entities.length - gaiaEntities;
  const terrainCounts = countBy(scenario.map.tileGrid.terrainIds, (terrainId) => String(terrainId));
  const elevationCounts = countBy(scenario.map.tileGrid.elevations, (elevation) => String(elevation));
  const destinationCount = scenario.commands.filter((command) => command.destination).length;
  const targetCount = scenario.commands.filter((command) => command.sourceTargetId !== undefined).length;

  return {
    schemaVersion: "aoe-sim.scenario-report.v1",
    scenarioId: scenario.scenarioId,
    displayName: scenario.displayName,
    source: {
      replay: scenario.provenance.replay,
      gameJson: scenario.provenance.gameJson,
      parser: scenario.provenance.parser,
      parserOutputGeneratedUtc: source.generated_utc,
      sourceRecordingFilename: basename(options.recording)
    },
    artifact: {
      semanticSha256: scenario.provenance.generatedArtifact.sha256,
      fileSha256: `sha256:${artifactSha}`,
      sizeBytes: artifactSize
    },
    counts: {
      source: {
        players: counts.players,
        teams: counts.teams,
        mapTiles: counts.map_tiles,
        gaiaObjects: counts.gaia_objects,
        playerStartingObjects: counts.player_starting_objects,
        actions: counts.actions,
        inputs: counts.inputs,
        durationMs: Math.round(source.summary.duration_seconds * 1000)
      },
      generated: {
        players: scenario.players.length - 1,
        teams: scenario.teams.length - 1,
        mapTiles: scenario.map.tileGrid.terrainIds.length,
        gaiaObjects: gaiaEntities,
        playerStartingObjects: playerEntities,
        totalEntities: scenario.entities.length,
        commands: scenario.commands.length,
        durationMs: scenario.durationMs,
        commandsWithTargets: targetCount,
        commandsWithDestinations: destinationCount
      }
    },
    reconciliation: {
      playersMatch: counts.players === scenario.players.length - 1,
      teamsMatch: counts.teams === scenario.teams.length - 1,
      mapTilesMatch: counts.map_tiles === scenario.map.tileGrid.terrainIds.length,
      gaiaObjectsMatch: counts.gaia_objects === gaiaEntities,
      playerStartingObjectsMatch: counts.player_starting_objects === playerEntities,
      actionsMatch: counts.actions === scenario.commands.length,
      durationMatches: Math.round(source.summary.duration_seconds * 1000) === scenario.durationMs
    },
    terrainCounts,
    elevationCounts,
    actionTypes: scenario.unsupported.commandKinds,
    omittedCollections: {
      normalizedInputs: counts.inputs,
      chatMessages: counts.chat_messages,
      uptimeEvents: counts.uptime_events,
      viewlockEvents: counts.viewlock_events,
      playerTimeseriesRows: counts.timeseries_rows
    },
    unresolved: scenario.unsupported.unresolved
  };
}

function printSummary(report) {
  console.log(stableJson({
    scenario: report.scenarioId,
    output: {
      sizeBytes: report.artifact.sizeBytes,
      fileSha256: report.artifact.fileSha256,
      semanticSha256: report.artifact.semanticSha256
    },
    generatedCounts: report.counts.generated,
    reconciliation: report.reconciliation
  }));
}

function parseTimestamp(value, path) {
  const match = /^(\d+):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/.exec(value);
  if (!match) {
    throw new Error(`${path} must use H:MM:SS.ffffff`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const micros = Number((match[4] ?? "").padEnd(6, "0"));

  if (minutes >= 60 || seconds >= 60) {
    throw new Error(`${path} has invalid minute or second fields`);
  }

  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + Math.round(micros / 1000);
}

function replayVersionFromSource(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  return /MP Replay v([^ @/\\]+)/.exec(basename(value))?.[1];
}

function countBy(values, readKey) {
  const counts = new Map();
  for (const value of values) {
    const key = readKey(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function entityId(value) {
  return `obj:${value}`;
}

function playerId(value) {
  return value === 0 ? "gaia" : `p${value}`;
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "unnamed";
}

function parseJson(bytes, path) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`Failed to parse ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function stableJson(value) {
  return JSON.stringify(value);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertNoPathLeaks(value, path) {
  if (typeof value === "string") {
    const leakMarkers = ["/" + "home" + "/", "\\" + "Users" + "\\", "steamapps" + "/compatdata"];
    if (leakMarkers.some((marker) => value.includes(marker))) {
      throw new Error(`${path} contains a machine-local path`);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPathLeaks(item, `${path}[${index}]`));
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    assertNoPathLeaks(item, `${path}.${key}`);
  }
}

function readFirstNumber(value, path) {
  const items = requireArray(value, path);
  if (items.length !== 1) {
    throw new Error(`${path} must contain exactly one value for the pinned 1v1 fixture`);
  }

  return requireInteger(items[0], `${path}[0]`);
}

function readIntegerArray(value, path) {
  return requireArray(value, path).map((item, index) => requireInteger(item, `${path}[${index}]`));
}

function requireRecord(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }

  return value;
}

function requireArray(value, path) {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }

  return value;
}

function requireLiteral(value, expected, path) {
  if (value !== expected) {
    throw new Error(`${path} must be ${expected}`);
  }
}

function requireString(value, path) {
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string`);
  }

  return value;
}

function optionalString(value, path) {
  return value === undefined || value === null ? undefined : requireString(value, path);
}

function requireNumber(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }

  return value;
}

function requireInteger(value, path) {
  const valueNumber = requireNumber(value, path);
  if (!Number.isInteger(valueNumber)) {
    throw new Error(`${path} must be an integer`);
  }

  return valueNumber;
}

function optionalInteger(value, path) {
  return value === undefined || value === null ? undefined : requireInteger(value, path);
}

function requirePositiveInteger(value, path) {
  const valueNumber = requireInteger(value, path);
  if (valueNumber <= 0) {
    throw new Error(`${path} must be positive`);
  }

  return valueNumber;
}

function requireNonNegativeInteger(value, path) {
  const valueNumber = requireInteger(value, path);
  if (valueNumber < 0) {
    throw new Error(`${path} must be non-negative`);
  }

  return valueNumber;
}

function dropUndefined(value) {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) {
      delete value[key];
    }
  }

  return value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
