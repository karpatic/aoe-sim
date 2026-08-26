import type { PerformanceMetricSnapshot } from "./replay/model";

const DEFAULT_WINDOW_SIZE = 60;

export class RollingPerformanceMetric {
  private readonly samples: number[] = [];
  private nextIndex = 0;
  private lastValueMs = 0;

  public constructor(private readonly windowSize = DEFAULT_WINDOW_SIZE) {}

  public record(valueMs: number): void {
    const sample = Math.max(0, valueMs);
    this.lastValueMs = sample;

    if (this.samples.length < this.windowSize) {
      this.samples.push(sample);
      return;
    }

    this.samples[this.nextIndex] = sample;
    this.nextIndex = (this.nextIndex + 1) % this.windowSize;
  }

  public snapshot(): PerformanceMetricSnapshot | undefined {
    if (!this.samples.length) {
      return undefined;
    }

    let total = 0;
    let max = 0;
    for (const sample of this.samples) {
      total += sample;
      max = Math.max(max, sample);
    }

    return {
      lastMs: roundTiming(this.lastValueMs),
      averageMs: roundTiming(total / this.samples.length),
      maxMs: roundTiming(max),
      samples: this.samples.length
    };
  }

  public reset(): void {
    this.samples.length = 0;
    this.nextIndex = 0;
    this.lastValueMs = 0;
  }
}

export function measurePerformance<T>(metric: RollingPerformanceMetric, work: () => T): T {
  const startMs = performance.now();
  try {
    return work();
  } finally {
    metric.record(performance.now() - startMs);
  }
}

function roundTiming(value: number): number {
  return Number(value.toFixed(3));
}
