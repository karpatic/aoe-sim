import type { ReplayScenarioV1, RulesetV1 } from "./model";

export function summarizeProvenance(scenario: ReplayScenarioV1, ruleset: RulesetV1): readonly string[] {
  return [
    `scenario ${scenario.provenance.generatedArtifact.id} ${scenario.provenance.generatedArtifact.sha256}`,
    `game-json ${scenario.provenance.gameJson.sha256}`,
    `ruleset ${ruleset.rulesetId} ${scenario.provenance.ruleset.sha256}`,
    `replay ${scenario.provenance.replay.id} ${scenario.provenance.replay.sha256}`,
    `parser ${scenario.provenance.parser.id} ${scenario.provenance.parser.sha256}`,
    `importer ${scenario.provenance.importer.sha256}`
  ];
}
