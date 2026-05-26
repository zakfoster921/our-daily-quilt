import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pbxproj = join(root, "ios", "App", "App.xcodeproj", "project.pbxproj");
const www = join(root, "www");
const assetsSrc = join(root, "assets");
const assetsDest = join(www, "assets");
const cutiveSrc = join(assetsSrc, "fonts", "CutiveMono-Regular.ttf");
const cutiveIosDest = join(root, "ios", "App", "App", "Fonts", "CutiveMono-Regular.ttf");
const libSrc = join(root, "lib");
const libDest = join(www, "lib");
const rumiSrc = join(root, "rumi-colors.js");
const rumiDest = join(www, "rumi-colors.js");
const srcHtml = join(root, "our-daily-beta.html");
const destHtml = join(www, "index.html");

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

async function resolveBuildId() {
  try {
    const pbx = await readFile(pbxproj, "utf8");
    const match = pbx.match(/CURRENT_PROJECT_VERSION = (\d+);/);
    if (match) return match[1];
  } catch {
    /* no iOS project */
  }
  return "dev";
}

async function injectAppVersion(html) {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const version = pkg.version || "1.0.0";
  const buildId = await resolveBuildId();

  let out = html.replace(
    /(name: 'OUR DAILY QUILT',\s*\n\s*version: )'[^']+'/,
    `$1'${version}'`
  );
  out = out.replace(/(buildId: )'[^']+'/, `$1'${buildId}'`);
  return { html: out, version, buildId };
}

await mkdir(www, { recursive: true });

const html = await readFile(srcHtml, "utf8");
const { html: stamped, version, buildId } = await injectAppVersion(html);
await writeFile(destHtml, stamped);

try {
  if (await stat(assetsSrc).then((s) => s.isDirectory())) {
    await copyDir(assetsSrc, assetsDest);
  }
} catch {
  console.warn("build:www: no assets/ folder, skipping");
}
try {
  if (await stat(libSrc).then((s) => s.isDirectory())) {
    await copyDir(libSrc, libDest);
  }
} catch {
  console.warn("build:www: no lib/ folder, skipping");
}
try {
  await copyFile(rumiSrc, rumiDest);
} catch {
  console.warn("build:www: rumi-colors.js missing, skipping");
}
try {
  await mkdir(join(root, "ios", "App", "App", "Fonts"), { recursive: true });
  await copyFile(cutiveSrc, cutiveIosDest);
} catch {
  console.warn(
    "build:www: CutiveMono-Regular.ttf missing — add assets/fonts/CutiveMono-Regular.ttf"
  );
}
console.log(`build:www: wrote www/index.html (version ${version}, buildId ${buildId}) and www/assets/`);
