import type { ReplayScenarioV1, RulesetV1 } from "./model";

export function assertReplayScenarioV1(value: unknown): ReplayScenarioV1 {
  if (!isRecord(value) || value.schemaVersion !== "aoe-sim.scenario.v1") {
    throw new Error("Unsupported scenario schema");
  }

  if (typeof value.scenarioId !== "string" || typeof value.durationMs !== "number") {
    throw new Error("Scenario is missing identity or duration");
  }

  if (!Array.isArray(value.players) || !Array.isArray(value.entities) || !Array.isArray(value.commands)) {
    throw new Error("Scenario is missing players, entities, or commands");
  }

  return value as unknown as ReplayScenarioV1;
}

export function assertRulesetV1(value: unknown): RulesetV1 {
  if (!isRecord(value) || value.schemaVersion !== "aoe-sim.ruleset.v1") {
    throw new Error("Unsupported ruleset schema");
  }

  if (typeof value.rulesetId !== "string" || !Array.isArray(value.units)) {
    throw new Error("Ruleset is missing identity or units");
  }

  return value as unknown as RulesetV1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
