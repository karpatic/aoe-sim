import { parse_rec, parse_rec_summary } from "aoe2rec-js";
import {
  buildCorruptLocalReplayReport,
  buildLocalReplayCompatibilityReport,
  mapAoe2recActionKindCounts,
  sortNumberRecord
} from "./local-recording";
import type {
  Aoe2recParsedPlayer,
  Aoe2recParsedReplay,
  Aoe2recParsedTeam,
  LocalReplayCompatibilityReport,
  LocalReplayExpectedScenario,
  LocalReplayFileReference
} from "./local-recording";

export async function analyzeLocalReplay(
  buffer: ArrayBuffer,
  fileName: string,
  lastModified: number,
  expected: LocalReplayExpectedScenario
): Promise<LocalReplayCompatibilityReport> {
  const recording = await buildRecordingReference(buffer, fileName, lastModified);

  try {
    validateRecordingEnvelope(buffer);
    const parsed = parseRecording(buffer);
    return buildLocalReplayCompatibilityReport(recording, expected, parsed);
  } catch (error) {
    return buildCorruptLocalReplayReport(recording, expected, error);
  }
}

function parseRecording(buffer: ArrayBuffer): Aoe2recParsedReplay {
  const summary = parse_rec_summary(buffer);
  let parsedSummary: Aoe2recParsedReplay["summary"];

  try {
    parsedSummary = extractSummary(summary);
  } finally {
    summary.free();
  }

  try {
    return {
      schemaVersion: "aoe-sim.aoe2rec-parse.v1",
      summary: parsedSummary,
      full: extractFullParse(parse_rec(buffer))
    };
  } catch (error) {
    return {
      schemaVersion: "aoe-sim.aoe2rec-parse.v1",
      summary: parsedSummary,
      fullParseError: error instanceof Error ? error.message : String(error)
    };
  }
}

function validateRecordingEnvelope(buffer: ArrayBuffer): void {
  if (buffer.byteLength < 16) {
    throw new Error("Recording is too small to contain an aoe2record savegame envelope.");
  }

  const view = new DataView(buffer);
  const zheaderLength = view.getUint32(0, true);
  if (zheaderLength <= 0 || zheaderLength > buffer.byteLength) {
    throw new Error(
      `Recording has an invalid compressed-header length (${zheaderLength}) for ${buffer.byteLength} bytes.`
    );
  }
}

async function buildRecordingReference(
  buffer: ArrayBuffer,
  fileName: string,
  lastModified: number
): Promise<LocalReplayFileReference> {
  const reference: LocalReplayFileReference = {
    id: fileName || "selected.aoe2record",
    fileName: fileName || "selected.aoe2record",
    sha256: `sha256:${await sha256(buffer)}`,
    sizeBytes: buffer.byteLength,
    localOnly: true
  };

  if (Number.isFinite(lastModified) && lastModified > 0) {
    return {
      ...reference,
      lastModifiedUtc: new Date(lastModified).toISOString()
    };
  }

  return reference;
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function extractSummary(summary: {
  readonly duration: number;
  readonly teams: readonly unknown[];
  readonly header: unknown;
}): Aoe2recParsedReplay["summary"] {
  const header = requireRecord(summary.header, "summary.header");
  const replay = requireRecord(header.replay, "summary.header.replay");
  const gameSettings = requireRecord(header.game_settings, "summary.header.game_settings");

  return {
    durationMs: requireNumber(summary.duration, "summary.duration"),
    teams: summary.teams.map((team, index) => extractTeam(team, `summary.teams[${index}]`)),
    header: {
      build: requireNumber(header.build, "summary.header.build"),
      gameString: requireString(header.game_string, "summary.header.game_string"),
      timestamp: requireNumber(header.timestamp, "summary.header.timestamp"),
      saveVersion: requireNumber(header.version_major, "summary.header.version_major"),
      versionMinor: requireNumber(header.version_minor, "summary.header.version_minor"),
      replay: {
        timer: requireNumber(replay.timer, "summary.header.replay.timer"),
        worldTime: requireNumber(replay.world_time, "summary.header.replay.world_time"),
        oldTime: requireNumber(replay.old_time, "summary.header.replay.old_time"),
        oldWorldTime: requireNumber(replay.old_world_time, "summary.header.replay.old_world_time"),
        randomSeed: requireNumber(replay.random_seed, "summary.header.replay.random_seed"),
        randomSeed2: requireNumber(replay.random_seed_2, "summary.header.replay.random_seed_2"),
        numPlayers: requireNumber(replay.num_players, "summary.header.replay.num_players"),
        recPlayer: requireNumber(replay.rec_player, "summary.header.replay.rec_player")
      },
      gameSettings: {
        selectedMapId: requireNumber(gameSettings.selected_map_id, "summary.header.game_settings.selected_map_id"),
        resolvedMapId: requireNumber(gameSettings.resolved_map_id, "summary.header.game_settings.resolved_map_id"),
        mapSize: requireNumber(gameSettings.map_size, "summary.header.game_settings.map_size"),
        nPlayers: requireNumber(gameSettings.n_players, "summary.header.game_settings.n_players"),
        populationLimit: requireNumber(gameSettings.population_limit, "summary.header.game_settings.population_limit"),
        startingResourcesId: requireNumber(
          gameSettings.starting_resources_id,
          "summary.header.game_settings.starting_resources_id"
        ),
        startingAgeId: requireNumber(gameSettings.starting_age_id, "summary.header.game_settings.starting_age_id"),
        endingAgeId: requireNumber(gameSettings.ending_age_id, "summary.header.game_settings.ending_age_id"),
        gameType: requireNumber(gameSettings.game_type, "summary.header.game_settings.game_type"),
        difficulty: requireNumber(gameSettings.difficulty, "summary.header.game_settings.difficulty"),
        moddedDataset: requireString(gameSettings.modded_dataset, "summary.header.game_settings.modded_dataset"),
        numStartingUnits: requireNumber(
          gameSettings.num_starting_units,
          "summary.header.game_settings.num_starting_units"
        )
      }
    }
  };
}

function extractTeam(value: unknown, path: string): Aoe2recParsedTeam {
  const team = requireRecord(value, path);
  const players = requireArray(team.players, `${path}.players`);

  return {
    winner: requireBoolean(team.winner, `${path}.winner`),
    players: players.map((player, index) => extractPlayer(player, `${path}.players[${index}]`))
  };
}

function extractPlayer(value: unknown, path: string): Aoe2recParsedPlayer {
  const player = requireRecord(value, path);

  return {
    playerNumber: requireNumber(player.player_number, `${path}.player_number`),
    name: requireString(player.name, `${path}.name`),
    civilizationId: requireNumber(player.civ_id, `${path}.civ_id`),
    colorId: requireNumber(player.color_id, `${path}.color_id`),
    selectedColor: requireNumber(player.selected_color, `${path}.selected_color`),
    selectedTeamId: requireNumber(player.selected_team_id, `${path}.selected_team_id`),
    resolvedTeamId: requireNumber(player.resolved_team_id, `${path}.resolved_team_id`),
    profileId: requireNumber(player.profile_id, `${path}.profile_id`),
    playerType: requireNumber(player.player_type, `${path}.player_type`),
    resigned: requireBoolean(player.resigned, `${path}.resigned`)
  };
}

function extractFullParse(value: unknown): NonNullable<Aoe2recParsedReplay["full"]> {
  const root = requireRecord(value, "parse_rec");
  const operations = requireArray(root.operations, "parse_rec.operations");
  const operationKindCounts: Record<string, number> = {};
  const actionKindCounts: Record<string, number> = {};

  for (const operation of operations) {
    const operationRecord = requireRecord(operation, "parse_rec.operations[]");
    const operationKind = Object.keys(operationRecord)[0] ?? "unknown";
    operationKindCounts[operationKind] = (operationKindCounts[operationKind] ?? 0) + 1;

    if (operationKind !== "Action") {
      continue;
    }

    const action = optionalRecord(operationRecord.Action);
    const actionData = optionalRecord(action?.action_data);
    const actionKind = actionData ? (Object.keys(actionData)[0] ?? "unknown") : "unknown";
    actionKindCounts[actionKind] = (actionKindCounts[actionKind] ?? 0) + 1;
  }

  const mappedActions = mapAoe2recActionKindCounts(actionKindCounts);
  const zheader = requireRecord(root.zheader, "parse_rec.zheader");

  return dropUndefined({
    byteLength: requireNumber(root.length, "parse_rec.length"),
    logVersion: optionalNumber(root.log_version),
    operationCount: operations.length,
    operationKindCounts: sortNumberRecord(operationKindCounts),
    actionKindCounts: sortNumberRecord(actionKindCounts),
    mappedScenarioActionKindCounts: mappedActions.mappedScenarioActionKindCounts,
    unmappedActionKinds: mappedActions.unmappedActionKinds,
    map: extractFullMap(optionalRecord(zheader.map_info)),
    replay: extractFullReplay(optionalRecord(zheader.replay)),
    postGameWorldTimeMs: extractPostGameWorldTime(operations)
  }) as NonNullable<Aoe2recParsedReplay["full"]>;
}

function extractFullMap(mapInfo: Record<string, unknown> | undefined): NonNullable<Aoe2recParsedReplay["full"]>["map"] {
  if (!mapInfo) {
    return undefined;
  }

  const tiles = optionalArray(mapInfo.tiles) ?? [];
  const terrainCounts: Record<string, number> = {};
  const elevationCounts: Record<string, number> = {};

  for (const tile of tiles) {
    const tileRecord = optionalRecord(tile);
    const terrain = optionalNumber(tileRecord?.terrain_type);
    const elevation = optionalNumber(tileRecord?.elevation);
    if (terrain !== undefined) {
      terrainCounts[String(terrain)] = (terrainCounts[String(terrain)] ?? 0) + 1;
    }
    if (elevation !== undefined) {
      elevationCounts[String(elevation)] = (elevationCounts[String(elevation)] ?? 0) + 1;
    }
  }

  return dropUndefined({
    widthTiles: optionalNumber(mapInfo.size_x),
    heightTiles: optionalNumber(mapInfo.size_y),
    tileCount: optionalArray(mapInfo.tiles)?.length,
    terrainCounts: sortNumberRecord(terrainCounts),
    elevationCounts: sortNumberRecord(elevationCounts)
  }) as NonNullable<Aoe2recParsedReplay["full"]>["map"];
}

function extractFullReplay(
  replay: Record<string, unknown> | undefined
): NonNullable<Aoe2recParsedReplay["full"]>["replay"] {
  if (!replay) {
    return undefined;
  }

  return dropUndefined({
    nextObjectId: optionalNumber(replay.next_object_id),
    nextReusableObjectId: optionalNumber(replay.next_reusable_object_id),
    randomSeed: optionalNumber(replay.random_seed),
    randomSeed2: optionalNumber(replay.random_seed_2)
  }) as NonNullable<Aoe2recParsedReplay["full"]>["replay"];
}

function extractPostGameWorldTime(operations: readonly unknown[]): number | undefined {
  for (const operation of operations) {
    const postGame = optionalRecord(optionalRecord(operation)?.PostGame);
    const blocks = optionalArray(postGame?.blocks);
    if (!blocks) {
      continue;
    }

    for (const block of blocks) {
      const worldTime = optionalRecord(block)?.WorldTime;
      const worldTimeRecord = optionalRecord(worldTime);
      const value = optionalNumber(worldTimeRecord?.world_time);
      if (value !== undefined) {
        return value;
      }
    }
  }

  return undefined;
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new Error(`${path} must be an object`);
  }

  return record;
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function requireArray(value: unknown, path: string): unknown[] {
  const array = optionalArray(value);
  if (!array) {
    throw new Error(`${path} must be an array`);
  }

  return array;
}

function optionalArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string`);
  }

  return value;
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }

  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${path} must be a boolean`);
  }

  return value;
}

function dropUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) {
      delete value[key];
    }
  }

  return value;
}
