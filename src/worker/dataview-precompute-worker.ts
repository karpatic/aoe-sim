import type { PyodideInterface } from "pyodide";
import {
  DATAVIEW_REQUIRED_OUTPUT_NAMES,
  DATAVIEW_WORKER_REQUEST_TYPE,
  type DataviewDoneMessage,
  type DataviewErrorMessage,
  type DataviewGeneratedOutput,
  type DataviewOutputName,
  type DataviewPrecomputeRequest,
  type DataviewProgressStage,
  type DataviewStageTiming,
  type DataviewWorkerToClient
} from "../dataview-protocol";
import {
  assertDataviewGeneratedJsonByteLength,
  assertDataviewGeneratedJsonTotalByteLength,
  assertRecordingByteLength,
  formatBytes
} from "../replay/limits";
import { generateUnitStatsForReplay } from "../replay/unit-stats";

type DataviewWorkerScope = typeof globalThis & {
  postMessage(message: DataviewWorkerToClient, transfer?: readonly Transferable[]): void;
  onmessage: ((event: MessageEvent<DataviewPrecomputeRequest>) => void) | null;
  close(): void;
};

interface PyodideRuntimeModule {
  readonly version: string;
  loadPyodide(options: {
    readonly indexURL: string;
    readonly stdout: () => undefined;
    readonly stderr: () => undefined;
  }): Promise<PyodideInterface>;
}

interface RuntimeAsset {
  readonly path: string;
  readonly sha256: string;
  readonly maxBytes: number;
}

interface PipelineStage {
  readonly stage: DataviewProgressStage;
  readonly message: string;
  readonly script: string;
  readonly args: readonly string[];
  readonly sanitizer?: string;
}

const workerScope = self as DataviewWorkerScope;
const PIPELINE_SHA256 = "bab3345c2f8128350ce64090c73eb1088cc229af94a0add698be046233a26ffc";
const RULESET_SHA256 = "c23b1ffd73f1178baa011f41d7d7faab98f7076eb885dcdd43711a295afb7eab";

const WORK_DIR = "/work";
const REPLAY_PATH = `${WORK_DIR}/selected.aoe2record`;
const REFERENCE_PATH = `${WORK_DIR}/aoe2techtree-data.json`;
const OUTPUT_PATHS: Record<(typeof DATAVIEW_REQUIRED_OUTPUT_NAMES)[number], string> = {
  "game.json": `${WORK_DIR}/game.json`,
  "schemas.json": `${WORK_DIR}/schemas.json`,
  "lifetimes.json": `${WORK_DIR}/lifetimes.json`,
  "economy.json": `${WORK_DIR}/economy.json`,
  "resource_estimates.json": `${WORK_DIR}/resource_estimates.json`
};
const RUNTIME_ASSETS: readonly RuntimeAsset[] = [
  {
    path: "pyodide/pyodide.mjs",
    sha256: "635a6da3218fe4e5668da595acfe8b5ce77453d597d602f19a423dd250653441",
    maxBytes: 128 * 1024
  },
  {
    path: "pyodide/pyodide.asm.js",
    sha256: "b22e5831eade9ff10e6fe2c811c68688cd91f10154377b4f80debcf5bafa1e56",
    maxBytes: 2 * 1024 * 1024
  },
  {
    path: "pyodide/pyodide.asm.wasm",
    sha256: "5effb6a1a6cc4a1a85bec4622701aa797c031e1de923cbbaf2ad47abdc4ab325",
    maxBytes: 10 * 1024 * 1024
  },
  {
    path: "pyodide/python_stdlib.zip",
    sha256: "71fee17f88a6260ec8c9c7c063533ee59c021fdc88a1ce76247378d3c4a35f4c",
    maxBytes: 4 * 1024 * 1024
  },
  {
    path: "pyodide/pyodide-lock.json",
    sha256: "f6e6f42f451f42affbbcddb00e8c9a3278dcbf399f57aab9f3f568839a7ff4a6",
    maxBytes: 256 * 1024
  },
  {
    path: "pyodide/libopenssl-1.1.1w.zip",
    sha256: "48965994b6ace00d3ebbc2dc1b65c11978582620f4ef6c71a50d9ea4c5fc7437",
    maxBytes: 2 * 1024 * 1024
  },
  {
    path: "pyodide/hashlib-1.0.0-cp313-cp313-pyodide_2025_0_wasm32.whl",
    sha256: "b5c736c84ce26cba4e5096c6b9d173a357666af5993cc08395bfb8bac997bb98",
    maxBytes: 128 * 1024
  }
];

workerScope.onmessage = (event: MessageEvent<DataviewPrecomputeRequest>) => {
  handleMessage(event.data).catch((error: unknown) => {
    const message: DataviewErrorMessage = {
      type: "error",
      requestId: event.data.requestId,
      message: error instanceof Error ? error.message : String(error)
    };
    workerScope.postMessage(message);
  });
};

async function handleMessage(message: DataviewPrecomputeRequest): Promise<void> {
  if (message.type !== DATAVIEW_WORKER_REQUEST_TYPE) {
    throw new Error("Unknown dataview worker request.");
  }
  if (!crypto?.subtle) {
    throw new Error("This browser worker does not expose Web Crypto hashing.");
  }

  const timings: DataviewStageTiming[] = [];
  await recordStage(timings, "validating", "Validating selected recording", 1, 15, async () => {
    assertSafeFileMetadata(message);
    assertRecordingByteLength(message.sizeBytes, message.fileName || "Selected recording");
    assertRecordingByteLength(message.buffer.byteLength, "Selected recording buffer");
    if (message.sizeBytes !== message.buffer.byteLength) {
      throw new Error(
        `Selected recording size changed before preprocessing: file metadata says ${message.sizeBytes} bytes, ` +
          `transferred buffer has ${message.buffer.byteLength} bytes.`
      );
    }
  }, message.requestId);

  const replaySha256 = await recordStage(timings, "hashing", "Hashing selected recording", 2, 15, async () =>
    sha256Hex(message.buffer), message.requestId);
  const runtimeBaseUrl = normalizeRuntimeBaseUrl(message.runtimeBaseUrl);

  await recordStage(timings, "verifying-runtime", "Verifying pinned Pyodide runtime files", 3, 15, async () => {
    for (const asset of RUNTIME_ASSETS) {
      await fetchVerified(runtimeBaseUrl, asset.path, asset.sha256, asset.maxBytes);
    }
  }, message.requestId);

  const pyodide = await recordStage(timings, "loading-pyodide", "Loading Pyodide 0.28.3", 4, 15, async () =>
    loadPyodideFromRuntime(runtimeBaseUrl), message.requestId);

  await recordStage(timings, "loading-python-packages", "Loading hashlib and libopenssl", 5, 15, async () => {
    await pyodide.loadPackage(["libopenssl", "hashlib"]);
  }, message.requestId);

  const pipelineArchive = await recordStage(timings, "loading-pipeline", "Loading pinned replay pipeline", 6, 15,
    async () => fetchVerified(runtimeBaseUrl, "aoc-mgz-pipeline.zip", PIPELINE_SHA256, 512 * 1024),
    message.requestId);
  const referenceBytes = await fetchVerified(
    runtimeBaseUrl,
    "aoe2techtree-data.json",
    "4e2f85b39e39078cdee71bdbaf2c36a8f0b50202de4032df7ba8e2c36c6049c4",
    2 * 1024 * 1024
  );

  initializePyodideFilesystem(pyodide, pipelineArchive, referenceBytes, message.buffer);
  await installPipelineHelpers(pyodide);

  const sanitizedName = selectedBasename(message.fileName);
  const stages: readonly PipelineStage[] = [
    {
      stage: "extracting-replay",
      message: "Extracting replay with pinned aoc-mgz",
      script: "extract_replay.py",
      args: [REPLAY_PATH, "--output", OUTPUT_PATHS["game.json"]],
      sanitizer: `__dataview_sanitize_game(${pythonString(OUTPUT_PATHS["game.json"])}, ${pythonString(sanitizedName)}, ${pythonString(replaySha256)}, ${message.sizeBytes})`
    },
    {
      stage: "generating-schemas",
      message: "Generating recording schemas",
      script: "generate_recording_schemas.py",
      args: [OUTPUT_PATHS["game.json"], "--output", OUTPUT_PATHS["schemas.json"]]
    },
    {
      stage: "inferring-lifetimes",
      message: "Inferring object lifetimes",
      script: "infer_lifetimes.py",
      args: [OUTPUT_PATHS["game.json"], "--output", OUTPUT_PATHS["lifetimes.json"]]
    },
    {
      stage: "generating-economy",
      message: "Generating economy index",
      script: "generate_economy.py",
      args: [OUTPUT_PATHS["game.json"], "--output", OUTPUT_PATHS["economy.json"], "--reference", REFERENCE_PATH],
      sanitizer: `__dataview_sanitize_economy(${pythonString(OUTPUT_PATHS["economy.json"])})`
    },
    {
      stage: "reconstructing-resources",
      message: "Reconstructing resource estimates",
      script: "reconstruct_resources.py",
      args: [
        "--game",
        OUTPUT_PATHS["game.json"],
        "--lifetimes",
        OUTPUT_PATHS["lifetimes.json"],
        "--economy",
        OUTPUT_PATHS["economy.json"],
        "--reference",
        REFERENCE_PATH,
        "--output",
        OUTPUT_PATHS["resource_estimates.json"]
      ],
      sanitizer: `__dataview_sanitize_resource_estimates(${pythonString(OUTPUT_PATHS["resource_estimates.json"])})`
    }
  ];

  let completed = 6;
  for (const stage of stages) {
    completed += 1;
    await recordStage(timings, stage.stage, stage.message, completed, 15, async () => {
      await runPipelineStage(pyodide, stage.script, stage.args);
      if (stage.sanitizer) {
        await pyodide.runPythonAsync(stage.sanitizer);
      }
      await pyodide.runPythonAsync(`__dataview_assert_clean_json(${pythonString(outputPathForStage(stage))})`);
    }, message.requestId);
  }

  const outputs: DataviewGeneratedOutput[] = [];
  for (const name of DATAVIEW_REQUIRED_OUTPUT_NAMES) {
    outputs.push(await readPyodideOutput(pyodide, name, OUTPUT_PATHS[name]));
  }

  const unitStatsBuffer = await recordStage(timings, "generating-unit-stats", "Calculating this replay's unit stats", 12, 15,
    async () => {
      const rulesetBuffer = await fetchVerified(runtimeBaseUrl, "../rules/ruleset-current.json", RULESET_SHA256, 20 * 1024 * 1024);
      const rulesetText = new TextDecoder("utf-8", { fatal: true }).decode(rulesetBuffer);
      const generated = generateUnitStatsForReplay({
        game: parseGeneratedOutput(outputs, "game.json"),
        economy: parseGeneratedOutput(outputs, "economy.json"),
        resourceEstimates: parseGeneratedOutput(outputs, "resource_estimates.json"),
        ruleset: JSON.parse(rulesetText) as Record<string, unknown>
      });
      return new TextEncoder().encode(`${JSON.stringify(generated)}\n`).buffer;
    }, message.requestId);
  outputs.push(await buildFetchedOutput("unit_stats.json", unitStatsBuffer, "per-replay-unit-stats"));
  const unitStatsNotice = "Unit attributes calculated from this replay's civilizations, units, and research timeline.";

  const totalBytes = outputs.reduce((sum, output) => sum + output.sizeBytes, 0);
  assertDataviewGeneratedJsonTotalByteLength(totalBytes);
  progress(message.requestId, "transferring", `Transferring ${formatBytes(totalBytes)} of generated JSON`, 14, 15);

  const done: DataviewDoneMessage = {
    type: "done",
    requestId: message.requestId,
    replay: {
      fileName: sanitizedName,
      sizeBytes: message.sizeBytes,
      sha256: replaySha256
    },
    outputs,
    timings,
    unitStatsNotice
  };
  progress(message.requestId, "done", "Standalone dataview data is ready", 15, 15);
  workerScope.postMessage(done, outputs.map((output) => output.buffer));
  workerScope.close();
}

function assertSafeFileMetadata(message: DataviewPrecomputeRequest): void {
  if (!message.fileName || message.fileName !== selectedBasename(message.fileName)) {
    throw new Error("Selected replay filename must be a basename, not a path.");
  }
  if (!message.fileName.toLowerCase().endsWith(".aoe2record")) {
    throw new Error("Selected file must use the .aoe2record extension.");
  }
  if (!Number.isSafeInteger(message.sizeBytes) || message.sizeBytes <= 0) {
    throw new Error("Selected recording must have a positive safe integer byte size.");
  }
  if (!Number.isFinite(message.lastModified) || message.lastModified < 0) {
    throw new Error("Selected recording has invalid file metadata.");
  }
}

function initializePyodideFilesystem(
  pyodide: PyodideInterface,
  pipelineArchive: ArrayBuffer,
  referenceBytes: ArrayBuffer,
  replayBytes: ArrayBuffer
): void {
  try {
    pyodide.FS.mkdir(WORK_DIR);
  } catch {
    // Pyodide workers are one-shot, but mkdir can throw if a previous failed run created the directory.
  }
  pyodide.unpackArchive(new Uint8Array(pipelineArchive), "zip");
  pyodide.FS.writeFile(REPLAY_PATH, new Uint8Array(replayBytes));
  pyodide.FS.writeFile(REFERENCE_PATH, new Uint8Array(referenceBytes));
}

async function installPipelineHelpers(pyodide: PyodideInterface): Promise<void> {
  await pyodide.runPythonAsync(String.raw`
import contextlib
import io
import json
import os
import re
import runpy
import sys
import time
from pathlib import Path

WORK_DIR = Path("/work")
PIPELINE_DIR = Path.cwd() / "pipeline"
LOCAL_HOME_PATTERN = "/" + "home" + "/" + "carlos"
LOCAL_TEMP_PATTERN = "/" + "tmp"
FILE_URL_PATTERN = "file" + "://"
URL_AUTHORITY_PATTERN = ":" + "/" + "/"
URL_CREDENTIAL_PATTERN = re.escape(URL_AUTHORITY_PATTERN) + r"[^/\s:@]+:[^/\s@]+@"
FORBIDDEN_PATTERNS = [
    re.compile(re.escape(LOCAL_HOME_PATTERN)),
    re.compile(re.escape(LOCAL_TEMP_PATTERN) + r"(?:/|\b)"),
    re.compile(r"/work(?:/|\b)"),
    re.compile(re.escape(FILE_URL_PATTERN)),
    re.compile(r"[A-Za-z]:\\"),
    re.compile(URL_CREDENTIAL_PATTERN),
]

def __dataview_run_stage(name, args):
    script = PIPELINE_DIR / name
    if not script.is_file():
        raise FileNotFoundError(f"pipeline script missing: {name}")
    old_argv = sys.argv
    stdout = io.StringIO()
    stderr = io.StringIO()
    started = time.time()
    try:
        sys.argv = [name, *list(args)]
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            runpy.run_path(str(script), run_name="__main__")
    except BaseException as exc:
        return json.dumps({
            "ok": False,
            "name": name,
            "error": f"{type(exc).__name__}: {exc}",
            "stdout_tail": stdout.getvalue()[-4000:],
            "stderr_tail": stderr.getvalue()[-4000:],
            "elapsed": round(time.time() - started, 3),
        })
    finally:
        sys.argv = old_argv
    return json.dumps({
        "ok": True,
        "name": name,
        "stdout_tail": stdout.getvalue()[-1200:],
        "stderr_tail": stderr.getvalue()[-1200:],
        "elapsed": round(time.time() - started, 3),
    })

def __dataview_write_json(path, data):
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False, separators=(",", ": ")) + "\n", encoding="utf-8")

def __dataview_sanitize_game(path, basename, replay_sha256, size_bytes):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    data["source_recording"] = {
        "filename": basename,
        "path": f"browser-local:{basename}",
        "original_source": None,
        "size_bytes": size_bytes,
        "modified_utc": None,
        "sha256": replay_sha256,
        "local_only": True,
    }
    __dataview_write_json(path, data)

def __dataview_sanitize_economy(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    source = data.setdefault("source", {})
    source["game_json"] = "browser-generated:game.json"
    source["reference_loaded_from"] = "pinned-public:aoe2techtree-data.json"
    __dataview_write_json(path, data)

def __dataview_sanitize_resource_estimates(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    source = data.setdefault("source", {})
    source["game_json"] = "browser-generated:game.json"
    source["lifetimes_json"] = "browser-generated:lifetimes.json"
    source["economy_json"] = "browser-generated:economy.json"
    source["reference_json"] = "pinned-public:aoe2techtree-data.json"
    __dataview_write_json(path, data)

def __dataview_assert_clean_json(path):
    text = Path(path).read_text(encoding="utf-8")
    for pattern in FORBIDDEN_PATTERNS:
        if pattern.search(text):
            raise ValueError(f"generated dataview JSON contains forbidden local path or credential pattern: {pattern.pattern}")
    json.loads(text)
`);
}

async function runPipelineStage(
  pyodide: PyodideInterface,
  script: string,
  args: readonly string[]
): Promise<void> {
  const resultText = String(await pyodide.runPythonAsync(
    `__dataview_run_stage(${pythonString(script)}, ${pythonJson(args)})`
  ));
  const result = JSON.parse(resultText) as {
    ok?: boolean;
    error?: string;
    stdout_tail?: string;
    stderr_tail?: string;
  };
  if (!result.ok) {
    const detail = [result.error, result.stderr_tail, result.stdout_tail].filter(Boolean).join("\n");
    throw new Error(`Pipeline stage ${script} failed: ${detail}`);
  }
}

function outputPathForStage(stage: PipelineStage): string {
  switch (stage.stage) {
    case "extracting-replay":
      return OUTPUT_PATHS["game.json"];
    case "generating-schemas":
      return OUTPUT_PATHS["schemas.json"];
    case "inferring-lifetimes":
      return OUTPUT_PATHS["lifetimes.json"];
    case "generating-economy":
      return OUTPUT_PATHS["economy.json"];
    case "reconstructing-resources":
      return OUTPUT_PATHS["resource_estimates.json"];
    default:
      return OUTPUT_PATHS["game.json"];
  }
}

function parseGeneratedOutput(
  outputs: readonly DataviewGeneratedOutput[],
  name: (typeof DATAVIEW_REQUIRED_OUTPUT_NAMES)[number]
): Record<string, unknown> {
  const output = outputs.find(candidate => candidate.name === name);
  if (!output) throw new Error(`Generated replay output is missing ${name}.`);
  const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(output.buffer));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Generated replay output ${name} is not a JSON object.`);
  }
  return value as Record<string, unknown>;
}

async function readPyodideOutput(
  pyodide: PyodideInterface,
  name: (typeof DATAVIEW_REQUIRED_OUTPUT_NAMES)[number],
  path: string
): Promise<DataviewGeneratedOutput> {
  const bytes = pyodide.FS.readFile(path);
  return buildFetchedOutput(name, exactBuffer(bytes), "pyodide-pipeline");
}

async function buildFetchedOutput(
  name: DataviewOutputName,
  buffer: ArrayBuffer,
  source: DataviewGeneratedOutput["source"]
): Promise<DataviewGeneratedOutput> {
  assertDataviewGeneratedJsonByteLength(buffer.byteLength, name);
  assertCleanGeneratedBytes(buffer, name);
  return {
    name,
    sizeBytes: buffer.byteLength,
    sha256: await sha256Hex(buffer),
    source,
    buffer
  };
}

function assertCleanGeneratedBytes(buffer: ArrayBuffer, label: string): void {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  const escapePattern = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const workerUrl = new URL(location.href);
  const slash = workerUrl.pathname.slice(0, 1);
  const colon = workerUrl.protocol.slice(-1);
  const localHomePattern = slash + ["home", "carlos"].join(slash);
  const localTempPattern = slash + "tmp";
  const fileUrlPattern = ["file", colon, slash, slash].join("");
  const urlAuthorityPattern = colon + slash + slash;
  const forbidden = [
    new RegExp(escapePattern(localHomePattern)),
    new RegExp(`${escapePattern(localTempPattern)}(?:/|\\b)`),
    /\/work(?:\/|\b)/,
    new RegExp(escapePattern(fileUrlPattern)),
    /[A-Za-z]:\\/,
    new RegExp(`${escapePattern(urlAuthorityPattern)}[^\\s/:@]+:[^\\s/@]+@`)
  ];
  const match = forbidden.find((pattern) => pattern.test(text));
  if (match) {
    throw new Error(`${label} contains a forbidden local path or credential pattern: ${match.source}`);
  }
  JSON.parse(text);
}

async function loadPyodideFromRuntime(runtimeBaseUrl: string): Promise<PyodideInterface> {
  const moduleUrl = new URL("pyodide/pyodide.mjs", runtimeBaseUrl);
  if (moduleUrl.origin !== location.origin) {
    throw new Error("Pyodide loader must be served from this origin.");
  }
  const pyodideModule = await import(/* @vite-ignore */ moduleUrl.href) as PyodideRuntimeModule;
  if (pyodideModule.version !== "0.28.3") {
    throw new Error(`Unexpected Pyodide loader version: ${pyodideModule.version}.`);
  }
  return pyodideModule.loadPyodide({
    indexURL: new URL("pyodide/", runtimeBaseUrl).href,
    stdout: () => undefined,
    stderr: () => undefined
  });
}

async function recordStage<T>(
  timings: DataviewStageTiming[],
  stage: DataviewProgressStage,
  message: string,
  completed: number,
  total: number,
  task: () => Promise<T> | T,
  requestId: string
): Promise<T> {
  progress(requestId, stage, message, Math.max(0, completed - 1), total);
  const started = performance.now();
  const result = await task();
  timings.push({ stage, elapsedMs: Math.round(performance.now() - started) });
  progress(requestId, stage, message, completed, total);
  return result;
}

function progress(
  requestId: string,
  stage: DataviewProgressStage,
  message: string,
  completed: number,
  total: number
): void {
  workerScope.postMessage({
    type: "progress",
    requestId,
    stage,
    message,
    completed,
    total
  });
}

async function fetchVerified(
  baseUrl: string,
  path: string,
  expectedSha256: string,
  maxBytes: number
): Promise<ArrayBuffer> {
  const url = new URL(path, baseUrl);
  if (url.origin !== location.origin) {
    throw new Error(`Runtime asset must be same-origin: ${path}`);
  }
  url.searchParams.set("sha256", expectedSha256);
  const response = await fetch(url.href, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status}`);
  }
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) {
    throw new Error(`${path} is ${formatBytes(contentLength)}, above its runtime asset limit.`);
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    throw new Error(`${path} is ${formatBytes(buffer.byteLength)}, above its runtime asset limit.`);
  }
  const actual = await sha256Hex(buffer);
  if (actual !== expectedSha256) {
    throw new Error(`${path} hash mismatch: expected ${expectedSha256}, got ${actual}.`);
  }
  return buffer;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer as ArrayBuffer;
  }
  return bytes.slice().buffer as ArrayBuffer;
}

function normalizeRuntimeBaseUrl(value: string): string {
  const url = new URL(value, location.href);
  if (url.origin !== location.origin) {
    throw new Error("Dataview runtime assets must be served from this origin.");
  }
  if (!url.pathname.endsWith("/")) {
    url.pathname += "/";
  }
  return url.href;
}

function selectedBasename(value: string): string {
  return value.split(/[\\/]/).pop()?.replace(/[^\w .()[\]-]/g, "_").slice(0, 160) || "selected.aoe2record";
}

function pythonString(value: string): string {
  return JSON.stringify(value);
}

function pythonJson(value: unknown): string {
  return JSON.stringify(value);
}
