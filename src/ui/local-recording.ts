import { AOE2REC_PARSER_IDENTITY } from "../replay/local-recording";
import type { LocalReplayCompatibilityReport, LocalReplayComparison } from "../replay/local-recording";

export function renderLocalRecordingReport(
  root: HTMLElement,
  report: LocalReplayCompatibilityReport | undefined,
  stateText: string
): void {
  const disclosureState = readDisclosureState(root);
  root.replaceChildren();

  appendRow(root, "state", stateText);
  appendRow(root, "boundary", "raw bytes stay local; derived dataview/export can include replay facts");
  appendRow(root, "parser", `${AOE2REC_PARSER_IDENTITY.parser.id} / ${AOE2REC_PARSER_IDENTITY.license.name}`);
  appendRow(root, "parser commit", AOE2REC_PARSER_IDENTITY.parser.commit ?? "unknown");
  appendRow(root, "package", AOE2REC_PARSER_IDENTITY.parser.sha256);
  appendRow(root, "wasm", AOE2REC_PARSER_IDENTITY.wasm.sha256);

  if (!report) {
    return;
  }

  appendRow(root, "compatibility", report.status);
  appendRow(root, "summary", report.summary);
  appendRow(root, "file", `${report.recording.fileName} / ${formatBytes(report.recording.sizeBytes ?? 0)}`);
  appendRow(root, "replay content hash", report.recording.sha256);
  appendRow(root, "scenario", `${report.expected.scenarioId} / ${report.expected.scenarioArtifact.sha256}`);
  appendRow(root, "ruleset", `${report.expected.ruleset.id} / ${report.expected.ruleset.sha256}`);

  if (report.parsed) {
    appendRow(root, "build", String(report.parsed.summary.header.build));
    appendRow(root, "duration", `${report.parsed.summary.durationMs}ms`);
    appendRow(root, "players", formatPlayers(report));
    appendRow(root, "operations", formatOperations(report));
    appendRow(root, "seeds", formatSeeds(report));
  }

  if (report.compiled) {
    appendRow(root, "dataview", report.compiled.provenance.generatedArtifact.id);
    appendRow(root, "compiled content hash", report.compiled.provenance.generatedArtifact.sha256);
    appendRow(root, "canonical content bytes", String(report.compiled.provenance.generatedArtifact.sizeBytes ?? 0));
    appendRow(
      root,
      "timeline",
      `${report.compiled.actions.timeline.length} actions, ${report.compiled.chat.total} chat`
    );
  }

  appendDisclosureRow(
    root,
    "comparison",
    comparisonSummary(report.comparisons),
    report.comparisons.map(formatComparison),
    disclosureState.comparison
  );
  appendDisclosureRow(
    root,
    "unsupported",
    `${report.unsupportedMappings.length} scoped ${pluralize("mapping", report.unsupportedMappings.length)}`,
    report.unsupportedMappings,
    disclosureState.unsupported
  );
}

function appendRow(root: HTMLElement, label: string, value: string): void {
  const term = document.createElement("dt");
  const detail = document.createElement("dd");
  term.textContent = label;
  detail.textContent = value;
  root.append(term, detail);
}

function appendDisclosureRow(
  root: HTMLElement,
  label: DisclosureKey,
  summaryText: string,
  items: readonly string[],
  wasOpen: boolean
): void {
  const term = document.createElement("dt");
  const detail = document.createElement("dd");
  const disclosure = document.createElement("details");
  const summary = document.createElement("summary");
  const list = document.createElement("ul");

  term.textContent = label;
  disclosure.dataset.localRecordingDisclosure = label;
  disclosure.open = wasOpen;
  summary.textContent = summaryText;
  disclosure.append(summary);
  list.setAttribute("aria-label", `${label} details`);

  for (const item of items) {
    const row = document.createElement("li");
    row.textContent = item;
    list.append(row);
  }

  disclosure.append(list);
  detail.append(disclosure);
  root.append(term, detail);
}

function readDisclosureState(root: HTMLElement): Record<DisclosureKey, boolean> {
  return {
    comparison: Boolean(
      root.querySelector<HTMLDetailsElement>('details[data-local-recording-disclosure="comparison"]')?.open
    ),
    unsupported: Boolean(
      root.querySelector<HTMLDetailsElement>('details[data-local-recording-disclosure="unsupported"]')?.open
    )
  };
}

function formatPlayers(report: LocalReplayCompatibilityReport): string {
  const teams = report.parsed?.summary.teams ?? [];
  return teams
    .flatMap((team) => team.players.map((player) => `${player.playerNumber}:${player.name}`))
    .join(", ");
}

function formatOperations(report: LocalReplayCompatibilityReport): string {
  const full = report.parsed?.full;
  if (!full) {
    return report.parsed?.fullParseError ?? "summary only";
  }

  return `${full.operationCount} total, ${full.operationKindCounts.Action ?? 0} actions`;
}

function formatSeeds(report: LocalReplayCompatibilityReport): string {
  const replay = report.parsed?.summary.header.replay;
  if (!replay) {
    return "unavailable";
  }

  return `${replay.randomSeed} / ${replay.randomSeed2}`;
}

function comparisonSummary(comparisons: readonly LocalReplayComparison[]): string {
  const counts: Record<LocalReplayComparison["status"], number> = {
    match: 0,
    mismatch: 0,
    partial: 0,
    unsupported: 0
  };

  for (const comparison of comparisons) {
    counts[comparison.status] += 1;
  }

  return (
    `${counts.match} match, ${counts.partial} partial, ` +
    `${counts.unsupported} unsupported, ${counts.mismatch} mismatch`
  );
}

function formatComparison(comparison: LocalReplayComparison): string {
  const values =
    comparison.expected !== undefined || comparison.actual !== undefined
      ? `. expected ${comparison.expected ?? "n/a"}; actual ${comparison.actual ?? "n/a"}`
      : "";
  const detail = comparison.detail ? `. ${comparison.detail}` : ".";
  return `[${comparison.evidence}] ${comparison.area} / ${comparison.label}: ${comparison.status}${values}${detail}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function pluralize(label: string, count: number): string {
  return count === 1 ? label : `${label}s`;
}

type DisclosureKey = "comparison" | "unsupported";
