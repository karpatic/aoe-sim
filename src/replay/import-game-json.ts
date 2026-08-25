import type {
  ArtifactReference,
  CommandDestination,
  CommandParameterValue,
  EvidenceClass,
  EvidencePoint,
  InitialEntity,
  JsonRecord,
  MapBounds,
  MapTileGrid,
  MoveCommand,
  ObservedIntentCommand,
  ParserReference,
  PlayerDefinition,
  ReplayCommand,
  ReplayScenarioV1,
  RulesetTerrain,
  RulesetUnit,
  RulesetV1,
  ScenarioProvenance,
  ScenarioUnsupported,
  ScenarioVersions,
  TeamDefinition
} from "./model";

const evidenceClasses = new Set<EvidenceClass>(["observed", "simulated", "reconciled"]);
const unitTokens = new Set<RulesetUnit["token"]>(["scout", "villager", "marker", "resource"]);

export function assertReplayScenarioV1(value: unknown): ReplayScenarioV1 {
  const root = requireRecord(value, "scenario");
  requireLiteral(root.schemaVersion, "aoe-sim.scenario.v1", "scenario.schemaVersion");

  const scenario: ReplayScenarioV1 = {
    schemaVersion: "aoe-sim.scenario.v1",
    scenarioId: requireString(root.scenarioId, "scenario.scenarioId"),
    displayName: requireString(root.displayName, "scenario.displayName"),
    durationMs: requireNonNegativeInteger(root.durationMs, "scenario.durationMs"),
    versions: readVersions(root.versions, "scenario.versions"),
    map: readMap(root.map, "scenario.map"),
    players: readArray(root.players, "scenario.players", readPlayer),
    teams: readArray(root.teams, "scenario.teams", readTeam),
    entities: readArray(root.entities, "scenario.entities", readEntity),
    commands: readArray(root.commands, "scenario.commands", readCommand),
    randomSeeds: readArray(root.randomSeeds, "scenario.randomSeeds", (item, path) =>
      requireInteger(item, path)
    ),
    unsupported: readUnsupported(root.unsupported, "scenario.unsupported"),
    provenance: readScenarioProvenance(root.provenance, "scenario.provenance")
  };

  validateScenarioReferences(scenario);
  return scenario;
}

export function assertRulesetV1(value: unknown): RulesetV1 {
  const root = requireRecord(value, "ruleset");
  requireLiteral(root.schemaVersion, "aoe-sim.ruleset.v1", "ruleset.schemaVersion");

  return dropUndefined({
    schemaVersion: "aoe-sim.ruleset.v1",
    rulesetId: requireString(root.rulesetId, "ruleset.rulesetId"),
    displayName: optionalString(root.displayName, "ruleset.displayName"),
    sourceBuild: requireString(root.sourceBuild, "ruleset.sourceBuild"),
    datVersion: optionalString(root.datVersion, "ruleset.datVersion"),
    fidelity: root.fidelity === undefined ? undefined : readFidelity(root.fidelity, "ruleset.fidelity"),
    fixedPointScale: requirePositiveNumber(root.fixedPointScale, "ruleset.fixedPointScale"),
    stepMs: requirePositiveInteger(root.stepMs, "ruleset.stepMs"),
    terrain: readArray(root.terrain, "ruleset.terrain", readTerrain),
    units: readArray(root.units, "ruleset.units", readUnit),
    diagnostics:
      root.diagnostics === undefined ? undefined : readRulesetDiagnostics(root.diagnostics, "ruleset.diagnostics"),
    provenance: readRulesetProvenance(root.provenance, "ruleset.provenance")
  }) as RulesetV1;
}

function readMap(value: unknown, path: string): MapBounds {
  const record = requireRecord(value, path);
  const widthTiles = requirePositiveInteger(record.widthTiles, `${path}.widthTiles`);
  const heightTiles = requirePositiveInteger(record.heightTiles, `${path}.heightTiles`);
  const tileGrid = record.tileGrid === undefined ? undefined : readTileGrid(record.tileGrid, `${path}.tileGrid`);

  if (tileGrid && (tileGrid.widthTiles !== widthTiles || tileGrid.heightTiles !== heightTiles)) {
    throw new Error(`${path}.tileGrid dimensions do not match map bounds`);
  }

  return dropUndefined({
    widthTiles,
    heightTiles,
    sourceMapId: optionalInteger(record.sourceMapId, `${path}.sourceMapId`),
    name: optionalString(record.name, `${path}.name`),
    size: optionalString(record.size, `${path}.size`),
    tileGrid
  }) as MapBounds;
}

function readTileGrid(value: unknown, path: string): MapTileGrid {
  const record = requireRecord(value, path);
  requireLiteral(record.encoding, "row-major-terrain-elevation-v1", `${path}.encoding`);

  const widthTiles = requirePositiveInteger(record.widthTiles, `${path}.widthTiles`);
  const heightTiles = requirePositiveInteger(record.heightTiles, `${path}.heightTiles`);
  const tileCount = widthTiles * heightTiles;
  const terrainIds = readArray(record.terrainIds, `${path}.terrainIds`, requireNonNegativeInteger);
  const elevations = readArray(record.elevations, `${path}.elevations`, requireInteger);
  requireLiteral(record.passability, "unresolved", `${path}.passability`);

  if (terrainIds.length !== tileCount || elevations.length !== tileCount) {
    throw new Error(`${path} arrays must contain exactly ${tileCount} row-major tiles`);
  }

  return {
    encoding: "row-major-terrain-elevation-v1",
    widthTiles,
    heightTiles,
    terrainIds,
    elevations,
    passability: "unresolved"
  };
}

function readPlayer(value: unknown, path: string): PlayerDefinition {
  const record = requireRecord(value, path);
  const startPosition =
    record.startPosition === undefined ? undefined : readPoint(record.startPosition, `${path}.startPosition`);

  return dropUndefined({
    id: requireString(record.id, `${path}.id`),
    name: requireString(record.name, `${path}.name`),
    team: requireInteger(record.team, `${path}.team`),
    color: requireString(record.color, `${path}.color`),
    playerNumber: optionalInteger(record.playerNumber, `${path}.playerNumber`),
    colorId: optionalInteger(record.colorId, `${path}.colorId`),
    civilization: optionalString(record.civilization, `${path}.civilization`),
    civilizationId: optionalInteger(record.civilizationId, `${path}.civilizationId`),
    profileId: optionalInteger(record.profileId, `${path}.profileId`),
    startPosition
  }) as PlayerDefinition;
}

function readTeam(value: unknown, path: string): TeamDefinition {
  const record = requireRecord(value, path);
  return {
    id: requireString(record.id, `${path}.id`),
    playerIds: readArray(record.playerIds, `${path}.playerIds`, requireString),
    sourceTeamIds: readArray(record.sourceTeamIds, `${path}.sourceTeamIds`, requireInteger)
  };
}

function readEntity(value: unknown, path: string): InitialEntity {
  const record = requireRecord(value, path);
  const hp = record.hp === null ? null : requirePositiveNumber(record.hp, `${path}.hp`);

  return dropUndefined({
    id: requireString(record.id, `${path}.id`),
    kind: requireString(record.kind, `${path}.kind`),
    playerId: requireString(record.playerId, `${path}.playerId`),
    hp,
    position: readEvidencePoint(record.position, `${path}.position`),
    evidence: readEvidence(record.evidence, `${path}.evidence`),
    dataId: optionalInteger(record.dataId, `${path}.dataId`),
    classId: optionalInteger(record.classId, `${path}.classId`),
    sourceInstanceId: optionalInteger(record.sourceInstanceId, `${path}.sourceInstanceId`),
    sourceIndex: optionalInteger(record.sourceIndex, `${path}.sourceIndex`),
    label: optionalString(record.label, `${path}.label`)
  }) as InitialEntity;
}

function readCommand(value: unknown, path: string): ReplayCommand {
  const record = requireRecord(value, path);
  const base = {
    id: requireString(record.id, `${path}.id`),
    issuedAtMs: requireNonNegativeInteger(record.issuedAtMs, `${path}.issuedAtMs`),
    sourceSequence: requireInteger(record.sourceSequence, `${path}.sourceSequence`),
    sourceIndex: optionalInteger(record.sourceIndex, `${path}.sourceIndex`),
    playerId: optionalString(record.playerId, `${path}.playerId`),
    actorIds: readArray(record.actorIds, `${path}.actorIds`, requireString),
    sourceActorIds:
      record.sourceActorIds === undefined
        ? undefined
        : readArray(record.sourceActorIds, `${path}.sourceActorIds`, requireInteger),
    evidence: readEvidence(record.evidence, `${path}.evidence`),
    rawKind: optionalString(record.rawKind, `${path}.rawKind`)
  };

  if (record.kind === "move") {
    const command: MoveCommand = {
      ...(dropUndefined(base) as Omit<MoveCommand, "kind" | "intentDestination">),
      kind: "move",
      intentDestination: readPoint(record.intentDestination, `${path}.intentDestination`)
    };
    return command;
  }

  if (record.kind === "observed-intent") {
    const command: ObservedIntentCommand = dropUndefined({
      ...base,
      kind: "observed-intent" as const,
      rawKind: requireString(record.rawKind, `${path}.rawKind`),
      targetId: optionalString(record.targetId, `${path}.targetId`),
      sourceTargetId: optionalInteger(record.sourceTargetId, `${path}.sourceTargetId`),
      destination:
        record.destination === undefined ? undefined : readDestination(record.destination, `${path}.destination`),
      parameters: record.parameters === undefined ? undefined : readParameters(record.parameters, `${path}.parameters`)
    }) as ObservedIntentCommand;
    return command;
  }

  throw new Error(`${path}.kind is not a supported scenario command kind`);
}

function readDestination(value: unknown, path: string): CommandDestination {
  const record = requireRecord(value, path);
  const source = record.source;
  if (source !== "point" && source !== "wall-end") {
    throw new Error(`${path}.source must be point or wall-end`);
  }

  return {
    x: requireNumber(record.x, `${path}.x`),
    y: requireNumber(record.y, `${path}.y`),
    source,
    evidence: readEvidence(record.evidence, `${path}.evidence`),
    isMapCoordinate: requireBoolean(record.isMapCoordinate, `${path}.isMapCoordinate`)
  };
}

function readParameters(value: unknown, path: string): Record<string, CommandParameterValue> {
  const record = requireRecord(value, path);
  const parameters: Record<string, CommandParameterValue> = {};

  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") {
      throw new Error(`${path}.${key} must be a string, number, or boolean`);
    }
    parameters[key] = item;
  }

  return parameters;
}

function readVersions(value: unknown, path: string): ScenarioVersions {
  const record = requireRecord(value, path);
  return dropUndefined({
    replayVersion: optionalString(record.replayVersion, `${path}.replayVersion`),
    gameVersion: optionalString(record.gameVersion, `${path}.gameVersion`),
    saveVersion: optionalInteger(record.saveVersion, `${path}.saveVersion`),
    logVersion: optionalInteger(record.logVersion, `${path}.logVersion`),
    buildVersion: optionalInteger(record.buildVersion, `${path}.buildVersion`),
    dataset: optionalString(record.dataset, `${path}.dataset`),
    datasetId: optionalInteger(record.datasetId, `${path}.datasetId`)
  }) as ScenarioVersions;
}

function readUnsupported(value: unknown, path: string): ScenarioUnsupported {
  const record = requireRecord(value, path);
  return {
    commandKinds: readNumberRecord(record.commandKinds, `${path}.commandKinds`),
    commandCount: requireNonNegativeInteger(record.commandCount, `${path}.commandCount`),
    implementedCommandKinds: readArray(
      record.implementedCommandKinds,
      `${path}.implementedCommandKinds`,
      requireString
    ),
    unresolved: readArray(record.unresolved, `${path}.unresolved`, requireString)
  };
}

function readScenarioProvenance(value: unknown, path: string): ScenarioProvenance {
  const record = requireRecord(value, path);
  return {
    replay: readArtifact(record.replay, `${path}.replay`),
    gameJson: readArtifact(record.gameJson, `${path}.gameJson`),
    parser: readParser(record.parser, `${path}.parser`),
    ruleset: readArtifact(record.ruleset, `${path}.ruleset`),
    importer: readArtifact(record.importer, `${path}.importer`),
    generatedArtifact: readArtifact(record.generatedArtifact, `${path}.generatedArtifact`)
  };
}

function readRulesetProvenance(value: unknown, path: string): RulesetV1["provenance"] {
  const record = requireRecord(value, path);
  return dropUndefined({
    dat: readArtifact(record.dat, `${path}.dat`),
    localization:
      record.localization === undefined ? undefined : readArtifact(record.localization, `${path}.localization`),
    appmanifest:
      record.appmanifest === undefined
        ? undefined
        : readAppmanifestArtifact(record.appmanifest, `${path}.appmanifest`),
    parser: record.parser === undefined ? undefined : readParser(record.parser, `${path}.parser`),
    extractor: readArtifact(record.extractor, `${path}.extractor`)
  }) as RulesetV1["provenance"];
}

function readArtifact(value: unknown, path: string): ArtifactReference {
  const record = requireRecord(value, path);
  return dropUndefined({
    id: requireString(record.id, `${path}.id`),
    sha256: requireString(record.sha256, `${path}.sha256`),
    sizeBytes: optionalNonNegativeInteger(record.sizeBytes, `${path}.sizeBytes`)
  }) as ArtifactReference;
}

function readParser(value: unknown, path: string): ParserReference {
  const record = requireRecord(value, path);
  return dropUndefined({
    ...readArtifact(record, path),
    project: optionalString(record.project, `${path}.project`),
    distribution: optionalString(record.distribution, `${path}.distribution`),
    version: optionalString(record.version, `${path}.version`),
    commit: optionalString(record.commit, `${path}.commit`),
    sourceUrl: optionalString(record.sourceUrl, `${path}.sourceUrl`),
    aocrefVersion: optionalString(record.aocrefVersion, `${path}.aocrefVersion`)
  }) as ParserReference;
}

function readAppmanifestArtifact(value: unknown, path: string): RulesetV1["provenance"]["appmanifest"] {
  const record = requireRecord(value, path);
  return dropUndefined({
    ...readArtifact(record, path),
    steamAppId: optionalStringOrNumber(record.steamAppId, `${path}.steamAppId`),
    steamBuildId: optionalString(record.steamBuildId, `${path}.steamBuildId`),
    steamLastUpdatedUnix: optionalStringOrNumber(record.steamLastUpdatedUnix, `${path}.steamLastUpdatedUnix`),
    mtimeUtc: optionalString(record.mtimeUtc, `${path}.mtimeUtc`)
  }) as RulesetV1["provenance"]["appmanifest"];
}

function readFidelity(value: unknown, path: string): RulesetV1["fidelity"] {
  const record = requireRecord(value, path);
  const status = requireString(record.status, `${path}.status`);
  if (status !== "exact-build" && status !== "mapped-build" && status !== "current-rules-approximation") {
    throw new Error(`${path}.status is not a supported fidelity status`);
  }

  return dropUndefined({
    status,
    reason: requireString(record.reason, `${path}.reason`),
    replayEvidence:
      record.replayEvidence === undefined ? undefined : readJsonRecord(record.replayEvidence, `${path}.replayEvidence`),
    sourceEvidence:
      record.sourceEvidence === undefined ? undefined : readJsonRecord(record.sourceEvidence, `${path}.sourceEvidence`),
    auditNotes:
      record.auditNotes === undefined ? undefined : readArray(record.auditNotes, `${path}.auditNotes`, requireString),
    unsupportedClaim: optionalString(record.unsupportedClaim, `${path}.unsupportedClaim`)
  }) as RulesetV1["fidelity"];
}

function readRulesetDiagnostics(value: unknown, path: string): RulesetV1["diagnostics"] {
  const record = requireRecord(value, path);
  return dropUndefined({
    counts: record.counts === undefined ? undefined : readNumberRecord(record.counts, `${path}.counts`),
    unresolved: record.unresolved === undefined ? undefined : readJsonRecord(record.unresolved, `${path}.unresolved`),
    fieldCoverage:
      record.fieldCoverage === undefined ? undefined : readJsonRecord(record.fieldCoverage, `${path}.fieldCoverage`)
  }) as RulesetV1["diagnostics"];
}

function readLabels(value: unknown, path: string): NonNullable<RulesetUnit["labels"]> {
  const record = requireRecord(value, path);
  const labels: Record<string, string | number> = {};

  for (const [key, item] of Object.entries(record)) {
    if (item === undefined) {
      continue;
    }
    if (typeof item !== "string" && typeof item !== "number") {
      throw new Error(`${path}.${key} must be a string or number`);
    }
    labels[key] = item;
  }

  return labels;
}

function readJsonRecord(value: unknown, path: string): JsonRecord {
  const record = requireRecord(value, path);
  for (const [key, item] of Object.entries(record)) {
    requireJsonValue(item, `${path}.${key}`);
  }

  return record as JsonRecord;
}

function requireJsonValue(value: unknown, path: string): void {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error(`${path} must be a finite number`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => requireJsonValue(item, `${path}[${index}]`));
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      requireJsonValue(item, `${path}.${key}`);
    }
    return;
  }

  throw new Error(`${path} must be JSON-compatible`);
}

function readTerrain(value: unknown, path: string): RulesetTerrain {
  const record = requireRecord(value, path);
  return dropUndefined({
    id: optionalNonNegativeInteger(record.id, `${path}.id`),
    kind: requireString(record.kind, `${path}.kind`),
    color: requireString(record.color, `${path}.color`),
    passable: requireBoolean(record.passable, `${path}.passable`),
    labels: record.labels === undefined ? undefined : readLabels(record.labels, `${path}.labels`)
  }) as RulesetTerrain;
}

function readUnit(value: unknown, path: string): RulesetUnit {
  const record = requireRecord(value, path);
  const token = requireString(record.token, `${path}.token`);
  if (!unitTokens.has(token as RulesetUnit["token"])) {
    throw new Error(`${path}.token is not a supported renderer token`);
  }

  return dropUndefined({
    id: optionalNonNegativeInteger(record.id, `${path}.id`),
    kind: requireString(record.kind, `${path}.kind`),
    label: optionalString(record.label, `${path}.label`),
    labels: record.labels === undefined ? undefined : readLabels(record.labels, `${path}.labels`),
    type: optionalNonNegativeInteger(record.type, `${path}.type`),
    typeName: optionalString(record.typeName, `${path}.typeName`),
    classId: optionalInteger(record.classId, `${path}.classId`),
    baseId: optionalInteger(record.baseId, `${path}.baseId`),
    copyId: optionalInteger(record.copyId, `${path}.copyId`),
    maxHp: requireNonNegativeNumber(record.maxHp, `${path}.maxHp`),
    speedFpPerSecond: requireNonNegativeInteger(record.speedFpPerSecond, `${path}.speedFpPerSecond`),
    radiusTiles: requirePositiveNumber(record.radiusTiles, `${path}.radiusTiles`),
    token: token as RulesetUnit["token"]
  }) as RulesetUnit;
}

function readEvidencePoint(value: unknown, path: string): EvidencePoint {
  const point = readPoint(value, path);
  const record = requireRecord(value, path);
  return {
    ...point,
    evidence: readEvidence(record.evidence, `${path}.evidence`)
  };
}

function readPoint(value: unknown, path: string): { readonly x: number; readonly y: number } {
  const record = requireRecord(value, path);
  return {
    x: requireNumber(record.x, `${path}.x`),
    y: requireNumber(record.y, `${path}.y`)
  };
}

function readEvidence(value: unknown, path: string): EvidenceClass {
  if (typeof value !== "string" || !evidenceClasses.has(value as EvidenceClass)) {
    throw new Error(`${path} must be observed, simulated, or reconciled`);
  }

  return value as EvidenceClass;
}

function validateScenarioReferences(scenario: ReplayScenarioV1): void {
  const playerIds = new Set(scenario.players.map((player) => player.id));

  for (const team of scenario.teams) {
    for (const playerId of team.playerIds) {
      if (!playerIds.has(playerId)) {
        throw new Error(`scenario.teams references missing player ${playerId}`);
      }
    }
  }

  for (const entity of scenario.entities) {
    if (!playerIds.has(entity.playerId)) {
      throw new Error(`scenario.entities references missing player ${entity.playerId}`);
    }
  }
}

function readNumberRecord(value: unknown, path: string): Record<string, number> {
  const record = requireRecord(value, path);
  const output: Record<string, number> = {};

  for (const [key, item] of Object.entries(record)) {
    output[key] = requireNonNegativeInteger(item, `${path}.${key}`);
  }

  return output;
}

function readArray<T>(value: unknown, path: string, readItem: (item: unknown, path: string) => T): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }

  return value.map((item, index) => readItem(item, `${path}[${index}]`));
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }

  return value as Record<string, unknown>;
}

function requireLiteral(value: unknown, expected: string, path: string): void {
  if (value !== expected) {
    throw new Error(`${path} must be ${expected}`);
  }
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string`);
  }

  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : requireString(value, path);
}

function optionalStringOrNumber(value: unknown, path: string): string | number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  return requireNumber(value, path);
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${path} must be a boolean`);
  }

  return value;
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }

  return value;
}

function requirePositiveNumber(value: unknown, path: string): number {
  const numberValue = requireNumber(value, path);
  if (numberValue <= 0) {
    throw new Error(`${path} must be positive`);
  }

  return numberValue;
}

function requireNonNegativeNumber(value: unknown, path: string): number {
  const numberValue = requireNumber(value, path);
  if (numberValue < 0) {
    throw new Error(`${path} must be non-negative`);
  }

  return numberValue;
}

function requireInteger(value: unknown, path: string): number {
  const numberValue = requireNumber(value, path);
  if (!Number.isInteger(numberValue)) {
    throw new Error(`${path} must be an integer`);
  }

  return numberValue;
}

function optionalInteger(value: unknown, path: string): number | undefined {
  return value === undefined ? undefined : requireInteger(value, path);
}

function requirePositiveInteger(value: unknown, path: string): number {
  const numberValue = requireInteger(value, path);
  if (numberValue <= 0) {
    throw new Error(`${path} must be a positive integer`);
  }

  return numberValue;
}

function requireNonNegativeInteger(value: unknown, path: string): number {
  const numberValue = requireInteger(value, path);
  if (numberValue < 0) {
    throw new Error(`${path} must be a non-negative integer`);
  }

  return numberValue;
}

function optionalNonNegativeInteger(value: unknown, path: string): number | undefined {
  return value === undefined ? undefined : requireNonNegativeInteger(value, path);
}

function dropUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) {
      delete value[key];
    }
  }

  return value;
}
