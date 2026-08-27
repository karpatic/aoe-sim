export const LOCAL_REPLAY_LIMITS = {
  maxRecordingBytes: 128 * 1024 * 1024,
  maxMapDimensionTiles: 1024,
  maxMapTiles: 1_048_576,
  maxOperations: 2_000_000,
  maxNormalizedActions: 250_000,
  maxChatMessages: 100,
  maxChatRawTextChars: 2_000,
  maxChatDecodedTextChars: 500,
  maxChatMetadataFields: 16,
  maxCommandParameterFields: 16,
  maxCommandParameterStringChars: 120,
  maxReplayIdArrayLength: 512,
  maxCanonicalJsonBytes: 128 * 1024 * 1024,
  maxDataviewGeneratedJsonBytes: 96 * 1024 * 1024,
  maxDataviewGeneratedJsonTotalBytes: 192 * 1024 * 1024
} as const;

export const LOCAL_REPLAY_LIMIT_NOTES = [
  `selected recording bytes: ${formatBytes(LOCAL_REPLAY_LIMITS.maxRecordingBytes)}`,
  `map dimensions: 1..${LOCAL_REPLAY_LIMITS.maxMapDimensionTiles} tiles per side`,
  `map tiles: up to ${formatInteger(LOCAL_REPLAY_LIMITS.maxMapTiles)}`,
  `parser operations: up to ${formatInteger(LOCAL_REPLAY_LIMITS.maxOperations)}`,
  `normalized actions: up to ${formatInteger(LOCAL_REPLAY_LIMITS.maxNormalizedActions)}`,
  `chat preview rows: up to ${formatInteger(LOCAL_REPLAY_LIMITS.maxChatMessages)}`,
  `canonical/download JSON bytes: ${formatBytes(LOCAL_REPLAY_LIMITS.maxCanonicalJsonBytes)}`
] as const;

export function assertRecordingByteLength(sizeBytes: number, label = "Selected recording"): void {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    throw new Error(`${label} size must be a safe nonnegative integer byte count; received ${sizeBytes}.`);
  }
  if (sizeBytes > LOCAL_REPLAY_LIMITS.maxRecordingBytes) {
    throw new Error(
      `${label} is ${formatBytes(sizeBytes)}, above the local parser limit of ` +
        `${formatBytes(LOCAL_REPLAY_LIMITS.maxRecordingBytes)}.`
    );
  }
}

export function assertCanonicalJsonByteLength(sizeBytes: number, label = "Compiled replay JSON"): void {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    throw new Error(`${label} byte length must be a safe nonnegative integer; received ${sizeBytes}.`);
  }
  if (sizeBytes > LOCAL_REPLAY_LIMITS.maxCanonicalJsonBytes) {
    throw new Error(
      `${label} is ${formatBytes(sizeBytes)}, above the local download limit of ` +
        `${formatBytes(LOCAL_REPLAY_LIMITS.maxCanonicalJsonBytes)}.`
    );
  }
}

export function assertDataviewGeneratedJsonByteLength(sizeBytes: number, label = "Generated dataview JSON"): void {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    throw new Error(`${label} byte length must be a safe nonnegative integer; received ${sizeBytes}.`);
  }
  if (sizeBytes > LOCAL_REPLAY_LIMITS.maxDataviewGeneratedJsonBytes) {
    throw new Error(
      `${label} is ${formatBytes(sizeBytes)}, above the standalone dataview per-file limit of ` +
        `${formatBytes(LOCAL_REPLAY_LIMITS.maxDataviewGeneratedJsonBytes)}.`
    );
  }
}

export function assertDataviewGeneratedJsonTotalByteLength(sizeBytes: number): void {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    throw new Error(`Generated dataview JSON total must be a safe nonnegative integer; received ${sizeBytes}.`);
  }
  if (sizeBytes > LOCAL_REPLAY_LIMITS.maxDataviewGeneratedJsonTotalBytes) {
    throw new Error(
      `Generated dataview JSON total is ${formatBytes(sizeBytes)}, above the standalone dataview limit of ` +
        `${formatBytes(LOCAL_REPLAY_LIMITS.maxDataviewGeneratedJsonTotalBytes)}.`
    );
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function formatInteger(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
