import type {
  ArtifactReference,
  CommandParameterValue,
  EvidenceClass,
  ParserReference,
  PlayerDefinition,
  ReplayScenarioV1,
  ScenarioVersions
} from "./model";
import { compareCodePoint } from "./canonical-json";
import type { BrowserCompiledReplayHashContract } from "./canonical-json";

export type LocalReplayCompatibilityStatus = "compatible" | "unsupported" | "corrupt";
export type LocalReplayComparisonStatus = "match" | "mismatch" | "partial" | "unsupported";
export type LocalReplayParserProgressPhase =
  | "hashing"
  | "loading-parser"
  | "validating"
  | "summary"
  | "full-parse"
  | "compiling"
  | "comparing"
  | "done";
export type LocalReplayComparisonArea =
  | "fixture identity"
  | "versions"
  | "players"
  | "map"
  | "duration"
  | "starting objects"
  | "commands"
  | "provenance";

export interface LocalReplayParserIdentity {
  readonly parser: ParserReference;
  readonly wasm: ArtifactReference;
  readonly license: ArtifactReference & {
    readonly name: "MIT";
    readonly sourceUrl: string;
  };
  readonly npm: {
    readonly packageName: "aoe2rec-js";
    readonly version: "0.1.22";
    readonly integrity: string;
    readonly tarballUrl: string;
  };
}

export interface LocalReplayExpectedPlayer {
  readonly playerNumber: number;
  readonly name: string;
  readonly civilizationId?: number;
  readonly colorId?: number;
  readonly profileId?: number;
  readonly team: number;
}

export interface LocalReplayExpectedScenario {
  readonly schemaVersion: "aoe-sim.local-replay-expected.v1";
  readonly scenarioId: string;
  readonly displayName: string;
  readonly replay: ArtifactReference;
  readonly scenarioArtifact: ArtifactReference;
  readonly aocMgzParser: ParserReference;
  readonly ruleset: ArtifactReference;
  readonly durationMs: number;
  readonly versions: ScenarioVersions;
  readonly map: {
    readonly widthTiles: number;
    readonly heightTiles: number;
    readonly sourceMapId?: number;
    readonly name?: string;
    readonly size?: string;
    readonly tileCount: number;
    readonly terrainCounts: Record<string, number>;
    readonly elevationCounts: Record<string, number>;
  };
  readonly players: readonly LocalReplayExpectedPlayer[];
  readonly humanTeamCount: number;
  readonly startingObjects: {
    readonly total: number;
    readonly gaia: number;
    readonly player: number;
  };
  readonly commands: {
    readonly total: number;
    readonly move: number;
    readonly observedIntent: number;
    readonly byScenarioKind: Record<string, number>;
  };
}

export interface LocalReplayFileReference extends ArtifactReference {
  readonly fileName: string;
  readonly localOnly: true;
  readonly lastModifiedUtc?: string;
}

export interface BrowserCompiledReplayV1 {
  readonly schemaVersion: "aoe-sim.browser-compiled-replay.v1";
  readonly contentHashContract: BrowserCompiledReplayHashContract;
  readonly compiler: {
    readonly id: "aoe-sim.browser-local-replay-compiler";
    readonly version: "v1";
    readonly source: "src/replay/aoe2rec-parser.ts";
    readonly deterministicOrdering: "operation-index-then-action-index";
  };
  readonly recording: LocalReplayFileReference;
  readonly parser: LocalReplayParserIdentity;
  readonly localBoundary: {
    readonly bytesStayLocal: true;
    readonly transfer: "File.arrayBuffer -> parser worker -> aoe2rec-js WASM parser -> compact model";
    readonly rawParserObjectsReturned: false;
    readonly selectedReplayJsonFetched: false;
  };
  readonly provenance: {
    readonly replay: LocalReplayFileReference;
    readonly parser: ParserReference;
    readonly wasm: ArtifactReference;
    readonly ruleset: ArtifactReference;
    readonly generatedArtifact: ArtifactReference;
  };
  readonly fixtureOracle: {
    readonly scenarioId: string;
    readonly scenarioArtifact: ArtifactReference;
    readonly replay: ArtifactReference;
    readonly aocMgzParser: ParserReference;
    readonly equivalentFieldParity: readonly LocalReplayComparison[];
    readonly nonEquivalentUnsupported: readonly string[];
  };
  readonly durationMs: number;
  readonly versions: {
    readonly build: number;
    readonly gameString: string;
    readonly saveVersion: number;
    readonly versionMinor: number;
    readonly logVersion?: number;
  };
  readonly replay: {
    readonly timer: number;
    readonly worldTime: number;
    readonly oldTime: number;
    readonly oldWorldTime: number;
    readonly randomSeed: number;
    readonly randomSeed2: number;
    readonly recPlayer: number;
    readonly numPlayers: number;
    readonly nextObjectId?: number;
    readonly nextReusableObjectId?: number;
    readonly postGameWorldTimeMs?: number;
  };
  readonly gameSettings: Aoe2recParsedReplay["summary"]["header"]["gameSettings"];
  readonly teams: readonly BrowserReplayTeam[];
  readonly players: readonly BrowserReplayPlayer[];
  readonly outcome: BrowserReplayOutcome;
  readonly map?: BrowserReplayMap;
  readonly operations: {
    readonly total: number;
    readonly byKind: Record<string, number>;
    readonly firstOperationIndex?: number;
    readonly lastOperationIndex?: number;
  };
  readonly actions: {
    readonly total: number;
    readonly byKind: Record<string, number>;
    readonly byMappedScenarioKind: Record<string, number>;
    readonly byPlayer: readonly BrowserReplayPlayerActionSummary[];
    readonly timeline: readonly BrowserReplayAction[];
    readonly missingTimeCount: number;
    readonly actionsWithActors: number;
    readonly actionsWithTargets: number;
    readonly actionsWithDestinations: number;
    readonly unmappedKinds: readonly string[];
  };
  readonly chat: {
    readonly total: number;
    readonly omittedCount: number;
    readonly truncatedTextCount: number;
    readonly messages: readonly BrowserReplayChatMessage[];
    readonly truncated: boolean;
  };
  readonly unsupportedEvidence: readonly BrowserReplayUnsupportedEvidence[];
}

export type BrowserReplayPlayerResult = "winner" | "loss" | "resigned" | "unknown";

export interface BrowserReplayOutcome {
  readonly completion: {
    readonly complete: boolean;
    readonly evidence: EvidenceClass;
    readonly source: "PostGame.WorldTime" | "unavailable";
    readonly worldTimeMs?: number;
  };
  readonly winnerTeamIds: readonly string[];
}

export interface BrowserReplayTeam {
  readonly id: string;
  readonly winner: boolean;
  readonly playerNumbers: readonly number[];
}

export interface BrowserReplayPlayer {
  readonly id: string;
  readonly playerNumber: number;
  readonly name: string;
  readonly civilizationId: number;
  readonly colorId: number;
  readonly selectedColor: number;
  readonly selectedTeamId: number;
  readonly resolvedTeamId: number;
  readonly profileId: number;
  readonly playerType: number;
  readonly resigned: boolean;
  readonly teamWinner: boolean;
  readonly result: BrowserReplayPlayerResult;
  readonly resultEvidence: EvidenceClass;
  readonly resultSource: "summary-resigned" | "summary-winner-with-postgame" | "postgame-nonwinner" | "unavailable";
}

export interface BrowserReplayMap {
  readonly evidence: EvidenceClass;
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly tileCount: number;
  readonly terrainCounts: Record<string, number>;
  readonly elevationCounts: Record<string, number>;
  readonly tileGrid: {
    readonly encoding: "row-major-terrain-elevation-v1";
    readonly widthTiles: number;
    readonly heightTiles: number;
    readonly terrainIds: readonly number[];
    readonly elevations: readonly number[];
    readonly passability: "unresolved";
  };
}

export interface BrowserReplayActionPoint {
  readonly x: number;
  readonly y: number;
  readonly source: "action-position" | "payload-point" | "wall-end" | "unknown";
  readonly evidence: EvidenceClass;
  readonly isMapCoordinate: boolean;
}

export interface BrowserReplayAction {
  readonly id: string;
  readonly operationIndex: number;
  readonly actionIndex: number;
  readonly sourceSequence: number;
  readonly issuedAtMs?: number;
  readonly playerNumber?: number;
  readonly playerId?: string;
  readonly kind: string;
  readonly mappedScenarioKind?: string;
  readonly selectedIds: readonly number[];
  readonly actorIds: readonly number[];
  readonly targetId?: number;
  readonly destination?: BrowserReplayActionPoint;
  readonly dataIds: Record<string, number>;
  readonly parameters: Record<string, CommandParameterValue>;
  readonly evidence: EvidenceClass;
  readonly unsupported: readonly string[];
}

export interface BrowserReplayPlayerActionSummary {
  readonly playerId: string;
  readonly playerNumber?: number;
  readonly name?: string;
  readonly total: number;
  readonly byKind: Record<string, number>;
  readonly firstActionMs?: number;
  readonly lastActionMs?: number;
  readonly firstOperationIndex: number;
  readonly lastOperationIndex: number;
}

export interface BrowserReplayChatMessage {
  readonly operationIndex: number;
  readonly sourceSequence: number;
  readonly issuedAtMs?: number;
  readonly playerNumber?: number;
  readonly playerId?: string;
  readonly rawText?: string;
  readonly decodedText?: string;
  readonly textSource: "decoded-message" | "raw-parser-text" | "none";
  readonly textTruncated: boolean;
  readonly metadata: Record<string, CommandParameterValue>;
  readonly evidence: EvidenceClass;
}

export interface BrowserReplayUnsupportedEvidence {
  readonly area:
    | "initial objects"
    | "lifetimes"
    | "economy"
    | "actions"
    | "chat"
    | "map"
    | "ruleset"
    | "parser"
    | "provenance";
  readonly evidence: EvidenceClass;
  readonly message: string;
  readonly count?: number;
}

export interface Aoe2recParsedPlayer {
  readonly playerNumber: number;
  readonly name: string;
  readonly civilizationId: number;
  readonly colorId: number;
  readonly selectedColor: number;
  readonly selectedTeamId: number;
  readonly resolvedTeamId: number;
  readonly profileId: number;
  readonly playerType: number;
  readonly resigned: boolean;
}

export interface Aoe2recParsedTeam {
  readonly winner: boolean;
  readonly players: readonly Aoe2recParsedPlayer[];
}

export interface Aoe2recParsedReplay {
  readonly schemaVersion: "aoe-sim.aoe2rec-parse.v1";
  readonly summary: {
    readonly durationMs: number;
    readonly teams: readonly Aoe2recParsedTeam[];
    readonly header: {
      readonly build: number;
      readonly gameString: string;
      readonly timestamp: number;
      readonly saveVersion: number;
      readonly versionMinor: number;
      readonly replay: {
        readonly timer: number;
        readonly worldTime: number;
        readonly oldTime: number;
        readonly oldWorldTime: number;
        readonly randomSeed: number;
        readonly randomSeed2: number;
        readonly numPlayers: number;
        readonly recPlayer: number;
      };
      readonly gameSettings: {
        readonly selectedMapId: number;
        readonly resolvedMapId: number;
        readonly mapSize: number;
        readonly nPlayers: number;
        readonly populationLimit: number;
        readonly startingResourcesId: number;
        readonly startingAgeId: number;
        readonly endingAgeId: number;
        readonly gameType: number;
        readonly difficulty: number;
        readonly moddedDataset: string;
        readonly numStartingUnits: number;
      };
    };
  };
  readonly full?: {
    readonly byteLength: number;
    readonly logVersion?: number;
    readonly operationCount: number;
    readonly operationKindCounts: Record<string, number>;
    readonly actionKindCounts: Record<string, number>;
    readonly mappedScenarioActionKindCounts: Record<string, number>;
    readonly unmappedActionKinds: readonly string[];
    readonly map?: {
      readonly widthTiles?: number;
      readonly heightTiles?: number;
      readonly tileCount?: number;
      readonly terrainCounts: Record<string, number>;
      readonly elevationCounts: Record<string, number>;
    };
    readonly replay?: {
      readonly nextObjectId?: number;
      readonly nextReusableObjectId?: number;
      readonly randomSeed?: number;
      readonly randomSeed2?: number;
    };
    readonly postGameWorldTimeMs?: number;
  };
  readonly fullParseError?: string;
}

export interface LocalReplayComparison {
  readonly area: LocalReplayComparisonArea;
  readonly label: string;
  readonly status: LocalReplayComparisonStatus;
  readonly evidence: EvidenceClass;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface LocalReplayCompatibilityReport {
  readonly schemaVersion: "aoe-sim.local-replay-compatibility.v1";
  readonly status: LocalReplayCompatibilityStatus;
  readonly summary: string;
  readonly recording: LocalReplayFileReference;
  readonly parser: LocalReplayParserIdentity;
  readonly expected: {
    readonly scenarioId: string;
    readonly scenarioArtifact: ArtifactReference;
    readonly replay: ArtifactReference;
    readonly aocMgzParser: ParserReference;
    readonly ruleset: ArtifactReference;
  };
  readonly localBoundary: {
    readonly bytesStayLocal: true;
    readonly transfer: string;
    readonly committedRawReplayBytes: false;
  };
  readonly parsed?: Aoe2recParsedReplay;
  readonly compiled?: BrowserCompiledReplayV1;
  readonly comparisons: readonly LocalReplayComparison[];
  readonly unsupportedMappings: readonly string[];
}

type LocalReplayComparisonInput = Omit<LocalReplayComparison, "expected" | "actual" | "detail"> & {
  readonly expected?: string | undefined;
  readonly actual?: string | undefined;
  readonly detail?: string | undefined;
};

export type LocalReplayParserRequest =
  | {
      readonly type: "parse-local-recording";
      readonly requestId: string;
      readonly fileName: string;
      readonly sizeBytes: number;
      readonly lastModified: number;
      readonly expected: LocalReplayExpectedScenario;
      readonly buffer: ArrayBuffer;
    };

export type LocalReplayParserResponse =
  | {
      readonly type: "local-recording-status";
      readonly requestId: string;
      readonly phase: LocalReplayParserProgressPhase;
      readonly message: string;
    }
  | {
      readonly type: "local-recording-report";
      readonly requestId: string;
      readonly report: LocalReplayCompatibilityReport;
    }
  | {
      readonly type: "local-recording-error";
      readonly requestId?: string;
      readonly message: string;
    };

export const AOE2REC_PARSER_IDENTITY: LocalReplayParserIdentity = {
  parser: {
    id: "aoe2rec-js@0.1.22",
    sha256: "sha256:39c94c55f7a35a689ad496d2562d29eaab676d3c2aa42f002823d2c7ff2cdb1d",
    sizeBytes: 129566,
    project: "aoe2rec",
    distribution: "npm:aoe2rec-js",
    version: "0.1.22",
    commit: "a6b8125c1206aa3b0646fbe3eae436d368640e49",
    sourceUrl: "https://github.com/aoe2ct/aoe2rec.git"
  },
  wasm: {
    id: "aoe2rec_js_bg.wasm",
    sha256: "sha256:cc048829dae76e2e2dbeb90b19271c773b7806345c1192e48adf2663248dd545",
    sizeBytes: 419676
  },
  license: {
    id: "aoe2rec/LICENSE",
    sha256: "sha256:8173d5c29b4f956d532781d2b86e4e30f83e6b7878dce18c919451d6ba707c90",
    sizeBytes: 10850,
    name: "MIT",
    sourceUrl: "https://github.com/aoe2ct/aoe2rec/blob/a6b8125c1206aa3b0646fbe3eae436d368640e49/LICENSE"
  },
  npm: {
    packageName: "aoe2rec-js",
    version: "0.1.22",
    integrity: "sha512-sLu4n5YpDq5UgSjl31VdH+iQ/wn1LTERNJBYkVbLC5ntQzr9AQRBCFjEMi/WKOBWwkOQLWlV7O6yRYMyKSvmxQ==",
    tarballUrl: "https://registry.npmjs.org/aoe2rec-js/-/aoe2rec-js-0.1.22.tgz"
  }
};

const AOE2REC_ACTION_TO_SCENARIO_KIND: Record<string, string> = {
  AttackGround: "ATTACK_GROUND",
  Autoscout: "DE_AUTOSCOUT",
  BackToWork: "BACK_TO_WORK",
  Build: "BUILD",
  Buy: "BUY",
  Delete: "DELETE",
  DeQueue: "DE_QUEUE",
  DeUnknown140: "DE_107_B",
  Formation: "FORMATION",
  Game: "GAME",
  Gatherpoint: "GATHER_POINT",
  Interact: "ORDER",
  Move: "MOVE",
  Order: "SPECIAL",
  Release: "UNGARRISON",
  Research: "RESEARCH",
  Resign: "RESIGN",
  Sell: "SELL",
  Stance: "STANCE",
  Stop: "STOP",
  ToggleGate: "GATE",
  Transform: "DE_TRANSFORM",
  Unknown45: "DE_MULTI_GATHERPOINT",
  Wall: "WALL"
};

export function buildLocalReplayExpectedScenario(scenario: ReplayScenarioV1): LocalReplayExpectedScenario {
  const humanPlayers = scenario.players
    .filter((player) => player.playerNumber !== undefined && player.playerNumber > 0)
    .map(readExpectedPlayer)
    .sort((left, right) => left.playerNumber - right.playerNumber);
  const humanPlayerIds = new Set(humanPlayers.map((player) => `p${player.playerNumber}`));
  const humanTeamCount = scenario.teams.filter((team) =>
    team.playerIds.some((playerId) => humanPlayerIds.has(playerId))
  ).length;
  const terrainCounts = countNumbers(scenario.map.tileGrid?.terrainIds ?? []);
  const elevationCounts = countNumbers(scenario.map.tileGrid?.elevations ?? []);
  const gaiaObjects = scenario.entities.filter((entity) => entity.playerId === "gaia").length;
  const moveCommands = scenario.commands.filter((command) => command.kind === "move").length;
  const observedIntentCommands = scenario.commands.filter((command) => command.kind === "observed-intent").length;

  return dropUndefined({
    schemaVersion: "aoe-sim.local-replay-expected.v1" as const,
    scenarioId: scenario.scenarioId,
    displayName: scenario.displayName,
    replay: scenario.provenance.replay,
    scenarioArtifact: scenario.provenance.generatedArtifact,
    aocMgzParser: scenario.provenance.parser,
    ruleset: scenario.provenance.ruleset,
    durationMs: scenario.durationMs,
    versions: scenario.versions,
    map: dropUndefined({
      widthTiles: scenario.map.widthTiles,
      heightTiles: scenario.map.heightTiles,
      sourceMapId: scenario.map.sourceMapId,
      name: scenario.map.name,
      size: scenario.map.size,
      tileCount: scenario.map.widthTiles * scenario.map.heightTiles,
      terrainCounts,
      elevationCounts
    }),
    players: humanPlayers,
    humanTeamCount,
    startingObjects: {
      total: scenario.entities.length,
      gaia: gaiaObjects,
      player: scenario.entities.length - gaiaObjects
    },
    commands: {
      total: scenario.commands.length,
      move: moveCommands,
      observedIntent: observedIntentCommands,
      byScenarioKind: sortNumberRecord(scenario.unsupported.commandKinds)
    }
  }) as LocalReplayExpectedScenario;
}

export function mapAoe2recActionKindCounts(actionKindCounts: Record<string, number>): {
  readonly mappedScenarioActionKindCounts: Record<string, number>;
  readonly unmappedActionKinds: readonly string[];
} {
  const mapped = createNullRecord<number>();
  const unmapped: string[] = [];

  for (const [aoe2recKind, count] of Object.entries(actionKindCounts)) {
    const scenarioKind = AOE2REC_ACTION_TO_SCENARIO_KIND[aoe2recKind];
    if (!scenarioKind) {
      unmapped.push(aoe2recKind);
      continue;
    }
    mapped[scenarioKind] = (mapped[scenarioKind] ?? 0) + count;
  }

  return {
    mappedScenarioActionKindCounts: sortNumberRecord(mapped),
    unmappedActionKinds: unmapped.sort(compareCodePoint)
  };
}

export function mapAoe2recActionKind(actionKind: string): string | undefined {
  return AOE2REC_ACTION_TO_SCENARIO_KIND[actionKind];
}

export function buildLocalReplayCompatibilityReport(
  recording: LocalReplayFileReference,
  expected: LocalReplayExpectedScenario,
  parsed: Aoe2recParsedReplay,
  compiled?: BrowserCompiledReplayV1
): LocalReplayCompatibilityReport {
  const comparisons = buildComparisons(recording, expected, parsed);
  const unsupportedMappings = buildUnsupportedMappings(parsed);
  const hardMismatch = comparisons.some((comparison) => comparison.status === "mismatch");
  const status: LocalReplayCompatibilityStatus = hardMismatch || parsed.fullParseError ? "unsupported" : "compatible";
  const summary =
    status === "compatible"
      ? "Compatible with the validated Glade fixture contract for equivalent parser fields; object tables and " +
        "simulation import remain unsupported."
      : "Parsed by the pinned aoe2rec WASM package, but it does not match the validated fixture contract.";

  return baseReport(recording, expected, status, summary, comparisons, unsupportedMappings, parsed, compiled);
}

export function buildCorruptLocalReplayReport(
  recording: LocalReplayFileReference,
  expected: LocalReplayExpectedScenario,
  error: unknown
): LocalReplayCompatibilityReport {
  const message = normalizeParserError(error);
  const comparisons: LocalReplayComparison[] = [
    comparison({
      area: "fixture identity",
      label: "recording sha256",
      status: sameSha(recording.sha256, expected.replay.sha256) ? "match" : "mismatch",
      evidence: sameSha(recording.sha256, expected.replay.sha256) ? "reconciled" : "observed",
      expected: expected.replay.sha256,
      actual: recording.sha256
    }),
    comparison({
      area: "provenance",
      label: "aoe2rec parse",
      status: "unsupported",
      evidence: "observed",
      detail: message
    })
  ];

  return baseReport(
    recording,
    expected,
    "corrupt",
    "The pinned aoe2rec WASM parser rejected this recording before a usable replay summary was produced.",
    comparisons,
    [
      `Parser error: ${message}`,
      "No simulation state was initialized from this file.",
      "The selected bytes stayed inside the browser and parser worker boundary."
    ]
  );
}

export function createNullRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

export function sortNumberRecord(input: Record<string, number>): Record<string, number> {
  const output = createNullRecord<number>();
  for (const [key, value] of Object.entries(input).sort(([left], [right]) => compareCodePoint(left, right))) {
    output[key] = value;
  }
  return output;
}

function buildComparisons(
  recording: LocalReplayFileReference,
  expected: LocalReplayExpectedScenario,
  parsed: Aoe2recParsedReplay
): LocalReplayComparison[] {
  const summary = parsed.summary;
  const full = parsed.full;
  const actualPlayers = summary.teams.flatMap((team) => team.players);
  const fullMap = full?.map;
  const nextObjectId = full?.replay?.nextObjectId;
  const actionCount = full?.operationKindCounts.Action;
  const moveCount = full?.actionKindCounts.Move;

  return [
    comparison({
      area: "fixture identity",
      label: "recording sha256",
      status: sameSha(recording.sha256, expected.replay.sha256) ? "match" : "mismatch",
      evidence: sameSha(recording.sha256, expected.replay.sha256) ? "reconciled" : "observed",
      expected: expected.replay.sha256,
      actual: recording.sha256
    }),
    comparison({
      area: "fixture identity",
      label: "recording size",
      status: recording.sizeBytes === expected.replay.sizeBytes ? "match" : "mismatch",
      evidence: recording.sizeBytes === expected.replay.sizeBytes ? "reconciled" : "observed",
      expected: formatNumber(expected.replay.sizeBytes),
      actual: formatNumber(recording.sizeBytes)
    }),
    comparison({
      area: "versions",
      label: "build",
      status: sameNumber(summary.header.build, expected.versions.buildVersion) ? "match" : "mismatch",
      evidence: sameNumber(summary.header.build, expected.versions.buildVersion) ? "reconciled" : "observed",
      expected: formatNumber(expected.versions.buildVersion),
      actual: formatNumber(summary.header.build)
    }),
    comparison({
      area: "versions",
      label: "game string",
      status: summary.header.gameString === expected.versions.gameVersion ? "match" : "mismatch",
      evidence: summary.header.gameString === expected.versions.gameVersion ? "reconciled" : "observed",
      expected: expected.versions.gameVersion,
      actual: summary.header.gameString
    }),
    comparison({
      area: "versions",
      label: "save version",
      status: sameNumber(summary.header.saveVersion, expected.versions.saveVersion) ? "match" : "mismatch",
      evidence: sameNumber(summary.header.saveVersion, expected.versions.saveVersion) ? "reconciled" : "observed",
      expected: formatNumber(expected.versions.saveVersion),
      actual: formatNumber(summary.header.saveVersion)
    }),
    full?.logVersion === undefined
      ? unsupportedComparison("versions", "log version", "parse_rec did not expose a numeric log version.")
      : comparison({
          area: "versions",
          label: "log version",
          status: sameNumber(full.logVersion, expected.versions.logVersion) ? "match" : "mismatch",
          evidence: sameNumber(full.logVersion, expected.versions.logVersion) ? "reconciled" : "observed",
          expected: formatNumber(expected.versions.logVersion),
          actual: formatNumber(full.logVersion)
        }),
    comparison({
      area: "duration",
      label: "summary duration",
      status: summary.durationMs === expected.durationMs ? "match" : "mismatch",
      evidence: summary.durationMs === expected.durationMs ? "reconciled" : "observed",
      expected: formatNumber(expected.durationMs),
      actual: formatNumber(summary.durationMs)
    }),
    full?.postGameWorldTimeMs === undefined
      ? unsupportedComparison("duration", "post-game world time", "No WorldTime post-game block was exposed.")
      : comparison({
          area: "duration",
          label: "post-game world time",
          status: full.postGameWorldTimeMs === expected.durationMs ? "match" : "mismatch",
          evidence: full.postGameWorldTimeMs === expected.durationMs ? "reconciled" : "observed",
          expected: formatNumber(expected.durationMs),
          actual: formatNumber(full.postGameWorldTimeMs)
        }),
    comparison({
      area: "players",
      label: "human player count",
      status: summary.header.gameSettings.nPlayers === expected.players.length ? "match" : "mismatch",
      evidence: summary.header.gameSettings.nPlayers === expected.players.length ? "reconciled" : "observed",
      expected: formatNumber(expected.players.length),
      actual: formatNumber(summary.header.gameSettings.nPlayers)
    }),
    comparison({
      area: "players",
      label: "human team count",
      status: summary.teams.length === expected.humanTeamCount ? "match" : "mismatch",
      evidence: summary.teams.length === expected.humanTeamCount ? "reconciled" : "observed",
      expected: formatNumber(expected.humanTeamCount),
      actual: formatNumber(summary.teams.length),
      detail: "Team membership cardinality is compared; raw team ID namespaces differ between parsers."
    }),
    ...expected.players.flatMap((player) => comparePlayer(player, actualPlayers)),
    comparison({
      area: "map",
      label: "resolved map id",
      status: sameNumber(summary.header.gameSettings.resolvedMapId, expected.map.sourceMapId)
        ? "match"
        : "mismatch",
      evidence: sameNumber(summary.header.gameSettings.resolvedMapId, expected.map.sourceMapId)
        ? "reconciled"
        : "observed",
      expected: formatNumber(expected.map.sourceMapId),
      actual: formatNumber(summary.header.gameSettings.resolvedMapId),
      detail: expected.map.name ? `Committed scenario names this map ${expected.map.name}.` : undefined
    }),
    comparison({
      area: "map",
      label: "map size",
      status:
        summary.header.gameSettings.mapSize === expected.map.widthTiles &&
        summary.header.gameSettings.mapSize === expected.map.heightTiles
          ? "match"
          : "mismatch",
      evidence:
        summary.header.gameSettings.mapSize === expected.map.widthTiles &&
        summary.header.gameSettings.mapSize === expected.map.heightTiles
          ? "reconciled"
          : "observed",
      expected: `${expected.map.widthTiles}x${expected.map.heightTiles}`,
      actual: `${summary.header.gameSettings.mapSize}x${summary.header.gameSettings.mapSize}`
    }),
    fullMap?.tileCount === undefined
      ? unsupportedComparison("map", "map tile count", "parse_rec did not expose map tile rows.")
      : comparison({
          area: "map",
          label: "map tile count",
          status: fullMap.tileCount === expected.map.tileCount ? "match" : "mismatch",
          evidence: fullMap.tileCount === expected.map.tileCount ? "reconciled" : "observed",
          expected: formatNumber(expected.map.tileCount),
          actual: formatNumber(fullMap.tileCount)
        }),
    fullMap
      ? comparison({
          area: "map",
          label: "terrain counts",
          status: recordsEqual(fullMap.terrainCounts, expected.map.terrainCounts) ? "match" : "mismatch",
          evidence: recordsEqual(fullMap.terrainCounts, expected.map.terrainCounts) ? "reconciled" : "observed",
          expected: formatRecord(expected.map.terrainCounts),
          actual: formatRecord(fullMap.terrainCounts)
        })
      : unsupportedComparison("map", "terrain counts", "parse_rec did not expose terrain ids."),
    fullMap
      ? comparison({
          area: "map",
          label: "elevation counts",
          status: recordsEqual(fullMap.elevationCounts, expected.map.elevationCounts) ? "match" : "mismatch",
          evidence: recordsEqual(fullMap.elevationCounts, expected.map.elevationCounts) ? "reconciled" : "observed",
          expected: formatRecord(expected.map.elevationCounts),
          actual: formatRecord(fullMap.elevationCounts)
        })
      : unsupportedComparison("map", "elevation counts", "parse_rec did not expose elevation ids."),
    nextObjectId === undefined
      ? unsupportedComparison("starting objects", "starting object count", "aoe2rec-js does not expose object tables.")
      : comparison({
          area: "starting objects",
          label: "next_object_id proxy",
          status: nextObjectId === expected.startingObjects.total ? "partial" : "mismatch",
          evidence: nextObjectId === expected.startingObjects.total ? "reconciled" : "observed",
          expected: formatNumber(expected.startingObjects.total),
          actual: formatNumber(nextObjectId),
          detail:
            "This only reconciles a contiguous-ID proxy. Per-object owners, data IDs, HP, and positions remain " +
            "unsupported."
        }),
    unsupportedComparison(
      "starting objects",
      "gaia/player split",
      "Committed scenario has " +
        `${expected.startingObjects.gaia} Gaia and ${expected.startingObjects.player} player objects; ` +
        "aoe2rec-js 0.1.22 did not expose that table."
    ),
    actionCount === undefined
      ? unsupportedComparison("commands", "action count", "parse_rec did not expose operations.")
      : comparison({
          area: "commands",
          label: "action count",
          status: actionCount === expected.commands.total ? "match" : "mismatch",
          evidence: actionCount === expected.commands.total ? "reconciled" : "observed",
          expected: formatNumber(expected.commands.total),
          actual: formatNumber(actionCount)
        }),
    moveCount === undefined
      ? unsupportedComparison("commands", "move action count", "parse_rec did not expose Move actions.")
      : comparison({
          area: "commands",
          label: "move action count",
          status: moveCount === expected.commands.move ? "match" : "mismatch",
          evidence: moveCount === expected.commands.move ? "reconciled" : "observed",
          expected: formatNumber(expected.commands.move),
          actual: formatNumber(moveCount)
        }),
    full
      ? comparison({
          area: "commands",
          label: "mapped action kind counts",
          status: recordsEqual(full.mappedScenarioActionKindCounts, expected.commands.byScenarioKind)
            ? "match"
            : "mismatch",
          evidence: recordsEqual(full.mappedScenarioActionKindCounts, expected.commands.byScenarioKind)
            ? "reconciled"
            : "observed",
          expected: formatRecord(expected.commands.byScenarioKind),
          actual: formatRecord(full.mappedScenarioActionKindCounts),
          detail: full.unmappedActionKinds.length
            ? `Unmapped aoe2rec action kinds: ${full.unmappedActionKinds.join(", ")}.`
            : "aoe2rec action names are mapped to the committed aoc-mgz action vocabulary for counts only."
        })
      : unsupportedComparison("commands", "action kind counts", "Full parse failed before action kinds were available.")
  ];
}

function comparePlayer(
  expected: LocalReplayExpectedPlayer,
  actualPlayers: readonly Aoe2recParsedPlayer[]
): LocalReplayComparison[] {
  const actual = actualPlayers.find((player) => player.playerNumber === expected.playerNumber);
  if (!actual) {
    return [
      comparison({
        area: "players",
        label: `p${expected.playerNumber}`,
        status: "mismatch",
        evidence: "observed",
        expected: expected.name,
        actual: "missing"
      })
    ];
  }

  return [
    comparison({
      area: "players",
      label: `p${expected.playerNumber} identity`,
      status: actual.name === expected.name && actual.profileId === expected.profileId ? "match" : "mismatch",
      evidence: actual.name === expected.name && actual.profileId === expected.profileId ? "reconciled" : "observed",
      expected: `${expected.name} / ${formatNumber(expected.profileId)}`,
      actual: `${actual.name} / ${actual.profileId}`
    }),
    comparison({
      area: "players",
      label: `p${expected.playerNumber} civ/color`,
      status: actual.civilizationId === expected.civilizationId && actual.colorId === expected.colorId
        ? "match"
        : "mismatch",
      evidence: actual.civilizationId === expected.civilizationId && actual.colorId === expected.colorId
        ? "reconciled"
        : "observed",
      expected: `civ ${formatNumber(expected.civilizationId)}, color ${formatNumber(expected.colorId)}`,
      actual: `civ ${actual.civilizationId}, color ${actual.colorId}`
    })
  ];
}

function buildUnsupportedMappings(parsed: Aoe2recParsedReplay): string[] {
  const unsupported = [
    "Direct browser parsing is a compatibility/provenance report only; it does not initialize simulation world state.",
    "Raw recording bytes stay local and raw parser objects are not returned. Derived output/export can include " +
      "player names/profile IDs, terrain/elevation arrays, action object IDs/coordinates/scalars, and bounded " +
      "chat text.",
    "aoe2rec-js 0.1.22 exposes map ID/size/tile arrays, but not the localized map name or size label.",
    "aoe2rec-js 0.1.22 did not expose per-object starting owner, data ID, HP, and position tables through this JS API.",
    "Command payloads are normalized for the browser dataview only; they are not imported into ReplayScenarioV1 " +
      "or SimulationEngine.",
    "Sync, Viewlock, Chat, and PostGame operations are shown as parser operations, not simulation commands.",
    "Replay random seeds are reported as parser header facts and remain distinct from ruleset/DAT provenance."
  ];

  if (parsed.fullParseError) {
    unsupported.push(`Full parse unavailable after summary parse: ${parsed.fullParseError}`);
  }
  if (parsed.full?.unmappedActionKinds.length) {
    unsupported.push(`Unmapped aoe2rec action kinds: ${parsed.full.unmappedActionKinds.join(", ")}.`);
  }

  return unsupported;
}

function baseReport(
  recording: LocalReplayFileReference,
  expected: LocalReplayExpectedScenario,
  status: LocalReplayCompatibilityStatus,
  summary: string,
  comparisons: readonly LocalReplayComparison[],
  unsupportedMappings: readonly string[],
  parsed?: Aoe2recParsedReplay,
  compiled?: BrowserCompiledReplayV1
): LocalReplayCompatibilityReport {
  return dropUndefined({
    schemaVersion: "aoe-sim.local-replay-compatibility.v1" as const,
    status,
    summary,
    recording,
    parser: AOE2REC_PARSER_IDENTITY,
    expected: {
      scenarioId: expected.scenarioId,
      scenarioArtifact: expected.scenarioArtifact,
      replay: expected.replay,
      aocMgzParser: expected.aocMgzParser,
      ruleset: expected.ruleset
    },
    localBoundary: {
      bytesStayLocal: true as const,
      transfer: "File.arrayBuffer -> dedicated module worker -> aoe2rec-js WASM parser",
      committedRawReplayBytes: false as const
    },
    parsed,
    compiled,
    comparisons,
    unsupportedMappings
  }) as LocalReplayCompatibilityReport;
}

function readExpectedPlayer(player: PlayerDefinition): LocalReplayExpectedPlayer {
  return dropUndefined({
    playerNumber: player.playerNumber ?? 0,
    name: player.name,
    civilizationId: player.civilizationId,
    colorId: player.colorId,
    profileId: player.profileId,
    team: player.team
  }) as LocalReplayExpectedPlayer;
}

function unsupportedComparison(
  area: LocalReplayComparisonArea,
  label: string,
  detail: string
): LocalReplayComparison {
  return comparison({
    area,
    label,
    status: "unsupported",
    evidence: "observed",
    detail
  });
}

function comparison(value: LocalReplayComparisonInput): LocalReplayComparison {
  return dropUndefined(value as unknown as Record<string, unknown>) as unknown as LocalReplayComparison;
}

function countNumbers(values: readonly number[]): Record<string, number> {
  const counts = createNullRecord<number>();
  for (const value of values) {
    counts[String(value)] = (counts[String(value)] ?? 0) + 1;
  }

  return sortNumberRecord(counts);
}

function recordsEqual(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftKeys = Object.keys(left).sort(compareCodePoint);
  const rightKeys = Object.keys(right).sort(compareCodePoint);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

function sameSha(left: string, right: string): boolean {
  return left.replace(/^sha256:/, "") === right.replace(/^sha256:/, "");
}

function sameNumber(left: number | undefined, right: number | undefined): boolean {
  return left !== undefined && right !== undefined && left === right;
}

function formatNumber(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function formatRecord(value: Record<string, number>): string {
  return Object.entries(sortNumberRecord(value))
    .map(([key, count]) => `${key}:${count}`)
    .join(", ");
}

function normalizeParserError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message === "unreachable"
    ? "aoe2rec-js rejected the recording while decoding; the file may be corrupt or outside the supported DE " +
        "savegame format."
    : message;
}

function dropUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) {
      delete value[key];
    }
  }

  return value;
}
