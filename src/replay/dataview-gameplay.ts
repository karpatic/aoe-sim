type JsonObject = Record<string, unknown>;

interface Point {
  readonly x: number;
  readonly y: number;
}

interface DataviewGameplayTimelineInputs {
  readonly game: JsonObject;
  readonly lifetimes: JsonObject;
  readonly economy: JsonObject;
  readonly resourceEstimates: JsonObject;
  readonly unitStats: JsonObject;
  readonly ruleset: JsonObject;
  readonly replaySha256: string;
  readonly rulesetSha256: string;
}

interface IndexedInputRow {
  readonly index: number;
  readonly time: number;
  readonly player: number;
  readonly type: string;
  readonly param: string;
  readonly payload: JsonObject;
  readonly position: Point | null;
  readonly sourceIds: readonly number[];
}

interface UnitIdentity {
  readonly sourceUnitId: number | null;
  readonly resolvedUnitId: number | null;
  readonly name: string;
  readonly normalizedName: string;
  readonly classId: number | null;
  readonly category: string | null;
  readonly spriteKey: string | null;
  readonly baseTrainTime: number;
  readonly effectiveTrainTime: number;
  readonly speed: number;
  readonly trainTimeEvidence: string;
}

interface BuildingTimelineRow {
  readonly id: string;
  readonly player: number;
  readonly instance_id: number | null;
  readonly name: string;
  readonly position: Point;
  readonly footprint: { readonly width: number; readonly height: number };
  readonly placed_time: number;
  readonly estimated_completion_time: number;
  readonly available_time: number;
  readonly evidence_class: "observed" | "simulated";
  readonly completion_evidence_class: "observed" | "simulated";
  readonly builder_count: number;
  readonly builder_ids: readonly number[];
  readonly base_build_seconds: number;
  readonly construction_seconds: number;
  readonly completion_method: string;
  readonly source: string;
}

interface QueueTimelineRow {
  readonly id: string;
  readonly queue_index: number;
  readonly player: number;
  readonly producer_id: number | null;
  readonly unit_id: number | null;
  readonly resolved_unit_id: number | null;
  readonly name: string;
  readonly category: string | null;
  readonly sprite_key: string | null;
  readonly queued_time: number;
  readonly train_start_time: number;
  readonly estimated_completion_time: number;
  readonly producer_available_time: number;
  readonly base_train_time: number;
  readonly effective_train_time: number;
  readonly train_time_evidence: string;
  readonly queue_evidence_class: "observed";
  readonly birth_evidence_class: "simulated";
  readonly status: "estimated_birth" | "cancelled" | "blocked";
  readonly cancellation_time: number | null;
  readonly cancellation_evidence_class: "observed" | null;
  readonly producer_completion_gate: string;
  readonly spawn: SpawnEstimate | null;
}

interface SpawnEstimate {
  readonly position: Point;
  readonly producer_position: Point | null;
  readonly rally_position: Point | null;
  readonly direction: "rally" | "deterministic-east-edge";
  readonly evidence_class: "simulated";
  readonly method: string;
}

interface ActorObservation {
  readonly index: number;
  readonly player: number;
  readonly actorId: number;
  readonly time: number;
  readonly kind: string;
  readonly label: string;
  readonly position: Point | null;
  readonly targetId: number | null;
  readonly evidence_class: "observed";
}

interface MotionSegment {
  readonly from_time: number;
  readonly to_time: number;
  readonly from: Point;
  readonly to: Point;
  readonly from_evidence_class: "observed" | "simulated" | "reconciled";
  readonly destination_evidence_class: "observed";
  readonly interpolation_evidence_class: "simulated" | "reconciled";
  readonly interpolation: "bounded-straight-line-visual" | "instant-evidence-update";
  readonly time_bound: "unit-speed" | "replay-timestamp" | "instant";
  readonly distance_tiles: number;
  readonly max_speed_tiles_per_second: number;
  readonly travel_time_seconds: number;
  readonly terrain_avoidance: false;
  readonly source_observation_kind: string;
}

interface PositionRetirement {
  readonly time: number;
  readonly kind: "possible_loss";
  readonly reason: string;
  readonly confidence: string;
}

interface UnitTimelineRow {
  id: string;
  readonly stable_id: string;
  readonly player: number;
  source_actor_id: number | null;
  parser_instance_id: number | null;
  readonly unit_id: number | null;
  readonly resolved_unit_id: number | null;
  readonly name: string;
  readonly normalized_name: string;
  readonly category: string | null;
  readonly sprite_key: string | null;
  readonly worker: boolean;
  readonly birth_time: number;
  readonly birth_position: Point | null;
  readonly birth_evidence_class: "observed" | "simulated" | "reconciled";
  readonly birth_kind: "starting_actor" | "queue_estimate";
  readonly birth_confirmation: "parser_initial_actor" | "estimated_from_queue";
  readonly producer_id: number | null;
  readonly queue_id: string | null;
  readonly estimated_completion_time: number | null;
  readonly spawn_method: string | null;
  reconciliation: ReconciliationState;
  observations: ActorObservation[];
  position_retirements: PositionRetirement[];
  motion_segments: MotionSegment[];
  readonly position_horizon_seconds: number;
  position_valid_until: number;
  position_end_reason: string;
  visible_until: number;
  end_reason: string;
  readonly speed: number;
}

interface ReconciliationState {
  status:
    | "starting-parser-id"
    | "matched"
    | "anonymous-estimate"
    | "ambiguous-observed-actor"
    | "unmatched-observed-actor";
  actor_id: number | null;
  matched_time: number | null;
  confidence: "parser" | "confident" | "anonymous" | "ambiguous" | "unmatched";
  evidence: string;
}

interface ReconciliationSummary {
  readonly matched_observed_actors: JsonObject[];
  readonly ambiguous_observed_actors: JsonObject[];
  readonly unmatched_observed_actors: JsonObject[];
}

interface CandidateScore {
  readonly unit: UnitTimelineRow;
  readonly score: number;
  readonly timeGap: number;
  readonly distance: number | null;
  readonly typeMatch: "exact-name" | "category" | "unknown";
  readonly evidence: string;
}

interface TerminalState {
  readonly time: number;
  readonly reason: string;
}

const DEFAULT_UNIT_SPEED = 0.8;
const VISIBILITY_EPSILON = 0.001;
const UNIT_POSITION_HORIZON_SECONDS = 6 * 60;
const WORKER_POSITION_HORIZON_SECONDS = 10 * 60;
const BUILD_COMPLETION_FALLBACK_SECONDS: readonly [RegExp, number][] = [
  [/\bfarm\b/, 15],
  [/\b(outpost|watch tower|guard tower|keep)\b/, 15],
  [/\bhouse\b/, 25],
  [/\b(lumber camp|mining camp|mill|dock)\b/, 35],
  [/\b(blacksmith|monastery|siege workshop)\b/, 40],
  [/\b(barracks|archery range|stable)\b/, 50],
  [/\b(university|market)\b/, 60],
  [/\btown center\b/, 150],
  [/\bcastle\b/, 200],
  [/\b(wall|gate|palisade)\b/, 8],
];
const BUILDING_FOOTPRINT_FALLBACKS: readonly [RegExp, { readonly width: number; readonly height: number }][] = [
  [/\bfarm\b/, { width: 3, height: 3 }],
  [/\btown center\b/, { width: 4, height: 4 }],
  [/\bcastle\b/, { width: 4, height: 4 }],
  [/\b(mill|lumber camp|mining camp|barracks|archery range|stable|market|university|monastery|siege workshop|blacksmith|dock)\b/, { width: 3, height: 3 }],
  [/\bhouse\b/, { width: 2, height: 2 }],
  [/\b(outpost|tower)\b/, { width: 1, height: 1 }],
];
// DAT-derived unit class buckets from the pinned ruleset. Class 51 is mixed, so packed siege stays name-gated.
const NAVAL_UNIT_CLASS_IDS = [2, 20, 21, 22];
const RANGED_UNIT_CLASS_IDS = [0, 23, 36, 44];
const INFANTRY_UNIT_CLASS_IDS = [6];
const CAVALRY_UNIT_CLASS_IDS = [12, 47];
const SUPPORT_UNIT_CLASS_IDS = [18, 43];
const SIEGE_UNIT_CLASS_IDS = [13, 54, 55];
const PACKED_SIEGE_UNIT_CLASS_IDS = [51];
const CONTROLLABLE_FOOD_UNIT_CLASS_IDS = [58];

export function generateDataviewGameplayTimeline(inputs: DataviewGameplayTimelineInputs): JsonObject {
  const { game, lifetimes, economy, unitStats, ruleset, replaySha256, rulesetSha256 } = inputs;
  const match = object(game.match);
  const summary = object(game.summary);
  const duration = cleanTime(number(summary.duration_seconds));
  const players = array(match.players).map(object);
  const inputRows = indexedInputRows(match);
  const rules = buildRulesIndex(ruleset);
  const knownObjectPositions = knownObjectPositionIndex(match);
  const lifetimeObjects = array(lifetimes.objects).map(object);
  const lifetimesByActorKey = new Map<string, JsonObject>();
  lifetimeObjects.forEach((row) => {
    const actorId = integer(row.instance_id, null);
    const player = integer(row.player, integer(row.owner, null));
    if (actorId !== null && player !== null) lifetimesByActorKey.set(actorKey(player, actorId), row);
  });

  const mapEvents = indexedMapEvents(lifetimes);
  const terminalStates = terminalStateIndex(lifetimes, duration);
  const positionRetirements = positionRetirementIndex(lifetimes, duration);
  const buildingTimeline = [
    ...startingBuildingRows(players, rules),
    ...placedBuildingRows(economy, inputRows, mapEvents, rules),
  ];
  buildingTimeline.push(
    ...inferredProducerBuildingRows(inputRows, mapEvents, lifetimesByActorKey, buildingTimeline, rules)
  );
  buildingTimeline.sort((a, b) =>
    a.player - b.player
      || a.available_time - b.available_time
      || a.placed_time - b.placed_time
      || a.name.localeCompare(b.name)
      || (a.instance_id ?? 0) - (b.instance_id ?? 0)
      || a.id.localeCompare(b.id));
  const buildingByProducer = new Map<string, BuildingTimelineRow>();
  buildingTimeline.forEach((building) => {
    if (building.instance_id !== null) {
      buildingByProducer.set(actorKey(building.player, building.instance_id), building);
    }
  });
  const gatherPointRows = indexedGatherPointRows(inputRows, knownObjectPositions);
  const queueTimeline = buildQueueTimeline(inputRows, buildingByProducer, gatherPointRows, unitStats, rules, duration);
  const startingUnits = startingUnitRows(players, unitStats, rules, terminalStates, duration);
  const estimatedUnits = estimatedUnitRows(queueTimeline, unitStats, rules, terminalStates, duration);
  const units = [...startingUnits, ...estimatedUnits];
  const startingActorKeys = new Set(startingUnits
    .flatMap((unit) => unit.source_actor_id === null ? [] : [actorKey(unit.player, unit.source_actor_id)]));
  const observationsByActor = actorObservationIndex(mapEvents, startingActorKeys);
  attachStartingObservations(units, observationsByActor);
  const reconciliation = reconcileEstimatedUnits(units, observationsByActor, lifetimesByActorKey);
  attachPositionRetirements(units, positionRetirements);
  finalizeUnitMotion(units, terminalStates, duration);

  const visibleSampleTimes = representativeSampleTimes(duration, units, reconciliation.matched_observed_actors.length);
  const outputUnits = units
    .sort((a, b) =>
      a.player - b.player
        || a.birth_time - b.birth_time
        || a.id.localeCompare(b.id))
    .map((unit) => ({
      id: unit.id,
      stable_id: unit.stable_id,
      player: unit.player,
      source_actor_id: unit.source_actor_id,
      parser_instance_id: unit.parser_instance_id,
      unit_id: unit.unit_id,
      resolved_unit_id: unit.resolved_unit_id,
      name: unit.name,
      normalized_name: unit.normalized_name,
      category: unit.category,
      sprite_key: unit.sprite_key,
      worker: unit.worker,
      birth_time: cleanTime(unit.birth_time),
      birth_position: unit.birth_position ? cleanPoint(unit.birth_position) : null,
      birth_evidence_class: unit.birth_evidence_class,
      birth_kind: unit.birth_kind,
      birth_confirmation: unit.birth_confirmation,
      producer_id: unit.producer_id,
      queue_id: unit.queue_id,
      estimated_completion_time: unit.estimated_completion_time === null
        ? null
        : cleanTime(unit.estimated_completion_time),
      spawn_method: unit.spawn_method,
      reconciliation: unit.reconciliation,
      observations: unit.observations.map((row) => ({
        ...row,
        time: cleanTime(row.time),
        position: row.position ? cleanPoint(row.position) : null,
      })),
      position_retirements: unit.position_retirements.map((row) => ({
        ...row,
        time: cleanTime(row.time),
      })),
      motion_segments: unit.motion_segments.map((segment) => ({
        ...segment,
        from_time: cleanTime(segment.from_time),
        to_time: cleanTime(segment.to_time),
        from: cleanPoint(segment.from),
        to: cleanPoint(segment.to),
      })),
      position_horizon_seconds: cleanTime(unit.position_horizon_seconds),
      position_valid_until: cleanTime(unit.position_valid_until),
      position_end_reason: unit.position_end_reason,
      visible_until: cleanTime(unit.visible_until),
      end_reason: unit.end_reason,
      speed: cleanNumber(unit.speed),
    }));

  return {
    schema: "aoe-sim.dataview-gameplay-timeline/v1",
    generated_in: "browser-worker",
    generated_utc: new Date().toISOString(),
    source: {
      replay_sha256: replaySha256,
      ruleset_sha256: rulesetSha256,
      game_json: "browser-generated:game.json",
      lifetimes_json: "browser-generated:lifetimes.json",
      economy_json: "browser-generated:economy.json",
      resource_estimates_json: "browser-generated:resource_estimates.json",
      unit_stats_json: "browser-generated:unit_stats.json",
      private_data_sidecar: false,
      server_processing: false,
      replay_specific_hardcoding: false,
    },
    methodology: {
      evidence_classes: "Observed rows are parser/replay evidence; simulated rows are deterministic estimates; reconciled rows attach a later observed actor ID to one compatible prior estimate.",
      building_timeline: "Starting player buildings are available at 0. Placed buildings use replay placement/build-selection evidence where present, ruleset build seconds where available, and documented name-family fallback seconds otherwise. Producer buildings without placement IDs can also receive observed target-position rows when the replay later identifies that building actor. Production gates wait until the conservative estimated completion or first producer-position observation time.",
      builder_count_effect: "When selected builder IDs are available near a placement, duration uses baseBuildSeconds * 3 / (builderCount + 2), matching the project viewer's prior conservative multi-builder policy. Missing builder evidence falls back to one builder.",
      production_queue: "Queue and unqueue commands are replay-observed intent. Birth rows are simulated only after sequential per-producer availability and effective train time gates; queue intent is never promoted to a confirmed birth.",
      spawn_point: "Produced-unit spawn positions are deterministic producer-edge estimates directed toward the latest known rally/gather point before the train start. Missing rally data uses the producer's east edge. Missing producer position stays position-unknown and produces no map marker.",
      reconciliation: "The whole replay is scanned after estimating births. Later observed actor IDs match backward only when one compatible unmatched estimate wins by owner, unit name/category, timing, and coarse spatial plausibility. Ambiguous and unmatched actor IDs are exposed instead of forced.",
      motion: "Unit marker positions use deterministic bounded straight-line visual interpolation only while the previous position evidence is still fresh. Later command endpoints re-acquire the player-scoped actor identity, but long unsupported gaps become position-unknown until that endpoint time. Destination commands are replay evidence endpoints, not observed continuous paths; no terrain avoidance, collision, obstruction, or pathfinding is claimed.",
      computation_boundary: "All rows in this artifact are produced in the browser worker after a local replay is loaded.",
    },
    policies: {
      construction_fallbacks: Object.fromEntries(BUILD_COMPLETION_FALLBACK_SECONDS.map(([pattern, seconds]) => [
        pattern.source,
        seconds,
      ])),
      default_spawn_fallback: "producer-east-edge when producer position is known; no map-origin fallback for missing producer positions",
      pathfinding: "not-implemented",
      stale_or_death: "Confirmed terminal rows end lifecycle visibility; possible-loss rows and stale command endpoints retire only current map position, leaving survival unresolved until later evidence or replay end.",
      position_horizons_seconds: {
        command_selected_unit: UNIT_POSITION_HORIZON_SECONDS,
        command_selected_worker: WORKER_POSITION_HORIZON_SECONDS,
      },
    },
    counts: {
      starting_buildings: buildingTimeline.filter((row) => row.source === "parser-starting-building").length,
      placed_buildings: buildingTimeline.filter((row) => row.source === "economy-building-placement").length,
      inferred_producer_buildings: buildingTimeline.filter((row) => row.source === "lifetimes-target-position-producer").length,
      build_completion_estimates: buildingTimeline.filter((row) => row.completion_evidence_class === "simulated").length,
      queue_events: queueTimeline.length,
      unqueue_cancellations: queueTimeline.filter((row) => row.status === "cancelled").length,
      starting_units: startingUnits.length,
      estimated_births: estimatedUnits.length,
      positioned_estimated_births: estimatedUnits.filter((unit) => unit.birth_position !== null).length,
      position_unknown_estimated_births: estimatedUnits.filter((unit) => unit.birth_position === null).length,
      reconciled_births: outputUnits.filter((row) => row.reconciliation.status === "matched").length,
      anonymous_births: outputUnits.filter((row) => row.reconciliation.status === "anonymous-estimate").length,
      ambiguous_births: outputUnits.filter((row) => row.reconciliation.status === "ambiguous-observed-actor").length,
      ambiguous_observed_actors: reconciliation.ambiguous_observed_actors.length,
      unmatched_observed_actors: reconciliation.unmatched_observed_actors.length,
      motion_segments: outputUnits.reduce((sum, row) => sum + row.motion_segments.length, 0),
      bounded_interpolated_motion_segments: outputUnits.reduce((sum, row) =>
        sum + row.motion_segments.filter((segment) =>
          segment.interpolation === "bounded-straight-line-visual").length, 0),
      instant_motion_segments: outputUnits.reduce((sum, row) =>
        sum + row.motion_segments.filter((segment) =>
          segment.interpolation === "instant-evidence-update").length, 0),
      unit_speed_bound_motion_segments: outputUnits.reduce((sum, row) =>
        sum + row.motion_segments.filter((segment) => segment.time_bound === "unit-speed").length, 0),
      position_retirements: outputUnits.reduce((sum, row) => sum + row.position_retirements.length, 0),
      current_position_expired_before_replay_end: outputUnits.filter((row) =>
        row.birth_position !== null && row.position_valid_until < duration).length,
    },
    sample_times: visibleSampleTimes,
    building_timeline: buildingTimeline.map((row) => ({
      ...row,
      position: cleanPoint(row.position),
      placed_time: cleanTime(row.placed_time),
      estimated_completion_time: cleanTime(row.estimated_completion_time),
      available_time: cleanTime(row.available_time),
      base_build_seconds: cleanNumber(row.base_build_seconds),
      construction_seconds: cleanNumber(row.construction_seconds),
    })),
    gather_point_timeline: gatherPointRows.map((row) => ({
      time: cleanTime(row.time),
      player: row.player,
      source_id: row.sourceId,
      position: row.position ? cleanPoint(row.position) : null,
      target_id: row.targetId,
      evidence_class: "observed",
    })),
    queue_timeline: queueTimeline.map((row) => ({
      ...row,
      queued_time: cleanTime(row.queued_time),
      train_start_time: cleanTime(row.train_start_time),
      estimated_completion_time: cleanTime(row.estimated_completion_time),
      producer_available_time: cleanTime(row.producer_available_time),
      base_train_time: cleanNumber(row.base_train_time),
      effective_train_time: cleanNumber(row.effective_train_time),
      cancellation_time: row.cancellation_time === null ? null : cleanTime(row.cancellation_time),
      spawn: row.spawn
        ? {
            ...row.spawn,
            position: cleanPoint(row.spawn.position),
            producer_position: row.spawn.producer_position ? cleanPoint(row.spawn.producer_position) : null,
            rally_position: row.spawn.rally_position ? cleanPoint(row.spawn.rally_position) : null,
          }
        : null,
    })),
    units: outputUnits,
    reconciliation,
    diagnostics: [
      "Starting units keep parser-provided actor IDs and parser positions at time 0.",
      "Estimated units are born only at estimated_completion_time, never at queue time.",
      "Queue births without producer-position evidence keep their production count but have birth_position null and no map marker.",
      "Static map markers consume these rows; animated GIF/WebP or animated SVG frame behavior is not part of this artifact.",
      "Motion segments are deterministic bounded straight-line visual interpolation rows with terrain_avoidance=false; replay command destinations remain evidence endpoints, not observed continuous paths.",
    ],
  };
}

function indexedInputRows(match: JsonObject): readonly IndexedInputRow[] {
  return array(match.inputs)
    .map((value, index): IndexedInputRow | null => {
      const row = object(value);
      const time = replayTime(row);
      const player = integer(row.player, null);
      if (player === null || time === null) return null;
      const payload = object(row.payload);
      return {
        index,
        time,
        player,
        type: text(row.type),
        param: text(row.param),
        payload,
        position: point(row.position) ?? point(payload.position),
        sourceIds: uniqueNormalizedIds([
          ...array(payload.object_ids),
          ...array(payload.objects),
          ...array(payload.source_ids),
          payload.object_id,
          payload.source_id,
        ]),
      };
    })
    .filter((row): row is IndexedInputRow => row !== null)
    .sort((a, b) => a.time - b.time || a.player - b.player || a.index - b.index);
}

function indexedMapEvents(lifetimes: JsonObject): readonly JsonObject[] {
  return array(lifetimes.map_events)
    .map((value, index) => ({ ...object(value), __index: index }))
    .sort((a, b) => {
      const timeA = replayTime(a) ?? 0;
      const timeB = replayTime(b) ?? 0;
      return timeA - timeB || (integer(a.__index, 0) ?? 0) - (integer(b.__index, 0) ?? 0);
    });
}

function startingBuildingRows(players: readonly JsonObject[], rules: RulesIndex): readonly BuildingTimelineRow[] {
  const rows: BuildingTimelineRow[] = [];
  players.forEach((player) => {
    const playerNumber = integer(player.number, null);
    if (playerNumber === null) return;
    array(player.objects).map(object)
      .filter((unit) => integer(unit.class_id, null) === 80)
      .forEach((unit, index) => {
        const position = point(unit.position);
        if (!position) return;
        const instanceId = integer(unit.instance_id, null);
        const name = text(unit.name, `Building ${instanceId ?? index}`);
        rows.push({
          id: `building:${playerNumber}:${instanceId ?? `starting-${index}`}`,
          player: playerNumber,
          instance_id: instanceId,
          name,
          position,
          footprint: buildingFootprint(name, rules.ruleForName(name)),
          placed_time: 0,
          estimated_completion_time: 0,
          available_time: 0,
          evidence_class: "observed",
          completion_evidence_class: "observed",
          builder_count: 0,
          builder_ids: [],
          base_build_seconds: 0,
          construction_seconds: 0,
          completion_method: "parser-starting-building",
          source: "parser-starting-building",
        });
      });
  });
  return rows;
}

function placedBuildingRows(
  economy: JsonObject,
  inputRows: readonly IndexedInputRow[],
  mapEvents: readonly JsonObject[],
  rules: RulesIndex
): readonly BuildingTimelineRow[] {
  const buildCommands = buildCommandRows(inputRows, mapEvents);
  return array(economy.building_placements)
    .map(object)
    .map((row, index): BuildingTimelineRow | null => {
      const player = integer(row.player, integer(row.owner, null));
      const time = replayTime(row);
      const position = point(row.position) ?? point(row.end_position);
      if (player === null || time === null || !position) return null;
      const name = text(row.name, text(row.label, `Building placement ${index + 1}`));
      const rule = rules.ruleForName(name);
      const baseBuildSeconds = baseBuildSecondsFor(name, rule);
      const buildEvidence = nearestBuildCommand(buildCommands, player, name, time, position);
      const builderIds = buildEvidence?.builderIds ?? [];
      const builderCount = Math.max(1, builderIds.length || buildEvidence?.selectedCount || 1);
      const constructionSeconds = estimatedConstructionDurationSeconds(baseBuildSeconds, builderCount);
      const completion = cleanTime(time + constructionSeconds);
      const instanceId = integer(row.instance_id, integer(row.target_id, null));
      return {
        id: `building-placement:${player}:${instanceId ?? `anon-${index}`}:${cleanTime(time)}`,
        player,
        instance_id: instanceId,
        name,
        position,
        footprint: buildingFootprint(name, rule),
        placed_time: cleanTime(time),
        estimated_completion_time: completion,
        available_time: completion,
        evidence_class: "observed",
        completion_evidence_class: "simulated",
        builder_count: builderCount,
        builder_ids: builderIds,
        base_build_seconds: baseBuildSeconds,
        construction_seconds: constructionSeconds,
        completion_method: buildEvidence
          ? "placement-plus-nearby-builder-selection-and-build-time"
          : "placement-plus-one-builder-fallback-and-build-time",
        source: "economy-building-placement",
      };
    })
    .filter((row): row is BuildingTimelineRow => row !== null);
}

function inferredProducerBuildingRows(
  inputRows: readonly IndexedInputRow[],
  mapEvents: readonly JsonObject[],
  lifetimesByActorKey: ReadonlyMap<string, JsonObject>,
  existingBuildings: readonly BuildingTimelineRow[],
  rules: RulesIndex
): readonly BuildingTimelineRow[] {
  const existingProducerKeys = new Set(existingBuildings
    .flatMap((building) => building.instance_id === null ? [] : [actorKey(building.player, building.instance_id)]));
  const queuedProducers = new Map<string, { readonly player: number; readonly actorId: number; firstQueueTime: number }>();
  inputRows
    .filter((row) => row.type === "Queue")
    .forEach((row) => {
      row.sourceIds.forEach((actorId) => {
        const key = actorKey(row.player, actorId);
        if (existingProducerKeys.has(key)) return;
        const producer = queuedProducers.get(key) ?? {
          player: row.player,
          actorId,
          firstQueueTime: row.time,
        };
        producer.firstQueueTime = Math.min(producer.firstQueueTime, row.time);
        queuedProducers.set(key, producer);
      });
    });

  const targetPositions = new Map<string, {
    readonly time: number;
    readonly position: Point;
    readonly name: string;
    readonly sourceKind: string;
  }>();
  mapEvents.forEach((event) => {
    const player = integer(event.player, integer(event.owner, null));
    const targetId = integer(event.target_id, null);
    const time = replayTime(event);
    const position = point(event.position);
    if (player === null || targetId === null || time === null || !position) return;
    const producerKey = actorKey(player, targetId);
    if (!queuedProducers.has(producerKey) || existingProducerKeys.has(producerKey)) return;
    const inferredName = targetBuildingName(event, lifetimesByActorKey.get(producerKey));
    if (!inferredName) return;
    const previous = targetPositions.get(producerKey);
    if (previous && previous.time <= time) return;
    targetPositions.set(producerKey, {
      time,
      position: cleanPoint(position),
      name: inferredName,
      sourceKind: text(event.kind, "target"),
    });
  });

  return [...queuedProducers.values()].flatMap((producer): readonly BuildingTimelineRow[] => {
    const key = actorKey(producer.player, producer.actorId);
    const target = targetPositions.get(key);
    if (!target) return [];
    const rule = rules.ruleForName(target.name);
    return [{
      id: `building-producer-target:${producer.player}:${producer.actorId}`,
      player: producer.player,
      instance_id: producer.actorId,
      name: target.name,
      position: target.position,
      footprint: buildingFootprint(target.name, rule),
      placed_time: target.time,
      estimated_completion_time: target.time,
      available_time: target.time,
      evidence_class: "observed",
      completion_evidence_class: "observed",
      builder_count: 0,
      builder_ids: [],
      base_build_seconds: 0,
      construction_seconds: 0,
      completion_method: `${target.sourceKind}-position-observation`,
      source: "lifetimes-target-position-producer",
    }];
  });
}

function targetBuildingName(event: JsonObject, lifetime: JsonObject | undefined): string | null {
  const lifetimeName = text(lifetime?.name);
  if (lifetimeName && lifetimeName !== "Production building") return lifetimeName;
  const labelName = text(event.name, labelObjectName(event.label));
  return labelName && labelName !== "Production building" ? labelName : null;
}

function labelObjectName(value: unknown): string {
  const label = text(value);
  const match = /^\s*(?:Target|Spawn|Gather Point):\s*(.+?)\s*$/i.exec(label);
  return match?.[1] ?? "";
}

interface BuildCommandRow {
  readonly index: number;
  readonly time: number;
  readonly player: number;
  readonly name: string;
  readonly position: Point | null;
  readonly builderIds: readonly number[];
  readonly selectedCount: number;
}

function buildCommandRows(inputRows: readonly IndexedInputRow[], mapEvents: readonly JsonObject[]): readonly BuildCommandRow[] {
  const fromInputs = inputRows
    .filter((row) => /\bbuild\b/i.test(row.type) || /\bbuild\b/i.test(row.param))
    .map((row): BuildCommandRow => ({
      index: row.index,
      time: row.time,
      player: row.player,
      name: text(row.payload.building, text(row.payload.unit, row.param)),
      position: row.position,
      builderIds: row.sourceIds,
      selectedCount: row.sourceIds.length,
    }));
  const fromMapEvents = mapEvents.flatMap((value): readonly BuildCommandRow[] => {
    const row = object(value);
    const time = replayTime(row);
    const player = integer(row.player, null);
    const label = `${text(row.kind)} ${text(row.label)} ${text(row.name)}`;
    if (time === null || player === null || !/\bbuild/i.test(label)) return [];
    const builderIds = uniqueNormalizedIds(array(row.object_ids));
    return [{
      index: (integer(row.__index, 0) ?? 0) + 1000000,
      time,
      player,
      name: text(row.name, text(row.label)),
      position: point(row.position),
      builderIds,
      selectedCount: Math.max(builderIds.length, integer(row.selected_count, 0) ?? 0),
    }];
  });
  return [...fromInputs, ...fromMapEvents]
    .sort((a, b) => a.time - b.time || a.player - b.player || a.index - b.index);
}

function nearestBuildCommand(
  rows: readonly BuildCommandRow[],
  player: number,
  name: string,
  time: number,
  position: Point
): BuildCommandRow | null {
  return rows
    .filter((row) =>
      row.player === player
        && row.time >= time - 45
        && row.time <= time + 10
        && (!row.position || distance(row.position, position) <= 2.5)
        && (!row.name || namesCompatible(row.name, name)))
    .sort((a, b) =>
      (a.position ? distance(a.position, position) : 4) - (b.position ? distance(b.position, position) : 4)
        || Math.abs(a.time - time) - Math.abs(b.time - time)
        || b.builderIds.length - a.builderIds.length
        || a.index - b.index)[0] ?? null;
}

interface GatherPointRow {
  readonly time: number;
  readonly player: number;
  readonly sourceId: number;
  readonly position: Point | null;
  readonly targetId: number | null;
}

function indexedGatherPointRows(
  inputRows: readonly IndexedInputRow[],
  knownObjectPositions: ReadonlyMap<number, Point>
): readonly GatherPointRow[] {
  return inputRows
    .filter((row) => row.type === "Gather Point")
    .flatMap((row): readonly GatherPointRow[] => {
      const targetId = integer(row.payload.target_id, integer(row.payload.target, null));
      const targetPosition = targetId === null ? null : knownObjectPositions.get(targetId) ?? null;
      const position = row.position ?? targetPosition;
      return row.sourceIds.map((sourceId) => ({
        time: row.time,
        player: row.player,
        sourceId,
        position,
        targetId,
      }));
    })
    .sort((a, b) => a.player - b.player || a.sourceId - b.sourceId || a.time - b.time);
}

function buildQueueTimeline(
  inputRows: readonly IndexedInputRow[],
  buildingByProducer: ReadonlyMap<string, BuildingTimelineRow>,
  gatherPointRows: readonly GatherPointRow[],
  unitStats: JsonObject,
  rules: RulesIndex,
  duration: number
): readonly QueueTimelineRow[] {
  const queueRows = dedupeAdjacentInputRows(
    inputRows.filter((row) => row.type === "Queue"),
    (row) => [
      row.player,
      row.type,
      row.payload.unit_id ?? "",
      row.payload.unit ?? row.param,
      row.payload.amount ?? 1,
      row.sourceIds.join(","),
    ].join(":")
  );
  const unqueueRows = dedupeAdjacentInputRows(
    inputRows.filter((row) => row.type === "Unqueue"),
    (row) => [
      row.player,
      row.type,
      row.payload.order_id ?? "",
      row.payload.slot_id ?? "",
      row.payload.unit_id ?? "",
      row.sourceIds.join(","),
    ].join(":")
  );
  const draftItems: Array<{
    readonly queueIndex: number;
    readonly player: number;
    readonly producerId: number | null;
    readonly unitId: number | null;
    readonly name: string;
    readonly queuedTime: number;
    cancelledTime: number | null;
  }> = [];
  queueRows.forEach((row, rowIndex) => {
    const amount = Math.max(1, Math.floor(number(row.payload.amount, 1)));
    const producerIds = row.sourceIds.length ? row.sourceIds : [null];
    const unitId = integer(row.payload.unit_id, null);
    const name = text(row.payload.unit, text(row.param, unitId === null ? "Unit" : `Unit ${unitId}`));
    for (let offset = 0; offset < amount; offset += 1) {
      draftItems.push({
        queueIndex: rowIndex * 1000 + offset,
        player: row.player,
        producerId: producerIds[offset % producerIds.length] ?? null,
        unitId,
        name,
        queuedTime: cleanTime(row.time),
        cancelledTime: null,
      });
    }
  });

  const initialSchedule = scheduleQueueItems(draftItems, buildingByProducer, gatherPointRows, unitStats, rules, duration);
  unqueueRows.forEach((row) => {
    const sourceIds = new Set(row.sourceIds);
    const unitId = integer(row.payload.unit_id, null);
    const count = Math.max(1, Math.floor(number(row.payload.amount, 1)));
    let remaining = count;
    const candidates = initialSchedule
      .filter((item) =>
        item.player === row.player
          && item.status === "estimated_birth"
          && item.queued_time <= row.time
          && item.estimated_completion_time > row.time
          && (unitId === null || item.unit_id === unitId)
          && (!sourceIds.size || (item.producer_id !== null && sourceIds.has(item.producer_id))))
      .sort((a, b) =>
        b.queued_time - a.queued_time
          || b.train_start_time - a.train_start_time
          || b.queue_index - a.queue_index);
    for (const item of candidates) {
      if (remaining <= 0) break;
      const draft = draftItems.find((candidate) => candidate.queueIndex === item.queue_index);
      if (draft && draft.cancelledTime === null) {
        draft.cancelledTime = cleanTime(row.time);
        remaining -= 1;
      }
    }
  });

  return [...scheduleQueueItems(draftItems, buildingByProducer, gatherPointRows, unitStats, rules, duration)]
    .sort((a, b) =>
      a.player - b.player
        || a.train_start_time - b.train_start_time
        || a.estimated_completion_time - b.estimated_completion_time
        || a.queue_index - b.queue_index);
}

function scheduleQueueItems(
  draftItems: readonly {
    readonly queueIndex: number;
    readonly player: number;
    readonly producerId: number | null;
    readonly unitId: number | null;
    readonly name: string;
    readonly queuedTime: number;
    readonly cancelledTime: number | null;
  }[],
  buildingByProducer: ReadonlyMap<string, BuildingTimelineRow>,
  gatherPointRows: readonly GatherPointRow[],
  unitStats: JsonObject,
  rules: RulesIndex,
  duration: number
): readonly QueueTimelineRow[] {
  const producerAvailability = new Map<string, number>();
  return [...draftItems]
    .sort((a, b) =>
      a.player - b.player
        || (a.producerId ?? Number.MAX_SAFE_INTEGER) - (b.producerId ?? Number.MAX_SAFE_INTEGER)
        || a.queuedTime - b.queuedTime
        || a.queueIndex - b.queueIndex)
    .map((draft): QueueTimelineRow => {
      const producerKey = draft.producerId === null
        ? `unknown:${draft.player}`
        : actorKey(draft.player, draft.producerId);
      const producer = draft.producerId === null ? null : buildingByProducer.get(producerKey) ?? null;
      const producerAvailable = producer?.available_time ?? draft.queuedTime;
      const previousAvailable = producerAvailability.get(producerKey) ?? producerAvailable;
      const identity = unitIdentity(draft.player, draft.unitId, draft.name, draft.queuedTime, unitStats, rules);
      const trainStart = cleanTime(Math.max(draft.queuedTime, producerAvailable, previousAvailable));
      const completion = cleanTime(trainStart + Math.max(0, identity.effectiveTrainTime));
      const spawn = draft.cancelledTime === null
        ? spawnEstimate(producer, latestGatherPoint(gatherPointRows, draft.player, draft.producerId, trainStart))
        : null;
      const status = draft.cancelledTime !== null
        ? "cancelled"
        : completion <= duration + VISIBILITY_EPSILON
          ? "estimated_birth"
          : "blocked";
      if (draft.cancelledTime === null) {
        producerAvailability.set(producerKey, completion);
      }
      return {
        id: `queue:${draft.player}:${draft.producerId ?? "unknown"}:${draft.queueIndex}`,
        queue_index: draft.queueIndex,
        player: draft.player,
        producer_id: draft.producerId,
        unit_id: identity.sourceUnitId,
        resolved_unit_id: identity.resolvedUnitId,
        name: identity.name,
        category: identity.category,
        sprite_key: identity.spriteKey,
        queued_time: draft.queuedTime,
        train_start_time: trainStart,
        estimated_completion_time: completion,
        producer_available_time: cleanTime(producerAvailable),
        base_train_time: identity.baseTrainTime,
        effective_train_time: identity.effectiveTrainTime,
        train_time_evidence: identity.trainTimeEvidence,
        queue_evidence_class: "observed",
        birth_evidence_class: "simulated",
        status,
        cancellation_time: draft.cancelledTime,
        cancellation_evidence_class: draft.cancelledTime === null ? null : "observed",
        producer_completion_gate: producer
          ? `producer available at ${cleanTime(producer.available_time)} from ${producer.completion_method}`
          : draft.producerId === null
            ? "producer identity unavailable; queue time is used for production counts and spawn position remains unknown"
            : "producer identity observed but producer building position/completion was unavailable; queue time is used for production counts and spawn position remains unknown",
        spawn,
      };
    });
}

function startingUnitRows(
  players: readonly JsonObject[],
  unitStats: JsonObject,
  rules: RulesIndex,
  terminalStates: ReadonlyMap<string, TerminalState>,
  duration: number
): UnitTimelineRow[] {
  const rows: UnitTimelineRow[] = [];
  players.forEach((player) => {
    const playerNumber = integer(player.number, null);
    if (playerNumber === null) return;
    array(player.objects).map(object)
      .filter((unit) => integer(unit.class_id, null) === 70)
      .forEach((unit, index) => {
        const position = point(unit.position);
        if (!position) return;
        const actorId = integer(unit.instance_id, null);
        const sourceUnitId = integer(unit.object_id, null);
        const identity = unitIdentity(playerNumber, sourceUnitId, text(unit.name, "Unit"), 0, unitStats, rules);
        const terminal = actorId === null ? null : terminalStates.get(actorKey(playerNumber, actorId)) ?? null;
        const positionHorizon = positionHorizonSeconds(identity.category === "villagers");
        rows.push({
          id: `actor:${playerNumber}:${actorId ?? `starting-${index}`}`,
          stable_id: `starting:${playerNumber}:${actorId ?? index}`,
          player: playerNumber,
          source_actor_id: actorId,
          parser_instance_id: actorId,
          unit_id: identity.sourceUnitId,
          resolved_unit_id: identity.resolvedUnitId,
          name: identity.name,
          normalized_name: identity.normalizedName,
          category: identity.category,
          sprite_key: identity.spriteKey,
          worker: identity.category === "villagers",
          birth_time: 0,
          birth_position: cleanPoint(position),
          birth_evidence_class: "observed",
          birth_kind: "starting_actor",
          birth_confirmation: "parser_initial_actor",
          producer_id: null,
          queue_id: null,
          estimated_completion_time: null,
          spawn_method: null,
          reconciliation: {
            status: "starting-parser-id",
            actor_id: actorId,
            matched_time: 0,
            confidence: "parser",
            evidence: "parser-provided starting actor ID and position",
          },
          observations: [],
          position_retirements: [],
          motion_segments: [],
          position_horizon_seconds: positionHorizon,
          position_valid_until: cleanTime(Math.min(
            terminal?.time ?? duration + VISIBILITY_EPSILON,
            positionHorizon,
            duration + VISIBILITY_EPSILON
          )),
          position_end_reason: terminal?.reason ?? "position-horizon-expired; survival unresolved",
          visible_until: terminal?.time ?? duration + VISIBILITY_EPSILON,
          end_reason: terminal?.reason ?? "survival-unresolved-through-replay-end",
          speed: identity.speed,
        });
      });
  });
  return rows;
}

function estimatedUnitRows(
  queueTimeline: readonly QueueTimelineRow[],
  unitStats: JsonObject,
  rules: RulesIndex,
  terminalStates: ReadonlyMap<string, TerminalState>,
  duration: number
): UnitTimelineRow[] {
  return queueTimeline
    .filter((queue) => queue.status === "estimated_birth")
    .map((queue): UnitTimelineRow => {
      const identity = unitIdentity(queue.player, queue.unit_id, queue.name, queue.estimated_completion_time, unitStats, rules);
      const stableId = `estimate:${queue.player}:${queue.producer_id ?? "unknown"}:${queue.queue_index}`;
      const terminal = terminalStates.get(stableId) ?? null;
      const positionHorizon = positionHorizonSeconds(identity.category === "villagers");
      return {
        id: `anon:${stableId}`,
        stable_id: stableId,
        player: queue.player,
        source_actor_id: null,
        parser_instance_id: null,
        unit_id: identity.sourceUnitId,
        resolved_unit_id: identity.resolvedUnitId,
        name: identity.name,
        normalized_name: identity.normalizedName,
        category: identity.category,
        sprite_key: identity.spriteKey,
        worker: identity.category === "villagers",
        birth_time: queue.estimated_completion_time,
        birth_position: queue.spawn ? cleanPoint(queue.spawn.position) : null,
        birth_evidence_class: "simulated",
        birth_kind: "queue_estimate",
        birth_confirmation: "estimated_from_queue",
        producer_id: queue.producer_id,
        queue_id: queue.id,
        estimated_completion_time: queue.estimated_completion_time,
        spawn_method: queue.spawn?.method ?? "producer-position-unknown",
        reconciliation: {
          status: "anonymous-estimate",
          actor_id: null,
          matched_time: null,
          confidence: "anonymous",
          evidence: "queue completion estimate has no later unambiguous parser actor ID",
        },
        observations: [],
        position_retirements: [],
        motion_segments: [],
        position_horizon_seconds: positionHorizon,
        position_valid_until: queue.spawn
          ? cleanTime(Math.min(
              terminal?.time ?? duration + VISIBILITY_EPSILON,
              queue.estimated_completion_time + positionHorizon,
              duration + VISIBILITY_EPSILON
            ))
          : queue.estimated_completion_time,
        position_end_reason: queue.spawn
          ? terminal?.reason ?? "position-horizon-expired; survival unresolved"
          : "producer-position-unknown",
        visible_until: terminal?.time ?? duration + VISIBILITY_EPSILON,
        end_reason: terminal?.reason ?? "anonymous-estimated-survival-unresolved-through-replay-end",
        speed: identity.speed,
      };
    });
}

function actorObservationIndex(
  mapEvents: readonly JsonObject[],
  startingActorKeys: ReadonlySet<string>
): ReadonlyMap<string, readonly ActorObservation[]> {
  const byActor = new Map<string, ActorObservation[]>();
  mapEvents.forEach((value) => {
    const row = object(value);
    const time = replayTime(row);
    const player = integer(row.player, null);
    if (time === null || player === null) return;
    const ids = uniqueNormalizedIds(array(row.object_ids));
    ids.forEach((actorId) => {
      const key = actorKey(player, actorId);
      const observation: ActorObservation = {
        index: integer(row.__index, 0) ?? 0,
        player,
        actorId,
        time,
        kind: text(row.kind, text(row.type, "command")),
        label: text(row.label, text(row.name)),
        position: point(row.position),
        targetId: integer(row.target_id, null),
        evidence_class: "observed",
      };
      const rows = byActor.get(key) ?? [];
      if (startingActorKeys.has(key) || observation.time > 0 || observation.position) {
        rows.push(observation);
      }
      byActor.set(key, rows);
    });
  });
  byActor.forEach((rows) => rows.sort((a, b) => a.time - b.time || a.index - b.index));
  return byActor;
}

function attachStartingObservations(
  units: readonly UnitTimelineRow[],
  observationsByActor: ReadonlyMap<string, readonly ActorObservation[]>
): void {
  units
    .filter((unit) => unit.birth_kind === "starting_actor" && unit.source_actor_id !== null)
    .forEach((unit) => {
      const actorId = unit.source_actor_id;
      if (actorId === null || !unit.birth_position) return;
      const actorObservations = observationsByActor.get(actorKey(unit.player, actorId)) ?? [];
      unit.observations = [
        {
          index: -1,
          player: unit.player,
          actorId,
          time: 0,
          kind: "parser-initial-position",
          label: "starting position",
          position: unit.birth_position,
          targetId: null,
          evidence_class: "observed",
        },
        ...actorObservations.filter((row) => row.time > 0 || row.position !== null),
      ];
    });
}

function reconcileEstimatedUnits(
  units: readonly UnitTimelineRow[],
  observationsByActor: ReadonlyMap<string, readonly ActorObservation[]>,
  lifetimesByActorKey: ReadonlyMap<string, JsonObject>
): ReconciliationSummary {
  const startingKeys = new Set(units
    .flatMap((unit) =>
      unit.birth_kind === "starting_actor" && unit.source_actor_id !== null
        ? [actorKey(unit.player, unit.source_actor_id)]
        : []));
  const producedUnits = units.filter((unit) => unit.birth_kind === "queue_estimate");
  const matched = new Set<UnitTimelineRow>();
  const matchedObservedActors: JsonObject[] = [];
  const ambiguousObservedActors: JsonObject[] = [];
  const unmatchedObservedActors: JsonObject[] = [];

  const observedActors = [...observationsByActor.entries()]
    .filter(([key, rows]) => !startingKeys.has(key) && rows.length > 0)
    .flatMap(([key, rows]) => {
      const [playerText, actorText] = key.split(":");
      const first = rows[0];
      if (!first) return [];
      return {
        key,
        player: Number(playerText),
        actorId: Number(actorText),
        rows,
        first,
      };
    })
    .filter((row) => Number.isInteger(row.player) && Number.isInteger(row.actorId))
    .sort((a, b) =>
      a.first.time - b.first.time
        || a.player - b.player
        || a.actorId - b.actorId);

  observedActors.forEach((observed) => {
    const actorLifetime = lifetimesByActorKey.get(observed.key) ?? {};
    const observedName = text(actorLifetime.name);
    const candidates = producedUnits
      .filter((unit) => !matched.has(unit))
      .map((unit) => candidateScore(unit, observed.player, observed.first, observedName))
      .filter((score): score is CandidateScore => score !== null)
      .sort((a, b) =>
        a.score - b.score
          || a.timeGap - b.timeGap
          || (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY)
          || a.unit.birth_time - b.unit.birth_time
          || a.unit.stable_id.localeCompare(b.unit.stable_id));
    if (!candidates.length) {
      unmatchedObservedActors.push({
        player: observed.player,
        actor_id: observed.actorId,
        first_observed_time: cleanTime(observed.first.time),
        observed_name: observedName || null,
        status: "unmatched-observed-actor",
        reason: "no compatible unmatched estimated birth passed owner, timing, type/category, and spatial plausibility checks",
      });
      return;
    }
    const best = candidates[0];
    if (!best) return;
    const second = candidates[1] ?? null;
    const confident = !second || second.score - best.score >= 2.5;
    if (!confident) {
      ambiguousObservedActors.push({
        player: observed.player,
        actor_id: observed.actorId,
        first_observed_time: cleanTime(observed.first.time),
        observed_name: observedName || null,
        status: "ambiguous-observed-actor",
        candidates: candidates.slice(0, 5).map((candidate) => ({
          estimated_unit_id: candidate.unit.id,
          queue_id: candidate.unit.queue_id,
          birth_time: cleanTime(candidate.unit.birth_time),
          score: cleanNumber(candidate.score),
          time_gap: cleanNumber(candidate.timeGap),
          distance: candidate.distance === null ? null : cleanNumber(candidate.distance),
          type_match: candidate.typeMatch,
          evidence: candidate.evidence,
        })),
      });
      candidates.slice(0, 5).forEach((candidate) => {
        if (candidate.unit.reconciliation.status === "anonymous-estimate") {
          candidate.unit.reconciliation = {
            status: "ambiguous-observed-actor",
            actor_id: null,
            matched_time: null,
            confidence: "ambiguous",
            evidence: `possible match for observed actor ${observed.actorId}, but deterministic scoring did not separate the best candidate`,
          };
        }
      });
      return;
    }
    best.unit.id = `actor:${observed.player}:${observed.actorId}`;
    best.unit.source_actor_id = observed.actorId;
    best.unit.parser_instance_id = observed.actorId;
    best.unit.reconciliation = {
      status: "matched",
      actor_id: observed.actorId,
      matched_time: cleanTime(observed.first.time),
      confidence: "confident",
      evidence: best.evidence,
    };
    best.unit.observations = [...observed.rows];
    matched.add(best.unit);
    matchedObservedActors.push({
      player: observed.player,
      actor_id: observed.actorId,
      estimated_unit_id: best.unit.stable_id,
      queue_id: best.unit.queue_id,
      estimated_birth_time: cleanTime(best.unit.birth_time),
      first_observed_time: cleanTime(observed.first.time),
      score: cleanNumber(best.score),
      time_gap: cleanNumber(best.timeGap),
      distance: best.distance === null ? null : cleanNumber(best.distance),
      type_match: best.typeMatch,
      status: "matched",
      evidence: best.evidence,
    });
  });

  return {
    matched_observed_actors: matchedObservedActors,
    ambiguous_observed_actors: ambiguousObservedActors,
    unmatched_observed_actors: unmatchedObservedActors,
  };
}

function attachPositionRetirements(
  units: readonly UnitTimelineRow[],
  retirementsByActor: ReadonlyMap<string, readonly PositionRetirement[]>
): void {
  units.forEach((unit) => {
    const actorId = unit.source_actor_id;
    unit.position_retirements = actorId === null
      ? []
      : [...retirementsByActor.get(actorKey(unit.player, actorId)) ?? []]
          .filter((row) => row.time >= unit.birth_time && row.time <= unit.visible_until + VISIBILITY_EPSILON)
          .sort((a, b) => a.time - b.time || a.kind.localeCompare(b.kind));
  });
}

function candidateScore(
  unit: UnitTimelineRow,
  observedPlayer: number,
  firstObservation: ActorObservation,
  observedName: string
): CandidateScore | null {
  if (unit.player !== observedPlayer) return null;
  const timeGap = firstObservation.time - unit.birth_time;
  if (timeGap < -2) return null;
  const normalizedObserved = normalizedLookupName(observedName);
  const typeMatch = normalizedObserved && unit.normalized_name
    ? namesCompatible(normalizedObserved, unit.normalized_name)
      ? "exact-name"
      : classifyUnitCategory({ name: observedName }) === unit.category
        ? "category"
        : null
    : "unknown";
  if (typeMatch === null) return null;
  const distanceToObservation = firstObservation.position
    && unit.birth_position
    ? distance(unit.birth_position, firstObservation.position)
    : null;
  if (distanceToObservation !== null) {
    const maximumPlausibleTravel = Math.max(10, Math.max(DEFAULT_UNIT_SPEED, unit.speed) * Math.max(0, timeGap) + 8);
    if (distanceToObservation > maximumPlausibleTravel) return null;
  }
  const typeScore = typeMatch === "exact-name" ? 0 : typeMatch === "category" ? 4 : 8;
  const distanceScore = distanceToObservation === null ? 4 : Math.min(20, distanceToObservation / 6);
  const timingScore = Math.min(30, Math.abs(timeGap) / 15);
  const producerScore = unit.producer_id === null ? 2 : 0;
  const score = typeScore + distanceScore + timingScore + producerScore;
  return {
    unit,
    score,
    timeGap,
    distance: distanceToObservation,
    typeMatch,
    evidence: [
      `owner p${unit.player}`,
      `type ${typeMatch}`,
      `time gap ${cleanNumber(timeGap)}s`,
      distanceToObservation === null ? "no first-position distance" : `spawn-to-first-position ${cleanNumber(distanceToObservation)} tiles`,
      unit.producer_id === null ? "producer unknown" : `producer ${unit.producer_id}`,
    ].join("; "),
  };
}

function finalizeUnitMotion(
  units: readonly UnitTimelineRow[],
  terminalStates: ReadonlyMap<string, TerminalState>,
  duration: number
): void {
  units.forEach((unit) => {
    const terminal = unit.source_actor_id === null
      ? null
      : terminalStates.get(actorKey(unit.player, unit.source_actor_id)) ?? null;
    if (terminal) {
      unit.visible_until = Math.min(unit.visible_until, terminal.time);
      unit.end_reason = terminal.reason;
    }
    unit.motion_segments = buildMotionSegments(unit, duration);
    const positionState = finalPositionValidity(unit, duration);
    unit.position_valid_until = positionState.time;
    unit.position_end_reason = positionState.reason;
  });
}

function buildMotionSegments(unit: UnitTimelineRow, duration: number): MotionSegment[] {
  const segments: MotionSegment[] = [];
  let anchorTime = unit.birth_time;
  let anchorEvidenceTime = unit.birth_time;
  let anchorPosition = unit.birth_position;
  let anchorEvidenceClass: "observed" | "simulated" | "reconciled" = unit.birth_evidence_class;
  const destinationRows = unit.observations
    .filter((row) => row.position && row.time >= unit.birth_time && row.time <= unit.visible_until + VISIBILITY_EPSILON)
    .sort((a, b) => a.time - b.time || a.index - b.index);
  if (!anchorPosition) {
    const first = destinationRows[0];
    if (!first?.position) return [];
    const evidenceTime = cleanTime(Math.min(duration, Math.max(unit.birth_time, first.time)));
    segments.push({
      from_time: evidenceTime,
      to_time: evidenceTime,
      from: cleanPoint(first.position),
      to: cleanPoint(first.position),
      from_evidence_class: "observed",
      destination_evidence_class: "observed",
      interpolation_evidence_class: unit.reconciliation.status === "matched" ? "reconciled" : "simulated",
      interpolation: "instant-evidence-update",
      time_bound: "instant",
      distance_tiles: 0,
      max_speed_tiles_per_second: cleanNumber(Math.max(DEFAULT_UNIT_SPEED, unit.speed)),
      travel_time_seconds: 0,
      terrain_avoidance: false,
      source_observation_kind: first.kind,
    });
    anchorTime = evidenceTime;
    anchorEvidenceTime = evidenceTime;
    anchorPosition = first.position;
    anchorEvidenceClass = "observed";
  }
  if (!anchorPosition) return segments;
  for (const row of destinationRows) {
    const rowPosition = row.position;
    if (!rowPosition || !anchorPosition) continue;
    if (row.time <= anchorEvidenceTime + VISIBILITY_EPSILON && samePoint(rowPosition, anchorPosition)) continue;
    if (row.kind === "parser-initial-position" && row.time <= unit.birth_time + VISIBILITY_EPSILON) {
      anchorTime = row.time;
      anchorEvidenceTime = row.time;
      anchorPosition = rowPosition;
      anchorEvidenceClass = "observed";
      continue;
    }
    const evidenceTime = cleanTime(Math.min(duration, Math.max(unit.birth_time, row.time)));
    const distanceTiles = distance(anchorPosition, rowPosition);
    const maxSpeedTilesPerSecond = Math.max(DEFAULT_UNIT_SPEED, unit.speed);
    const intervalSeconds = Math.max(0, evidenceTime - anchorTime);
    const speedTravelSeconds = maxSpeedTilesPerSecond > 0
      ? distanceTiles / maxSpeedTilesPerSecond
      : intervalSeconds;
    const speedBounded = (
      distanceTiles > VISIBILITY_EPSILON
      && speedTravelSeconds > VISIBILITY_EPSILON
      && speedTravelSeconds < intervalSeconds
    );
    const proposedFromTime = cleanTime(speedBounded ? evidenceTime - speedTravelSeconds : anchorTime);
    const anchorFresh = positionEvidenceSupportsInterval(unit, anchorEvidenceTime, evidenceTime);
    const fromTime = cleanTime(anchorFresh ? proposedFromTime : evidenceTime);
    const instant = (
      !anchorFresh
      || distanceTiles <= VISIBILITY_EPSILON
      || evidenceTime <= fromTime + VISIBILITY_EPSILON
    );
    segments.push({
      from_time: instant ? evidenceTime : fromTime,
      to_time: evidenceTime,
      from: cleanPoint(instant && !anchorFresh ? rowPosition : anchorPosition),
      to: cleanPoint(rowPosition),
      from_evidence_class: instant && !anchorFresh ? "observed" : anchorEvidenceClass,
      destination_evidence_class: "observed",
      interpolation_evidence_class: unit.reconciliation.status === "matched" ? "reconciled" : "simulated",
      interpolation: instant ? "instant-evidence-update" : "bounded-straight-line-visual",
      time_bound: instant ? "instant" : speedBounded ? "unit-speed" : "replay-timestamp",
      distance_tiles: cleanNumber(distanceTiles),
      max_speed_tiles_per_second: cleanNumber(maxSpeedTilesPerSecond),
      travel_time_seconds: cleanNumber(instant ? 0 : evidenceTime - fromTime),
      terrain_avoidance: false,
      source_observation_kind: row.kind,
    });
    anchorTime = evidenceTime;
    anchorEvidenceTime = evidenceTime;
    anchorPosition = rowPosition;
    anchorEvidenceClass = "observed";
  }
  if (segments.length && anchorTime > unit.visible_until) {
    unit.visible_until = anchorTime;
  }
  return segments;
}

function finalPositionValidity(unit: UnitTimelineRow, duration: number): TerminalState {
  const lastPositionTime = latestPositionEvidenceTime(unit);
  if (lastPositionTime === null) {
    return { time: unit.birth_time, reason: "position-unknown" };
  }

  const horizonEnd = lastPositionTime + unit.position_horizon_seconds;
  const retirement = firstPositionRetirementBetween(unit, lastPositionTime, horizonEnd);
  if (retirement) {
    return { time: retirement.time, reason: retirement.reason };
  }
  const visibleUntil = Math.min(unit.visible_until, duration + VISIBILITY_EPSILON);
  const time = cleanTime(Math.min(visibleUntil, horizonEnd));
  return {
    time,
    reason: time < visibleUntil - VISIBILITY_EPSILON
      ? "position-horizon-expired; survival unresolved"
      : unit.end_reason,
  };
}

function latestPositionEvidenceTime(unit: UnitTimelineRow): number | null {
  const segmentTimes = unit.motion_segments
    .map((segment) => segment.to_time)
    .filter((time) => Number.isFinite(time) && time <= unit.visible_until + VISIBILITY_EPSILON);
  if (unit.birth_position) {
    return segmentTimes.reduce((latest, time) => Math.max(latest, time), unit.birth_time);
  }
  return segmentTimes.length ? Math.max(...segmentTimes) : null;
}

function positionEvidenceSupportsInterval(unit: UnitTimelineRow, fromEvidenceTime: number, toEvidenceTime: number): boolean {
  if (toEvidenceTime - fromEvidenceTime > unit.position_horizon_seconds + VISIBILITY_EPSILON) {
    return false;
  }
  return !firstPositionRetirementBetween(unit, fromEvidenceTime, toEvidenceTime);
}

function firstPositionRetirementBetween(
  unit: UnitTimelineRow,
  fromExclusive: number,
  toInclusive: number
): PositionRetirement | null {
  return unit.position_retirements
    .filter((row) => row.time > fromExclusive + VISIBILITY_EPSILON && row.time <= toInclusive + VISIBILITY_EPSILON)
    .sort((a, b) => a.time - b.time || a.kind.localeCompare(b.kind))[0] ?? null;
}

function terminalStateIndex(lifetimes: JsonObject, duration: number): ReadonlyMap<string, TerminalState> {
  const rows = new Map<string, TerminalState>();
  array(lifetimes.lifecycle_events).map(object).forEach((event) => {
    const kind = text(event.kind);
    if (!confirmedTerminalKind(kind)) return;
    const player = integer(event.player, integer(event.owner, null));
    const time = replayTime(event);
    if (player === null || time === null) return;
    uniqueNormalizedIds(array(event.object_ids)).forEach((actorId) => {
      const key = actorKey(player, actorId);
      const reason = kind === "delete" ? "explicit-delete" : `${kind}-terminal`;
      const previous = rows.get(key);
      if (!previous || time < previous.time) rows.set(key, { time: cleanTime(Math.min(time, duration)), reason });
    });
  });
  return rows;
}

function positionRetirementIndex(lifetimes: JsonObject, duration: number): ReadonlyMap<string, readonly PositionRetirement[]> {
  const rows = new Map<string, PositionRetirement[]>();
  array(lifetimes.lifecycle_events).map(object).forEach((event) => {
    if (text(event.kind) !== "possible_loss") return;
    const player = integer(event.player, integer(event.owner, null));
    const time = replayTime(event);
    if (player === null || time === null) return;
    uniqueNormalizedIds(array(event.object_ids)).forEach((actorId) => {
      const key = actorKey(player, actorId);
      const values = rows.get(key) ?? [];
      values.push({
        time: cleanTime(Math.min(time, duration)),
        kind: "possible_loss",
        reason: "possible-loss-position-retired; survival unresolved",
        confidence: text(event.confidence, "possible"),
      });
      rows.set(key, values);
    });
  });
  rows.forEach((values) => values.sort((a, b) => a.time - b.time || a.kind.localeCompare(b.kind)));
  return rows;
}

function confirmedTerminalKind(kind: string): boolean {
  return kind === "delete" || kind === "death" || kind === "combat_death" || kind === "simulated_death";
}

interface RulesIndex {
  readonly byId: ReadonlyMap<number, JsonObject>;
  readonly byName: ReadonlyMap<string, JsonObject>;
  readonly ruleForId: (id: number | null) => JsonObject | null;
  readonly ruleForName: (name: string) => JsonObject | null;
}

function buildRulesIndex(ruleset: JsonObject): RulesIndex {
  const byId = new Map<number, JsonObject>();
  const byName = new Map<string, JsonObject>();
  array(ruleset.units).map(object).forEach((unit) => {
    const id = integer(unit.id, null);
    const name = text(unit.label, text(unit.name));
    if (id !== null) byId.set(id, unit);
    if (name) byName.set(normalizedLookupName(name), unit);
  });
  return {
    byId,
    byName,
    ruleForId: (id) => id === null ? null : byId.get(id) ?? null,
    ruleForName: (name) => byName.get(normalizedLookupName(name)) ?? null,
  };
}

function unitIdentity(
  player: number,
  unitId: number | null,
  name: string,
  time: number,
  unitStats: JsonObject,
  rules: RulesIndex
): UnitIdentity {
  const playerStats = object(object(unitStats.players)[String(player)]);
  const units = object(playerStats.units);
  const unitRecord = unitId === null
    ? Object.values(units).map(object).find((row) => namesCompatible(text(row.name), name)) ?? null
    : object(units[String(unitId)]);
  const sourceUnitId = unitId ?? integer(unitRecord?.unit_id, null);
  const snapshot = latestSnapshot(playerStats, time);
  const resolvedUnitId = sourceUnitId === null
    ? null
    : integer(object(snapshot?.resolved_unit_ids)[String(sourceUnitId)], sourceUnitId);
  const snapshotRow = resolvedUnitId === null
    ? null
    : array(snapshot?.units).map(object).find((row) => integer(row.unit_id, null) === resolvedUnitId) ?? null;
  const rule = rules.ruleForId(sourceUnitId) ?? rules.ruleForName(name);
  const resolvedName = text(snapshotRow?.name, text(unitRecord?.name, text(rule?.label, text(rule?.name, name || "Unit"))));
  const baseStats = object(unitRecord?.base_stats);
  const snapshotStats = object(snapshotRow?.stats);
  const ruleMovement = object(rule?.movement);
  const ruleProduction = object(rule?.production);
  const baseTrainTime = firstNonNegative([
    number(baseStats.train_time, -1),
    firstTrainTime(ruleProduction),
  ], 0);
  const effectiveTrainTime = firstNonNegative([
    number(snapshotStats.train_time, -1),
    baseTrainTime,
  ], baseTrainTime);
  const speed = firstNonNegative([
    number(snapshotStats.speed, -1),
    number(baseStats.speed, -1),
    number(ruleMovement.speed, -1),
  ], DEFAULT_UNIT_SPEED);
  const classId = integer(unitRecord?.class_id, integer(rule?.classId, null));
  const category = classifyUnitCategory({
    name: resolvedName,
    stats: snapshotStats,
    classId,
    worker: /\bvillager\b/.test(normalizedLookupName(resolvedName)),
  });
  return {
    sourceUnitId,
    resolvedUnitId,
    name: resolvedName,
    normalizedName: normalizedLookupName(resolvedName),
    classId,
    category,
    spriteKey: resolveMapSpriteKey({ name: resolvedName, stats: snapshotStats, classId, category }),
    baseTrainTime,
    effectiveTrainTime,
    speed,
    trainTimeEvidence: number(snapshotStats.train_time, -1) >= 0
      ? "unit_stats_effective_snapshot"
      : number(baseStats.train_time, -1) >= 0
        ? "unit_stats_base"
        : "ruleset_or_zero_fallback",
  };
}

function latestSnapshot(playerStats: JsonObject, time: number): JsonObject | null {
  const snapshots = array(playerStats.snapshots)
    .map(object)
    .filter((row) => Number.isFinite(number(row.time, Number.NaN)))
    .sort((a, b) => number(a.time) - number(b.time));
  let latest: JsonObject | null = null;
  for (const snapshot of snapshots) {
    if (number(snapshot.time) <= time + VISIBILITY_EPSILON) latest = snapshot;
    else break;
  }
  return latest;
}

function firstTrainTime(production: JsonObject): number {
  const times = array(production.trainLocations)
    .map(object)
    .map((location) => number(location.trainTime, -1))
    .filter((time) => time >= 0);
  return times.length ? Math.min(...times) : -1;
}

function baseBuildSecondsFor(name: string, rule: JsonObject | null): number {
  const rawBase = object(rule?.rawBase);
  const building = object(rule?.building);
  const construction = object(rule?.construction);
  const explicit = firstNonNegative([
    number(rawBase.buildTime, -1),
    number(rawBase.constructionTime, -1),
    number(building.buildTime, -1),
    number(building.constructionTime, -1),
    number(construction.buildTime, -1),
    number(construction.seconds, -1),
  ], -1);
  if (explicit >= 0) return explicit;
  const normalized = normalizedLookupName(name);
  const fallback = BUILD_COMPLETION_FALLBACK_SECONDS.find(([pattern]) => pattern.test(normalized));
  return fallback?.[1] ?? 50;
}

function buildingFootprint(name: string, rule: JsonObject | null): { readonly width: number; readonly height: number } {
  const rawBase = object(rule?.rawBase);
  const footprint = object(rule?.footprint);
  const width = firstNonNegative([
    number(footprint.width, -1),
    number(rawBase.sizeX, -1),
    number(rawBase.radiusX, -1) * 2,
  ], -1);
  const height = firstNonNegative([
    number(footprint.height, -1),
    number(rawBase.sizeY, -1),
    number(rawBase.radiusY, -1) * 2,
  ], -1);
  if (width > 0 && height > 0) return { width, height };
  const normalized = normalizedLookupName(name);
  return BUILDING_FOOTPRINT_FALLBACKS.find(([pattern]) => pattern.test(normalized))?.[1]
    ?? { width: 2, height: 2 };
}

function estimatedConstructionDurationSeconds(baseBuildSeconds: number, builderCount: number): number {
  const builders = Math.max(1, Math.floor(builderCount));
  return cleanNumber(Math.max(0, baseBuildSeconds) * 3 / (builders + 2));
}

function positionHorizonSeconds(worker: boolean): number {
  return worker ? WORKER_POSITION_HORIZON_SECONDS : UNIT_POSITION_HORIZON_SECONDS;
}

function spawnEstimate(producer: BuildingTimelineRow | null, rally: GatherPointRow | null): SpawnEstimate | null {
  if (!producer) {
    return null;
  }
  const rallyPosition = rally?.position ?? null;
  const vector = rallyPosition
    ? { x: rallyPosition.x - producer.position.x, y: rallyPosition.y - producer.position.y }
    : { x: 1, y: 0 };
  const magnitude = Math.hypot(vector.x, vector.y);
  const direction = magnitude > 0.0001
    ? { x: vector.x / magnitude, y: vector.y / magnitude }
    : { x: 1, y: 0 };
  const halfWidth = Math.max(0.5, producer.footprint.width / 2);
  const halfHeight = Math.max(0.5, producer.footprint.height / 2);
  const edgeScale = Math.min(
    Math.abs(direction.x) < 0.0001 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(direction.x),
    Math.abs(direction.y) < 0.0001 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(direction.y)
  );
  const outsideOffset = 0.65;
  return {
    position: cleanPoint({
      x: producer.position.x + direction.x * (edgeScale + outsideOffset),
      y: producer.position.y + direction.y * (edgeScale + outsideOffset),
    }),
    producer_position: producer.position,
    rally_position: rallyPosition,
    direction: rallyPosition ? "rally" : "deterministic-east-edge",
    evidence_class: "simulated",
    method: rallyPosition
      ? "producer-edge-directed-to-latest-known-rally"
      : "producer-east-edge-deterministic-fallback",
  };
}

function latestGatherPoint(
  rows: readonly GatherPointRow[],
  player: number,
  producerId: number | null,
  time: number
): GatherPointRow | null {
  if (producerId === null) return null;
  return rows
    .filter((row) => row.player === player && row.sourceId === producerId && row.time <= time + VISIBILITY_EPSILON)
    .sort((a, b) => b.time - a.time || a.sourceId - b.sourceId)[0] ?? null;
}

function knownObjectPositionIndex(match: JsonObject): ReadonlyMap<number, Point> {
  const rows = new Map<number, Point>();
  array(match.gaia).map(object).forEach((objectRow) => {
    const id = integer(objectRow.instance_id, null);
    const position = point(objectRow.position);
    if (id !== null && position) rows.set(id, position);
  });
  array(match.players).map(object).forEach((player) => {
    array(player.objects).map(object).forEach((objectRow) => {
      const id = integer(objectRow.instance_id, null);
      const position = point(objectRow.position);
      if (id !== null && position) rows.set(id, position);
    });
  });
  return rows;
}

function representativeSampleTimes(
  duration: number,
  units: readonly UnitTimelineRow[],
  matchedCount: number
): JsonObject {
  const firstEstimatedBirth = units
    .filter((unit) => unit.birth_kind === "queue_estimate")
    .sort((a, b) => a.birth_time - b.birth_time)[0]?.birth_time ?? null;
  const firstMatched = units
    .filter((unit) => unit.reconciliation.status === "matched")
    .sort((a, b) => a.birth_time - b.birth_time)[0] ?? null;
  return {
    initial: 0,
    first_estimated_birth: firstEstimatedBirth === null ? null : cleanTime(firstEstimatedBirth),
    post_first_interaction: firstMatched?.reconciliation.matched_time ?? null,
    late: cleanTime(duration),
    backward_seek_representative: firstMatched
      ? cleanTime(Math.max(0, firstMatched.birth_time - 1))
      : firstEstimatedBirth === null
        ? 0
        : cleanTime(Math.max(0, firstEstimatedBirth - 1)),
    matched_observed_actor_count: matchedCount,
  };
}

function dedupeAdjacentInputRows<T>(rows: readonly T[], keyFor: (row: T) => string): readonly T[] {
  const result: T[] = [];
  let previousKey = "";
  rows.forEach((row) => {
    const key = keyFor(row);
    if (key !== previousKey) result.push(row);
    previousKey = key;
  });
  return result;
}

function replayTime(row: JsonObject): number | null {
  const direct = number(row.time, Number.NaN);
  if (Number.isFinite(direct)) return cleanTime(direct);
  if (typeof row.timestamp === "string") {
    const [hours, minutes, seconds] = row.timestamp.split(":").map(Number);
    if ([hours, minutes, seconds].every(Number.isFinite)) {
      return cleanTime((hours ?? 0) * 3600 + (minutes ?? 0) * 60 + (seconds ?? 0));
    }
  }
  return null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function integer(value: unknown, fallback: number | null = -1): number | null {
  return Number.isInteger(value) ? value as number : fallback;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value ? value : fallback;
}

function point(value: unknown): Point | null {
  const row = object(value);
  const x = number(row.x, Number.NaN);
  const y = number(row.y, Number.NaN);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function cleanNumber(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
}

function cleanTime(value: number): number {
  return cleanNumber(Math.max(0, value));
}

function cleanPoint(value: Point): Point {
  return { x: cleanNumber(value.x), y: cleanNumber(value.y) };
}

function distance(first: Point, second: Point): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function samePoint(first: Point, second: Point): boolean {
  return distance(first, second) <= VISIBILITY_EPSILON;
}

function firstNonNegative(values: readonly number[], fallback: number): number {
  const value = values.find((candidate) => Number.isFinite(candidate) && candidate >= 0);
  return value ?? fallback;
}

function normalizedObjectId(instanceId: unknown): number | null {
  const value = Number(instanceId);
  if (!Number.isInteger(value)) return null;
  if (value > 65535 && value % 256 === 0) return value / 256;
  if (value > 65535 && value % 256 === 1) return (value - 1) / 256;
  return value;
}

function uniqueNormalizedIds(ids: readonly unknown[]): readonly number[] {
  return [...new Set(ids.map(normalizedObjectId).filter((value): value is number => Number.isInteger(value)))]
    .sort((a, b) => a - b);
}

function actorKey(player: number, actorId: number): string {
  return `${player}:${actorId}`;
}

function normalizedLookupName(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\belite\b/g, " ")
    .replace(/\bupgrade\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesCompatible(first: string, second: string): boolean {
  const a = normalizedLookupName(first);
  const b = normalizedLookupName(second);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function unitNameMatches(name: string, pattern: RegExp): boolean {
  return pattern.test(normalizedLookupName(name));
}

function unitClassId(classId: number | null, stats: JsonObject): number {
  return classId ?? integer(stats.class_id, integer(stats.classId, -1)) ?? -1;
}

function unitClassIdMatches(classId: number, ids: readonly number[]): boolean {
  return ids.includes(classId);
}

function packedSiegeClassMatchesName(classId: number, name: string): boolean {
  return unitClassIdMatches(classId, PACKED_SIEGE_UNIT_CLASS_IDS)
    && unitNameMatches(name, /\b(trebuchet|mang|pmang|sling|neighbor)\b/);
}

function classifyUnitCategory({
  name = "",
  stats = {},
  classId = null,
  worker = false,
}: {
  readonly name?: string;
  readonly stats?: JsonObject;
  readonly classId?: number | null;
  readonly worker?: boolean;
} = {}): string | null {
  const resolvedClassId = unitClassId(classId, stats);
  if (worker || unitNameMatches(name, /\bvillager\b/)) return "villagers";
  if (unitClassIdMatches(resolvedClassId, CONTROLLABLE_FOOD_UNIT_CLASS_IDS)) return "controllableFood";
  if (unitClassIdMatches(resolvedClassId, NAVAL_UNIT_CLASS_IDS)
    || unitNameMatches(name, /\b(ship|galley|galleon|transport|cog|caravel|dromon|longboat|turtle ship)\b/)) return "naval";
  if (unitClassIdMatches(resolvedClassId, SUPPORT_UNIT_CLASS_IDS)
    || unitNameMatches(name, /\b(monk|priest|missionary)\b/)) return "support";
  if (
    unitClassIdMatches(resolvedClassId, SIEGE_UNIT_CLASS_IDS)
    || packedSiegeClassMatchesName(resolvedClassId, name)
    || unitNameMatches(name, /\b(ram|mangonel|onager|scorpion|trebuchet|bombard cannon|siege|ballista|houfnice|hussite wagon|organ gun|flamethrower|rocket cart|traction trebuchet|armored elephant|mounted trebuchet)\b/)
  ) return "siege";
  if (unitClassIdMatches(resolvedClassId, RANGED_UNIT_CLASS_IDS)
    || unitNameMatches(name, /\b(archer|skirmisher|crossbow|bowman|longbow|chu ko nu|hand cannoneer|janissary|slinger|plumed|rattan|genoese|kipchak|mangudai|cavalry archer|camel archer|elephant archer|conquistador|arambai|genitour|ratha)\b/)) return "ranged";
  if (unitClassIdMatches(resolvedClassId, CAVALRY_UNIT_CLASS_IDS)
    || unitNameMatches(name, /\b(cavalry|knight|cavalier|paladin|hussar|camel|elephant|lancer|tarkan|cataphract|keshik|leitis|boyar|konnik|magyar huszar|coustillier|shrivamsha|centurion)\b/)) return "cavalry";
  if (unitClassIdMatches(resolvedClassId, INFANTRY_UNIT_CLASS_IDS)
    || unitNameMatches(name, /\b(militia|man at arms|swordsman|champion|spearman|pikeman|halb|eagle|huskarl|samurai|teutonic|woad|berserk|jaguar|condottiero|karambit|kamayuk|gbeto|serjeant|obuch|legionary|throwing axeman)\b/)) return "infantry";
  const attackAmount = number(object(stats.attack).amount);
  const maxRange = number(stats.max_range, number(stats.maxRange));
  const pierceArmor = number(stats.pierce_armor, number(stats.pierceArmor));
  const speed = number(stats.speed);
  const hp = number(stats.hp, number(stats.maxHp));
  if (attackAmount > 0 && (pierceArmor >= 50 || speed <= 0.65)) return "siege";
  if (attackAmount > 0 && maxRange > 0) return "ranged";
  if (attackAmount > 0 && speed >= 1.15 && hp >= 40) return "cavalry";
  if (attackAmount > 0 && speed >= 0.7) return "infantry";
  return null;
}

function resolveMapSpriteKey({
  name = "",
  stats = {},
  classId = null,
  category = null,
}: {
  readonly name?: string;
  readonly stats?: JsonObject;
  readonly classId?: number | null;
  readonly category?: string | null;
} = {}): string | null {
  const normalized = normalizedLookupName(name);
  const has = (pattern: RegExp): boolean => pattern.test(normalized);
  const resolvedClassId = unitClassId(classId, stats);
  const resolvedCategory = category ?? classifyUnitCategory({ name, stats, classId });
  if (has(/\bvillager\b/)) return "villagers";
  if (
    resolvedCategory === "controllableFood"
    || unitClassIdMatches(resolvedClassId, CONTROLLABLE_FOOD_UNIT_CLASS_IDS)
  ) return "controllableFood";
  if (unitClassIdMatches(resolvedClassId, NAVAL_UNIT_CLASS_IDS)
    || has(/\b(ship|galley|galleon|transport|cog|caravel|dromon|longboat|turtle ship)\b/)) return "ship";
  if (resolvedCategory === "siege") {
    if (has(/\b(scorpion|ballista|hussite wagon)\b/)
      || unitClassIdMatches(resolvedClassId, [55])) return "scorpion";
    if (has(/\b(capped ram|siege ram|battering ram|ram|siege tower|armored elephant|siege elephant)\b/)) return "ram";
    if (has(/\btrebuchet\b/)) return "trebuchet";
    if (has(/\b(bombard cannon|houfnice)\b/)) return "bombardCannon";
    if (has(/\b(mangonel|onager|catapult|pmang|sling|neighbor)\b/)) return "catapult";
    return "catapult";
  }
  if (has(/\belephant\b/)) return "elephant";
  if (has(/\b(cavalry archer|camel archer|conquistador|arambai|mangudai|kipchak|genitour|ratha|mounted ranged)\b/)) return "cavalryArcher";
  if (has(/\b(spearman|pikeman|halberdier|halb|kamayuk)\b/)) return "spear";
  if (has(/\b(militia|man at arms|long swordsman|two handed swordsman|swordsman|champion|condottiero|legionary|serjeant|samurai|teutonic knight|woad raider|berserk|jaguar warrior|huskarl|karambit warrior|gbeto|obuch|throwing axeman|eagle warrior)\b/)) return "swordsman";
  if (has(/\b(scout cavalry|light cavalry|hussar|magyar huszar|steppe scout)\b/)) return "scout";
  if (has(/\b(camel|mameluke)\b/)) return "camel";
  if (has(/\b(knight|cavalier|paladin|cataphract|boyar|keshik|leitis|konnik|coustillier|lancer|shrivamsha|centurion|tarkan)\b/)) return "knight";
  if (has(/\b(monk|priest|missionary)\b/) || unitClassIdMatches(resolvedClassId, SUPPORT_UNIT_CLASS_IDS)) return "monk";
  if (has(/\b(archer|skirmisher|crossbow|bowman|longbow|chu ko nu|hand cannoneer|janissary|slinger|plumed|rattan|genoese|organ gun)\b/)) return "archer";
  if (resolvedCategory === "villagers") return "villagers";
  if (resolvedCategory === "ranged") return "archer";
  if (resolvedCategory === "infantry") return "swordsman";
  if (resolvedCategory === "cavalry") return "knight";
  if (resolvedCategory === "support") return "monk";
  if (resolvedCategory === "siege") return "catapult";
  if (resolvedCategory === "naval") return "ship";
  return null;
}
