export const BROWSER_COMPILED_REPLAY_HASH_EXCLUDED_POINTERS = [
  "/provenance/generatedArtifact",
  "/recording/fileName",
  "/recording/lastModifiedUtc",
  "/provenance/replay/fileName",
  "/provenance/replay/lastModifiedUtc"
] as const;

export const BROWSER_COMPILED_REPLAY_HASH_CONTRACT = {
  id: "aoe-sim.stable-json-v1.unsigned-browser-compiled-replay",
  digest: "sha-256",
  canonicalJson: {
    encoding: "utf-8",
    keyOrder: "code-point-lexical",
    whitespace: "none",
    undefinedFields: "omitted"
  },
  unsignedProjection: {
    excludedJsonPointers: BROWSER_COMPILED_REPLAY_HASH_EXCLUDED_POINTERS
  },
  contentReferencePath: "/provenance/generatedArtifact"
} as const;

export type BrowserCompiledReplayHashContract = typeof BROWSER_COMPILED_REPLAY_HASH_CONTRACT;

export function compareCodePoint(left: string, right: string): number {
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    const leftPoint = left.codePointAt(leftIndex);
    const rightPoint = right.codePointAt(rightIndex);

    if (leftPoint === undefined || rightPoint === undefined) {
      break;
    }
    if (leftPoint < rightPoint) {
      return -1;
    }
    if (leftPoint > rightPoint) {
      return 1;
    }

    leftIndex += codePointCharLength(leftPoint);
    rightIndex += codePointCharLength(rightPoint);
  }

  if (leftIndex < left.length) {
    return 1;
  }
  if (rightIndex < right.length) {
    return -1;
  }
  return 0;
}

function codePointCharLength(value: number): 1 | 2 {
  return value > 0xffff ? 2 : 1;
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(stabilizeJson(value));
}

export function stableJsonUtf8Bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(stableJsonStringify(value));
}

export function unsignedBrowserCompiledReplayContent(value: unknown): unknown {
  return stripJsonPointers(value, new Set<string>(BROWSER_COMPILED_REPLAY_HASH_EXCLUDED_POINTERS), "");
}

function stabilizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stabilizeJson);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const output = Object.create(null) as Record<string, unknown>;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)
    .filter(([, childValue]) => childValue !== undefined)
    .sort(([left], [right]) => compareCodePoint(left, right))) {
    output[key] = stabilizeJson(child);
  }
  return output;
}

function stripJsonPointers(value: unknown, excludedPointers: ReadonlySet<string>, path: string): unknown {
  if (excludedPointers.has(path)) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((child, index) => stripJsonPointers(child, excludedPointers, `${path}/${index}`));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const output = Object.create(null) as Record<string, unknown>;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}/${escapePointerToken(key)}`;
    if (excludedPointers.has(childPath) || child === undefined) {
      continue;
    }
    const stripped = stripJsonPointers(child, excludedPointers, childPath);
    if (stripped !== undefined) {
      output[key] = stripped;
    }
  }
  return output;
}

function escapePointerToken(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}
