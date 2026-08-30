import { mkdir, readFile, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { dirname } from "node:path";

const sourcePath = "src/replay/dataview-reconstruction.ts";
const targetPath = "public/dataview-runtime/dataview-reconstruction.js";
const exportedNames = [
  "buildDataviewRenderSnapshot",
  "buildDataviewSeekParityDiagnostics",
  "buildDataviewDiagnostics",
  "canonicalMapSpriteKey",
  "resolveMapSpriteKey",
  "classifyUnitCategory",
  "normalizedLookupName",
  "mapPositionIsCredible",
  "timelinePoint",
  "unitTimelineInterpolationState",
  "groupExactTypeMarkers",
  "exactTypeStackLayoutMetrics",
  "exactTypeStackPixelLayout",
  "exactTypeStackPixelOffset",
  "markerRectsIntersect",
];

const source = await readFile(sourcePath, "utf8");
const transpiled = stripTypeScriptTypes(source, { mode: "transform" });

const runtimeBody = transpiled
  .replace(/^export\s+\{[^}]+\};?\s*$/gm, "")
  .replace(/\bexport\s+(function|const|let|var|class)\s+/g, "$1 ");

const output = [
  "/* Generated from src/replay/dataview-reconstruction.ts. Do not edit by hand. */",
  "(function () {",
  "\"use strict\";",
  runtimeBody,
  "globalThis.DataviewReconstruction = Object.freeze({",
  ...exportedNames.map((name) => `  ${name},`),
  "});",
  "}());",
  "",
].join("\n");

await mkdir(dirname(targetPath), { recursive: true });
await writeFile(targetPath, output);
console.log(`generated ${targetPath} from ${sourcePath}`);
