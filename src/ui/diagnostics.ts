import { formatSimTime } from "./timeline";
import type { SimulationDiagnostics, WorldSnapshot } from "../replay/model";

export function renderDiagnostics(
  root: HTMLElement,
  snapshot: WorldSnapshot | undefined,
  diagnostics: SimulationDiagnostics | undefined,
  provenance: readonly string[]
): void {
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
  appendRow(root, "provenance", provenance.join(" | "));
  appendRow(root, "warnings", diagnostics.warnings.length ? diagnostics.warnings.join(" | ") : "none");
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
