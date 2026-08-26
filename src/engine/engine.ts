import { SeededRng } from "./rng";
import { DeterministicScheduler, type ScheduledEvent } from "./scheduler";
import { advanceEconomy, initializeEconomy } from "./systems/economy";
import { applyReplayCommand } from "./systems/commands";
import { advanceMovement } from "./systems/movement";
import { advanceCombat } from "./systems/combat";
import { SimulationStepContext } from "./step-context";
import { WorldState } from "./world";
import { RollingPerformanceMetric, measurePerformance } from "../profiling";
import type {
  PlaybackRenderFrame,
  ReplayCommand,
  ReplayScenarioV1,
  RulesetV1,
  SimTimeMs,
  SimulationDiagnostics,
  SimulationPerformanceDiagnostics,
  WorldSnapshot
} from "../replay/model";

const DEFAULT_STEP_MS = 50;
const DEFAULT_SEED = 0x0a0e5000;
const TREE_ACTIVATION_INTERVAL_MS = 500;

export class SimulationEngine {
  private readonly commandTape: ReplayCommand[];
  private readonly commandById: Map<string, ReplayCommand>;
  private readonly scheduler = new DeterministicScheduler();
  private readonly rng = new SeededRng(DEFAULT_SEED);
  private world: WorldState;
  private lastSeekRepeat: SimulationDiagnostics["lastSeekRepeat"];
  private lastVerifiedChecksum = "unverified";
  private lastVerifiedChecksumTimeMs: SimTimeMs = 0;
  private renderBaselineTimeMs: SimTimeMs = 0;

  private readonly commandTiming = new RollingPerformanceMetric();
  private readonly movementTiming = new RollingPerformanceMetric();
  private readonly treeTiming = new RollingPerformanceMetric();
  private readonly economyTiming = new RollingPerformanceMetric();
  private readonly combatTiming = new RollingPerformanceMetric();
  private readonly renderDeltaTiming = new RollingPerformanceMetric();

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

  public get initialEntityCount(): number {
    return this.scenario.entities.length;
  }

  public get stepMs(): SimTimeMs {
    return this.ruleset.stepMs || DEFAULT_STEP_MS;
  }

  public get currentTimeMs(): SimTimeMs {
    return this.world.timeMs;
  }

  public advanceBy(deltaMs: SimTimeMs): WorldSnapshot {
    return this.advanceTo(this.world.timeMs + deltaMs);
  }

  public advanceByTime(deltaMs: SimTimeMs): void {
    this.advanceToTime(this.world.timeMs + deltaMs);
  }

  public advanceTo(timeMs: SimTimeMs): WorldSnapshot {
    const targetTimeMs = clampTime(timeMs, this.durationMs);

    if (targetTimeMs < this.world.timeMs) {
      return this.seek(targetTimeMs);
    }

    this.advanceToTime(targetTimeMs);
    return this.snapshot();
  }

  public advanceToTime(timeMs: SimTimeMs): void {
    const targetTimeMs = clampTime(timeMs, this.durationMs);

    if (targetTimeMs < this.world.timeMs) {
      this.reset();
    }

    this.scheduler.drainDue(this.world.timeMs, (event) => this.handleEvent(event));
    this.refreshTreeActiveSetIfNeededProfiled();

    while (this.world.timeMs < targetTimeMs) {
      const nextEventTime = this.scheduler.peekTime();
      const nextTreeActivationTime = this.nextTreeActivationBoundaryTime();
      const context = SimulationStepContext.create(this.world);
      const stepLimit = context.hasContinuousState ? this.stepMs : Number.MAX_SAFE_INTEGER;
      const nextTimeMs = Math.min(
        this.world.timeMs + stepLimit,
        targetTimeMs,
        nextEventTime ?? Number.MAX_SAFE_INTEGER,
        nextTreeActivationTime ?? Number.MAX_SAFE_INTEGER
      );
      const deltaMs = nextTimeMs - this.world.timeMs;

      if (deltaMs > 0) {
        if (context.hasContinuousState) {
          this.advanceContinuousSystems(deltaMs, context);
        }
        this.world.timeMs = nextTimeMs;
      }

      this.scheduler.drainDue(this.world.timeMs, (event) => this.handleEvent(event));
      this.refreshTreeActiveSetIfNeededProfiled();
    }
  }

  public advanceSlice(targetTimeMs: SimTimeMs, maxSteps: number): void {
    this.advanceSliceInternal(targetTimeMs, maxSteps, true);
  }

  public advancePlaybackSlice(targetTimeMs: SimTimeMs, maxSteps: number): boolean {
    return this.advanceSliceInternal(targetTimeMs, maxSteps, false);
  }

  private advanceSliceInternal(targetTimeMs: SimTimeMs, maxSteps: number, allowPartialTarget: boolean): boolean {
    const target = clampTime(targetTimeMs, this.durationMs);
    const stepBudget = Math.max(1, Math.trunc(maxSteps));
    const startTimeMs = this.world.timeMs;

    if (target < this.world.timeMs) {
      this.reset();
    }

    this.scheduler.drainDue(this.world.timeMs, (event) => this.handleEvent(event));
    this.refreshTreeActiveSetIfNeededProfiled();

    let stepCount = 0;
    while (this.world.timeMs < target && stepCount < stepBudget) {
      const nextEventTime = this.scheduler.peekTime();
      const nextTreeActivationTime = this.nextTreeActivationBoundaryTime();
      const context = SimulationStepContext.create(this.world);

      if (!context.hasContinuousState) {
        const nextBoundaryTime = Math.min(
          nextEventTime ?? Number.MAX_SAFE_INTEGER,
          nextTreeActivationTime ?? Number.MAX_SAFE_INTEGER
        );
        const nextTimeMs = this.nextIdleSliceTime(
          target,
          Number.isFinite(nextBoundaryTime) ? nextBoundaryTime : undefined,
          allowPartialTarget
        );
        if (nextTimeMs <= this.world.timeMs) {
          break;
        }
        this.world.timeMs = nextTimeMs;
        stepCount += 1;
        this.scheduler.drainDue(this.world.timeMs, (event) => this.handleEvent(event));
        this.refreshTreeActiveSetIfNeededProfiled();
        if (nextEventTime !== undefined && this.world.timeMs === nextEventTime && this.world.timeMs < target) {
          break;
        }
        continue;
      }

      const naturalNextTimeMs = Math.min(
        this.world.timeMs + this.stepMs,
        nextEventTime ?? Number.MAX_SAFE_INTEGER,
        nextTreeActivationTime ?? Number.MAX_SAFE_INTEGER
      );
      if (!allowPartialTarget && target < naturalNextTimeMs && target < this.durationMs) {
        break;
      }
      const nextTimeMs = Math.min(naturalNextTimeMs, target);
      const deltaMs = nextTimeMs - this.world.timeMs;
      if (deltaMs > 0) {
        this.advanceContinuousSystems(deltaMs, context);
        this.world.timeMs = nextTimeMs;
        stepCount += 1;
      }

      this.scheduler.drainDue(this.world.timeMs, (event) => this.handleEvent(event));
      this.refreshTreeActiveSetIfNeededProfiled();
      if (nextEventTime !== undefined && this.world.timeMs === nextEventTime && this.world.timeMs < target) {
        break;
      }
    }

    return this.world.timeMs > startTimeMs;
  }

  private nextIdleSliceTime(
    targetTimeMs: SimTimeMs,
    nextEventTimeMs: SimTimeMs | undefined,
    allowPartialTarget: boolean
  ): SimTimeMs {
    if (nextEventTimeMs !== undefined && nextEventTimeMs <= targetTimeMs) {
      return nextEventTimeMs;
    }
    if (allowPartialTarget || targetTimeMs >= this.durationMs) {
      return targetTimeMs;
    }

    const completeSteps = Math.floor((targetTimeMs - this.world.timeMs) / this.stepMs);
    return this.world.timeMs + completeSteps * this.stepMs;
  }

  public seek(timeMs: SimTimeMs): WorldSnapshot {
    this.resetToStart();
    return this.advanceTo(timeMs);
  }

  public resetToStart(): void {
    this.reset();
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
    const snapshot = this.world.createSnapshot();
    this.lastVerifiedChecksum = snapshot.checksum;
    this.lastVerifiedChecksumTimeMs = snapshot.timeMs;
    this.renderBaselineTimeMs = snapshot.timeMs;
    this.world.resetRenderBaseline();
    return snapshot;
  }

  public createPlaybackRenderFrame(isPlaying: boolean): PlaybackRenderFrame {
    const { entityUpdates, projectiles } = measurePerformance(this.renderDeltaTiming, () => ({
      entityUpdates: this.world.createRenderEntityUpdates(),
      projectiles: this.world.createProjectileRenderData()
    }));
    const fromTimeMs = this.renderBaselineTimeMs;
    this.renderBaselineTimeMs = this.world.timeMs;
    return {
      schemaVersion: "aoe-sim.render-frame.v1",
      fromTimeMs,
      timeMs: this.world.timeMs,
      durationMs: this.durationMs,
      entityUpdates,
      projectiles,
      diagnostics: this.diagnostics(isPlaying, entityUpdates.length)
    };
  }

  public diagnostics(isPlaying: boolean, playbackFrameEntityUpdates?: number): SimulationDiagnostics {
    const checksumCurrent = this.lastVerifiedChecksumTimeMs === this.world.timeMs;
    const diagnostics: SimulationDiagnostics = {
      schemaVersion: "aoe-sim.diagnostics.v1",
      isPlaying,
      checksum: this.lastVerifiedChecksum,
      checksumVerifiedAtMs: this.lastVerifiedChecksumTimeMs,
      checksumCurrent,
      schedulerPending: this.scheduler.pendingCount,
      schedulerExecuted: this.scheduler.executedCount,
      currentTimeMs: this.world.timeMs,
      durationMs: this.durationMs,
      stepMs: this.stepMs,
      commandCount: this.commandTape.length,
      appliedCommandCount: this.world.appliedCommandIds.length,
      observedIntentCount: this.world.observedIntentIds.length,
      unsupportedCommandCount: this.scenario.unsupported.commandCount,
      seed: this.rng.currentSeed,
      routes: this.world.createRouteDiagnostics(),
      economy: this.world.createEconomyDiagnostics(),
      combat: this.world.createCombatDiagnostics(),
      trees: this.world.createTreeActiveSetDiagnostics(),
      ...(playbackFrameEntityUpdates === undefined ? {} : { playbackFrameEntityUpdates }),
      performance: this.createPerformanceDiagnostics(),
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
    this.lastSeekRepeat = undefined;
    this.world = new WorldState(this.scenario, this.ruleset);
    this.renderBaselineTimeMs = this.world.timeMs;
    initializeEconomy(this.world);
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

  private advanceContinuousSystems(deltaMs: SimTimeMs, context: SimulationStepContext): void {
    measurePerformance(this.movementTiming, () => advanceMovement(this.world, deltaMs, context));
    measurePerformance(this.economyTiming, () => advanceEconomy(this.world, deltaMs, context));
    measurePerformance(this.combatTiming, () => advanceCombat(this.world, deltaMs, context));
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

    measurePerformance(this.commandTiming, () => applyReplayCommand(this.world, command, this.ruleset));
  }

  private refreshTreeActiveSetIfNeededProfiled(): void {
    if (!this.world.needsTreeActiveSetRefresh()) {
      return;
    }

    if (this.world.timeMs % TREE_ACTIVATION_INTERVAL_MS !== 0) {
      return;
    }

    measurePerformance(this.treeTiming, () => this.world.refreshTreeActiveSet());
  }

  private nextTreeActivationBoundaryTime(): SimTimeMs | undefined {
    if (!this.world.needsTreeActiveSetRefresh()) {
      return undefined;
    }

    const remainder = this.world.timeMs % TREE_ACTIVATION_INTERVAL_MS;
    return remainder === 0
      ? this.world.timeMs
      : this.world.timeMs + TREE_ACTIVATION_INTERVAL_MS - remainder;
  }

  private createPerformanceDiagnostics(): SimulationPerformanceDiagnostics {
    const commands = this.commandTiming.snapshot();
    const movement = this.movementTiming.snapshot();
    const tree = this.treeTiming.snapshot();
    const economy = this.economyTiming.snapshot();
    const combat = this.combatTiming.snapshot();
    const renderDelta = this.renderDeltaTiming.snapshot();

    return {
      targetSpeed: 0,
      effectiveSpeed: 0,
      lagMs: 0,
      ...(commands ? { commands } : {}),
      ...(movement ? { movement } : {}),
      ...(tree ? { tree } : {}),
      ...(economy ? { economy } : {}),
      ...(combat ? { combat } : {}),
      ...(renderDelta ? { renderDelta } : {})
    };
  }
}

function compareCommands(left: ReplayCommand, right: ReplayCommand): number {
  return left.issuedAtMs - right.issuedAtMs || left.sourceSequence - right.sourceSequence || left.id.localeCompare(right.id);
}

function clampTime(value: SimTimeMs, durationMs: SimTimeMs): SimTimeMs {
  return Math.max(0, Math.min(durationMs, Math.trunc(value)));
}
