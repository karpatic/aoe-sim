import { loadAoe2recWasm, type Aoe2recWasmModule } from "./aoe2rec-wasm";
import {
  BROWSER_COMPILED_REPLAY_HASH_CONTRACT,
  compareCodePoint,
  stableJsonUtf8Bytes,
  unsignedBrowserCompiledReplayContent
} from "./canonical-json";
import { assertCanonicalJsonByteLength, assertRecordingByteLength, LOCAL_REPLAY_LIMITS } from "./limits";
import {
  AOE2REC_PARSER_IDENTITY,
  buildCorruptLocalReplayReport,
  buildLocalReplayCompatibilityReport,
  createNullRecord,
  mapAoe2recActionKind,
  mapAoe2recActionKindCounts,
  sortNumberRecord
} from "./local-recording";
import type {
  Aoe2recParsedPlayer,
  Aoe2recParsedReplay,
  Aoe2recParsedTeam,
  BrowserCompiledReplayV1,
  BrowserReplayAction,
  BrowserReplayActionPoint,
  BrowserReplayChatMessage,
  BrowserReplayMap,
  BrowserReplayOutcome,
  BrowserReplayPlayer,
  BrowserReplayPlayerActionSummary,
  BrowserReplayTeam,
  BrowserReplayUnsupportedEvidence,
  LocalReplayCompatibilityReport,
  LocalReplayComparison,
  LocalReplayExpectedScenario,
  LocalReplayFileReference,
  LocalReplayParserProgressPhase
} from "./local-recording";
import type { ArtifactReference, CommandParameterValue } from "./model";

type LocalReplayProgressSink = (phase: LocalReplayParserProgressPhase, message: string) => void;

interface ParseRecordingResult {
  readonly parsed: Aoe2recParsedReplay;
  readonly fullRoot?: Record<string, unknown>;
}

interface ExtractedActionSet {
  readonly timeline: readonly BrowserReplayAction[];
  readonly byPlayer: readonly BrowserReplayPlayerActionSummary[];
  readonly missingTimeCount: number;
  readonly actionsWithActors: number;
  readonly actionsWithTargets: number;
  readonly actionsWithDestinations: number;
}

interface ExtractedChatSet {
  readonly messages: readonly BrowserReplayChatMessage[];
  readonly total: number;
  readonly omittedCount: number;
  readonly truncatedTextCount: number;
  readonly truncated: boolean;
}

interface ValidatedMapGrid {
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly tileCount: number;
  readonly terrainIds: readonly number[];
  readonly elevations: readonly number[];
  readonly terrainCounts: Record<string, number>;
  readonly elevationCounts: Record<string, number>;
}

interface LimitedRecord<T> {
  readonly values: Record<string, T>;
  readonly truncated: boolean;
}

interface LimitedString {
  readonly value: string;
  readonly truncated: boolean;
}

interface ActionSemantics {
  readonly selectedIds: readonly number[];
  readonly actorIds: readonly number[];
  readonly targetId?: number;
  readonly dataIds: Record<string, number>;
  readonly parameters: Record<string, CommandParameterValue>;
  readonly unsupported: readonly string[];
}

class ReplayModelValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ReplayModelValidationError";
  }
}

export async function analyzeLocalReplay(
  buffer: ArrayBuffer,
  fileName: string,
  lastModified: number,
  expected: LocalReplayExpectedScenario,
  onProgress?: LocalReplayProgressSink
): Promise<LocalReplayCompatibilityReport> {
  assertRecordingByteLength(buffer.byteLength, "Selected recording buffer");
  onProgress?.("hashing", "Hashing selected replay bytes inside the parser worker");
  const recording = await buildRecordingReference(buffer, fileName, lastModified).catch((error: unknown) => {
    throw stageError("Replay content hashing/reference failed", error);
  });

  onProgress?.("loading-parser", "Loading pinned aoe2rec-js WASM in the parser worker");
  const parser = await loadAoe2recWasm().catch((error: unknown) => {
    throw stageError("Parser worker failed to initialize aoe2rec WASM", error);
  });

  let parseResult: ParseRecordingResult;
  try {
    onProgress?.("validating", "Checking the recorded-game envelope before parsing");
    validateRecordingEnvelope(buffer);
    parseResult = parseRecording(parser, buffer, onProgress);
  } catch (error) {
    if (error instanceof ReplayModelValidationError) {
      throw stageError("Browser replay model validation failed", error);
    }
    onProgress?.("done", "Replay envelope or summary parsing ended with a corrupt-file report");
    return buildCorruptLocalReplayReport(recording, expected, error);
  }

  onProgress?.("comparing", "Reconciling equivalent parser fields against the Glade oracle");
  const report = buildLocalReplayCompatibilityReport(recording, expected, parseResult.parsed);
  onProgress?.("compiling", "Compiling compact map, player, chat, action, and unsupported-evidence views");
  const compiled = await buildBrowserCompiledReplay(
    recording,
    expected,
    parseResult.parsed,
    report.comparisons,
    report.unsupportedMappings,
    parseResult.fullRoot
  ).catch((error: unknown) => {
    throw stageError("Browser replay compiler failed", error);
  });
  onProgress?.("done", "Browser-local replay model compiled");
  return buildLocalReplayCompatibilityReport(recording, expected, parseResult.parsed, compiled);
}

function parseRecording(
  parser: Aoe2recWasmModule,
  buffer: ArrayBuffer,
  onProgress?: LocalReplayProgressSink
): ParseRecordingResult {
  onProgress?.("summary", "Parsing replay metadata and player summary");
  const summary = parser.parse_rec_summary(buffer);
  let parsedSummary: Aoe2recParsedReplay["summary"];

  try {
    parsedSummary = extractSummary(summary);
  } finally {
    summary.free();
  }

  onProgress?.("full-parse", "Parsing full operation stream for local analytical dataview");
  try {
    const fullRoot = requireRecord(parser.parse_rec(buffer), "parse_rec");
    validateOperationCount(optionalArray(fullRoot.operations)?.length ?? 0, "parse_rec.operations");
    let full: NonNullable<Aoe2recParsedReplay["full"]> | undefined;
    let fullParseError: string | undefined;
    try {
      full = extractFullParse(fullRoot);
    } catch (error) {
      if (error instanceof ReplayModelValidationError) {
        throw error;
      }
      fullParseError = error instanceof Error ? error.message : String(error);
    }

    return {
      parsed: dropUndefined({
        schemaVersion: "aoe-sim.aoe2rec-parse.v1",
        summary: parsedSummary,
        full,
        fullParseError
      }) as Aoe2recParsedReplay,
      fullRoot
    };
  } catch (error) {
    if (error instanceof ReplayModelValidationError) {
      throw error;
    }
    return {
      parsed: {
        schemaVersion: "aoe-sim.aoe2rec-parse.v1",
        summary: parsedSummary,
        fullParseError: error instanceof Error ? error.message : String(error)
      }
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
  const digest = await sha256(buffer);
  const reference: LocalReplayFileReference = {
    id: `selected-replay-${digest.slice(0, 12)}`,
    fileName: fileName || "selected.aoe2record",
    sha256: `sha256:${digest}`,
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

async function buildBrowserCompiledReplay(
  recording: LocalReplayFileReference,
  expected: LocalReplayExpectedScenario,
  parsed: Aoe2recParsedReplay,
  comparisons: readonly LocalReplayComparison[],
  unsupportedMappings: readonly string[],
  fullRoot: Record<string, unknown> | undefined
): Promise<BrowserCompiledReplayV1> {
  const operations = readOperationsForCompilation(fullRoot);
  const parsedFull = parsed.full;
  const operationKindCounts = parsedFull?.operationKindCounts ?? countOperationKinds(operations);
  validateOperationCount(parsedFull?.operationCount ?? operations.length, "compiled operations total");
  const actionKindCounts = parsedFull?.actionKindCounts ?? countActionsByKind(operations);
  const actionTotal = operationKindCounts.Action ?? countActionOperations(operations);
  validateNormalizedActionCount(actionTotal, "compiled normalized action timeline");
  const mappedActions = mapAoe2recActionKindCounts(actionKindCounts);
  const outcome = buildReplayOutcome(parsed.summary.teams, parsedFull?.postGameWorldTimeMs);
  const players = buildCompiledPlayers(parsed.summary.teams, outcome);
  const teams = buildCompiledTeams(parsed.summary.teams);
  const map = extractCompiledMap(optionalRecord(optionalRecord(fullRoot?.zheader)?.map_info));
  const playerNames = new Map(players.map((player) => [player.playerNumber, player.name]));
  const actions = extractCompiledActions(operations, map, playerNames);
  const chat = extractCompiledChatMessages(operations);
  const unsupportedEvidence = buildCompiledUnsupportedEvidence(
    parsed,
    map,
    actions,
    chat,
    mappedActions.unmappedActionKinds,
    unsupportedMappings
  );
  const provenanceBase = {
    replay: recording,
    parser: AOE2REC_PARSER_IDENTITY.parser,
    wasm: AOE2REC_PARSER_IDENTITY.wasm,
    ruleset: expected.ruleset
  };
  const baseModel = dropUndefined({
    schemaVersion: "aoe-sim.browser-compiled-replay.v1" as const,
    contentHashContract: BROWSER_COMPILED_REPLAY_HASH_CONTRACT,
    compiler: {
      id: "aoe-sim.browser-local-replay-compiler" as const,
      version: "v1" as const,
      source: "src/replay/aoe2rec-parser.ts" as const,
      deterministicOrdering: "operation-index-then-action-index" as const
    },
    recording,
    parser: AOE2REC_PARSER_IDENTITY,
    localBoundary: {
      bytesStayLocal: true as const,
      transfer: "File.arrayBuffer -> parser worker -> aoe2rec-js WASM parser -> compact model" as const,
      rawParserObjectsReturned: false as const,
      selectedReplayJsonFetched: false as const
    },
    provenance: provenanceBase,
    fixtureOracle: {
      scenarioId: expected.scenarioId,
      scenarioArtifact: expected.scenarioArtifact,
      replay: expected.replay,
      aocMgzParser: expected.aocMgzParser,
      equivalentFieldParity: comparisons.filter((comparison) => comparison.status !== "unsupported"),
      nonEquivalentUnsupported: buildNonEquivalentUnsupported(comparisons, unsupportedMappings)
    },
    durationMs: parsed.summary.durationMs,
    versions: dropUndefined({
      build: parsed.summary.header.build,
      gameString: parsed.summary.header.gameString,
      saveVersion: parsed.summary.header.saveVersion,
      versionMinor: parsed.summary.header.versionMinor,
      logVersion: parsedFull?.logVersion
    }),
    replay: dropUndefined({
      timer: parsed.summary.header.replay.timer,
      worldTime: parsed.summary.header.replay.worldTime,
      oldTime: parsed.summary.header.replay.oldTime,
      oldWorldTime: parsed.summary.header.replay.oldWorldTime,
      randomSeed: parsed.summary.header.replay.randomSeed,
      randomSeed2: parsed.summary.header.replay.randomSeed2,
      recPlayer: parsed.summary.header.replay.recPlayer,
      numPlayers: parsed.summary.header.replay.numPlayers,
      nextObjectId: parsedFull?.replay?.nextObjectId,
      nextReusableObjectId: parsedFull?.replay?.nextReusableObjectId,
      postGameWorldTimeMs: parsedFull?.postGameWorldTimeMs
    }),
    gameSettings: parsed.summary.header.gameSettings,
    teams,
    players,
    outcome,
    map,
    operations: dropUndefined({
      total: parsedFull?.operationCount ?? operations.length,
      byKind: operationKindCounts,
      firstOperationIndex: operations.length ? 0 : undefined,
      lastOperationIndex: operations.length ? operations.length - 1 : undefined
    }),
    actions: {
      total: actionTotal,
      byKind: actionKindCounts,
      byMappedScenarioKind: mappedActions.mappedScenarioActionKindCounts,
      byPlayer: actions.byPlayer,
      timeline: actions.timeline,
      missingTimeCount: actions.missingTimeCount,
      actionsWithActors: actions.actionsWithActors,
      actionsWithTargets: actions.actionsWithTargets,
      actionsWithDestinations: actions.actionsWithDestinations,
      unmappedKinds: mappedActions.unmappedActionKinds
    },
    chat: {
      total: chat.total,
      omittedCount: chat.omittedCount,
      truncatedTextCount: chat.truncatedTextCount,
      messages: chat.messages,
      truncated: chat.truncated
    },
    unsupportedEvidence
  });
  const canonicalContentBytes = stableJsonUtf8Bytes(unsignedBrowserCompiledReplayContent(baseModel));
  assertCanonicalJsonByteLength(canonicalContentBytes.byteLength, "Browser-compiled canonical content");
  const generatedArtifact: ArtifactReference = {
    id: `browser-compiled-${recording.sha256.replace(/^sha256:/, "").slice(0, 12)}.v1`,
    sha256: `sha256:${await sha256Bytes(canonicalContentBytes)}`,
    sizeBytes: canonicalContentBytes.byteLength
  };

  return {
    ...baseModel,
    provenance: {
      ...provenanceBase,
      generatedArtifact
    }
  } as BrowserCompiledReplayV1;
}

function buildCompiledTeams(teams: readonly Aoe2recParsedTeam[]): readonly BrowserReplayTeam[] {
  return teams.map((team, index) => ({
    id: `team-${index + 1}`,
    winner: team.winner,
    playerNumbers: team.players.map((player) => player.playerNumber).sort((left, right) => left - right)
  }));
}

function buildReplayOutcome(
  teams: readonly Aoe2recParsedTeam[],
  postGameWorldTimeMs: number | undefined
): BrowserReplayOutcome {
  const complete = postGameWorldTimeMs !== undefined;
  return dropUndefined({
    completion: {
      complete,
      evidence: "observed" as const,
      source: complete ? ("PostGame.WorldTime" as const) : ("unavailable" as const),
      worldTimeMs: postGameWorldTimeMs
    },
    winnerTeamIds: teams
      .map((team, index) => (team.winner ? `team-${index + 1}` : undefined))
      .filter((teamId): teamId is string => teamId !== undefined)
      .sort(compareCodePoint)
  }) as BrowserReplayOutcome;
}

function buildCompiledPlayers(
  teams: readonly Aoe2recParsedTeam[],
  outcome: BrowserReplayOutcome
): readonly BrowserReplayPlayer[] {
  const hasWinner = outcome.winnerTeamIds.length > 0;
  return teams
    .flatMap((team) =>
      team.players.map((player) => ({
        id: playerIdForNumber(player.playerNumber),
        playerNumber: player.playerNumber,
        name: player.name,
        civilizationId: player.civilizationId,
        colorId: player.colorId,
        selectedColor: player.selectedColor,
        selectedTeamId: player.selectedTeamId,
        resolvedTeamId: player.resolvedTeamId,
        profileId: player.profileId,
        playerType: player.playerType,
        resigned: player.resigned,
        teamWinner: team.winner,
        ...derivePlayerResult(player, team.winner, outcome.completion.complete, hasWinner)
      }))
    )
    .sort((left, right) => left.playerNumber - right.playerNumber);
}

function derivePlayerResult(
  player: Aoe2recParsedPlayer,
  teamWinner: boolean,
  replayComplete: boolean,
  hasWinner: boolean
): Pick<BrowserReplayPlayer, "result" | "resultEvidence" | "resultSource"> {
  if (player.resigned) {
    return {
      result: "resigned",
      resultEvidence: "observed",
      resultSource: "summary-resigned"
    };
  }
  if (replayComplete && teamWinner) {
    return {
      result: "winner",
      resultEvidence: "observed",
      resultSource: "summary-winner-with-postgame"
    };
  }
  if (replayComplete && hasWinner) {
    return {
      result: "loss",
      resultEvidence: "observed",
      resultSource: "postgame-nonwinner"
    };
  }

  return {
    result: "unknown",
    resultEvidence: "observed",
    resultSource: "unavailable"
  };
}

function extractCompiledMap(mapInfo: Record<string, unknown> | undefined): BrowserReplayMap | undefined {
  const grid = extractValidatedMapGrid(mapInfo, "parse_rec.zheader.map_info");
  if (!grid) {
    return undefined;
  }

  return {
    evidence: "observed",
    widthTiles: grid.widthTiles,
    heightTiles: grid.heightTiles,
    tileCount: grid.tileCount,
    terrainCounts: grid.terrainCounts,
    elevationCounts: grid.elevationCounts,
    tileGrid: {
      encoding: "row-major-terrain-elevation-v1",
      widthTiles: grid.widthTiles,
      heightTiles: grid.heightTiles,
      terrainIds: grid.terrainIds,
      elevations: grid.elevations,
      passability: "unresolved"
    }
  };
}

function extractValidatedMapGrid(
  mapInfo: Record<string, unknown> | undefined,
  path: string
): ValidatedMapGrid | undefined {
  if (!mapInfo) {
    return undefined;
  }

  const widthTiles = requireBoundedPositiveSafeInteger(
    mapInfo.size_x,
    `${path}.size_x`,
    LOCAL_REPLAY_LIMITS.maxMapDimensionTiles
  );
  const heightTiles = requireBoundedPositiveSafeInteger(
    mapInfo.size_y,
    `${path}.size_y`,
    LOCAL_REPLAY_LIMITS.maxMapDimensionTiles
  );
  const tiles = requireArray(mapInfo.tiles, `${path}.tiles`);
  const tileCount = validateMapTileCount(widthTiles, heightTiles, tiles.length, `${path}.tiles`);
  const terrainIds: number[] = [];
  const elevations: number[] = [];
  const terrainCounts = createNullRecord<number>();
  const elevationCounts = createNullRecord<number>();

  for (let index = 0; index < tiles.length; index += 1) {
    const tile = requireRecord(tiles[index], `${path}.tiles[${index}]`);
    const terrain = requireSafeNonnegativeInteger(tile.terrain_type, `${path}.tiles[${index}].terrain_type`);
    const elevation = requireSafeNonnegativeInteger(tile.elevation, `${path}.tiles[${index}].elevation`);
    terrainIds.push(terrain);
    elevations.push(elevation);
    incrementCount(terrainCounts, String(terrain));
    incrementCount(elevationCounts, String(elevation));
  }

  return {
    widthTiles,
    heightTiles,
    tileCount,
    terrainIds,
    elevations,
    terrainCounts: sortNumberRecord(terrainCounts),
    elevationCounts: sortNumberRecord(elevationCounts)
  };
}

function extractCompiledActions(
  operations: readonly unknown[],
  map: BrowserReplayMap | undefined,
  playerNames: ReadonlyMap<number, string>
): ExtractedActionSet {
  validateOperationCount(operations.length, "parse_rec.operations");
  const timeline: BrowserReplayAction[] = [];
  const byPlayer = new Map<string, MutablePlayerActionSummary>();
  let missingTimeCount = 0;
  let actionsWithActors = 0;
  let actionsWithTargets = 0;
  let actionsWithDestinations = 0;

  for (let operationIndex = 0; operationIndex < operations.length; operationIndex += 1) {
    const operationRecord = optionalRecord(operations[operationIndex]);
    if (!operationRecord || firstRecordKey(operationRecord) !== "Action") {
      continue;
    }

    const actionRecord = optionalRecord(operationRecord.Action) ?? {};
    const actionData = optionalRecord(actionRecord.action_data);
    const actionKind = actionData ? (firstRecordKey(actionData) ?? "unknown") : "unknown";
    const payload = actionData ? optionalRecord(actionData[actionKind]) ?? {} : {};
    const records = [actionRecord, payload];
    const issuedAtMs = findFirstSafeNonnegativeIntegerByKeys(records, isTimeKey);
    const playerNumber = findFirstSafeNonnegativeIntegerByKeys(records, isPlayerNumberKey);
    const playerId = playerNumber === undefined ? undefined : playerIdForNumber(playerNumber);
    const semantics = extractActionSemantics(actionKind, records, payload);
    const destination = findActionPoint(records, map);
    const mappedScenarioKind = mapAoe2recActionKind(actionKind);
    const unsupported = [
      ...semantics.unsupported,
      ...(mappedScenarioKind ? [] : ["No scenario command-kind mapping exists for this parser action kind."])
    ];
    const actionIndex = timeline.length;
    const action = dropUndefined({
      id: `action-${String(actionIndex + 1).padStart(4, "0")}`,
      operationIndex,
      actionIndex,
      sourceSequence: issuedAtMs ?? operationIndex,
      issuedAtMs,
      playerNumber,
      playerId,
      kind: actionKind,
      mappedScenarioKind,
      selectedIds: semantics.selectedIds,
      actorIds: semantics.actorIds,
      targetId: semantics.targetId,
      destination,
      dataIds: semantics.dataIds,
      parameters: semantics.parameters,
      evidence: "observed" as const,
      unsupported
    }) as BrowserReplayAction;

    timeline.push(action);
    validateNormalizedActionCount(timeline.length, "compiled normalized action timeline");
    if (issuedAtMs === undefined) {
      missingTimeCount += 1;
    }
    if (semantics.actorIds.length) {
      actionsWithActors += 1;
    }
    if (semantics.targetId !== undefined) {
      actionsWithTargets += 1;
    }
    if (destination) {
      actionsWithDestinations += 1;
    }
    addPlayerActionSummary(byPlayer, action, playerNames);
  }

  return {
    timeline,
    byPlayer: Array.from(byPlayer.values())
      .map((summary) =>
        dropUndefined({
          playerId: summary.playerId,
          playerNumber: summary.playerNumber,
          name: summary.name,
          total: summary.total,
          byKind: sortNumberRecord(summary.byKind),
          firstActionMs: summary.firstActionMs,
          lastActionMs: summary.lastActionMs,
          firstOperationIndex: summary.firstOperationIndex,
          lastOperationIndex: summary.lastOperationIndex
        }) as BrowserReplayPlayerActionSummary
      )
      .sort(comparePlayerActionSummaries),
    missingTimeCount,
    actionsWithActors,
    actionsWithTargets,
    actionsWithDestinations
  };
}

function extractActionSemantics(
  actionKind: string,
  records: readonly Record<string, unknown>[],
  payload: Record<string, unknown>
): ActionSemantics {
  const unsupported: string[] = [];
  const dataIds = collectDataIds(actionKind, payload);
  const parameters = collectParameters(payload);
  const selectedIds = extractSelectedObjectIds(actionKind, records, payload);
  const actorIds = extractActorObjectIds(actionKind, records, payload, selectedIds);
  const targetId = extractTargetObjectId(actionKind, records, payload);

  if (dataIds.truncated) {
    unsupported.push(
      `Data-ID fields were capped at ${LOCAL_REPLAY_LIMITS.maxCommandParameterFields} entries for this payload.`
    );
  }
  if (parameters.truncated) {
    unsupported.push(
      `Scalar payload parameters were capped at ` +
        `${LOCAL_REPLAY_LIMITS.maxCommandParameterFields} entries for this payload.`
    );
  }
  if (Array.isArray(payload.data)) {
    unsupported.push(
      "This action carries an opaque parser data byte array whose field semantics are not normalized yet."
    );
  }

  return dropUndefined({
    selectedIds,
    actorIds,
    targetId,
    dataIds: dataIds.values,
    parameters: parameters.values,
    unsupported
  }) as ActionSemantics;
}

function extractSelectedObjectIds(
  actionKind: string,
  records: readonly Record<string, unknown>[],
  payload: Record<string, unknown>
): readonly number[] {
  switch (actionKind) {
    case "DeQueue":
    case "Research":
      return numberArrayFromKey(payload, "building_ids", `${actionKind}.building_ids`) ?? [];
    case "Order":
      return numberArrayFromKey(payload, "object_ids", "Order.object_ids") ?? [];
    default:
      return findFirstNumberArrayByKeys(records, isSelectedIdsKey);
  }
}

function extractActorObjectIds(
  actionKind: string,
  records: readonly Record<string, unknown>[],
  payload: Record<string, unknown>,
  selectedIds: readonly number[]
): readonly number[] {
  switch (actionKind) {
    case "DeQueue":
    case "Research": {
      const buildingIds = numberArrayFromKey(payload, "building_ids", `${actionKind}.building_ids`) ?? [];
      const buildingId = optionalSafeNonnegativeInteger(payload.building_id);
      return uniqueNumbers(buildingIds.length ? buildingIds : buildingId === undefined ? [] : [buildingId]);
    }
    case "Order":
      return uniqueNumbers(numberArrayFromKey(payload, "object_ids", "Order.object_ids") ?? []);
    default: {
      const explicitActorIds = findFirstNumberArrayByKeys(records, isActorIdsKey);
      return uniqueNumbers(explicitActorIds.length ? explicitActorIds : selectedIds);
    }
  }
}

function extractTargetObjectId(
  actionKind: string,
  records: readonly Record<string, unknown>[],
  payload: Record<string, unknown>
): number | undefined {
  if (actionKind === "Order") {
    return optionalSafeNonnegativeInteger(payload.building_id);
  }

  return findFirstSafeNonnegativeIntegerByKeys(records, isTargetIdKey);
}

function extractCompiledChatMessages(operations: readonly unknown[]): ExtractedChatSet {
  const messages: BrowserReplayChatMessage[] = [];
  let total = 0;
  let truncatedTextCount = 0;

  for (let operationIndex = 0; operationIndex < operations.length; operationIndex += 1) {
    const operationRecord = optionalRecord(operations[operationIndex]);
    const operationKind = operationRecord ? firstRecordKey(operationRecord) : undefined;
    if (!operationRecord || operationKind !== "Chat") {
      continue;
    }

    total += 1;
    if (messages.length >= LOCAL_REPLAY_LIMITS.maxChatMessages) {
      continue;
    }

    const chatRecord = requireRecord(operationRecord[operationKind], `parse_rec.operations[${operationIndex}].Chat`);
    const message = extractChatMessage(chatRecord, operationIndex);
    if (message.textTruncated) {
      truncatedTextCount += 1;
    }
    messages.push(message);
  }

  return {
    messages,
    total,
    omittedCount: Math.max(0, total - messages.length),
    truncatedTextCount,
    truncated: total > messages.length
  };
}

function extractChatMessage(chatRecord: Record<string, unknown>, operationIndex: number): BrowserReplayChatMessage {
  const issuedAtMs = findFirstSafeNonnegativeIntegerByKeys([chatRecord], isTimeKey);
  const raw = typeof chatRecord.text === "string"
    ? limitString(chatRecord.text, LOCAL_REPLAY_LIMITS.maxChatRawTextChars)
    : undefined;
  const decoded = raw && !raw.truncated ? decodeChatPayload(raw.value) : undefined;
  const decodedText = typeof decoded?.message === "string"
    ? limitString(decoded.message, LOCAL_REPLAY_LIMITS.maxChatDecodedTextChars)
    : undefined;
  const decodedPlayer = optionalSafeNonnegativeInteger(decoded?.player);
  const parserPlayer = findFirstSafeNonnegativeIntegerByKeys([chatRecord], isPlayerNumberKey);
  const playerNumber = decodedPlayer ?? parserPlayer;
  const metadata = collectChatMetadata(decoded ?? chatRecord);
  const rawText = raw?.value;
  const textSource = decodedText ? "decoded-message" : rawText ? "raw-parser-text" : "none";

  return dropUndefined({
    operationIndex,
    sourceSequence: issuedAtMs ?? operationIndex,
    issuedAtMs,
    playerNumber,
    playerId: playerNumber === undefined ? undefined : playerIdForNumber(playerNumber),
    rawText,
    decodedText: decodedText?.value,
    textSource,
    textTruncated: Boolean(raw?.truncated || decodedText?.truncated || metadata.truncated),
    metadata: metadata.values,
    evidence: "observed" as const
  }) as BrowserReplayChatMessage;
}

function decodeChatPayload(rawText: string): Record<string, unknown> | undefined {
  try {
    return optionalRecord(JSON.parse(rawText));
  } catch {
    return undefined;
  }
}

function collectChatMetadata(record: Record<string, unknown>): LimitedRecord<CommandParameterValue> {
  const metadata = createNullRecord<CommandParameterValue>();
  let truncated = false;

  for (const [key, value] of Object.entries(record).sort(([left], [right]) => compareCodePoint(left, right))) {
    if (key === "message" || key === "text") {
      continue;
    }
    if (Object.keys(metadata).length >= LOCAL_REPLAY_LIMITS.maxChatMetadataFields) {
      truncated = true;
      break;
    }

    const scalar = limitedParameterScalar(value);
    if (scalar !== undefined) {
      metadata[key] = scalar.value;
      truncated ||= scalar.truncated;
    }
  }

  return {
    values: metadata,
    truncated
  };
}

function buildCompiledUnsupportedEvidence(
  parsed: Aoe2recParsedReplay,
  map: BrowserReplayMap | undefined,
  actions: ExtractedActionSet,
  chat: ExtractedChatSet,
  unmappedKinds: readonly string[],
  unsupportedMappings: readonly string[]
): readonly BrowserReplayUnsupportedEvidence[] {
  const unsupported: BrowserReplayUnsupportedEvidence[] = [
    {
      area: "initial objects",
      evidence: "observed",
      message:
        "The pinned JS parser does not expose the initial object table; owners, data IDs, HP, and starting " +
        "positions are not confirmed from the selected replay."
    },
    {
      area: "lifetimes",
      evidence: "observed",
      message:
        "Object lifetimes and deaths are not compiled from lifetimes.json or inferred from queue/combat intent " +
        "for the selected replay."
    },
    {
      area: "economy",
      evidence: "observed",
      message:
        "Current economy and resource estimates are not compiled from economy.json or resource_estimates.json " +
        "for the selected replay."
    },
    {
      area: "ruleset",
      evidence: "observed",
      message:
        "Static DAT/ruleset references are hash-linked for interpretation, but the browser-compiled replay " +
        "model does not mutate rules into replay facts."
    }
  ];

  if (!map) {
    unsupported.push({
      area: "map",
      evidence: "observed",
      message: "The parser did not expose a complete terrain/elevation tile grid for this recording."
    });
  }
  if (parsed.fullParseError) {
    unsupported.push({
      area: "parser",
      evidence: "observed",
      message: `Full parser extraction was partial: ${parsed.fullParseError}`
    });
  }
  if (actions.missingTimeCount) {
    unsupported.push({
      area: "actions",
      evidence: "observed",
      message:
        "Some action records did not expose an absolute replay timestamp; those rows are ordered by parser " +
        "operation index only.",
      count: actions.missingTimeCount
    });
  }
  if (unmappedKinds.length) {
    unsupported.push({
      area: "actions",
      evidence: "observed",
      message: `Unmapped aoe2rec action kinds: ${unmappedKinds.join(", ")}.`,
      count: unmappedKinds.length
    });
  }
  if (!chat.total) {
    unsupported.push({
      area: "chat",
      evidence: "observed",
      message: "No chat operation was exposed by the pinned parser for this recording."
    });
  }
  if (chat.omittedCount) {
    unsupported.push({
      area: "chat",
      evidence: "observed",
      message:
        `Chat rows are capped at ${LOCAL_REPLAY_LIMITS.maxChatMessages} messages in the compiled dataview model.`,
      count: chat.omittedCount
    });
  }
  if (chat.truncatedTextCount) {
    unsupported.push({
      area: "chat",
      evidence: "observed",
      message:
        "One or more chat rows had raw text, decoded text, or metadata strings capped by the local dataview limits.",
      count: chat.truncatedTextCount
    });
  }
  for (const message of unsupportedMappings) {
    unsupported.push({
      area: "provenance",
      evidence: "observed",
      message
    });
  }

  return unsupported;
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
  validateOperationCount(operations.length, "parse_rec.operations");
  const operationKindCounts = createNullRecord<number>();
  const actionKindCounts = createNullRecord<number>();
  let actionCount = 0;

  for (const operation of operations) {
    const operationRecord = requireRecord(operation, "parse_rec.operations[]");
    const operationKind = Object.keys(operationRecord)[0] ?? "unknown";
    incrementCount(operationKindCounts, operationKind);

    if (operationKind !== "Action") {
      continue;
    }

    const action = optionalRecord(operationRecord.Action);
    const actionData = optionalRecord(action?.action_data);
    const actionKind = actionData ? (Object.keys(actionData)[0] ?? "unknown") : "unknown";
    actionCount += 1;
    validateNormalizedActionCount(actionCount, "parse_rec Action operations");
    incrementCount(actionKindCounts, actionKind);
  }

  const mappedActions = mapAoe2recActionKindCounts(actionKindCounts);
  const zheader = requireRecord(root.zheader, "parse_rec.zheader");

  return dropUndefined({
    byteLength: requireSafeNonnegativeInteger(root.length, "parse_rec.length"),
    logVersion: optionalSafeNonnegativeInteger(root.log_version),
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
  const grid = extractValidatedMapGrid(mapInfo, "parse_rec.zheader.map_info");
  if (!grid) {
    return undefined;
  }

  return {
    widthTiles: grid.widthTiles,
    heightTiles: grid.heightTiles,
    tileCount: grid.tileCount,
    terrainCounts: grid.terrainCounts,
    elevationCounts: grid.elevationCounts
  };
}

function extractFullReplay(
  replay: Record<string, unknown> | undefined
): NonNullable<Aoe2recParsedReplay["full"]>["replay"] {
  if (!replay) {
    return undefined;
  }

  return dropUndefined({
    nextObjectId: optionalSafeNonnegativeInteger(replay.next_object_id),
    nextReusableObjectId: optionalSafeNonnegativeInteger(replay.next_reusable_object_id),
    randomSeed: optionalSafeNonnegativeInteger(replay.random_seed),
    randomSeed2: optionalSafeNonnegativeInteger(replay.random_seed_2)
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
      const value = optionalSafeNonnegativeInteger(worldTimeRecord?.world_time);
      if (value !== undefined) {
        return value;
      }
    }
  }

  return undefined;
}

interface MutablePlayerActionSummary {
  playerId: string;
  playerNumber?: number;
  name?: string;
  total: number;
  readonly byKind: Record<string, number>;
  firstActionMs?: number;
  lastActionMs?: number;
  firstOperationIndex: number;
  lastOperationIndex: number;
}

function countOperationKinds(operations: readonly unknown[]): Record<string, number> {
  validateOperationCount(operations.length, "parse_rec.operations");
  const counts = createNullRecord<number>();
  for (const operation of operations) {
    const operationKind = firstRecordKey(optionalRecord(operation)) ?? "unknown";
    incrementCount(counts, operationKind);
  }

  return sortNumberRecord(counts);
}

function countActionsByKind(operations: readonly unknown[]): Record<string, number> {
  validateOperationCount(operations.length, "parse_rec.operations");
  const counts = createNullRecord<number>();
  let actionCount = 0;
  for (const operation of operations) {
    const operationRecord = optionalRecord(operation);
    if (!operationRecord || firstRecordKey(operationRecord) !== "Action") {
      continue;
    }

    const actionRecord = optionalRecord(operationRecord.Action);
    const actionData = optionalRecord(actionRecord?.action_data);
    const actionKind = actionData ? (firstRecordKey(actionData) ?? "unknown") : "unknown";
    actionCount += 1;
    validateNormalizedActionCount(actionCount, "parse_rec Action operations");
    incrementCount(counts, actionKind);
  }

  return sortNumberRecord(counts);
}

function countActionOperations(operations: readonly unknown[]): number {
  let actionCount = 0;
  for (const operation of operations) {
    if (firstRecordKey(optionalRecord(operation)) === "Action") {
      actionCount += 1;
      validateNormalizedActionCount(actionCount, "parse_rec Action operations");
    }
  }
  return actionCount;
}

function addPlayerActionSummary(
  summaries: Map<string, MutablePlayerActionSummary>,
  action: BrowserReplayAction,
  playerNames: ReadonlyMap<number, string>
): void {
  const playerId = action.playerId ?? "unknown";
  let summary = summaries.get(playerId);
  if (!summary) {
    summary = {
      playerId,
      total: 0,
      byKind: createNullRecord<number>(),
      firstOperationIndex: action.operationIndex,
      lastOperationIndex: action.operationIndex
    };
    if (action.playerNumber !== undefined) {
      summary.playerNumber = action.playerNumber;
      const playerName = playerNames.get(action.playerNumber);
      if (playerName !== undefined) {
        summary.name = playerName;
      }
    }
    summaries.set(playerId, summary);
  }

  summary.total += 1;
  incrementCount(summary.byKind, action.kind);
  summary.firstOperationIndex = Math.min(summary.firstOperationIndex, action.operationIndex);
  summary.lastOperationIndex = Math.max(summary.lastOperationIndex, action.operationIndex);
  if (action.issuedAtMs !== undefined) {
    summary.firstActionMs =
      summary.firstActionMs === undefined ? action.issuedAtMs : Math.min(summary.firstActionMs, action.issuedAtMs);
    summary.lastActionMs =
      summary.lastActionMs === undefined ? action.issuedAtMs : Math.max(summary.lastActionMs, action.issuedAtMs);
  }
}

function comparePlayerActionSummaries(
  left: BrowserReplayPlayerActionSummary,
  right: BrowserReplayPlayerActionSummary
): number {
  if (left.playerNumber !== undefined && right.playerNumber !== undefined) {
    return left.playerNumber - right.playerNumber;
  }
  if (left.playerNumber !== undefined) {
    return -1;
  }
  if (right.playerNumber !== undefined) {
    return 1;
  }
  return compareCodePoint(left.playerId, right.playerId);
}

function firstRecordKey(record: Record<string, unknown> | undefined): string | undefined {
  return record ? Object.keys(record)[0] : undefined;
}

function playerIdForNumber(playerNumber: number): string {
  return playerNumber === 0 ? "gaia" : `p${playerNumber}`;
}

function findFirstSafeNonnegativeIntegerByKeys(
  records: readonly Record<string, unknown>[],
  matchesKey: (key: string) => boolean
): number | undefined {
  for (const record of records) {
    const found = findSafeNonnegativeIntegerInRecord(record, matchesKey, 0);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

function findSafeNonnegativeIntegerInRecord(
  record: Record<string, unknown>,
  matchesKey: (key: string) => boolean,
  depth: number
): number | undefined {
  for (const [key, value] of Object.entries(record)) {
    const numberValue = optionalSafeNonnegativeInteger(value);
    if (numberValue !== undefined && matchesKey(key)) {
      return numberValue;
    }

    const child = optionalRecord(value);
    if (child && depth < 3) {
      const nested = findSafeNonnegativeIntegerInRecord(child, matchesKey, depth + 1);
      if (nested !== undefined) {
        return nested;
      }
    }
  }

  return undefined;
}

function findFirstNumberArrayByKeys(
  records: readonly Record<string, unknown>[],
  matchesKey: (key: string) => boolean
): readonly number[] {
  for (const record of records) {
    const found = findNumberArrayInRecord(record, matchesKey, "", 0);
    if (found?.length) {
      return found;
    }
  }

  return [];
}

function findNumberArrayInRecord(
  record: Record<string, unknown>,
  matchesKey: (key: string) => boolean,
  prefix: string,
  depth: number
): readonly number[] | undefined {
  for (const [key, value] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (matchesKey(key)) {
      const values = numberArrayFromValue(value, path);
      if (values?.length) {
        return values;
      }
    }

    const child = optionalRecord(value);
    if (child && depth < 3) {
      const nested = findNumberArrayInRecord(child, matchesKey, path, depth + 1);
      if (nested?.length) {
        return nested;
      }
    }
  }

  return undefined;
}

function numberArrayFromKey(
  record: Record<string, unknown>,
  key: string,
  path: string
): readonly number[] | undefined {
  if (!(key in record)) {
    return undefined;
  }
  const values = numberArrayFromValue(record[key], path);
  if (!values) {
    throw new ReplayModelValidationError(`${path} must be an array of safe nonnegative integer object IDs.`);
  }
  return values;
}

function numberArrayFromValue(value: unknown, path: string): readonly number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  if (value.length > LOCAL_REPLAY_LIMITS.maxReplayIdArrayLength) {
    throw new ReplayModelValidationError(
      `${path} has ${value.length} entries, above the ` +
        `${LOCAL_REPLAY_LIMITS.maxReplayIdArrayLength}-object ID array limit.`
    );
  }
  const values: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    const numberValue = optionalSafeNonnegativeInteger(item);
    if (numberValue !== undefined) {
      values.push(numberValue);
      continue;
    }

    const itemRecord = optionalRecord(item);
    const nestedId = optionalSafeNonnegativeInteger(itemRecord?.id);
    if (nestedId !== undefined) {
      values.push(nestedId);
      continue;
    }

    throw new ReplayModelValidationError(`${path}[${index}] must be a safe nonnegative integer object ID.`);
  }

  return values;
}

function findActionPoint(
  records: readonly Record<string, unknown>[],
  map: BrowserReplayMap | undefined
): BrowserReplayActionPoint | undefined {
  for (const record of records) {
    const direct = pointFromRecord(record, "action-position", map);
    if (direct) {
      return direct;
    }
    const nested = findNestedPoint(record, map, 0);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function findNestedPoint(
  record: Record<string, unknown>,
  map: BrowserReplayMap | undefined,
  depth: number
): BrowserReplayActionPoint | undefined {
  for (const [key, value] of Object.entries(record)) {
    const child = optionalRecord(value);
    if (!child) {
      continue;
    }

    const source = key.toLowerCase().includes("wall") ? "wall-end" : "payload-point";
    const point = pointFromRecord(child, source, map);
    if (point) {
      return point;
    }
    if (depth < 3) {
      const nested = findNestedPoint(child, map, depth + 1);
      if (nested) {
        return nested;
      }
    }
  }

  return undefined;
}

function pointFromRecord(
  record: Record<string, unknown>,
  source: BrowserReplayActionPoint["source"],
  map: BrowserReplayMap | undefined
): BrowserReplayActionPoint | undefined {
  const x =
    optionalNumber(record.x) ??
    optionalNumber(record.pos_x) ??
    optionalNumber(record.position_x) ??
    optionalNumber(record.x_coord) ??
    optionalNumber(record.x_coordinate);
  const y =
    optionalNumber(record.y) ??
    optionalNumber(record.pos_y) ??
    optionalNumber(record.position_y) ??
    optionalNumber(record.y_coord) ??
    optionalNumber(record.y_coordinate);

  if (x === undefined || y === undefined) {
    return undefined;
  }

  return {
    x,
    y,
    source,
    evidence: "observed",
    isMapCoordinate: isMapCoordinate(x, y, map)
  };
}

function isMapCoordinate(x: number, y: number, map: BrowserReplayMap | undefined): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
    return false;
  }
  if (!map) {
    return true;
  }

  return x <= map.widthTiles && y <= map.heightTiles;
}

function collectDataIds(actionKind: string, record: Record<string, unknown>): LimitedRecord<number> {
  const ids = createNullRecord<number>();
  const state = { truncated: false };
  collectDataIdsFromRecord(actionKind, record, ids, state, "", 0);
  return {
    values: sortNumberRecord(ids),
    truncated: state.truncated
  };
}

function collectDataIdsFromRecord(
  actionKind: string,
  record: Record<string, unknown>,
  ids: Record<string, number>,
  state: { truncated: boolean },
  prefix: string,
  depth: number
): void {
  for (const [key, value] of Object.entries(record).sort(([left], [right]) => compareCodePoint(left, right))) {
    const path = prefix ? `${prefix}.${key}` : key;
    const numberValue = optionalSafeNonnegativeInteger(value);
    if (numberValue !== undefined && isDataIdKey(actionKind, key) && !(path in ids)) {
      if (Object.keys(ids).length >= LOCAL_REPLAY_LIMITS.maxCommandParameterFields) {
        state.truncated = true;
        return;
      }
      ids[path] = numberValue;
    }

    const child = optionalRecord(value);
    if (child && depth < 2) {
      collectDataIdsFromRecord(actionKind, child, ids, state, path, depth + 1);
      if (state.truncated) {
        return;
      }
    }
  }
}

function collectParameters(record: Record<string, unknown>): LimitedRecord<CommandParameterValue> {
  const parameters = createNullRecord<CommandParameterValue>();
  const state = { truncated: false };
  collectParametersFromRecord(record, parameters, state, "", 0);

  const sorted = createNullRecord<CommandParameterValue>();
  for (const [key, value] of Object.entries(parameters).sort(([left], [right]) => compareCodePoint(left, right))) {
    sorted[key] = value;
  }
  return {
    values: sorted,
    truncated: state.truncated
  };
}

function collectParametersFromRecord(
  record: Record<string, unknown>,
  parameters: Record<string, CommandParameterValue>,
  state: { truncated: boolean },
  prefix: string,
  depth: number
): void {
  for (const [key, value] of Object.entries(record).sort(([left], [right]) => compareCodePoint(left, right))) {
    if (Object.keys(parameters).length >= LOCAL_REPLAY_LIMITS.maxCommandParameterFields) {
      state.truncated = true;
      return;
    }

    const path = prefix ? `${prefix}.${key}` : key;
    if (isParameterKeySkipped(key)) {
      continue;
    }
    const scalar = limitedParameterScalar(value);
    if (scalar !== undefined) {
      parameters[path] = scalar.value;
      state.truncated ||= scalar.truncated;
      continue;
    }

    const child = optionalRecord(value);
    if (child && depth < 2) {
      collectParametersFromRecord(child, parameters, state, path, depth + 1);
      if (state.truncated) {
        return;
      }
    }
  }
}

function limitedParameterScalar(
  value: unknown
): LimitedString | { readonly value: number | boolean; truncated: false } | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return {
      value,
      truncated: false
    };
  }
  if (typeof value === "boolean") {
    return {
      value,
      truncated: false
    };
  }
  if (typeof value === "string") {
    return limitString(value, LOCAL_REPLAY_LIMITS.maxCommandParameterStringChars);
  }

  return undefined;
}

function limitString(value: string, maxChars: number): LimitedString {
  if (value.length <= maxChars) {
    return {
      value,
      truncated: false
    };
  }

  return {
    value: `${value.slice(0, Math.max(0, maxChars - 3))}...`,
    truncated: true
  };
}

function isTimeKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    normalized === "time" ||
    normalized === "timestamp" ||
    normalized === "time_ms" ||
    normalized === "world_time" ||
    normalized === "game_time" ||
    normalized === "issued_at_ms"
  );
}

function isPlayerNumberKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    normalized === "player" ||
    normalized === "player_id" ||
    normalized === "player_number" ||
    normalized === "source_player" ||
    normalized === "source_player_id"
  );
}

function isSelectedIdsKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    normalized === "selected" ||
    normalized === "selected_ids" ||
    normalized === "selected_object_ids" ||
    normalized === "selected_unit_ids" ||
    normalized === "selection"
  );
}

function isActorIdsKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    isSelectedIdsKey(key) ||
    normalized === "actors" ||
    normalized === "actor_ids" ||
    normalized === "object_ids" ||
    normalized === "unit_ids"
  );
}

function isTargetIdKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    normalized === "target" ||
    normalized === "target_id" ||
    normalized === "target_object_id" ||
    normalized === "object_id" ||
    normalized === "gather_target_id"
  );
}

function isDataIdKey(actionKind: string, key: string): boolean {
  const normalized = normalizeKey(key);
  if (
    normalized === "player_id" ||
    normalized === "source_player_id" ||
    normalized === "building_id" ||
    normalized === "building_ids" ||
    normalized === "object_id" ||
    normalized === "object_ids" ||
    normalized === "target_id" ||
    normalized === "target_object_id" ||
    normalized === "unit_ids"
  ) {
    return false;
  }
  if (normalized === "technology_type") {
    return actionKind === "Research";
  }

  return (
    normalized === "building_type" ||
    normalized === "data_id" ||
    normalized === "unit_id" ||
    normalized === "tech_id" ||
    normalized === "technology_id" ||
    normalized === "target_type" ||
    normalized === "object_type" ||
    normalized === "formation_id" ||
    normalized === "stance_id" ||
    normalized.endsWith("_data_id")
  );
}

function isParameterKeySkipped(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    normalized === "x" ||
    normalized === "y" ||
    normalized === "pos_x" ||
    normalized === "pos_y" ||
    normalized === "position_x" ||
    normalized === "position_y" ||
    normalized === "x_coord" ||
    normalized === "y_coord" ||
    normalized === "x_coordinate" ||
    normalized === "y_coordinate" ||
    isTimeKey(normalized) ||
    isPlayerNumberKey(normalized) ||
    isTargetIdKey(normalized)
  );
}

function uniqueNumbers(values: readonly number[]): readonly number[] {
  const seen = new Set<number>();
  const unique: number[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    unique.push(value);
  }

  return unique;
}

function normalizeKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function buildNonEquivalentUnsupported(
  comparisons: readonly LocalReplayComparison[],
  unsupportedMappings: readonly string[]
): readonly string[] {
  return [
    ...comparisons
      .filter((comparison) => comparison.status === "unsupported")
      .map((comparison) =>
        comparison.detail
          ? `${comparison.area} / ${comparison.label}: ${comparison.detail}`
          : `${comparison.area} / ${comparison.label}`
      ),
    ...unsupportedMappings
  ];
}

async function sha256Bytes(value: Uint8Array): Promise<string> {
  const bytes = new ArrayBuffer(value.byteLength);
  new Uint8Array(bytes).set(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readOperationsForCompilation(fullRoot: Record<string, unknown> | undefined): readonly unknown[] {
  if (!fullRoot) {
    return [];
  }

  const operations = requireArray(fullRoot.operations, "parse_rec.operations");
  validateOperationCount(operations.length, "parse_rec.operations");
  return operations;
}

function validateOperationCount(count: number, path: string): void {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new ReplayModelValidationError(`${path} count must be a safe nonnegative integer; received ${count}.`);
  }
  if (count > LOCAL_REPLAY_LIMITS.maxOperations) {
    throw new ReplayModelValidationError(
      `${path} has ${count} operations, above the ` +
        `${LOCAL_REPLAY_LIMITS.maxOperations}-operation local compiler limit.`
    );
  }
}

function validateNormalizedActionCount(count: number, path: string): void {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new ReplayModelValidationError(`${path} count must be a safe nonnegative integer; received ${count}.`);
  }
  if (count > LOCAL_REPLAY_LIMITS.maxNormalizedActions) {
    throw new ReplayModelValidationError(
      `${path} has ${count} actions, above the ` +
        `${LOCAL_REPLAY_LIMITS.maxNormalizedActions}-action local compiler limit.`
    );
  }
}

function validateMapTileCount(widthTiles: number, heightTiles: number, tileCount: number, path: string): number {
  if (!Number.isSafeInteger(tileCount) || tileCount < 0) {
    throw new ReplayModelValidationError(`${path} length must be a safe nonnegative integer; received ${tileCount}.`);
  }
  if (tileCount > LOCAL_REPLAY_LIMITS.maxMapTiles) {
    throw new ReplayModelValidationError(
      `${path} has ${tileCount} tiles, above the ` +
        `${LOCAL_REPLAY_LIMITS.maxMapTiles}-tile local compiler limit.`
    );
  }

  const expectedTileCount = widthTiles * heightTiles;
  if (!Number.isSafeInteger(expectedTileCount) || expectedTileCount > LOCAL_REPLAY_LIMITS.maxMapTiles) {
    throw new ReplayModelValidationError(
      `${path} dimensions ${widthTiles}x${heightTiles} exceed the safe tile-count limit.`
    );
  }
  if (expectedTileCount !== tileCount) {
    throw new ReplayModelValidationError(
      `${path} length ${tileCount} does not match map dimensions ${widthTiles}x${heightTiles}.`
    );
  }

  return tileCount;
}

function requireBoundedPositiveSafeInteger(value: unknown, path: string, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new ReplayModelValidationError(`${path} must be a positive safe integer; received ${String(value)}.`);
  }
  if (value > max) {
    throw new ReplayModelValidationError(`${path} is ${value}, above the local compiler limit of ${max}.`);
  }
  return value;
}

function requireSafeNonnegativeInteger(value: unknown, path: string): number {
  const numberValue = optionalSafeNonnegativeInteger(value);
  if (numberValue === undefined) {
    throw new ReplayModelValidationError(
      `${path} must be a finite safe nonnegative integer; received ${String(value)}.`
    );
  }
  return numberValue;
}

function optionalSafeNonnegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function incrementCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function stageError(stage: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`${stage}: ${detail}`);
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
