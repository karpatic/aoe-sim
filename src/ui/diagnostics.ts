import { formatSimTime } from "./timeline";
import type { SimulationDiagnostics, WorldSnapshot } from "../replay/model";

export function renderDiagnostics(
  root: HTMLElement,
  snapshot: WorldSnapshot | undefined,
  diagnostics: SimulationDiagnostics | undefined,
  provenance: readonly string[]
): void {
  const disclosureState = readDisclosureState(root);
  root.replaceChildren();

  if (!snapshot || !diagnostics) {
    appendRow(root, "state", "waiting");
    return;
  }

  appendRow(root, "time", formatSimTime(snapshot.timeMs));
  appendRow(root, "checksum", diagnostics.checksum);
  appendRow(
    root,
    "map",
    `${snapshot.map.widthTiles}x${snapshot.map.heightTiles} / ${snapshot.entities.length} objects`
  );
  appendRow(root, "scheduler", `${diagnostics.schedulerExecuted} done / ${diagnostics.schedulerPending} queued`);
  appendRow(
    root,
    "commands",
    `${diagnostics.appliedCommandCount} applied, ` +
      `${diagnostics.observedIntentCount} intent / ${diagnostics.commandCount}`
  );
  appendRow(root, "unsupported", `${diagnostics.unsupportedCommandCount} observed intent commands`);
  appendRow(root, "step", `${diagnostics.stepMs}ms`);
  appendRow(
    root,
    "evidence",
    `obs ${snapshot.evidenceCounts.observed}, ` +
      `sim ${snapshot.evidenceCounts.simulated}, rec ${snapshot.evidenceCounts.reconciled}`
  );
  appendRow(root, "seek", diagnostics.lastSeekRepeat ? seekStatus(diagnostics.lastSeekRepeat) : "not sampled");
  appendRow(root, "seed", String(diagnostics.seed));
  appendDisclosureRow(
    root,
    "provenance",
    `${provenance.length} hash-linked ${pluralize("artifact", provenance.length)}`,
    provenance,
    disclosureState.provenance
  );
  appendDisclosureRow(
    root,
    "warnings",
    warningSummary(diagnostics.warnings),
    diagnostics.warnings,
    disclosureState.warnings
  );
}

function seekStatus(repeat: NonNullable<SimulationDiagnostics["lastSeekRepeat"]>): string {
  return `${formatSimTime(repeat.timeMs)} ${repeat.stable ? "stable" : "diverged"} ${repeat.checksum}`;
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

  term.textContent = label;
  disclosure.dataset.diagnosticsDisclosure = label;
  disclosure.open = wasOpen;
  summary.textContent = summaryText;
  disclosure.append(summary);

  if (items.length) {
    const list = document.createElement(label === "provenance" ? "ol" : "ul");
    list.setAttribute("aria-label", `${label} details`);

    for (const item of items) {
      const row = document.createElement("li");
      row.textContent = item;
      list.append(row);
    }

    disclosure.append(list);
  } else {
    const empty = document.createElement("p");
    empty.textContent = `No ${label}`;
    disclosure.append(empty);
  }

  detail.append(disclosure);
  root.append(term, detail);
}

type DisclosureKey = "provenance" | "warnings";

function readDisclosureState(root: HTMLElement): Record<DisclosureKey, boolean> {
  return {
    provenance: Boolean(
      root.querySelector<HTMLDetailsElement>('details[data-diagnostics-disclosure="provenance"]')?.open
    ),
    warnings: Boolean(root.querySelector<HTMLDetailsElement>('details[data-diagnostics-disclosure="warnings"]')?.open)
  };
}

function warningSummary(warnings: readonly string[]): string {
  const count = warnings.length;
  if (!count) {
    return "none";
  }

  const missingRuleCount = warnings.filter((warning) => warning.includes("Missing unit rule")).length;
  if (missingRuleCount === count) {
    return `${count} missing-rule ${pluralize("warning", count)}`;
  }
  if (missingRuleCount > 0) {
    return `${count} ${pluralize("warning", count)} (${missingRuleCount} missing-rule)`;
  }

  return `${count} ${pluralize("warning", count)}`;
}

function pluralize(label: string, count: number): string {
  return count === 1 ? label : `${label}s`;
}
