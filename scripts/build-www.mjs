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
const stylesSrc = join(root, "styles");
const stylesDest = join(www, "styles");
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

async function readPbxproj() {
  try {
    return await readFile(pbxproj, "utf8");
  } catch {
    return null;
  }
}

async function resolveBuildId() {
  const pbx = await readPbxproj();
  if (!pbx) return "dev";
  const match = pbx.match(/CURRENT_PROJECT_VERSION = (\d+);/);
  return match ? match[1] : "dev";
}

async function resolveMarketingVersion() {
  const pbx = await readPbxproj();
  if (pbx) {
    const match = pbx.match(/MARKETING_VERSION = ([^;]+);/);
    if (match) return match[1].trim();
  }
  try {
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    return pkg.version || "1.0.0";
  } catch {
    return "1.0.0";
  }
}

function stampAppConfig(content, version, buildId) {
  let out = content.replace(
    /(name: 'OUR DAILY QUILT',\s*\n\s*version: )'[^']+'/,
    `$1'${version}'`
  );
  return out.replace(/(buildId: )'[^']+'/, `$1'${buildId}'`);
}

async function resolveAppVersion() {
  return {
    version: await resolveMarketingVersion(),
    buildId: await resolveBuildId(),
  };
}

await mkdir(www, { recursive: true });

const { version, buildId } = await resolveAppVersion();

const html = await readFile(srcHtml, "utf8");
await writeFile(destHtml, html);

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
    const appConfigSrc = join(libSrc, "app-config.js");
    const appConfigDest = join(libDest, "app-config.js");
    try {
      const cfg = await readFile(appConfigSrc, "utf8");
      const stamped = stampAppConfig(cfg, version, buildId);
      await writeFile(appConfigSrc, stamped);
      await writeFile(appConfigDest, stamped);
    } catch {
      console.warn("build:www: lib/app-config.js missing, skipping version stamp");
    }
  }
} catch {
  console.warn("build:www: no lib/ folder, skipping");
}
try {
  if (await stat(stylesSrc).then((s) => s.isDirectory())) {
    await copyDir(stylesSrc, stylesDest);
  }
} catch {
  console.warn("build:www: no styles/ folder, skipping");
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
