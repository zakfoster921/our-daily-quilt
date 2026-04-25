import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const www = join(root, "www");
const assetsSrc = join(root, "assets");
const assetsDest = join(www, "assets");

async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = join(src, e.name);
    const d = join(dest, e.name);
    if (e.isDirectory()) {
      await copyDir(s, d);
    } else {
      await copyFile(s, d);
    }
  }
}

await mkdir(www, { recursive: true });
await copyFile(join(root, "our-daily-beta.html"), join(www, "index.html"));
try {
  if (await stat(assetsSrc).then((s) => s.isDirectory())) {
    await copyDir(assetsSrc, assetsDest);
  }
} catch {
  console.warn("build:www: no assets/ folder, skipping");
}
console.log("build:www: wrote www/index.html and www/assets/");
