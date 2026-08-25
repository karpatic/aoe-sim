import type { SimTimeMs } from "../replay/model";

export interface ScheduledEvent {
  readonly timeMs: SimTimeMs;
  readonly sourceSequence: number;
  readonly insertionOrdinal: number;
  readonly kind: "command";
  readonly commandId: string;
}

export class DeterministicScheduler {
  private readonly events: ScheduledEvent[] = [];
  private nextInsertionOrdinal = 0;
  private executedEvents = 0;

  public reset(): void {
    this.events.length = 0;
    this.nextInsertionOrdinal = 0;
    this.executedEvents = 0;
  }

  public enqueue(event: Omit<ScheduledEvent, "insertionOrdinal">): void {
    this.events.push({
      ...event,
      insertionOrdinal: this.nextInsertionOrdinal
    });
    this.nextInsertionOrdinal += 1;
    this.events.sort(compareScheduledEvents);
  }

  public peekTime(): SimTimeMs | undefined {
    return this.events[0]?.timeMs;
  }

  public drainDue(timeMs: SimTimeMs, handleEvent: (event: ScheduledEvent) => void): void {
    while (this.events[0] && this.events[0].timeMs <= timeMs) {
      const event = this.events.shift();
      if (!event) {
        return;
      }

      handleEvent(event);
      this.executedEvents += 1;
    }
  }

  public get pendingCount(): number {
    return this.events.length;
  }

  public get executedCount(): number {
    return this.executedEvents;
  }
}

function compareScheduledEvents(left: ScheduledEvent, right: ScheduledEvent): number {
  return (
    left.timeMs - right.timeMs ||
    left.sourceSequence - right.sourceSequence ||
    left.insertionOrdinal - right.insertionOrdinal
  );
}
