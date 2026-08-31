export type DataviewEvidenceClass = "observed" | "simulated" | "reconciled";

export interface DataviewPoint {
  readonly x: number;
  readonly y: number;
}

export interface DataviewMarkerRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface DataviewMarkerStackLayoutInput {
  readonly stackCount?: number;
}

export interface DataviewMarkerStackLayoutMetrics {
  readonly markerBoxSizePx: number;
  readonly spriteSizePx: number;
  readonly countFontSizePx: number;
  readonly countGapPx: number;
  readonly itemGapPx: number;
  readonly countDigitWidthPx: number;
  readonly countPaddingPx: number;
}

export interface DataviewMarkerStackLayoutItem {
  readonly index: number;
  readonly stackCount: number;
  readonly countText: string;
  readonly countDigits: number;
  readonly countWidthPx: number;
  readonly offset: DataviewPoint;
  readonly spriteRect: DataviewMarkerRect;
  readonly countRect: DataviewMarkerRect | null;
  readonly footprintRect: DataviewMarkerRect;
  readonly metrics: DataviewMarkerStackLayoutMetrics;
  readonly rowWidthPx: number;
  readonly columnHeightPx: number;
  readonly layoutDirection: "vertical";
}

export interface DataviewMotionSegment {
  readonly from_time?: number;
  readonly to_time?: number;
  readonly from?: DataviewPoint | null;
  readonly to?: DataviewPoint | null;
  readonly interpolation_evidence_class?: string;
  readonly interpolation?: string;
  readonly time_bound?: string;
  readonly distance_tiles?: number;
  readonly travel_time_seconds?: number;
  readonly source_observation_kind?: string;
}

export interface DataviewActorObservation {
  readonly index?: number;
  readonly player?: number;
  readonly actorId?: number;
  readonly time?: number;
  readonly kind?: string;
  readonly label?: string;
  readonly position?: DataviewPoint | null;
  readonly targetId?: number | null;
  readonly evidence_class?: DataviewEvidenceClass;
}

export interface DataviewPositionRetirement {
  readonly time?: number;
  readonly kind?: string;
  readonly reason?: string;
  readonly confidence?: string;
}

export interface DataviewTimelineUnit {
  readonly id?: string;
  readonly stable_id?: string;
  readonly player?: number;
  readonly source_actor_id?: number | null;
  readonly parser_instance_id?: number | null;
  readonly unit_id?: number | null;
  readonly resolved_unit_id?: number | null;
  readonly name?: string;
  readonly normalized_name?: string;
  readonly category?: string | null;
  readonly sprite_key?: string | null;
  readonly worker?: boolean;
  readonly birth_time?: number;
  readonly birth_position?: DataviewPoint | null;
  readonly birth_evidence_class?: DataviewEvidenceClass;
  readonly birth_kind?: string;
  readonly birth_confirmation?: string;
  readonly producer_id?: number | null;
  readonly queue_id?: string | null;
  readonly estimated_completion_time?: number | null;
  readonly spawn_method?: string | null;
  readonly reconciliation?: {
    readonly status?: string;
    readonly actor_id?: number | null;
    readonly matched_time?: number | null;
    readonly confidence?: string;
    readonly evidence?: string;
  };
  readonly observations?: readonly DataviewActorObservation[];
  readonly position_retirements?: readonly DataviewPositionRetirement[];
  readonly motion_segments?: readonly DataviewMotionSegment[];
  readonly position_horizon_seconds?: number;
  readonly position_valid_until?: number;
  readonly position_end_reason?: string;
  readonly visible_until?: number;
  readonly end_reason?: string;
  readonly speed?: number;
}

export interface DataviewWorkerTaskTimelineEvent {
  readonly player?: number;
  readonly actor_id?: number | null;
  readonly source_actor_id?: number | null;
  readonly time?: number;
  readonly event_index?: number;
  readonly command_kind?: string;
  readonly task_assignment?: string | null;
  readonly indexed_task_assignment?: string | null;
  readonly estimated_completion_time?: number | null;
  readonly post_build_task_assignment?: string | null;
  readonly post_build_resource_family?: string | null;
  readonly post_build_resource_status?: string | null;
  readonly evidence_class?: string;
  readonly post_build_evidence_class?: string;
  readonly evidence?: string;
  readonly post_build_evidence?: string;
}

export interface DataviewGameplayTimeline {
  readonly schema?: string;
  readonly units?: readonly DataviewTimelineUnit[];
  readonly worker_task_timeline?: readonly DataviewWorkerTaskTimelineEvent[];
  readonly counts?: Record<string, unknown>;
  readonly sample_times?: Record<string, unknown>;
}

export interface DataviewInterpolationState {
  readonly current: DataviewPoint;
  readonly from: DataviewPoint;
  readonly destination: DataviewPoint;
  readonly to: DataviewPoint;
  readonly status: string;
  readonly progress: number;
  readonly segmentEvidence: string;
  readonly fromTime: number;
  readonly toTime: number;
  readonly interpolationKind: string;
  readonly timeBound: string;
  readonly distanceTiles: number;
  readonly travelTimeSeconds: number;
}

export interface DataviewActivityState {
  readonly kind: string;
  readonly label: string;
  readonly time: number;
  readonly evidenceClass: string;
  readonly source: string;
}

export interface DataviewWorkerTaskState {
  readonly taskAssignment: string | null;
  readonly indexedTaskAssignment: string | null;
  readonly phase: string;
  readonly time: number;
  readonly eventIndex: number;
  readonly commandKind: string;
  readonly evidenceClass: string;
  readonly evidence: string;
  readonly postBuildResourceStatus: string;
}

export interface DataviewUnitIdentity {
  readonly quality: string;
  readonly unit_id: number | null;
  readonly name: string;
  readonly evidence: string;
}

export interface DataviewUnitAssignment {
  readonly player: number;
  readonly instanceId: number | string;
  readonly sourceActorId: number | null;
  readonly stableId: string;
  readonly markerKey: string;
  readonly worker: boolean;
  readonly villager: boolean;
  readonly partyId: string;
  readonly partyKind: string;
  readonly partyTime: number;
  readonly activityKind: string;
  readonly activityLabel: string;
  readonly activityTime: number;
  readonly activityEvidenceClass: string;
  readonly activitySource: string;
  readonly villagerTaskAssignment: string | null;
  readonly indexedVillagerTaskAssignment: string | null;
  readonly villagerTaskPhase: string;
  readonly villagerTaskTime: number | null;
  readonly villagerTaskCommandKind: string;
  readonly villagerTaskEvidenceClass: string;
  readonly villagerTaskEvidence: string;
  readonly position: DataviewPoint;
  readonly commandDestination: DataviewPoint;
  readonly interpolationFrom: DataviewPoint;
  readonly interpolationTo: DataviewPoint;
  readonly unitIdentity: DataviewUnitIdentity;
  readonly resolvedUnitId: number | null;
  readonly unitName: string;
  readonly referenceUnitName: string;
  readonly spriteKey: string;
  readonly spriteCategory: string;
  readonly category: string | null;
  readonly evidenceQuality: string;
  readonly evidenceClass: DataviewEvidenceClass;
  readonly evidence: string;
  readonly outcome: string;
  readonly endTime: number;
  readonly positionCredible: boolean;
  readonly mapRendered: boolean;
  readonly interpolationStatus: string;
  readonly interpolationProgress: number;
  readonly interpolationEvidenceClass: string;
  readonly interpolationKind: string;
  readonly interpolationTimeBound: string;
  readonly interpolationFromTime: number;
  readonly interpolationToTime: number;
  readonly interpolationDistanceTiles: number;
  readonly interpolationTravelTimeSeconds: number;
  readonly birthTime: number;
  readonly birthEvidenceClass: string;
  readonly birthConfirmation: string;
  readonly positionHorizonSeconds: number;
  readonly positionValidUntil: number;
  readonly positionEndReason: string;
  readonly producerId: number | null;
  readonly queueId: string | null;
  readonly reconciliationStatus: string;
  readonly stackAnchorPositionKey: string;
  readonly stackUnitTypeKey: string;
  readonly stackCount: number;
  readonly stackMemberKeys: readonly string[];
  readonly stackMemberIds: readonly string[];
  readonly stackEvidenceSplit: string;
  readonly stackLayoutIndex: number;
  readonly stackLayoutCount: number;
  readonly stackLayoutItemCounts: readonly number[];
}

export interface DataviewRenderSnapshot {
  readonly schema: "aoe-sim.dataview-render-snapshot/v1";
  readonly seconds: number;
  readonly assignments: readonly DataviewUnitAssignment[];
  readonly markerGroups: readonly DataviewUnitAssignment[];
  readonly population: DataviewPopulationSummary;
  readonly diagnostics: DataviewRenderDiagnostics;
  readonly checksum: string;
}

export interface DataviewPopulationSummary {
  readonly schema: "aoe-sim.dataview-population-summary/v1";
  readonly seconds: number;
  readonly players: readonly DataviewPlayerPopulationSummary[];
  readonly workerTotalsByPlayer: Record<string, number>;
  readonly mapPositionedWorkersByPlayer: Record<string, number>;
  readonly positionUnknownWorkersByPlayer: Record<string, number>;
  readonly totalWorkers: number;
}

export interface DataviewPlayerPopulationSummary {
  readonly player: number;
  readonly workers: DataviewWorkerPopulationSummary;
}

export interface DataviewWorkerPopulationSummary {
  readonly total: number;
  readonly resourceCounts: Record<string, number>;
  readonly resourceTotal: number;
  readonly other: number;
  readonly equationMatchesTotal: boolean;
  readonly mapPositioned: number;
  readonly positionKnown: number;
  readonly positionUnknown: number;
  readonly lifecycleFiltered: number;
  readonly starting: number;
  readonly queueEstimated: number;
  readonly observedActor: number;
  readonly sourceActorWorkers: number;
  readonly replayEndSurvivalUnresolved: number;
  readonly evidenceCounts: Record<string, number>;
  readonly evidenceQualityCounts: Record<string, number>;
  readonly birthKindCounts: Record<string, number>;
  readonly assignmentCounts: Record<string, number>;
  readonly source: "gameplay-timeline-active-workers";
}

export interface DataviewRenderDiagnostics {
  readonly timelineUnits: number;
  readonly assignments: number;
  readonly mapRendered: number;
  readonly positionUnknown: number;
  readonly lifecycleFiltered: number;
  readonly stalePositionFiltered: number;
  readonly evidenceCounts: Record<string, number>;
  readonly activityCounts: Record<string, number>;
  readonly spriteCounts: Record<string, number>;
  readonly markerGroups: number;
  readonly stackedGroups: number;
  readonly stackedUnits: number;
  readonly mixedPositionGroups: number;
  readonly exactTypeGroupKeys: readonly string[];
  readonly disappearedSupportedUnits: number;
  readonly workerTotalsByPlayer: Record<string, number>;
  readonly mapRenderedWorkersByPlayer: Record<string, number>;
  readonly positionUnknownWorkersByPlayer: Record<string, number>;
}

export interface DataviewSeekParityResult {
  readonly schema: "aoe-sim.dataview-seek-parity/v1";
  readonly sequence: readonly number[];
  readonly snapshots: readonly DataviewRenderSnapshot[];
  readonly parity: readonly {
    readonly seconds: number;
    readonly checksum: string;
    readonly repeatCount: number;
    readonly deterministic: boolean;
  }[];
  readonly deterministic: boolean;
}

export interface DataviewDiagnosticsResult {
  readonly schema: "aoe-sim.dataview-diagnostics/v1";
  readonly sampleTimes: readonly number[];
  readonly snapshots: readonly DataviewRenderSnapshot[];
  readonly parity: DataviewSeekParityResult;
  readonly checks: readonly DataviewDiagnosticCheck[];
}

export interface DataviewDiagnosticCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

const VISIBILITY_EPSILON = 0.001;
const UNIT_MARKER_BASE_SIZE_PX = 15;
const UNIT_MARKER_MIN_SIZE_PX = 11;
const UNIT_MARKER_BASE_COUNT_FONT_SIZE_PX = 8;
const UNIT_MARKER_MIN_COUNT_FONT_SIZE_PX = 7;
const UNIT_MARKER_COUNT_GAP_PX = 2;
const UNIT_MARKER_ROW_GAP_PX = 3;
const UNIT_MARKER_COUNT_DIGIT_EM = 0.72;
const UNIT_MARKER_COUNT_PADDING_PX = 1;
const WORKER_RESOURCE_COUNT_KEYS = ["Food", "Wood", "Gold", "Stone"] as const;
const SPRITE_KEYS = Object.freeze([
  "villagers",
  "archer",
  "spear",
  "swordsman",
  "camel",
  "knight",
  "cavalryArcher",
  "scout",
  "elephant",
  "monk",
  "scorpion",
  "catapult",
  "ram",
  "trebuchet",
  "bombardCannon",
  "ship",
  "controllableFood",
  "unknown",
] as const);
const SPRITE_KEY_SET = new Set<string>(SPRITE_KEYS);
const SPRITE_ALIASES = new Map<string, string>([
  ["priest", "monk"],
  ["ranged", "archer"],
  ["infantry", "swordsman"],
  ["cavalry", "knight"],
  ["support", "monk"],
  ["siege", "catapult"],
  ["naval", "ship"],
]);
const SPRITE_LABELS = new Map<string, string>([
  ["villagers", "Villagers"],
  ["archer", "Archers / foot ranged"],
  ["spear", "Spear infantry"],
  ["swordsman", "Swordsmen / infantry"],
  ["camel", "Camels"],
  ["knight", "Knights / heavy cavalry"],
  ["cavalryArcher", "Cavalry archers / mounted ranged"],
  ["scout", "Scouts / light cavalry"],
  ["elephant", "Elephants"],
  ["monk", "Monks / priests"],
  ["scorpion", "Scorpions"],
  ["catapult", "Mangonels / onagers"],
  ["ram", "Rams"],
  ["trebuchet", "Trebuchets"],
  ["bombardCannon", "Bombard cannons"],
  ["ship", "Ships / naval actors"],
  ["controllableFood", "Controllable food"],
  ["unknown", "Unknown fallback"],
]);
const SPRITE_CATEGORIES = new Map<string, string>([
  ["villagers", "villagers"],
  ["archer", "ranged"],
  ["cavalryArcher", "ranged"],
  ["spear", "infantry"],
  ["swordsman", "infantry"],
  ["camel", "cavalry"],
  ["knight", "cavalry"],
  ["scout", "cavalry"],
  ["elephant", "cavalry"],
  ["monk", "support"],
  ["priest", "support"],
  ["scorpion", "siege"],
  ["catapult", "siege"],
  ["ram", "siege"],
  ["trebuchet", "siege"],
  ["bombardCannon", "siege"],
  ["ship", "naval"],
  ["controllableFood", "controllableFood"],
]);

const RANGED_UNIT_CLASS_IDS = Object.freeze([0, 23, 36, 44]);
const INFANTRY_UNIT_CLASS_IDS = Object.freeze([6]);
const CAVALRY_UNIT_CLASS_IDS = Object.freeze([12, 47]);
const SUPPORT_UNIT_CLASS_IDS = Object.freeze([18, 43]);
const SIEGE_UNIT_CLASS_IDS = Object.freeze([13, 54, 55]);
const PACKED_SIEGE_UNIT_CLASS_IDS = Object.freeze([51]);
const CONTROLLABLE_FOOD_UNIT_CLASS_IDS = Object.freeze([58]);
const NAVAL_UNIT_CLASS_IDS = Object.freeze([2, 20, 21, 22]);

export function buildDataviewRenderSnapshot(options: {
  readonly gameplayTimeline: DataviewGameplayTimeline | null | undefined;
  readonly seconds: number;
  readonly dimension: number;
}): DataviewRenderSnapshot {
  const seconds = cleanTime(options.seconds);
  const units = timelineUnits(options.gameplayTimeline);
  const workerTaskStates = activeWorkerTaskStates(units, workerTaskTimeline(options.gameplayTimeline), seconds);
  const rawAssignments = units.flatMap((unit) =>
    timelineUnitAssignment(unit, seconds, options.dimension, workerTaskStates.get(timelineUnitIdentityKey(unit))));
  const assignments = dedupeActiveIndividualUnitAssignments(rawAssignments)
    .map((assignment) => freezeAssignment(assignment));
  const markerGroups = groupExactTypeMarkers(assignments).map((assignment) => freezeAssignment(assignment));
  const population = buildPopulationSummary(units, assignments, seconds, workerTaskStates);
  const diagnostics = renderDiagnostics(units, assignments, markerGroups, seconds, population);
  const checksum = snapshotChecksum(seconds, assignments, markerGroups, population, diagnostics);
  return Object.freeze({
    schema: "aoe-sim.dataview-render-snapshot/v1",
    seconds,
    assignments,
    markerGroups,
    population,
    diagnostics,
    checksum,
  });
}

export function buildDataviewSeekParityDiagnostics(options: {
  readonly gameplayTimeline: DataviewGameplayTimeline | null | undefined;
  readonly dimension: number;
  readonly sequence: readonly number[];
}): DataviewSeekParityResult {
  const sequence = options.sequence.map(cleanTime);
  const snapshots = sequence.map((seconds) => buildDataviewRenderSnapshot({
    gameplayTimeline: options.gameplayTimeline,
    seconds,
    dimension: options.dimension,
  }));
  const bySecond = new Map<string, { seconds: number; checksums: string[] }>();
  snapshots.forEach((snapshot) => {
    const key = snapshot.seconds.toFixed(3);
    const row = bySecond.get(key) ?? { seconds: snapshot.seconds, checksums: [] };
    row.checksums.push(snapshot.checksum);
    bySecond.set(key, row);
  });
  const parity = [...bySecond.values()]
    .sort((a, b) => a.seconds - b.seconds)
    .map((row) => {
      const unique = new Set(row.checksums);
      return Object.freeze({
        seconds: row.seconds,
        checksum: row.checksums[0] ?? "",
        repeatCount: row.checksums.length,
        deterministic: unique.size === 1,
      });
    });
  return Object.freeze({
    schema: "aoe-sim.dataview-seek-parity/v1",
    sequence,
    snapshots,
    parity,
    deterministic: parity.every((row) => row.deterministic),
  });
}

export function buildDataviewDiagnostics(options: {
  readonly gameplayTimeline: DataviewGameplayTimeline | null | undefined;
  readonly dimension: number;
  readonly sampleTimes: readonly number[];
  readonly paritySequence?: readonly number[];
}): DataviewDiagnosticsResult {
  const sampleTimes = [...new Set(options.sampleTimes.map(cleanTime))].sort((a, b) => a - b);
  const snapshots = sampleTimes.map((seconds) => buildDataviewRenderSnapshot({
    gameplayTimeline: options.gameplayTimeline,
    seconds,
    dimension: options.dimension,
  }));
  const fallbackSequence = sampleTimes.length >= 3
    ? [
        sampleTimes[0] ?? 0,
        sampleTimes[1] ?? 0,
        sampleTimes[2] ?? 0,
        sampleTimes[1] ?? 0,
        sampleTimes[0] ?? 0,
        sampleTimes[1] ?? 0,
      ]
    : [...sampleTimes, ...sampleTimes.slice().reverse(), ...sampleTimes];
  const parity = buildDataviewSeekParityDiagnostics({
    gameplayTimeline: options.gameplayTimeline,
    dimension: options.dimension,
    sequence: options.paritySequence ?? fallbackSequence,
  });
  const checks = diagnosticChecks(timelineUnits(options.gameplayTimeline), snapshots, parity);
  return Object.freeze({
    schema: "aoe-sim.dataview-diagnostics/v1",
    sampleTimes,
    snapshots,
    parity,
    checks,
  });
}

export function canonicalMapSpriteKey(spriteKey: unknown): string | null {
  if (!spriteKey) return null;
  const key = String(spriteKey);
  if (SPRITE_KEY_SET.has(key)) return key;
  return SPRITE_ALIASES.get(key) ?? null;
}

export function resolveMapSpriteKey({
  name = "",
  stats = {},
  classId = null,
  category = null,
  worker = false,
}: {
  readonly name?: string;
  readonly stats?: Record<string, unknown>;
  readonly classId?: number | null;
  readonly category?: string | null;
  readonly worker?: boolean;
} = {}): string | null {
  const normalized = normalizedLookupName(name);
  const has = (pattern: RegExp): boolean => pattern.test(normalized);
  const resolvedClassId = unitClassId(classId, stats);
  const resolvedCategory = category ?? classifyUnitCategory({ name, stats, classId, worker });
  if (worker || has(/\bvillager\b/)) return "villagers";
  if (
    resolvedCategory === "controllableFood"
    || unitClassIdMatches(resolvedClassId, CONTROLLABLE_FOOD_UNIT_CLASS_IDS)
  ) return "controllableFood";
  if (unitClassIdMatches(resolvedClassId, NAVAL_UNIT_CLASS_IDS)
    || has(/\b(ship|galley|galleon|transport|cog|caravel|dromon|longboat|turtle ship)\b/)) return "ship";
  if (resolvedCategory === "siege") {
    if (has(/\b(scorpion|ballista|hussite wagon)\b/)
      || unitClassIdMatches(resolvedClassId, [55])) return "scorpion";
    if (has(/\b(capped ram|siege ram|battering ram|ram|siege tower|armored elephant|siege elephant)\b/)) {
      return "ram";
    }
    if (has(/\btrebuchet\b/)) return "trebuchet";
    if (has(/\b(bombard cannon|houfnice)\b/)) return "bombardCannon";
    if (has(/\b(mangonel|onager|catapult|pmang|sling|neighbor)\b/)) return "catapult";
    return "catapult";
  }
  if (has(/\belephant archer\b/)) return "elephant";
  if (has(/\b(war elephant|battle elephant|ballista elephant|armored elephant|siege elephant|elephant)\b/)) {
    return "elephant";
  }
  if (has(/\b(cavalry archer|camel archer|conquistador|arambai|mangudai|kipchak|genitour|ratha|mounted ranged)\b/)) {
    return "cavalryArcher";
  }
  if (has(/\b(spearman|pikeman|halberdier|halb|kamayuk)\b/)) return "spear";
  if (has(/\b(militia|man at arms|long swordsman|two handed swordsman|swordsman|champion|condottiero|legionary|serjeant|samurai|teutonic knight|woad raider|berserk|jaguar warrior|huskarl|karambit warrior|gbeto|obuch|throwing axeman|eagle warrior)\b/)) {
    return "swordsman";
  }
  if (has(/\b(scout cavalry|light cavalry|hussar|magyar huszar|steppe scout)\b/)) return "scout";
  if (has(/\b(camel|mameluke)\b/)) return "camel";
  if (has(/\b(knight|cavalier|paladin|cataphract|boyar|keshik|leitis|konnik|coustillier|lancer|shrivamsha|centurion|tarkan)\b/)) {
    return "knight";
  }
  if (has(/\b(monk|priest|missionary)\b/) || unitClassIdMatches(resolvedClassId, SUPPORT_UNIT_CLASS_IDS)) {
    return "monk";
  }
  if (has(/\b(archer|skirmisher|crossbow|bowman|longbow|chu ko nu|hand cannoneer|janissary|slinger|plumed|rattan|genoese|organ gun)\b/)) {
    return "archer";
  }
  if (resolvedCategory === "villagers") return "villagers";
  if (resolvedCategory === "ranged") return "archer";
  if (resolvedCategory === "infantry") return "swordsman";
  if (resolvedCategory === "cavalry") return "knight";
  if (resolvedCategory === "support") return "monk";
  if (resolvedCategory === "siege") return "catapult";
  if (resolvedCategory === "naval") return "ship";
  return null;
}

export function classifyUnitCategory({
  name = "",
  stats = {},
  classId = null,
  worker = false,
}: {
  readonly name?: string;
  readonly stats?: Record<string, unknown>;
  readonly classId?: number | null;
  readonly worker?: boolean;
} = {}): string | null {
  const resolvedClassId = unitClassId(classId, stats);
  if (worker || unitNameMatches(name, /\bvillager\b/)) return "villagers";
  if (unitClassIdMatches(resolvedClassId, CONTROLLABLE_FOOD_UNIT_CLASS_IDS)) return "controllableFood";
  if (unitClassIdMatches(resolvedClassId, NAVAL_UNIT_CLASS_IDS)
    || unitNameMatches(name, /\b(ship|galley|galleon|transport|cog|caravel|dromon|longboat|turtle ship)\b/)) {
    return "naval";
  }
  if (unitClassIdMatches(resolvedClassId, SUPPORT_UNIT_CLASS_IDS)
    || unitNameMatches(name, /\b(monk|priest|missionary)\b/)) return "support";
  if (
    unitClassIdMatches(resolvedClassId, SIEGE_UNIT_CLASS_IDS)
    || packedSiegeClassMatchesName(resolvedClassId, name)
    || unitNameMatches(name, /\b(ram|mangonel|onager|scorpion|trebuchet|bombard cannon|siege|ballista|houfnice|hussite wagon|organ gun|flamethrower|rocket cart|traction trebuchet|armored elephant|mounted trebuchet)\b/)
  ) return "siege";
  if (unitClassIdMatches(resolvedClassId, RANGED_UNIT_CLASS_IDS)
    || unitNameMatches(name, /\b(archer|skirmisher|crossbow|bowman|longbow|chu ko nu|hand cannoneer|janissary|slinger|plumed|rattan|genoese|kipchak|mangudai|cavalry archer|camel archer|elephant archer|conquistador|arambai|genitour|ratha)\b/)) {
    return "ranged";
  }
  if (unitClassIdMatches(resolvedClassId, CAVALRY_UNIT_CLASS_IDS)
    || unitNameMatches(name, /\b(cavalry|knight|cavalier|paladin|hussar|camel|elephant|lancer|tarkan|cataphract|keshik|leitis|boyar|konnik|magyar huszar|coustillier|shrivamsha|centurion)\b/)) {
    return "cavalry";
  }
  if (unitClassIdMatches(resolvedClassId, INFANTRY_UNIT_CLASS_IDS)
    || unitNameMatches(name, /\b(militia|man at arms|swordsman|champion|spearman|pikeman|halb|eagle|huskarl|samurai|teutonic|woad|berserk|jaguar|condottiero|karambit|kamayuk|gbeto|serjeant|obuch|legionary|throwing axeman)\b/)) {
    return "infantry";
  }
  const attackAmount = finiteNumber(record(stats.attack).amount);
  const maxRange = finiteNumber(stats.max_range, finiteNumber(stats.maxRange));
  const minRange = finiteNumber(stats.min_range, finiteNumber(stats.minRange));
  const pierceArmor = finiteNumber(stats.pierce_armor, finiteNumber(stats.pierceArmor));
  const speed = finiteNumber(stats.speed);
  const hp = finiteNumber(stats.hp, finiteNumber(stats.maxHp));
  if (attackAmount > 0 && (pierceArmor >= 50 || (minRange >= 2 && speed <= 0.85))) return "siege";
  if (attackAmount > 0 && maxRange > 0) return "ranged";
  if (attackAmount > 0 && speed >= 1.15 && hp >= 40) return "cavalry";
  if (attackAmount > 0 && speed >= 0.7) return "infantry";
  return null;
}

export function normalizedLookupName(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\belite\b/g, " ")
    .replace(/\bupgrade\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mapPositionIsCredible(position: unknown, dimension: number): position is DataviewPoint {
  const point = timelinePoint(position);
  if (!point) return false;
  const boundedDimension = Number.isFinite(dimension) && dimension > 0 ? dimension : Number.POSITIVE_INFINITY;
  return point.x >= 0 && point.y >= 0 && point.x <= boundedDimension && point.y <= boundedDimension;
}

export function timelinePoint(value: unknown): DataviewPoint | null {
  const row = record(value);
  const x = finiteNumber(row.x, Number.NaN);
  const y = finiteNumber(row.y, Number.NaN);
  return Number.isFinite(x) && Number.isFinite(y) ? Object.freeze({ x, y }) : null;
}

export function unitTimelineInterpolationState(
  unit: DataviewTimelineUnit,
  seconds: number
): DataviewInterpolationState | null {
  const birthTime = finiteNumber(unit.birth_time, Number.NaN);
  const visibleUntil = finiteNumber(unit.visible_until, Number.POSITIVE_INFINITY);
  const birthPosition = timelinePoint(unit.birth_position);
  if (!Number.isFinite(birthTime) || seconds + VISIBILITY_EPSILON < birthTime || seconds >= visibleUntil) {
    return null;
  }

  let current = birthPosition;
  let destination = birthPosition;
  let status = "at-birth-position";
  let progress = 1;
  let segmentEvidence: string = unit.birth_evidence_class ?? "simulated";
  let fromPosition = birthPosition;
  let toPosition = birthPosition;
  let fromTime = birthTime;
  let toTime = birthTime;
  let interpolationKind = "at-birth-position";
  let timeBound = "birth";
  let distanceTiles = 0;
  let travelTimeSeconds = 0;
  let latestPositionEvidenceTime = birthPosition ? birthTime : null;

  const segments = [...unit.motion_segments ?? []].sort((a, b) =>
    finiteNumber(a.to_time) - finiteNumber(b.to_time)
      || finiteNumber(a.from_time) - finiteNumber(b.from_time));
  for (const segment of segments) {
    const from = timelinePoint(segment.from);
    const to = timelinePoint(segment.to);
    const rawFromTime = finiteNumber(segment.from_time, Number.NaN);
    const rawToTime = finiteNumber(segment.to_time, Number.NaN);
    if (!from || !to || !Number.isFinite(rawFromTime) || !Number.isFinite(rawToTime)) continue;
    const segmentFromTime = Math.min(rawFromTime, rawToTime);
    const segmentToTime = Math.max(rawFromTime, rawToTime);
    const segmentDuration = Math.max(0, segmentToTime - segmentFromTime);
    const segmentKind = segment.interpolation ?? (
      segmentDuration > VISIBILITY_EPSILON ? "bounded-straight-line-visual" : "instant-evidence-update"
    );
    const segmentTimeBound = segment.time_bound ?? (
      segmentDuration > VISIBILITY_EPSILON ? "replay-timestamp" : "instant"
    );
    const segmentDistanceTiles = finiteNumber(segment.distance_tiles, Math.hypot(to.x - from.x, to.y - from.y));
    const segmentTravelTimeSeconds = finiteNumber(segment.travel_time_seconds, segmentDuration);

    if (!current || latestPositionEvidenceTime === null) {
      if (seconds + VISIBILITY_EPSILON < segmentToTime) return null;
      current = to;
      destination = to;
      status = segmentKind === "instant-evidence-update" ? "instant-evidence-update" : "arrived-at-evidence-time";
      progress = 1;
      segmentEvidence = segment.interpolation_evidence_class ?? segmentEvidence;
      fromPosition = from;
      toPosition = to;
      fromTime = segmentFromTime;
      toTime = segmentToTime;
      interpolationKind = segmentKind;
      timeBound = segmentTimeBound;
      distanceTiles = Number.isFinite(segmentDistanceTiles) ? segmentDistanceTiles : 0;
      travelTimeSeconds = Number.isFinite(segmentTravelTimeSeconds) ? segmentTravelTimeSeconds : segmentDuration;
      latestPositionEvidenceTime = segmentToTime;
      continue;
    }

    if (seconds < segmentFromTime) {
      if (!unitTimelinePositionFreshAt(unit, latestPositionEvidenceTime, seconds)) return null;
      const awaitingInstantUpdate = segmentDuration <= VISIBILITY_EPSILON || segmentKind === "instant-evidence-update";
      destination = awaitingInstantUpdate ? current : to;
      status = awaitingInstantUpdate ? status : "waiting-for-interpolation";
      progress = awaitingInstantUpdate ? progress : 0;
      segmentEvidence = awaitingInstantUpdate
        ? segmentEvidence
        : segment.interpolation_evidence_class ?? segmentEvidence;
      fromPosition = awaitingInstantUpdate ? current : from;
      toPosition = awaitingInstantUpdate ? current : to;
      fromTime = awaitingInstantUpdate ? latestPositionEvidenceTime : segmentFromTime;
      toTime = awaitingInstantUpdate ? latestPositionEvidenceTime : segmentToTime;
      interpolationKind = awaitingInstantUpdate ? interpolationKind : segmentKind;
      timeBound = awaitingInstantUpdate ? timeBound : segmentTimeBound;
      distanceTiles = awaitingInstantUpdate
        ? distanceTiles
        : Number.isFinite(segmentDistanceTiles) ? segmentDistanceTiles : 0;
      travelTimeSeconds = awaitingInstantUpdate
        ? travelTimeSeconds
        : Number.isFinite(segmentTravelTimeSeconds) ? segmentTravelTimeSeconds : segmentDuration;
      break;
    }

    if (segmentDuration > VISIBILITY_EPSILON && seconds < segmentToTime) {
      if (!unitTimelinePositionFreshAt(unit, latestPositionEvidenceTime, segmentFromTime)) return null;
      const segmentProgress = Math.max(0, Math.min(1, (seconds - segmentFromTime) / segmentDuration));
      return freezeInterpolation({
        current: timelineInterpolatedPoint(from, to, segmentProgress),
        from,
        destination: to,
        to,
        status: segmentProgress <= 0 ? "pending" : "moving",
        progress: segmentProgress,
        segmentEvidence: segment.interpolation_evidence_class ?? segmentEvidence,
        fromTime: segmentFromTime,
        toTime: segmentToTime,
        interpolationKind: segmentKind,
        timeBound: segmentTimeBound,
        distanceTiles: Number.isFinite(segmentDistanceTiles) ? segmentDistanceTiles : 0,
        travelTimeSeconds: Number.isFinite(segmentTravelTimeSeconds) ? segmentTravelTimeSeconds : segmentDuration,
      });
    }

    current = to;
    destination = to;
    status = segmentKind === "instant-evidence-update" ? "instant-evidence-update" : "arrived-at-evidence-time";
    progress = 1;
    segmentEvidence = segment.interpolation_evidence_class ?? segmentEvidence;
    fromPosition = from;
    toPosition = to;
    fromTime = segmentFromTime;
    toTime = segmentToTime;
    interpolationKind = segmentKind;
    timeBound = segmentTimeBound;
    distanceTiles = Number.isFinite(segmentDistanceTiles) ? segmentDistanceTiles : 0;
    travelTimeSeconds = Number.isFinite(segmentTravelTimeSeconds) ? segmentTravelTimeSeconds : segmentDuration;
    latestPositionEvidenceTime = segmentToTime;
  }

  if (!current || latestPositionEvidenceTime === null) return null;
  if (!unitTimelinePositionFreshAt(unit, latestPositionEvidenceTime, seconds)) return null;
  return freezeInterpolation({
    current,
    from: fromPosition ?? current,
    destination: destination ?? current,
    to: toPosition ?? current,
    status,
    progress,
    segmentEvidence,
    fromTime,
    toTime,
    interpolationKind,
    timeBound,
    distanceTiles,
    travelTimeSeconds,
  });
}

export function groupExactTypeMarkers(assignments: readonly DataviewUnitAssignment[]): readonly DataviewUnitAssignment[] {
  const groups = new Map<string, DataviewUnitAssignment[]>();
  assignments.filter((assignment) => assignment.mapRendered).forEach((assignment) => {
    const spriteKey = canonicalMapSpriteKey(assignment.spriteKey) ?? "unknown";
    const category = assignment.category ?? unitCategoryForMapSpriteKey(spriteKey) ?? "unknown";
    const positionKey = individualUnitStackPositionKey(assignment.position);
    const unitTypeKey = individualUnitTypeStackKey(assignment, spriteKey);
    const key = [
      assignment.player,
      unitTypeKey,
      category,
      spriteKey,
      assignment.villagerTaskAssignment ?? "",
      positionKey,
    ].join(":");
    const group = groups.get(key) ?? [];
    group.push(assignment);
    groups.set(key, group);
  });

  const stackGroups = [...groups.values()].map((group) => {
    const members = [...group].sort(individualUnitStackSort);
    const representative = members[0];
    if (!representative) return null;
    const spriteKey = canonicalMapSpriteKey(representative.spriteKey) ?? "unknown";
    const stackUnitTypeKey = individualUnitTypeStackKey(representative, spriteKey);
    const stackAnchorPositionKey = individualUnitStackPositionKey(representative.position);
    const stackMemberKeys = members.map(individualUnitMarkerIdentityKey);
    const stackMemberIds = members.map((member) => String(member.instanceId));
    const evidenceCounts = new Map<string, number>();
    members.forEach((member) => {
      const evidence = member.evidenceQuality ?? "unclassified";
      evidenceCounts.set(evidence, (evidenceCounts.get(evidence) ?? 0) + 1);
    });
    return freezeAssignment({
      ...representative,
      markerKey: members.length === 1
        ? individualUnitMarkerIdentityKey(representative)
        : `stack:${stackMemberKeys.join("|")}`,
      stackAnchorPositionKey,
      stackUnitTypeKey,
      stackCount: members.length,
      stackMemberKeys,
      stackMemberIds,
      stackEvidenceSplit: [...evidenceCounts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([evidence, count]) => `${evidence}:${count}`)
        .join(","),
    });
  }).filter((group): group is DataviewUnitAssignment => group !== null);

  const byPosition = new Map<string, DataviewUnitAssignment[]>();
  stackGroups.forEach((group) => {
    const rows = byPosition.get(group.stackAnchorPositionKey) ?? [];
    rows.push(group);
    byPosition.set(group.stackAnchorPositionKey, rows);
  });
  return Object.freeze([...byPosition.values()].flatMap((groupsAtPosition) => {
    const sorted = [...groupsAtPosition].sort(individualUnitStackGroupSort);
    const stackLayoutItemCounts = Object.freeze(sorted.map((group) => group.stackCount));
    return sorted.map((group, index) => freezeAssignment({
      ...group,
      stackLayoutIndex: index,
      stackLayoutCount: sorted.length,
      stackLayoutItemCounts,
    }));
  }));
}

export function exactTypeStackLayoutMetrics(uniformScale: number): DataviewMarkerStackLayoutMetrics {
  const scale = Math.max(0.1, Number.isFinite(uniformScale) ? uniformScale : 1);
  const markerBoxSizePx = cleanNumber(Math.max(UNIT_MARKER_MIN_SIZE_PX, UNIT_MARKER_BASE_SIZE_PX * scale));
  const spriteSizePx = cleanNumber(Math.max(9, markerBoxSizePx - 1));
  const countFontSizePx = cleanNumber(
    Math.max(UNIT_MARKER_MIN_COUNT_FONT_SIZE_PX, UNIT_MARKER_BASE_COUNT_FONT_SIZE_PX * scale),
  );
  return Object.freeze({
    markerBoxSizePx,
    spriteSizePx,
    countFontSizePx,
    countGapPx: cleanNumber(Math.max(1.5, UNIT_MARKER_COUNT_GAP_PX * scale)),
    itemGapPx: cleanNumber(Math.max(3, UNIT_MARKER_ROW_GAP_PX * scale)),
    countDigitWidthPx: cleanNumber(Math.max(4.8, countFontSizePx * UNIT_MARKER_COUNT_DIGIT_EM)),
    countPaddingPx: cleanNumber(UNIT_MARKER_COUNT_PADDING_PX),
  });
}

export function exactTypeStackPixelLayout(
  items: readonly DataviewMarkerStackLayoutInput[],
  uniformScale: number,
): readonly DataviewMarkerStackLayoutItem[] {
  const metrics = exactTypeStackLayoutMetrics(uniformScale);
  const stackCounts = items.length ? items.map((item) => positiveStackCount(item.stackCount)) : [1];
  const widths = stackCounts.map((stackCount) => {
    const countDigits = exactTypeStackCountText(stackCount).length;
    const countWidthPx = countDigits
      ? cleanNumber(countDigits * metrics.countDigitWidthPx + metrics.countPaddingPx)
      : 0;
    const countPartWidth = countDigits ? metrics.markerBoxSizePx / 2 + metrics.countGapPx + countWidthPx : 0;
    return cleanNumber(metrics.spriteSizePx / 2 + Math.max(metrics.spriteSizePx / 2, countPartWidth));
  });
  const itemHeightPx = cleanNumber(Math.max(metrics.spriteSizePx, metrics.countFontSizePx));
  const rowWidthPx = cleanNumber(Math.max(...widths));
  const columnHeightPx = cleanNumber(
    stackCounts.length * itemHeightPx + Math.max(0, stackCounts.length - 1) * metrics.itemGapPx,
  );
  const markerCenterX = cleanNumber(-rowWidthPx / 2 + metrics.spriteSizePx / 2);
  let cursor = -columnHeightPx / 2;
  return Object.freeze(stackCounts.map((stackCount, index) => {
    const countText = exactTypeStackCountText(stackCount);
    const countDigits = countText.length;
    const countWidthPx = countDigits
      ? cleanNumber(countDigits * metrics.countDigitWidthPx + metrics.countPaddingPx)
      : 0;
    const markerCenterY = cleanNumber(cursor + itemHeightPx / 2);
    const offset = freezePoint({ x: markerCenterX, y: markerCenterY });
    const spriteRect = freezeRect({
      left: markerCenterX - metrics.spriteSizePx / 2,
      top: markerCenterY - metrics.spriteSizePx / 2,
      right: markerCenterX + metrics.spriteSizePx / 2,
      bottom: markerCenterY + metrics.spriteSizePx / 2,
    });
    const countRect = countDigits
      ? freezeRect({
          left: markerCenterX + metrics.markerBoxSizePx / 2 + metrics.countGapPx,
          top: markerCenterY - metrics.countFontSizePx / 2,
          right: markerCenterX + metrics.markerBoxSizePx / 2 + metrics.countGapPx + countWidthPx,
          bottom: markerCenterY + metrics.countFontSizePx / 2,
        })
      : null;
    const footprintRect = unionMarkerRects(countRect ? [spriteRect, countRect] : [spriteRect]);
    cursor += itemHeightPx + metrics.itemGapPx;
    return Object.freeze({
      index,
      stackCount,
      countText,
      countDigits,
      countWidthPx,
      offset,
      spriteRect,
      countRect,
      footprintRect,
      metrics,
      rowWidthPx,
      columnHeightPx,
      layoutDirection: "vertical",
    });
  }));
}

export function exactTypeStackPixelOffset(index: number, count: number, uniformScale: number): DataviewPoint {
  const itemCount = Math.max(1, Math.floor(count));
  const layout = exactTypeStackPixelLayout(Array.from({ length: itemCount }, () => ({ stackCount: 1 })), uniformScale);
  return layout[Math.max(0, Math.min(layout.length - 1, index))]?.offset ?? Object.freeze({ x: 0, y: 0 });
}

export function markerRectsIntersect(
  left: DataviewMarkerRect | null | undefined,
  right: DataviewMarkerRect | null | undefined,
  epsilon = 0,
): boolean {
  if (!left || !right) return false;
  return left.left < right.right - epsilon
    && right.left < left.right - epsilon
    && left.top < right.bottom - epsilon
    && right.top < left.bottom - epsilon;
}

function timelineUnits(gameplayTimeline: DataviewGameplayTimeline | null | undefined): readonly DataviewTimelineUnit[] {
  return gameplayTimeline?.schema === "aoe-sim.dataview-gameplay-timeline/v1"
    ? Object.freeze([...(gameplayTimeline.units ?? [])])
    : Object.freeze([]);
}

function workerTaskTimeline(
  gameplayTimeline: DataviewGameplayTimeline | null | undefined
): readonly DataviewWorkerTaskTimelineEvent[] {
  return gameplayTimeline?.schema === "aoe-sim.dataview-gameplay-timeline/v1"
    ? Object.freeze([...(gameplayTimeline.worker_task_timeline ?? [])])
    : Object.freeze([]);
}

function activeWorkerTaskStates(
  units: readonly DataviewTimelineUnit[],
  taskTimeline: readonly DataviewWorkerTaskTimelineEvent[],
  seconds: number
): ReadonlyMap<string, DataviewWorkerTaskState> {
  if (!taskTimeline.length) return Object.freeze(new Map());
  const taskRowsByActor = new Map<string, DataviewWorkerTaskTimelineEvent[]>();
  taskTimeline.forEach((row) => {
    const player = numericId(row.player);
    const actorId = numericId(row.actor_id ?? row.source_actor_id);
    const time = finiteNumber(row.time, Number.NaN);
    if (player === null || actorId === null || !Number.isFinite(time)) return;
    const key = `actor:${player}:${actorId}`;
    const rows = taskRowsByActor.get(key) ?? [];
    rows.push(row);
    taskRowsByActor.set(key, rows);
  });
  taskRowsByActor.forEach((rows) => rows.sort(workerTaskTimelineSort));

  const states = new Map<string, DataviewWorkerTaskState>();
  units.filter(timelineUnitIsWorker).forEach((unit) => {
    const player = timelineUnitPlayer(unit);
    const actorId = numericId(unit.source_actor_id);
    const birthTime = finiteNumber(unit.birth_time, Number.NaN);
    if (player <= 0 || actorId === null || !Number.isFinite(birthTime)) return;
    const rows = taskRowsByActor.get(`actor:${player}:${actorId}`) ?? [];
    let latest: DataviewWorkerTaskTimelineEvent | null = null;
    for (const row of rows) {
      const time = finiteNumber(row.time, Number.NaN);
      if (!Number.isFinite(time) || time + VISIBILITY_EPSILON < birthTime) continue;
      if (time > seconds + VISIBILITY_EPSILON) break;
      latest = row;
    }
    if (latest) states.set(timelineUnitIdentityKey(unit), effectiveWorkerTaskState(latest, seconds));
  });
  return Object.freeze(states);
}

function workerTaskTimelineSort(
  left: DataviewWorkerTaskTimelineEvent,
  right: DataviewWorkerTaskTimelineEvent
): number {
  return finiteNumber(left.time, Number.NaN) - finiteNumber(right.time, Number.NaN)
    || finiteNumber(left.event_index) - finiteNumber(right.event_index)
    || String(left.command_kind ?? "").localeCompare(String(right.command_kind ?? ""));
}

function effectiveWorkerTaskState(
  row: DataviewWorkerTaskTimelineEvent,
  seconds: number
): DataviewWorkerTaskState {
  const indexedTaskAssignment = workerTaskAssignmentKey(row.indexed_task_assignment ?? row.task_assignment);
  let taskAssignment = workerTaskAssignmentKey(row.task_assignment);
  let phase = "";
  let evidenceClass = workerTaskEvidenceClass(row.evidence_class);
  let evidence = String(row.evidence ?? "");
  const completion = finiteNumber(row.estimated_completion_time, Number.NaN);
  const commandKind = normalizedLookupName(row.command_kind);
  const postBuildStatus = normalizedLookupName(row.post_build_resource_status);
  if (commandKind === "build" && Number.isFinite(completion)) {
    if (seconds + VISIBILITY_EPSILON >= completion) {
      const postBuildTaskAssignment = workerResourceTaskAssignmentKey(row.post_build_task_assignment);
      if (postBuildTaskAssignment) {
        taskAssignment = postBuildTaskAssignment;
        phase = "post-build";
        evidenceClass = workerTaskEvidenceClass(row.post_build_evidence_class, "simulated");
        evidence = row.post_build_evidence
          ? String(row.post_build_evidence)
          : evidence;
      } else {
        taskAssignment = indexedTaskAssignment ?? taskAssignment;
        phase = "post-build-resource-unresolved";
        if (row.post_build_evidence_class) {
          evidenceClass = workerTaskEvidenceClass(row.post_build_evidence_class, "simulated");
          evidence = row.post_build_evidence
            ? String(row.post_build_evidence)
            : evidence;
        }
      }
    } else {
      taskAssignment = indexedTaskAssignment ?? taskAssignment ?? "build";
      phase = "construction";
    }
  }
  return Object.freeze({
    taskAssignment,
    indexedTaskAssignment,
    phase,
    time: cleanTime(finiteNumber(row.time)),
    eventIndex: finiteNumber(row.event_index),
    commandKind: commandKind || "command",
    evidenceClass,
    evidence,
    postBuildResourceStatus: postBuildStatus,
  });
}

function workerTaskAssignmentKey(value: unknown): string | null {
  const key = normalizedLookupName(value);
  if (key === "food" || key === "wood" || key === "gold" || key === "stone"
    || key === "gather" || key === "build" || key === "repair") return key;
  return null;
}

function workerResourceTaskAssignmentKey(value: unknown): "food" | "wood" | "gold" | "stone" | null {
  const key = normalizedLookupName(value);
  if (key === "food" || key === "wood" || key === "gold" || key === "stone") return key;
  return null;
}

function workerTaskEvidenceClass(value: unknown, fallback = "observed"): string {
  const key = normalizedLookupName(value);
  if (key === "observed" || key === "simulated" || key === "reconciled") return key;
  return fallback;
}

function timelineUnitAssignment(
  unit: DataviewTimelineUnit,
  seconds: number,
  dimension: number,
  workerTaskState: DataviewWorkerTaskState | undefined
): readonly DataviewUnitAssignment[] {
  const interpolation = unitTimelineInterpolationState(unit, seconds);
  if (!interpolation) return [];
  const spriteKey = canonicalMapSpriteKey(unit.sprite_key ?? resolveMapSpriteKey({
    name: unit.name ?? "",
    category: unit.category ?? null,
    worker: Boolean(unit.worker),
  })) ?? "unknown";
  const category = unit.category ?? unitCategoryForMapSpriteKey(spriteKey);
  const evidenceQuality = unitTimelineEvidenceQuality(unit);
  const evidenceClass = unitTimelineEvidenceClass(unit);
  const markerKey = String(unit.id ?? unit.stable_id ?? "");
  const stableId = String(unit.stable_id ?? markerKey);
  const activity = unitTimelineActivityState(unit, seconds);
  const partyKind = activitySpriteMotionKind(activity.kind, unit.birth_kind);
  const positionCredible = mapPositionIsCredible(interpolation.current, dimension);
  const mapRendered = Boolean(positionCredible && canonicalMapSpriteKey(spriteKey));
  const resolvedUnitId = numericId(unit.resolved_unit_id ?? unit.unit_id);
  const assignment = freezeAssignment({
    player: numericId(unit.player) ?? 0,
    instanceId: unit.source_actor_id ?? markerKey,
    sourceActorId: numericId(unit.source_actor_id),
    stableId,
    markerKey,
    worker: Boolean(unit.worker || category === "villagers"),
    villager: Boolean(unit.worker || category === "villagers"),
    partyId: stableId,
    partyKind,
    partyTime: finiteNumber(unit.birth_time),
    activityKind: activity.kind,
    activityLabel: activity.label,
    activityTime: activity.time,
    activityEvidenceClass: activity.evidenceClass,
    activitySource: activity.source,
    villagerTaskAssignment: workerTaskState?.taskAssignment ?? null,
    indexedVillagerTaskAssignment: workerTaskState?.indexedTaskAssignment ?? null,
    villagerTaskPhase: workerTaskState?.phase ?? "",
    villagerTaskTime: workerTaskState?.time ?? null,
    villagerTaskCommandKind: workerTaskState?.commandKind ?? "",
    villagerTaskEvidenceClass: workerTaskState?.evidenceClass ?? "",
    villagerTaskEvidence: workerTaskState?.evidence ?? "",
    position: freezePoint(interpolation.current),
    commandDestination: freezePoint(interpolation.destination),
    interpolationFrom: freezePoint(interpolation.from),
    interpolationTo: freezePoint(interpolation.to),
    unitIdentity: Object.freeze({
      quality: evidenceQuality,
      unit_id: resolvedUnitId,
      name: unit.name ?? "",
      evidence: `${unit.birth_evidence_class ?? "simulated"}:${unit.reconciliation?.status ?? "unresolved"}`,
    }),
    resolvedUnitId,
    unitName: unit.name ?? "",
    referenceUnitName: unit.name ?? "",
    spriteKey,
    spriteCategory: spriteKey ? SPRITE_LABELS.get(spriteKey) ?? "" : "",
    category,
    evidenceQuality,
    evidenceClass,
    evidence: unit.reconciliation?.evidence ?? unit.birth_confirmation ?? "",
    outcome: unit.end_reason ?? unit.reconciliation?.status ?? "",
    endTime: finiteNumber(unit.visible_until, Number.POSITIVE_INFINITY),
    positionCredible,
    mapRendered,
    interpolationStatus: interpolation.status,
    interpolationProgress: interpolation.progress,
    interpolationEvidenceClass: interpolation.segmentEvidence,
    interpolationKind: interpolation.interpolationKind,
    interpolationTimeBound: interpolation.timeBound,
    interpolationFromTime: interpolation.fromTime,
    interpolationToTime: interpolation.toTime,
    interpolationDistanceTiles: interpolation.distanceTiles,
    interpolationTravelTimeSeconds: interpolation.travelTimeSeconds,
    birthTime: finiteNumber(unit.birth_time),
    birthEvidenceClass: unit.birth_evidence_class ?? "",
    birthConfirmation: unit.birth_confirmation ?? "",
    positionHorizonSeconds: unitTimelinePositionHorizonSeconds(unit),
    positionValidUntil: finiteNumber(unit.position_valid_until, Number.POSITIVE_INFINITY),
    positionEndReason: unit.position_end_reason ?? "",
    producerId: numericId(unit.producer_id),
    queueId: unit.queue_id ?? null,
    reconciliationStatus: unit.reconciliation?.status ?? "",
    stackAnchorPositionKey: individualUnitStackPositionKey(interpolation.current),
    stackUnitTypeKey: "",
    stackCount: 1,
    stackMemberKeys: [markerKey],
    stackMemberIds: [String(unit.source_actor_id ?? markerKey)],
    stackEvidenceSplit: `${evidenceQuality}:1`,
    stackLayoutIndex: 0,
    stackLayoutCount: 1,
    stackLayoutItemCounts: [1],
  });
  return [assignment];
}

function freezeAssignment(assignment: DataviewUnitAssignment): DataviewUnitAssignment {
  return Object.freeze({
    ...assignment,
    position: freezePoint(assignment.position),
    commandDestination: freezePoint(assignment.commandDestination),
    interpolationFrom: freezePoint(assignment.interpolationFrom),
    interpolationTo: freezePoint(assignment.interpolationTo),
    unitIdentity: Object.freeze({ ...assignment.unitIdentity }),
    stackMemberKeys: Object.freeze([...assignment.stackMemberKeys]),
    stackMemberIds: Object.freeze([...assignment.stackMemberIds]),
    stackLayoutItemCounts: Object.freeze([...assignment.stackLayoutItemCounts]),
  });
}

function freezeInterpolation(interpolation: DataviewInterpolationState): DataviewInterpolationState {
  return Object.freeze({
    ...interpolation,
    current: freezePoint(interpolation.current),
    from: freezePoint(interpolation.from),
    destination: freezePoint(interpolation.destination),
    to: freezePoint(interpolation.to),
  });
}

function freezePoint(point: DataviewPoint): DataviewPoint {
  return Object.freeze({ x: cleanNumber(point.x), y: cleanNumber(point.y) });
}

function freezeRect(rect: Pick<DataviewMarkerRect, "left" | "top" | "right" | "bottom">): DataviewMarkerRect {
  const left = cleanNumber(Math.min(rect.left, rect.right));
  const right = cleanNumber(Math.max(rect.left, rect.right));
  const top = cleanNumber(Math.min(rect.top, rect.bottom));
  const bottom = cleanNumber(Math.max(rect.top, rect.bottom));
  return Object.freeze({
    left,
    top,
    right,
    bottom,
    width: cleanNumber(right - left),
    height: cleanNumber(bottom - top),
  });
}

function unionMarkerRects(rects: readonly DataviewMarkerRect[]): DataviewMarkerRect {
  if (!rects.length) return freezeRect({ left: 0, top: 0, right: 0, bottom: 0 });
  return freezeRect({
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  });
}

function unitTimelineActivityState(unit: DataviewTimelineUnit, seconds: number): DataviewActivityState {
  const observations = [...unit.observations ?? []]
    .filter((row) => Number.isFinite(row.time) && Number(row.time) <= seconds + VISIBILITY_EPSILON)
    .sort((a, b) => finiteNumber(a.time) - finiteNumber(b.time) || finiteNumber(a.index) - finiteNumber(b.index));
  const latest = observations.at(-1);
  if (latest) {
    return Object.freeze({
      kind: activityKind(latest.kind ?? "command"),
      label: latest.label ?? latest.kind ?? "command",
      time: cleanTime(finiteNumber(latest.time)),
      evidenceClass: latest.evidence_class ?? "observed",
      source: "timeline-observation",
    });
  }
  const birthKind = unit.birth_kind === "queue_estimate" ? "queue-estimate" : "starting-actor";
  return Object.freeze({
    kind: birthKind,
    label: unit.birth_confirmation ?? birthKind,
    time: cleanTime(finiteNumber(unit.birth_time)),
    evidenceClass: unit.birth_evidence_class ?? "simulated",
    source: "timeline-birth",
  });
}

function activityKind(kind: string): string {
  const normalized = normalizedLookupName(kind);
  if (normalized === "target" || normalized === "order") return "attack";
  if (normalized === "move") return "move";
  if (normalized === "build") return "build";
  if (normalized === "repair") return "repair";
  if (normalized === "gather") return "gather";
  if (normalized === "attack") return "attack";
  if (normalized === "parser initial position") return "starting-actor";
  return normalized || "command";
}

function activitySpriteMotionKind(activity: string, birthKind: string | undefined): string {
  if (activity === "attack" || activity === "target" || activity === "order") return "attack";
  if (activity === "gather") return "gather";
  if (activity === "build") return "build";
  if (activity === "repair") return "repair";
  return birthKind === "queue_estimate" ? "move" : activity === "starting-actor" ? "move" : "move";
}

function unitTimelineEvidenceQuality(unit: DataviewTimelineUnit): string {
  const status = unit.reconciliation?.status ?? "";
  if (unit.birth_kind === "starting_actor") return "observed";
  if (status === "matched") return "reconciled";
  if (status === "ambiguous-observed-actor") return "ambiguous";
  if (status === "unmatched-observed-actor") return "observed";
  if (status === "anonymous-estimate") return "simulated";
  return unit.birth_evidence_class ?? "unclassified";
}

function unitTimelineEvidenceClass(unit: DataviewTimelineUnit): DataviewEvidenceClass {
  const status = unit.reconciliation?.status ?? "";
  if (status === "matched") return "reconciled";
  if (status === "ambiguous-observed-actor") return "reconciled";
  if (status === "unmatched-observed-actor") return "observed";
  if (unit.birth_evidence_class === "observed"
    || unit.birth_evidence_class === "simulated"
    || unit.birth_evidence_class === "reconciled") return unit.birth_evidence_class;
  return "simulated";
}

function unitTimelinePositionHorizonSeconds(unit: DataviewTimelineUnit): number {
  const explicit = finiteNumber(unit.position_horizon_seconds, Number.NaN);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  return unit.worker || unit.category === "villagers" ? 600 : 360;
}

function unitTimelineFirstRetirementBetween(
  unit: DataviewTimelineUnit,
  fromExclusive: number,
  toInclusive: number
): DataviewPositionRetirement | null {
  return (unit.position_retirements ?? [])
    .map((row) => ({ ...row, time: finiteNumber(row.time, Number.NaN) }))
    .filter((row) =>
      Number.isFinite(row.time)
      && row.time > fromExclusive + VISIBILITY_EPSILON
      && row.time <= toInclusive + VISIBILITY_EPSILON)
    .sort((a, b) => a.time - b.time || String(a.kind).localeCompare(String(b.kind)))[0] ?? null;
}

function unitTimelinePositionFreshAt(unit: DataviewTimelineUnit, evidenceTime: number, seconds: number): boolean {
  if (!Number.isFinite(evidenceTime) || !Number.isFinite(seconds)) return false;
  if (seconds - evidenceTime > unitTimelinePositionHorizonSeconds(unit) + VISIBILITY_EPSILON) return false;
  return !unitTimelineFirstRetirementBetween(unit, evidenceTime, seconds);
}

function timelineInterpolatedPoint(from: DataviewPoint, to: DataviewPoint, progress: number): DataviewPoint {
  return Object.freeze({
    x: cleanNumber(from.x + (to.x - from.x) * progress),
    y: cleanNumber(from.y + (to.y - from.y) * progress),
  });
}

function activeIndividualUnitIdentityKey(assignment: DataviewUnitAssignment): string {
  const actorId = numericId(assignment.sourceActorId ?? assignment.instanceId);
  return actorId === null
    ? `stable:${assignment.player}:${assignment.stableId ?? assignment.markerKey ?? assignment.instanceId}`
    : `actor:${assignment.player}:${actorId}`;
}

function assignmentEvidenceRank(assignment: DataviewUnitAssignment): number {
  const quality = assignment.evidenceQuality ?? "unclassified";
  if (quality === "observed") return 0;
  if (quality === "reconciled") return 1;
  if (quality === "simulated") return 2;
  if (quality === "anonymous") return 3;
  if (quality === "ambiguous") return 4;
  return 5;
}

function dedupeActiveIndividualUnitAssignments(
  assignments: readonly DataviewUnitAssignment[]
): readonly DataviewUnitAssignment[] {
  const selected = new Map<string, DataviewUnitAssignment>();
  assignments.forEach((assignment) => {
    const key = activeIndividualUnitIdentityKey(assignment);
    const previous = selected.get(key);
    if (!previous) {
      selected.set(key, assignment);
      return;
    }
    const preference = assignmentEvidenceRank(assignment) - assignmentEvidenceRank(previous)
      || finiteNumber(previous.birthTime) - finiteNumber(assignment.birthTime)
      || String(assignment.markerKey ?? "").localeCompare(String(previous.markerKey ?? ""), undefined, {
        numeric: true,
      });
    if (preference < 0) selected.set(key, assignment);
  });
  return Object.freeze([...selected.values()]
    .sort((a, b) => activeIndividualUnitIdentityKey(a).localeCompare(
      activeIndividualUnitIdentityKey(b),
      undefined,
      { numeric: true },
    )));
}

function individualUnitStackPositionKey(position: DataviewPoint): string {
  return `${Number(position.x).toFixed(2)}:${Number(position.y).toFixed(2)}`;
}

function positiveStackCount(value: unknown): number {
  const count = Number(value);
  return Number.isSafeInteger(count) && count > 0 ? count : 1;
}

function exactTypeStackCountText(stackCount: number): string {
  return stackCount > 1 ? String(stackCount) : "";
}

function individualUnitTypeStackKey(assignment: DataviewUnitAssignment, spriteKey: string): string {
  const unitId = numericId(assignment.resolvedUnitId ?? assignment.unitIdentity?.unit_id);
  if (unitId !== null) return `unit:${unitId}`;
  const name = normalizedLookupName(
    assignment.unitName
      || assignment.referenceUnitName
      || assignment.unitIdentity?.name
      || "",
  );
  if (name) return `name:${name}`;
  return `sprite:${spriteKey}`;
}

function individualUnitMarkerIdentityKey(assignment: DataviewUnitAssignment): string {
  return String(
    assignment.markerKey
      ?? assignment.stableId
      ?? `${assignment.player}:${assignment.instanceId}:${assignment.partyId ?? ""}`,
  );
}

function individualUnitStackSort(left: DataviewUnitAssignment, right: DataviewUnitAssignment): number {
  return individualUnitMarkerIdentityKey(left).localeCompare(individualUnitMarkerIdentityKey(right))
    || String(left.stableId).localeCompare(String(right.stableId))
    || String(left.instanceId).localeCompare(String(right.instanceId));
}

function individualUnitStackGroupSort(left: DataviewUnitAssignment, right: DataviewUnitAssignment): number {
  return Number(left.player) - Number(right.player)
    || String(left.stackUnitTypeKey).localeCompare(String(right.stackUnitTypeKey), undefined, { numeric: true })
    || String(left.spriteKey).localeCompare(String(right.spriteKey))
    || String(left.category).localeCompare(String(right.category))
    || String(left.markerKey).localeCompare(String(right.markerKey), undefined, { numeric: true });
}

function unitCategoryForMapSpriteKey(spriteKey: string, category: string | null = null): string | null {
  const key = canonicalMapSpriteKey(spriteKey) ?? spriteKey;
  return category ?? SPRITE_CATEGORIES.get(key) ?? null;
}

function buildPopulationSummary(
  units: readonly DataviewTimelineUnit[],
  assignments: readonly DataviewUnitAssignment[],
  seconds: number,
  workerTaskStates: ReadonlyMap<string, DataviewWorkerTaskState>
): DataviewPopulationSummary {
  const players = [...new Set([
    ...units.map((unit) => numericId(unit.player) ?? 0),
    ...assignments.map((assignment) => assignment.player),
  ])].filter((player) => player > 0).sort((a, b) => a - b);
  const playerSummaries = players.map((player) => Object.freeze({
    player,
    workers: buildWorkerPopulationSummary(player, units, assignments, seconds, workerTaskStates),
  }));
  const workerTotalsByPlayer = freezeCountObject(Object.fromEntries(
    playerSummaries.map((row) => [String(row.player), row.workers.total]),
  ));
  const mapPositionedWorkersByPlayer = freezeCountObject(Object.fromEntries(
    playerSummaries.map((row) => [String(row.player), row.workers.mapPositioned]),
  ));
  const positionUnknownWorkersByPlayer = freezeCountObject(Object.fromEntries(
    playerSummaries.map((row) => [String(row.player), row.workers.positionUnknown]),
  ));
  return Object.freeze({
    schema: "aoe-sim.dataview-population-summary/v1",
    seconds: cleanTime(seconds),
    players: Object.freeze(playerSummaries),
    workerTotalsByPlayer,
    mapPositionedWorkersByPlayer,
    positionUnknownWorkersByPlayer,
    totalWorkers: playerSummaries.reduce((sum, row) => sum + row.workers.total, 0),
  });
}

function buildWorkerPopulationSummary(
  player: number,
  units: readonly DataviewTimelineUnit[],
  assignments: readonly DataviewUnitAssignment[],
  seconds: number,
  workerTaskStates: ReadonlyMap<string, DataviewWorkerTaskState>
): DataviewWorkerPopulationSummary {
  const playerWorkers = units.filter((unit) => timelineUnitPlayer(unit) === player && timelineUnitIsWorker(unit));
  const activeWorkers = playerWorkers.filter((unit) => timelineUnitActiveAt(unit, seconds));
  const lifecycleFiltered = playerWorkers.filter((unit) => timelineUnitLifecycleFilteredAt(unit, seconds));
  const workerAssignments = assignments.filter((assignment) => assignment.player === player && assignment.worker);
  const positionKnownKeys = new Set(workerAssignments
    .filter((assignment) => assignment.positionCredible)
    .map(activeIndividualUnitIdentityKey));
  const mapPositionedKeys = new Set(workerAssignments
    .filter((assignment) => assignment.mapRendered)
    .map(activeIndividualUnitIdentityKey));
  const assignmentByKey = new Map(workerAssignments.map((assignment) => [
    activeIndividualUnitIdentityKey(assignment),
    assignment,
  ]));
  const resourceCounts = emptyWorkerResourceCounts();
  activeWorkers.forEach((unit) => {
    const identityKey = timelineUnitIdentityKey(unit);
    const assignment = assignmentByKey.get(identityKey);
    const taskState = workerTaskStates.get(identityKey);
    const resource = workerResourceCountKey(taskState?.taskAssignment ?? assignment?.villagerTaskAssignment);
    resourceCounts[resource ?? "Other"] = (resourceCounts[resource ?? "Other"] ?? 0) + 1;
  });
  const resourceTotal = WORKER_RESOURCE_COUNT_KEYS.reduce((sum, resource) => sum + (resourceCounts[resource] ?? 0), 0);
  const evidenceCounts = countRecord(activeWorkers.map((unit) => unitTimelineEvidenceClass(unit)));
  const evidenceQualityCounts = countRecord(activeWorkers.map((unit) => unitTimelineEvidenceQuality(unit)));
  const birthKindCounts = countRecord(activeWorkers.map((unit) => unit.birth_kind ?? "unknown"));
  const assignmentCounts = countRecord(activeWorkers.map((unit) => {
    const identityKey = timelineUnitIdentityKey(unit);
    const assignment = assignmentByKey.get(identityKey);
    const taskState = workerTaskStates.get(identityKey);
    if (taskState) {
      return taskState.taskAssignment ?? `unassigned-${taskState.commandKind || "task"}`;
    }
    return assignment?.villagerTaskAssignment ?? "position-unknown-or-unassigned";
  }));
  return Object.freeze({
    total: activeWorkers.length,
    resourceCounts: freezeCountObject(resourceCounts),
    resourceTotal,
    other: resourceCounts.Other ?? 0,
    equationMatchesTotal: resourceTotal + (resourceCounts.Other ?? 0) === activeWorkers.length,
    mapPositioned: mapPositionedKeys.size,
    positionKnown: positionKnownKeys.size,
    positionUnknown: Math.max(0, activeWorkers.length - positionKnownKeys.size),
    lifecycleFiltered: lifecycleFiltered.length,
    starting: activeWorkers.filter((unit) => unit.birth_kind === "starting_actor").length,
    queueEstimated: activeWorkers.filter((unit) => unit.birth_kind === "queue_estimate").length,
    observedActor: activeWorkers.filter((unit) => unit.birth_kind === "observed_actor").length,
    sourceActorWorkers: activeWorkers.filter((unit) => numericId(unit.source_actor_id) !== null).length,
    replayEndSurvivalUnresolved: activeWorkers.filter((unit) =>
      String(unit.end_reason ?? "").includes("survival-unresolved-through-replay-end")).length,
    evidenceCounts: freezeCountObject(evidenceCounts),
    evidenceQualityCounts: freezeCountObject(evidenceQualityCounts),
    birthKindCounts: freezeCountObject(birthKindCounts),
    assignmentCounts: freezeCountObject(assignmentCounts),
    source: "gameplay-timeline-active-workers",
  });
}

function emptyWorkerResourceCounts(): Record<string, number> {
  return {
    Food: 0,
    Wood: 0,
    Gold: 0,
    Stone: 0,
    Other: 0,
  };
}

function workerResourceCountKey(value: unknown): "Food" | "Wood" | "Gold" | "Stone" | null {
  const key = normalizedLookupName(value);
  if (key === "food") return "Food";
  if (key === "wood") return "Wood";
  if (key === "gold") return "Gold";
  if (key === "stone") return "Stone";
  return null;
}

function timelineUnitPlayer(unit: DataviewTimelineUnit): number {
  return numericId(unit.player) ?? 0;
}

function timelineUnitIsWorker(unit: DataviewTimelineUnit): boolean {
  return Boolean(unit.worker || unit.category === "villagers");
}

function timelineUnitIdentityKey(unit: DataviewTimelineUnit): string {
  const player = timelineUnitPlayer(unit);
  const actorId = numericId(unit.source_actor_id);
  if (actorId !== null) return `actor:${player}:${actorId}`;
  return `stable:${player}:${unit.stable_id ?? unit.id ?? ""}`;
}

function timelineUnitActiveAt(unit: DataviewTimelineUnit, seconds: number): boolean {
  const birthTime = finiteNumber(unit.birth_time, Number.NaN);
  const visibleUntil = finiteNumber(unit.visible_until, Number.POSITIVE_INFINITY);
  return Number.isFinite(birthTime)
    && seconds + VISIBILITY_EPSILON >= birthTime
    && seconds <= visibleUntil + VISIBILITY_EPSILON;
}

function timelineUnitLifecycleFilteredAt(unit: DataviewTimelineUnit, seconds: number): boolean {
  const birthTime = finiteNumber(unit.birth_time, Number.NaN);
  const visibleUntil = finiteNumber(unit.visible_until, Number.POSITIVE_INFINITY);
  return Number.isFinite(birthTime)
    && seconds + VISIBILITY_EPSILON >= birthTime
    && seconds > visibleUntil + VISIBILITY_EPSILON;
}

function renderDiagnostics(
  units: readonly DataviewTimelineUnit[],
  assignments: readonly DataviewUnitAssignment[],
  markerGroups: readonly DataviewUnitAssignment[],
  seconds: number,
  population: DataviewPopulationSummary
): DataviewRenderDiagnostics {
  const mapRendered = assignments.filter((assignment) => assignment.mapRendered);
  const assignedIds = new Set(assignments.map((assignment) => assignment.stableId));
  const lifecycleFiltered = units.filter((unit) => {
    return timelineUnitLifecycleFilteredAt(unit, seconds);
  });
  const stalePositionFiltered = units.filter((unit) => {
    const stableId = String(unit.stable_id ?? unit.id ?? "");
    const birthTime = finiteNumber(unit.birth_time, Number.NaN);
    const positionValidUntil = finiteNumber(unit.position_valid_until, Number.POSITIVE_INFINITY);
    const visibleUntil = finiteNumber(unit.visible_until, Number.POSITIVE_INFINITY);
    return Number.isFinite(birthTime)
      && seconds >= birthTime
      && seconds < visibleUntil
      && seconds > positionValidUntil + VISIBILITY_EPSILON
      && !assignedIds.has(stableId);
  });
  const byPosition = new Map<string, Set<string>>();
  markerGroups.forEach((group) => {
    const set = byPosition.get(group.stackAnchorPositionKey) ?? new Set<string>();
    set.add(group.stackUnitTypeKey);
    byPosition.set(group.stackAnchorPositionKey, set);
  });
  return Object.freeze({
    timelineUnits: units.length,
    assignments: assignments.length,
    mapRendered: mapRendered.length,
    positionUnknown: assignments.filter((assignment) => !assignment.positionCredible).length,
    lifecycleFiltered: lifecycleFiltered.length,
    stalePositionFiltered: stalePositionFiltered.length,
    evidenceCounts: countRecord(assignments.map((assignment) => assignment.evidenceClass)),
    activityCounts: countRecord(assignments.map((assignment) => assignment.activityKind)),
    spriteCounts: countRecord(mapRendered.map((assignment) => assignment.spriteKey)),
    markerGroups: markerGroups.length,
    stackedGroups: markerGroups.filter((assignment) => assignment.stackCount > 1).length,
    stackedUnits: markerGroups.reduce((sum, assignment) => sum + Math.max(0, assignment.stackCount - 1), 0),
    mixedPositionGroups: [...byPosition.values()].filter((set) => set.size > 1).length,
    exactTypeGroupKeys: Object.freeze(markerGroups
      .map((assignment) => `${assignment.stackAnchorPositionKey}:${assignment.stackUnitTypeKey}:${assignment.stackCount}`)
      .sort()),
    disappearedSupportedUnits: lifecycleFiltered.length,
    workerTotalsByPlayer: population.workerTotalsByPlayer,
    mapRenderedWorkersByPlayer: population.mapPositionedWorkersByPlayer,
    positionUnknownWorkersByPlayer: population.positionUnknownWorkersByPlayer,
  });
}

function diagnosticChecks(
  units: readonly DataviewTimelineUnit[],
  snapshots: readonly DataviewRenderSnapshot[],
  parity: DataviewSeekParityResult
): readonly DataviewDiagnosticCheck[] {
  const checks: DataviewDiagnosticCheck[] = [];
  const allAssignments = snapshots.flatMap((snapshot) => snapshot.assignments);
  const allGroups = snapshots.flatMap((snapshot) => snapshot.markerGroups);
  checks.push({
    name: "timeline schema present",
    passed: units.length > 0,
    detail: `${units.length} unit rows`,
  });
  checks.push({
    name: "evidence classes preserved",
    passed: allAssignments.every((assignment) =>
      ["observed", "simulated", "reconciled"].includes(assignment.evidenceClass)),
    detail: countRecord(allAssignments.map((assignment) => assignment.evidenceClass), true),
  });
  checks.push({
    name: "no map-origin fabrication",
    passed: allAssignments.every((assignment) =>
      !assignment.mapRendered || !(assignment.position.x === 0 && assignment.position.y === 0)),
    detail: `${allAssignments.filter((assignment) =>
      assignment.mapRendered && assignment.position.x === 0 && assignment.position.y === 0).length} rendered origins`,
  });
  checks.push({
    name: "stale/lifecycle filtering active",
    passed: snapshots.some((snapshot) =>
      snapshot.diagnostics.lifecycleFiltered > 0 || snapshot.diagnostics.stalePositionFiltered > 0),
    detail: snapshots
      .map((snapshot) =>
        `${snapshot.seconds.toFixed(3)}:life=${snapshot.diagnostics.lifecycleFiltered},stale=${snapshot.diagnostics.stalePositionFiltered}`)
      .join(";"),
  });
  checks.push({
    name: "exact type grouping",
    passed: allGroups.every((group) => group.stackUnitTypeKey && group.stackLayoutCount >= 1),
    detail: `${allGroups.length} marker group snapshots`,
  });
  checks.push({
    name: "seek parity",
    passed: parity.deterministic,
    detail: parity.parity.map((row) =>
      `${row.seconds.toFixed(3)}:${row.repeatCount}:${row.deterministic}`).join(";"),
  });
  return Object.freeze(checks.map((check) => Object.freeze(check)));
}

function snapshotChecksum(
  seconds: number,
  assignments: readonly DataviewUnitAssignment[],
  markerGroups: readonly DataviewUnitAssignment[],
  population: DataviewPopulationSummary,
  diagnostics: DataviewRenderDiagnostics
): string {
  const assignmentText = assignments
    .map((assignment) => [
      assignment.markerKey,
      assignment.player,
      assignment.sourceActorId ?? "",
      assignment.stableId,
      assignment.spriteKey,
      assignment.evidenceClass,
      assignment.evidenceQuality,
      assignment.activityKind,
      assignment.villagerTaskAssignment ?? "",
      assignment.indexedVillagerTaskAssignment ?? "",
      assignment.villagerTaskPhase ?? "",
      assignment.position.x.toFixed(3),
      assignment.position.y.toFixed(3),
      assignment.interpolationStatus,
      assignment.interpolationProgress.toFixed(3),
      assignment.endTime.toFixed(3),
    ].join("/"))
    .join("|");
  const groupText = markerGroups
    .map((group) => [
      group.markerKey,
      group.stackUnitTypeKey,
      group.stackCount,
      group.stackLayoutIndex,
      group.stackLayoutCount,
      group.stackLayoutItemCounts.join("+"),
      group.stackMemberKeys.join("+"),
    ].join("/"))
    .join("|");
  return fnv1a([
    seconds.toFixed(3),
    assignmentText,
    groupText,
    diagnostics.timelineUnits,
    diagnostics.assignments,
    diagnostics.mapRendered,
    diagnostics.lifecycleFiltered,
    diagnostics.stalePositionFiltered,
    JSON.stringify(population.workerTotalsByPlayer),
    JSON.stringify(population.mapPositionedWorkersByPlayer),
    JSON.stringify(population.positionUnknownWorkersByPlayer),
    JSON.stringify(population.players.map((row) => [
      row.player,
      row.workers.resourceCounts,
      row.workers.assignmentCounts,
    ])),
  ].join("||"));
}

function freezeCountObject(record: Record<string, number>): Record<string, number> {
  return Object.freeze(Object.fromEntries(
    Object.entries(record).sort((a, b) => a[0].localeCompare(b[0])),
  ));
}

function countRecord(values: readonly unknown[], asText?: false): Record<string, number>;
function countRecord(values: readonly unknown[], asText: true): string;
function countRecord(values: readonly unknown[], asText = false): Record<string, number> | string {
  const counts = new Map<string, number>();
  values.filter((value) => value !== null && value !== undefined && value !== "").forEach((value) => {
    const key = String(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const entries = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (asText) return entries.map(([value, count]) => `${value}:${count}`).join(",");
  return Object.freeze(Object.fromEntries(entries));
}

function unitNameMatches(name: string, pattern: RegExp): boolean {
  return pattern.test(normalizedLookupName(name));
}

function unitClassId(classId: number | null, stats: Record<string, unknown>): number {
  return classId ?? numericId(stats.class_id ?? stats.classId) ?? -1;
}

function unitClassIdMatches(classId: number, ids: readonly number[]): boolean {
  return ids.includes(classId);
}

function packedSiegeClassMatchesName(classId: number, name: string): boolean {
  return unitClassIdMatches(classId, PACKED_SIEGE_UNIT_CLASS_IDS)
    && unitNameMatches(name, /\b(trebuchet|mang|pmang|sling|neighbor)\b/);
}

function numericId(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function cleanNumber(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
}

function cleanTime(value: number): number {
  return cleanNumber(Math.max(0, value));
}

function fnv1a(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
