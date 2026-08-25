import { checksumStable } from "./checksum";
import type {
  EntityId,
  EvidenceClass,
  FixedPoint,
  ReplayScenarioV1,
  RulesetUnit,
  RulesetV1,
  SimTimeMs,
  SnapshotTask,
  WorldSnapshot,
  WorldSnapshotBody
} from "../replay/model";

export const FIXED_POINT_SCALE = 1000;

export interface FixedPointPosition {
  xFp: FixedPoint;
  yFp: FixedPoint;
  evidence: EvidenceClass;
}

export type EntityTask =
  | {
      readonly kind: "idle";
      readonly evidence: EvidenceClass;
    }
  | {
      readonly kind: "moving";
      readonly commandId: string;
      readonly destination: {
        readonly xFp: FixedPoint;
        readonly yFp: FixedPoint;
      };
      readonly evidence: EvidenceClass;
      readonly sourceSequence: number;
    };

export interface EntityState {
  id: EntityId;
  kind: string;
  playerId: string;
  hp: number;
  facing: -1 | 1;
  radiusFp: FixedPoint;
  speedFpPerSecond: number;
  position: FixedPointPosition;
  task: EntityTask;
  evidence: EvidenceClass;
}

export class WorldState {
  public timeMs: SimTimeMs = 0;
  public readonly entities = new Map<EntityId, EntityState>();
  public readonly appliedCommandIds: string[] = [];
  public readonly warnings: string[] = [];

  public constructor(
    private readonly scenario: ReplayScenarioV1,
    ruleset: RulesetV1
  ) {
    const rulesByKind = new Map(ruleset.units.map((unit) => [unit.kind, unit]));

    for (const entity of scenario.entities) {
      const rule = rulesByKind.get(entity.kind) ?? fallbackUnit(entity.kind);
      if (!rulesByKind.has(entity.kind)) {
        this.warn(`Missing unit rule for ${entity.kind}; using immobile fallback`);
      }

      this.entities.set(entity.id, {
        id: entity.id,
        kind: entity.kind,
        playerId: entity.playerId,
        hp: entity.hp || rule.maxHp,
        facing: 1,
        radiusFp: toFixedPoint(rule.radiusTiles),
        speedFpPerSecond: rule.speedFpPerSecond,
        position: {
          xFp: toFixedPoint(entity.position.x),
          yFp: toFixedPoint(entity.position.y),
          evidence: entity.position.evidence
        },
        task: {
          kind: "idle",
          evidence: entity.evidence
        },
        evidence: entity.evidence
      });
    }
  }

  public warn(message: string): void {
    this.warnings.push(`${this.timeMs}ms ${message}`);
    if (this.warnings.length > 12) {
      this.warnings.shift();
    }
  }

  public createSnapshot(): WorldSnapshot {
    const body: WorldSnapshotBody = {
      schemaVersion: "aoe-sim.snapshot.v1",
      timeMs: this.timeMs,
      durationMs: this.scenario.durationMs,
      map: this.scenario.map,
      players: this.scenario.players,
      entities: [...this.entities.values()].sort(compareEntities).map((entity) => ({
        id: entity.id,
        kind: entity.kind,
        playerId: entity.playerId,
        hp: entity.hp,
        facing: entity.facing,
        radiusTiles: fromFixedPoint(entity.radiusFp),
        position: {
          x: fromFixedPoint(entity.position.xFp),
          y: fromFixedPoint(entity.position.yFp),
          xFp: entity.position.xFp,
          yFp: entity.position.yFp,
          evidence: entity.position.evidence
        },
        task: snapshotTask(entity.task),
        evidence: entity.evidence
      })),
      appliedCommandIds: [...this.appliedCommandIds],
      evidenceCounts: this.countEvidence(),
      provenance: this.scenario.provenance
    };

    return deepFreeze({
      ...body,
      checksum: checksumStable(body)
    });
  }

  private countEvidence(): Record<EvidenceClass, number> {
    const counts: Record<EvidenceClass, number> = {
      observed: 0,
      simulated: 0,
      reconciled: 0
    };

    for (const entity of this.entities.values()) {
      counts[entity.position.evidence] += 1;
    }

    return counts;
  }
}

export function toFixedPoint(value: number): FixedPoint {
  return Math.round(value * FIXED_POINT_SCALE);
}

export function fromFixedPoint(value: FixedPoint): number {
  return Number((value / FIXED_POINT_SCALE).toFixed(3));
}

function snapshotTask(task: EntityTask): SnapshotTask {
  if (task.kind === "idle") {
    return {
      kind: "idle",
      evidence: task.evidence
    };
  }

  return {
    kind: "moving",
    commandId: task.commandId,
    destination: {
      x: fromFixedPoint(task.destination.xFp),
      y: fromFixedPoint(task.destination.yFp),
      xFp: task.destination.xFp,
      yFp: task.destination.yFp
    },
    evidence: task.evidence
  };
}

function compareEntities(left: EntityState, right: EntityState): number {
  return left.id.localeCompare(right.id);
}

function fallbackUnit(kind: string): RulesetUnit {
  return {
    kind,
    maxHp: 1,
    speedFpPerSecond: 0,
    radiusTiles: 0.25,
    token: "marker"
  };
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }

  return value;
}
