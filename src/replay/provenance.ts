import type { ReplayScenarioV1, RulesetV1 } from "./model";

export function summarizeProvenance(scenario: ReplayScenarioV1, ruleset: RulesetV1): readonly string[] {
  const counts = ruleset.diagnostics?.counts;
  const rulesetHash = ruleset.provenance.generatedArtifact?.sha256 ?? scenario.provenance.ruleset.sha256;
  return [
    `scenario ${scenario.provenance.generatedArtifact.id} ${scenario.provenance.generatedArtifact.sha256}`,
    `game-json ${scenario.provenance.gameJson.sha256}`,
    `ruleset ${ruleset.rulesetId} ${rulesetHash}`,
    `ruleset fidelity ${ruleset.fidelity?.status ?? "unknown"} (${ruleset.sourceBuild})`,
    counts
      ? `rules coverage ${counts.units} units, ${counts.technologies} techs, ${counts.effects} effects`
      : "rules coverage unavailable",
    `replay ${scenario.provenance.replay.id} ${scenario.provenance.replay.sha256}`,
    `dat ${ruleset.provenance.dat.id} ${ruleset.provenance.dat.sha256}`,
    ruleset.provenance.localization
      ? `strings ${ruleset.provenance.localization.id} ${ruleset.provenance.localization.sha256}`
      : "strings unavailable",
    `parser ${scenario.provenance.parser.id} ${scenario.provenance.parser.sha256}`,
    ruleset.provenance.parser
      ? `dat parser ${ruleset.provenance.parser.id} ${ruleset.provenance.parser.sha256}`
      : "dat parser unavailable",
    `importer ${scenario.provenance.importer.sha256}`
  ];
}
