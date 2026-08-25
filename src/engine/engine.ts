import { SeededRng } from "./rng";
import { DeterministicScheduler, type ScheduledEvent } from "./scheduler";
import { applyReplayCommand } from "./systems/commands";
import { advanceMovement } from "./systems/movement";
import { WorldState } from "./world";
import type {
  ReplayCommand,
  ReplayScenarioV1,
  RulesetV1,
  SimTimeMs,
  SimulationDiagnostics,
  WorldSnapshot
} from "../replay/model";

const DEFAULT_STEP_MS = 50;
const DEFAULT_SEED = 0x0a0e5000;

export class SimulationEngine {
  private readonly commandTape: ReplayCommand[];
  private readonly commandById: Map<string, ReplayCommand>;
  private readonly scheduler = new DeterministicScheduler();
  private readonly rng = new SeededRng(DEFAULT_SEED);
  private world: WorldState;
  private lastSeekRepeat: SimulationDiagnostics["lastSeekRepeat"];

  public constructor(
    private readonly scenario: ReplayScenarioV1,
    private readonly ruleset: RulesetV1
  ) {
    this.commandTape = [...scenario.commands].sort(compareCommands);
    this.commandById = new Map(this.commandTape.map((command) => [command.id, command]));
    this.world = new WorldState(scenario, ruleset);
    this.reset();
  }

  public get durationMs(): SimTimeMs {
    return this.scenario.durationMs;
  }

  public get stepMs(): SimTimeMs {
    return this.ruleset.stepMs || DEFAULT_STEP_MS;
  }

  public advanceBy(deltaMs: SimTimeMs): WorldSnapshot {
    return this.advanceTo(this.world.timeMs + deltaMs);
  }

  public advanceTo(timeMs: SimTimeMs): WorldSnapshot {
    const targetTimeMs = clampTime(timeMs, this.durationMs);

    if (targetTimeMs < this.world.timeMs) {
      return this.seek(targetTimeMs);
    }

    this.scheduler.drainDue(this.world.timeMs, (event) => this.handleEvent(event));

    while (this.world.timeMs < targetTimeMs) {
      const nextEventTime = this.scheduler.peekTime();
      const nextTimeMs = Math.min(this.world.timeMs + this.stepMs, targetTimeMs, nextEventTime ?? Number.MAX_SAFE_INTEGER);
      const deltaMs = nextTimeMs - this.world.timeMs;

      if (deltaMs > 0) {
        advanceMovement(this.world, deltaMs);
        this.world.timeMs = nextTimeMs;
      }

      this.scheduler.drainDue(this.world.timeMs, (event) => this.handleEvent(event));
    }

    return this.world.createSnapshot();
  }

  public seek(timeMs: SimTimeMs): WorldSnapshot {
    this.reset();
    return this.advanceTo(timeMs);
  }

  public seekWithRepeatCheck(timeMs: SimTimeMs): WorldSnapshot {
    const first = this.seek(timeMs);
    const second = this.seek(timeMs);
    this.lastSeekRepeat = {
      timeMs: second.timeMs,
      checksum: second.checksum,
      stable: first.checksum === second.checksum
    };
    return second;
  }

  public snapshot(): WorldSnapshot {
    return this.world.createSnapshot();
  }

  public diagnostics(isPlaying: boolean): SimulationDiagnostics {
    const snapshot = this.snapshot();
    const diagnostics: SimulationDiagnostics = {
      schemaVersion: "aoe-sim.diagnostics.v1",
      isPlaying,
      checksum: snapshot.checksum,
      schedulerPending: this.scheduler.pendingCount,
      schedulerExecuted: this.scheduler.executedCount,
      currentTimeMs: snapshot.timeMs,
      durationMs: this.durationMs,
      stepMs: this.stepMs,
      commandCount: this.commandTape.length,
      appliedCommandCount: snapshot.appliedCommandIds.length,
      observedIntentCount: snapshot.observedIntentIds.length,
      unsupportedCommandCount: this.scenario.unsupported.commandCount,
      seed: this.rng.currentSeed,
      warnings: [...this.world.warnings]
    };

    if (this.lastSeekRepeat) {
      return {
        ...diagnostics,
        lastSeekRepeat: this.lastSeekRepeat
      };
    }

    return diagnostics;
  }

  private reset(): void {
    this.world = new WorldState(this.scenario, this.ruleset);
    this.scheduler.reset();

    for (const command of this.commandTape) {
      this.scheduler.enqueue({
        timeMs: command.issuedAtMs,
        sourceSequence: command.sourceSequence,
        kind: "command",
        commandId: command.id
      });
    }
  }

  private handleEvent(event: ScheduledEvent): void {
    if (event.kind !== "command") {
      return;
    }

    const command = this.commandById.get(event.commandId);
    if (!command) {
      this.world.warn(`Scheduled missing command ${event.commandId}`);
      return;
    }

    applyReplayCommand(this.world, command, this.ruleset);
  }
}

function compareCommands(left: ReplayCommand, right: ReplayCommand): number {
  return left.issuedAtMs - right.issuedAtMs || left.sourceSequence - right.sourceSequence || left.id.localeCompare(right.id);
}

function clampTime(value: SimTimeMs, durationMs: SimTimeMs): SimTimeMs {
  return Math.max(0, Math.min(durationMs, Math.trunc(value)));
}
