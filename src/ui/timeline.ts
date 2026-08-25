export function formatSimTime(timeMs: number): string {
  const seconds = Math.floor(timeMs / 1000);
  const millis = Math.abs(Math.trunc(timeMs % 1000));
  return `${seconds}.${millis.toString().padStart(3, "0")}s`;
}

export function setTimeline(
  seek: HTMLInputElement,
  timeLabel: HTMLElement,
  durationLabel: HTMLElement,
  timeMs: number,
  durationMs: number
): void {
  seek.max = String(durationMs);
  seek.value = String(timeMs);
  timeLabel.textContent = formatSimTime(timeMs);
  durationLabel.textContent = formatSimTime(durationMs);
}
