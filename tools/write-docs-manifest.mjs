import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const docsRoot = "docs";
const manifestName = "manifest.sha256";
const manifestPath = join(docsRoot, manifestName);
const paths = [];

await collectFiles(docsRoot);
paths.sort();

const lines = [];
for (const path of paths) {
  const bytes = await readFile(path);
  const hash = createHash("sha256").update(bytes).digest("hex");
  lines.push(`${hash}  ${toPortablePath(relative(docsRoot, path))}`);
}

await writeFile(manifestPath, `${lines.join("\n")}\n`, "utf-8");
console.log(`docs manifest ready: ${lines.length} files hash-listed in ${manifestPath}`);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(path);
      continue;
    }
    if (entry.isFile() && path !== manifestPath) {
      paths.push(path);
    }
  }
}

function toPortablePath(path) {
  return path.split(sep).join("/");
}
