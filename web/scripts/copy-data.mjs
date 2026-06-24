import { mkdir, copyFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const bundleDir = join(repoRoot, "data-pipeline", "out");
const outDir = join(here, "..", "public", "data");
const TOPO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

await mkdir(outDir, { recursive: true });

for (const f of ["countries.json", "factors.json", "meta.json"]) {
  await copyFile(join(bundleDir, f), join(outDir, f));
  console.log("copied", f);
}

const topoPath = join(outDir, "countries-110m.json");
try {
  await access(topoPath);
  console.log("countries-110m.json already present");
} catch {
  const res = await fetch(TOPO_URL);
  if (!res.ok) throw new Error(`topojson fetch failed: ${res.status}`);
  await writeFile(topoPath, Buffer.from(await res.arrayBuffer()));
  console.log("downloaded countries-110m.json");
}
