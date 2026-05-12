#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const exportRoot = path.join(root, 'build', 'AppStoreExport');

function getNewestExportDir() {
  const dirs = [exportRoot];
  if (fs.existsSync(exportRoot)) {
    for (const entry of fs.readdirSync(exportRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(path.join(exportRoot, entry.name));
    }
  }

  return dirs
    .map((dir) => ({
      dir,
      summaryPath: path.join(dir, 'DistributionSummary.plist'),
      ipaPath: path.join(dir, 'App.ipa')
    }))
    .filter((candidate) => fs.existsSync(candidate.summaryPath) || fs.existsSync(candidate.ipaPath))
    .sort((a, b) => {
      const aTime = Math.max(
        fs.existsSync(a.summaryPath) ? fs.statSync(a.summaryPath).mtimeMs : 0,
        fs.existsSync(a.ipaPath) ? fs.statSync(a.ipaPath).mtimeMs : 0
      );
      const bTime = Math.max(
        fs.existsSync(b.summaryPath) ? fs.statSync(b.summaryPath).mtimeMs : 0,
        fs.existsSync(b.ipaPath) ? fs.statSync(b.ipaPath).mtimeMs : 0
      );
      return bTime - aTime;
    })[0] || {
      dir: exportRoot,
      summaryPath: path.join(exportRoot, 'DistributionSummary.plist'),
      ipaPath: path.join(exportRoot, 'App.ipa')
    };
}

const exportDir = getNewestExportDir();
const summaryPath = exportDir.summaryPath;
const ipaPath = exportDir.ipaPath;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', options.stderr || 'pipe'],
    ...options
  }).trim();
}

function fail(message, details = '') {
  console.error(`[FAIL] ${message}`);
  if (details) console.error(details);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`[OK] ${message}`);
}

function describeFile(filePath) {
  const relativePath = path.relative(root, filePath);
  if (!fs.existsSync(filePath)) return `${relativePath} (missing)`;
  const stats = fs.statSync(filePath);
  return `${relativePath} (modified ${stats.mtime.toLocaleString()})`;
}

function readSummaryApsEnvironment() {
  if (!fs.existsSync(summaryPath)) {
    fail(
      'Missing App Store export summary.',
      `Expected: ${path.relative(root, summaryPath)}\nArchive/export the app first, then run npm run ios:verify-push.`
    );
    return null;
  }

  try {
    return run('/usr/libexec/PlistBuddy', [
      '-c',
      'Print :App.ipa:0:entitlements:aps-environment',
      summaryPath
    ]);
  } catch (error) {
    fail(
      'DistributionSummary.plist does not include aps-environment.',
      'Make sure the App target has the Push Notifications capability and re-export for App Store Connect.'
    );
    return null;
  }
}

function readIpaApsEnvironment() {
  if (!fs.existsSync(ipaPath)) {
    fail('Missing exported IPA.', `Expected: ${path.relative(root, ipaPath)}`);
    return null;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'odq-ipa-'));
  try {
    run('/usr/bin/unzip', ['-q', ipaPath, '-d', tmpDir]);
    const payloadDir = path.join(tmpDir, 'Payload');
    const appName = fs.readdirSync(payloadDir).find((name) => name.endsWith('.app'));
    if (!appName) throw new Error('No .app bundle found inside IPA Payload.');

    const appPath = path.join(payloadDir, appName);
    const entitlements = run('/usr/bin/codesign', ['-d', '--entitlements', ':-', appPath], { stderr: 'ignore' });
    const entitlementsPath = path.join(tmpDir, 'entitlements.plist');
    fs.writeFileSync(entitlementsPath, entitlements);
    return run('/usr/bin/plutil', ['-extract', 'aps-environment', 'raw', '-o', '-', entitlementsPath]);
  } catch (error) {
    fail(
      'Exported IPA does not include aps-environment.',
      'Make sure the App target has the Push Notifications capability and re-export for App Store Connect.'
    );
    return null;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

console.log('Checking iOS push notification entitlement...');
console.log(`Export: ${path.relative(root, exportDir.dir)}`);
console.log(`Summary: ${describeFile(summaryPath)}`);
console.log(`IPA: ${describeFile(ipaPath)}`);
console.log('');

const summaryEnv = readSummaryApsEnvironment();
if (summaryEnv === 'production') {
  ok('DistributionSummary.plist has aps-environment = production');
} else if (summaryEnv) {
  fail(`DistributionSummary.plist has aps-environment = ${summaryEnv}, expected production.`);
}

const ipaEnv = readIpaApsEnvironment();
if (ipaEnv === 'production') {
  ok('Exported App.ipa has aps-environment = production');
} else if (ipaEnv) {
  fail(`Exported App.ipa has aps-environment = ${ipaEnv}, expected production.`);
}

if (process.exitCode) {
  console.error('\nPush notifications will not work for App Store/TestFlight until this is fixed.');
  process.exit(process.exitCode);
}

console.log('\nPush entitlement check passed.');
