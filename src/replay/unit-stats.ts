type JsonObject = Record<string, unknown>;

interface UnitStatsInputs {
  game: JsonObject;
  economy: JsonObject;
  resourceEstimates: JsonObject;
  ruleset: JsonObject;
}

interface UnitRecord {
  unit_id: number;
  name: string;
  internal_name: string;
  class_id: number;
  base_unit_id: number;
  copy_id: number;
  base_stats: StatBlock;
  attack_classes: Record<string, number>;
  armor_classes: Record<string, number>;
}

interface StatBlock {
  hp: number;
  attack: { kind: "melee" | "pierce" | null; class: number | null; amount: number };
  melee_armor: number;
  pierce_armor: number;
  max_range: number;
  min_range: number;
  speed: number;
  line_of_sight: number;
  reload_time: number;
  train_time: number;
}

interface EffectEvent {
  time: number;
  technology_id?: number;
  effect_id: number;
  name: string;
  source: string;
  source_label: string;
  confidence: string;
  display: boolean;
  kind?: "ruleset_effect";
}

const SCALAR_ATTRIBUTES: Record<number, keyof Omit<StatBlock, "attack">> = {
  0: "hp",
  1: "line_of_sight",
  5: "speed",
  10: "reload_time",
  12: "max_range",
  22: "min_range",
  101: "train_time"
};
const TECH_TREE_OPERATIONS = new Set([1, 2, 6, 7, 8, 10, 12, 15, 18, 26, 40, 101, 102, 103, 200, 201, 202, 204, 255]);
const STARTING_TECH_IDS = [104];

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function integer(value: unknown, fallback = -1): number {
  return Number.isInteger(value) ? value as number : fallback;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value ? value : fallback;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function cleanNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function teamKey(player: JsonObject): string {
  const teamId = array(player.team_id).map(String).sort().join(",");
  const team = array(player.team).map(String).sort().join(",");
  return teamId || team || `player:${integer(player.number)}`;
}

function firstTrainTime(production: JsonObject): number {
  const times = array(production.trainLocations).map(object).map(location => number(location.trainTime, -1)).filter(time => time >= 0);
  return times.length ? Math.min(...times) : 0;
}

function unitRecord(raw: JsonObject): UnitRecord {
  const combat = object(raw.combat);
  const movement = object(raw.movement);
  const production = object(raw.production);
  const rawBase = object(raw.rawBase);
  const attacks = array(combat.attacks).map(object);
  const armors = array(combat.armors).map(object);
  const attackClasses = Object.fromEntries(attacks.map(row => [String(integer(row.classId)), number(row.amount)]));
  const armorClasses = Object.fromEntries(armors.map(row => [String(integer(row.classId)), number(row.amount)]));
  const displayedAttack = number(combat.displayedAttack);
  const pierceAttack = number(attackClasses["3"], Number.NaN);
  const meleeAttack = number(attackClasses["4"], Number.NaN);
  const maxRange = number(combat.maxRange);
  const attackClass = maxRange > 0 && Number.isFinite(pierceAttack) ? 3 : Number.isFinite(meleeAttack) ? 4 : Number.isFinite(pierceAttack) ? 3 : -1;
  const attackAmount = attackClass === 3 ? pierceAttack : attackClass === 4 ? meleeAttack : displayedAttack;
  const id = integer(raw.id);
  return {
    unit_id: id,
    name: text(raw.label, `Unit ${id}`),
    internal_name: text(object(raw.labels).internalName),
    class_id: integer(raw.classId),
    base_unit_id: integer(raw.baseId, id),
    copy_id: integer(raw.copyId, id),
    base_stats: {
      hp: number(raw.maxHp, number(rawBase.hitPoints)),
      attack: { kind: attackClass === 3 ? "pierce" : attackClass === 4 ? "melee" : null, class: attackClass >= 0 ? attackClass : null, amount: Number.isFinite(attackAmount) ? attackAmount : displayedAttack },
      melee_armor: number(armorClasses["4"], number(combat.displayedMeleeArmor)),
      pierce_armor: number(armorClasses["3"], number(production.displayedPierceArmour)),
      max_range: maxRange,
      min_range: number(combat.minRange),
      speed: number(movement.speed),
      line_of_sight: number(rawBase.lineOfSight),
      reload_time: number(combat.reloadTime),
      train_time: firstTrainTime(production)
    },
    attack_classes: attackClasses,
    armor_classes: armorClasses
  };
}

function applyNumber(current: number, operation: number, value: number): number | undefined {
  if (operation === 0) return cleanNumber(value);
  if (operation === 4) return cleanNumber(current + value);
  if (operation === 5) return cleanNumber(current * value);
  return undefined;
}

function packed(value: number): [number, number] | undefined {
  if (!Number.isFinite(value)) return undefined;
  const sign = value < 0 ? -1 : 1;
  const raw = Math.round(Math.abs(value));
  return [Math.floor(raw / 256), sign * (raw % 256)];
}

function changedFields(base: StatBlock, current: StatBlock): string[] {
  const fields: (keyof Omit<StatBlock, "attack">)[] = ["hp", "melee_armor", "pierce_armor", "max_range", "min_range", "speed", "line_of_sight", "reload_time", "train_time"];
  const changed = fields.filter(field => base[field] !== current[field]);
  if (base.attack.amount !== current.attack.amount) changed.push("attack" as never);
  return changed;
}

function makeSnapshot(
  time: number,
  resolution: Map<number, number>,
  stats: Map<number, StatBlock>,
  records: Map<number, UnitRecord>,
  completed: Set<number>,
  unresolved: Record<string, number>
): JsonObject {
  const sources = new Map<number, number[]>();
  for (const [source, current] of resolution) sources.set(current, [...(sources.get(current) ?? []), source]);
  return {
    time,
    completed_technology_ids: [...completed].sort((a, b) => a - b),
    resolved_unit_ids: Object.fromEntries([...resolution].sort((a, b) => a[0] - b[0]).map(([source, current]) => [String(source), current])),
    units: [...sources].sort((a, b) => a[0] - b[0]).flatMap(([currentId, lineSources]) => {
      const record = records.get(currentId);
      const current = stats.get(currentId);
      if (!record || !current) return [];
      return [{ unit_id: currentId, name: record.name, line_source_unit_ids: lineSources.sort((a, b) => a - b), stats: clone(current), changed_fields: changedFields(record.base_stats, current) }];
    }),
    unresolved_effects: { ...unresolved }
  };
}

function addUnresolved(unresolved: Record<string, number>, key: string, count = 1): void {
  unresolved[key] = (unresolved[key] ?? 0) + count;
}

function automaticTechnologyEvents(
  civId: number,
  civ: JsonObject,
  technologies: Map<number, JsonObject>,
  effects: Map<number, JsonObject>,
  explicitEvents: readonly EffectEvent[]
): EffectEvent[] {
  const zeroOperations = new Map<number, Set<number>>();
  const civEffect = effects.get(integer(civ.techTreeEffectId));
  for (const rawCommand of array(civEffect?.commands)) {
    const command = object(rawCommand);
    const operation = integer(command.type);
    const techId = integer(command.a);
    if ((operation === 101 || operation === 103) && techId >= 0 && Math.abs(number(command.d)) < 1e-9) {
      const operations = zeroOperations.get(techId) ?? new Set<number>();
      operations.add(operation);
      zeroOperations.set(techId, operations);
    }
  }
  const zeroed = new Set([...zeroOperations].filter(([, operations]) => operations.has(101) && operations.has(103)).map(([techId]) => techId));
  const candidates = new Set(zeroed);
  for (const [techId, tech] of technologies) {
    const locations = array(tech.researchLocations).map(object);
    if (integer(tech.civilizationId) === civId && locations.length && locations.every(location => integer(location.locationId) === -1 && number(location.researchTime, Number.POSITIVE_INFINITY) <= 1)) {
      candidates.add(techId);
    }
  }
  const explicitIds = new Set(explicitEvents.flatMap(event => event.technology_id === undefined ? [] : [event.technology_id]));
  const knownTimes = new Map<number, number>(STARTING_TECH_IDS.map(techId => [techId, 0]));
  for (const event of explicitEvents) {
    if (event.technology_id === undefined) continue;
    knownTimes.set(event.technology_id, Math.min(knownTimes.get(event.technology_id) ?? Number.POSITIVE_INFINITY, event.time));
  }
  const emitted = new Set<number>();
  const result: EffectEvent[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const techId of [...candidates].sort((a, b) => a - b)) {
      if (explicitIds.has(techId) || emitted.has(techId)) continue;
      const tech = technologies.get(techId);
      if (!tech) continue;
      const requiredCount = integer(tech.requiredTechCount, 0);
      const prerequisiteTimes = array(tech.requiredTechs)
        .map(value => integer(value))
        .filter(requiredId => requiredId >= 0 && knownTimes.has(requiredId))
        .map(requiredId => knownTimes.get(requiredId)!)
        .sort((a, b) => a - b);
      if (requiredCount > 0 && prerequisiteTimes.length < requiredCount) continue;
      const time = requiredCount > 0 ? Math.max(...prerequisiteTimes.slice(0, requiredCount)) : 0;
      const effectId = integer(tech.effectId);
      result.push({
        time,
        technology_id: techId,
        effect_id: effectId,
        name: text(tech.label, `Technology ${techId}`),
        source: zeroed.has(techId) ? "civilization_zero_cost_time_modification" : "civilization_hidden_no_location_prerequisite",
        source_label: "auto · civilization",
        confidence: "derived_ruleset_prerequisite",
        display: zeroed.has(techId) && effectId >= 0
      });
      emitted.add(techId);
      knownTimes.set(techId, time);
      changed = true;
    }
  }
  return result;
}

function applyEffect(
  event: EffectEvent,
  effects: Map<number, JsonObject>,
  records: Map<number, UnitRecord>,
  stats: Map<number, StatBlock>,
  resolution: Map<number, number>,
  unresolved: Record<string, number>
): JsonObject {
  const changes: JsonObject[] = [];
  const upgrades: JsonObject[] = [];
  const effect = effects.get(event.effect_id);
  if (!effect) return { ...event, applied: false, stats_changed: changes, unit_upgrades: upgrades, unresolved_effects: {} };
  const eventUnresolved: Record<string, number> = {};
  for (const rawCommand of array(effect.commands)) {
    const command = object(rawCommand);
    const operation = integer(command.type);
    if (operation === 3) {
      const sourceId = integer(command.a);
      const targetId = integer(command.b);
      const affected = [...resolution].filter(([, current]) => current === sourceId).map(([source]) => source);
      if (sourceId < 0 || targetId < 0 || !records.has(targetId)) {
        if (affected.length) addUnresolved(eventUnresolved, "invalid_or_missing_unit_upgrade");
        continue;
      }
      for (const source of affected) resolution.set(source, targetId);
      if (affected.length) upgrades.push({ source_unit_id: sourceId, target_unit_id: targetId, line_source_unit_ids: affected });
      continue;
    }
    if (TECH_TREE_OPERATIONS.has(operation)) continue;
    const targetId = integer(command.a);
    const classId = integer(command.b);
    const targets = targetId >= 0
      ? (records.has(targetId) ? [targetId] : [])
      : (targetId === -1 && classId >= 0 ? [...records].filter(([, record]) => record.class_id === classId).map(([id]) => id) : []);
    if (!targets.length) {
      if (targetId === -1 && classId === -1) addUnresolved(eventUnresolved, `global_target_attribute_${integer(command.c)}`);
      continue;
    }
    if (![0, 4, 5].includes(operation)) {
      addUnresolved(eventUnresolved, `unsupported_operation_${operation}`, targets.length);
      continue;
    }
    const attribute = integer(command.c);
    const value = number(command.d, Number.NaN);
    const scalar = SCALAR_ATTRIBUTES[attribute];
    if (scalar) {
      for (const id of targets) {
        const unitStats = stats.get(id);
        if (!unitStats) continue;
        const before = unitStats[scalar];
        const after = applyNumber(before, operation, value);
        if (after === undefined) continue;
        unitStats[scalar] = after;
        if (before !== after) changes.push({ unit_id: id, field: scalar, from: before, to: after });
      }
      continue;
    }
    if (attribute !== 8 && attribute !== 9) {
      addUnresolved(eventUnresolved, `unsupported_attribute_${attribute}`, targets.length);
      continue;
    }
    const decoded = packed(value);
    if (!decoded || operation === 5) {
      addUnresolved(eventUnresolved, `unsupported_packed_${attribute}_${operation}`, targets.length);
      continue;
    }
    const [packedClass, amount] = decoded;
    for (const id of targets) {
      const unitStats = stats.get(id);
      if (!unitStats) continue;
      if (attribute === 8 && (packedClass === 3 || packedClass === 4)) {
        const field = packedClass === 3 ? "pierce_armor" : "melee_armor";
        const before = unitStats[field];
        const after = applyNumber(before, operation, amount);
        if (after !== undefined) {
          unitStats[field] = after;
          if (before !== after) changes.push({ unit_id: id, field, from: before, to: after });
        }
      } else if (attribute === 9 && unitStats.attack.class === packedClass) {
        const before = unitStats.attack.amount;
        const after = applyNumber(before, operation, amount);
        if (after !== undefined) {
          unitStats.attack.amount = after;
          if (before !== after) changes.push({ unit_id: id, field: "attack", from: before, to: after });
        }
      }
    }
  }
  for (const [key, count] of Object.entries(eventUnresolved)) addUnresolved(unresolved, key, count);
  return { ...event, applied: true, stats_changed: changes, unit_upgrades: upgrades, unresolved_effects: eventUnresolved };
}

export function generateUnitStatsForReplay({ game, economy, resourceEstimates, ruleset }: UnitStatsInputs): JsonObject {
  const match = object(game.match);
  const players = array(match.players).map(object).filter(player => integer(player.number) >= 0);
  const rawUnits = array(ruleset.units).map(object);
  const units = new Map(rawUnits.map(unit => [integer(unit.id), unit]));
  const technologies = new Map(array(ruleset.technologies).map(object).map(tech => [integer(tech.id), tech]));
  const effects = new Map(array(ruleset.effects).map(object).map(effect => [integer(effect.id), effect]));
  const civilizations = new Map(array(ruleset.civilizations).map(object).map(civ => [integer(civ.id), civ]));
  const completions = array(economy.unit_completions).map(object);
  const research = array(resourceEstimates.technology_completions).map(object);
  const sharedSeeds = new Set(completions.map(completion => integer(completion.unit_id)).filter(unitId => unitId >= 0));
  if (!sharedSeeds.size) {
    for (const player of players) {
      for (const rawObject of array(player.objects)) {
        const starting = object(rawObject);
        if (integer(starting.class_id) === 70 && integer(starting.object_id) >= 0) sharedSeeds.add(integer(starting.object_id));
      }
    }
  }
  const replayNames = new Map<number, string>();
  for (const completion of completions) {
    const unitId = integer(completion.unit_id);
    const name = text(completion.name);
    if (unitId >= 0 && name && !replayNames.has(unitId)) replayNames.set(unitId, name);
  }
  for (const player of players) {
    for (const rawObject of array(player.objects)) {
      const starting = object(rawObject);
      const unitId = integer(starting.object_id);
      const name = text(starting.name);
      if (unitId >= 0 && name && !replayNames.has(unitId)) replayNames.set(unitId, name);
    }
  }
  const playerOutputs: Record<string, JsonObject> = {};
  const unresolvedTotals: Record<string, number> = {};

  for (const player of players) {
    const playerNumber = integer(player.number);
    const civId = integer(player.civilization_id);
    const civ = civilizations.get(civId) ?? {};
    const queuedUnitIds = [...sharedSeeds].sort((a, b) => a - b);
    const seeds = new Set(sharedSeeds);

    const events: EffectEvent[] = [{
      time: 0, kind: "ruleset_effect", effect_id: integer(civ.techTreeEffectId),
      name: `${text(player.civilization, text(civ.name, `Civilization ${civId}`))} civilization ruleset`,
      source: "derived_civilization_effect", source_label: "ruleset · civilization", confidence: "derived_ruleset_initial_effect", display: false
    }];
    const key = teamKey(player);
    const teamEffects = new Set<number>();
    for (const ally of players.filter(other => teamKey(other) === key)) {
      const allyCiv = civilizations.get(integer(ally.civilization_id)) ?? {};
      const effectId = integer(allyCiv.teamBonusEffectId);
      if (effectId < 0 || teamEffects.has(effectId)) continue;
      teamEffects.add(effectId);
      events.push({ time: 0, kind: "ruleset_effect", effect_id: effectId, name: `${text(ally.civilization, text(allyCiv.name))} team bonus`, source: "derived_team_bonus_effect", source_label: "ruleset · team", confidence: "derived_ruleset_initial_effect", display: false });
    }
    for (const row of research.filter(item => integer(item.player) === playerNumber)) {
      const techId = integer(row.technology_id);
      const tech = technologies.get(techId);
      const effectId = integer(tech?.effectId);
      if (techId < 0 || effectId < 0) continue;
      events.push({ time: number(row.time), technology_id: techId, effect_id: effectId, name: text(row.name, text(tech?.label, `Technology ${techId}`)), source: "explicit_replay_research_estimate", source_label: "observed · estimate", confidence: text(row.confidence, "research_time_estimate"), display: true });
    }
    const explicitEvents = events.filter(event => event.source === "explicit_replay_research_estimate");
    events.push(...automaticTechnologyEvents(civId, civ, technologies, effects, explicitEvents));
    const eventKindOrder = (event: EffectEvent): number => event.kind === "ruleset_effect" ? 0 : event.source === "explicit_replay_research_estimate" ? 1 : 2;
    events.sort((a, b) => a.time - b.time || eventKindOrder(a) - eventKindOrder(b) || (a.technology_id ?? -1) - (b.technology_id ?? -1) || a.effect_id - b.effect_id || a.name.localeCompare(b.name));

    let changed = true;
    while (changed) {
      changed = false;
      for (const event of events) {
        const effect = effects.get(event.effect_id);
        for (const rawCommand of array(effect?.commands)) {
          const command = object(rawCommand);
          if (integer(command.type) !== 3) continue;
          const source = integer(command.a);
          const target = integer(command.b);
          if (seeds.has(source) && !seeds.has(target) && units.has(target)) { seeds.add(target); changed = true; }
        }
      }
    }

    const records = new Map<number, UnitRecord>();
    for (const id of [...seeds].sort((a, b) => a - b)) {
      const raw = units.get(id);
      if (raw) {
        const record = unitRecord(raw);
        record.name = replayNames.get(id) ?? record.name;
        records.set(id, record);
      }
    }
    const stats = new Map([...records].map(([id, record]) => [id, clone(record.base_stats)]));
    const resolution = new Map(queuedUnitIds.filter(id => records.has(id)).map(id => [id, id]));
    const completed = new Set(STARTING_TECH_IDS);
    const unresolved: Record<string, number> = {};
    const snapshots: JsonObject[] = [];
    const appliedEvents: JsonObject[] = [];
    if (!events.length || events[0]!.time > 0) snapshots.push(makeSnapshot(0, resolution, stats, records, completed, unresolved));
    let index = 0;
    while (index < events.length) {
      const time = events[index]!.time;
      while (index < events.length && events[index]!.time === time) {
        const event = events[index++]!;
        if (event.technology_id !== undefined) completed.add(event.technology_id);
        appliedEvents.push(applyEffect(event, effects, records, stats, resolution, unresolved));
      }
      snapshots.push(makeSnapshot(time, resolution, stats, records, completed, unresolved));
    }
    if (!snapshots.length) snapshots.push(makeSnapshot(0, resolution, stats, records, completed, unresolved));
    for (const [unresolvedKey, count] of Object.entries(unresolved)) addUnresolved(unresolvedTotals, unresolvedKey, count);
    playerOutputs[String(playerNumber)] = {
      player: playerNumber,
      name: text(player.name, `Player ${playerNumber}`),
      civilization: text(player.civilization, text(civ.name)),
      civilization_id: civId,
      civilization_dat_name: text(civ.name),
      queued_unit_ids: queuedUnitIds,
      included_unit_ids: [...records.keys()].sort((a, b) => a - b),
      missing_unit_ids: [...seeds].filter(id => !records.has(id)).sort((a, b) => a - b),
      units: Object.fromEntries([...records].map(([id, record]) => [String(id), record])),
      technology_events: appliedEvents,
      snapshots,
      unresolved
    };
  }

  return {
    schema: "aoe2-unit-stats/v1",
    generated_utc: new Date().toISOString(),
    source: { replay_build_version: match.build_version ?? null, ruleset_schema: ruleset.schema ?? null, ruleset_build: object(ruleset.source).appmanifestBuildId ?? null, raw_dat_bundled: false, replay_specific: true },
    methodology: {
      identity: "Numeric unit IDs are the stable identity; labels are display-only.",
      base_stats: "Base attributes come from the generic public derived ruleset for every selected replay.",
      technology_timing: "Observed technology completion times come from the selected replay resource reconstruction.",
      effect_semantics: "Civilization, allied team, and observed research effects are applied conservatively for unit upgrades and supported scalar or packed combat attributes."
    },
    confidence: { overall: "conservative_per_replay_ruleset_calculation", technology_completion_times: "estimated_from_selected_replay", unresolved_effect_policy: "counted_and_exposed_instead_of_guessed" },
    caveats: ["Exact historical patch parity is not guaranteed when the replay and derived ruleset builds differ.", "Unsupported effect operations are exposed as unresolved and are not guessed."],
    fields: { visible: ["hp", "attack", "melee_armor", "pierce_armor", "max_range", "min_range", "speed"], available_compact_or_tooltip: ["line_of_sight", "reload_time", "train_time"] },
    counts: { players: Object.keys(playerOutputs).length, unresolved_effects: Object.values(unresolvedTotals).reduce((sum, count) => sum + count, 0) },
    unresolved: unresolvedTotals,
    players: playerOutputs
  };
}
