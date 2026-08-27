import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

const copiedAssets = [
  {
    source: "node_modules/pyodide/pyodide.mjs",
    target: "public/dataview-runtime/pyodide/pyodide.js",
    sha256: "635a6da3218fe4e5668da595acfe8b5ce77453d597d602f19a423dd250653441"
  },
  {
    source: "node_modules/pyodide/pyodide.asm.js",
    target: "public/dataview-runtime/pyodide/pyodide.asm.js",
    sha256: "b22e5831eade9ff10e6fe2c811c68688cd91f10154377b4f80debcf5bafa1e56"
  },
  {
    source: "node_modules/pyodide/pyodide.asm.wasm",
    target: "public/dataview-runtime/pyodide/pyodide.asm.wasm",
    sha256: "5effb6a1a6cc4a1a85bec4622701aa797c031e1de923cbbaf2ad47abdc4ab325"
  },
  {
    source: "node_modules/pyodide/python_stdlib.zip",
    target: "public/dataview-runtime/pyodide/python_stdlib.zip",
    sha256: "71fee17f88a6260ec8c9c7c063533ee59c021fdc88a1ce76247378d3c4a35f4c"
  },
  {
    source: "node_modules/pyodide/pyodide-lock.json",
    target: "public/dataview-runtime/pyodide/pyodide-lock.json",
    sha256: "f6e6f42f451f42affbbcddb00e8c9a3278dcbf399f57aab9f3f568839a7ff4a6"
  }
];

const verifiedAssets = [
  {
    target: "public/dataview-runtime/pyodide/libopenssl-1.1.1w.zip",
    sha256: "48965994b6ace00d3ebbc2dc1b65c11978582620f4ef6c71a50d9ea4c5fc7437"
  },
  {
    target: "public/dataview-runtime/pyodide/hashlib-1.0.0-cp313-cp313-pyodide_2025_0_wasm32.whl",
    sha256: "b5c736c84ce26cba4e5096c6b9d173a357666af5993cc08395bfb8bac997bb98"
  },
  {
    target: "public/licenses/aoe2rec-js-0.1.22-APACHE-2.0.txt",
    sha256: "8173d5c29b4f956d532781d2b86e4e30f83e6b7878dce18c919451d6ba707c90"
  },
  {
    target: "public/licenses/pyodide-0.28.3-MPL-2.0.txt",
    sha256: "1f256ecad192880510e84ad60474eab7589218784b9a50bc7ceee34c2b91f1d5"
  },
  {
    target: "public/dataview-runtime/aoc-mgz-pipeline.zip",
    sha256: "bab3345c2f8128350ce64090c73eb1088cc229af94a0add698be046233a26ffc"
  },
  {
    target: "public/dataview-runtime/aoe2techtree-data.json",
    sha256: "4e2f85b39e39078cdee71bdbaf2c36a8f0b50202de4032df7ba8e2c36c6049c4"
  },
  {
    target: "public/rules/ruleset-current.json",
    sha256: "c23b1ffd73f1178baa011f41d7d7faab98f7076eb885dcdd43711a295afb7eab"
  }
];

for (const asset of copiedAssets) {
  await mkdir(dirname(asset.target), { recursive: true });
  await copyFile(asset.source, asset.target);
  await verify(asset.target, asset.sha256);
}

for (const asset of verifiedAssets) {
  await verify(asset.target, asset.sha256);
}

console.log(`dataview runtime ready: ${copiedAssets.length + verifiedAssets.length} hash-checked assets`);

async function verify(path, expectedSha256) {
  const bytes = await readFile(path);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expectedSha256) {
    throw new Error(`${path} hash mismatch: expected ${expectedSha256}, got ${actual}`);
  }
}
