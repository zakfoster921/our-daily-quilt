#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Fast CI smoke checks before deploy/refactors: dependency smoke, syntax, workflow YAML.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function ok(label) {
  console.log(`✅ ${label}`);
}

function fail(label, err) {
  console.error(`❌ ${label}:`, err?.message || err);
  process.exitCode = 1;
}

function runNodeCheck(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`missing file: ${relPath}`);
  }
  const res = spawnSync(process.execPath, ['--check', abs], {
    encoding: 'utf8',
    timeout: 20000
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(String(res.stderr || res.stdout || `${relPath} syntax check failed`).slice(0, 400));
  }
}

function smokeSyntax() {
  const files = [
    'server.js',
    'lib/logger.js',
    'lib/error-handler.js',
    'lib/color-utils-v2.js',
    'lib/utils-core.js',
    'lib/utils-color.js',
    'lib/utils-client.js',
    'lib/utils-portal.js',
    'lib/utils-mood-receipt.js',
    'lib/utils-quilt.js',
    'lib/utils-quilt-render.js',
    'lib/utils-blob.js',
    'lib/utils-zapier.js',
    'lib/utils-instagram.js',
    'lib/quilt-shape-v2.js',
    'lib/simple-quilt-engine.js',
    'lib/ui-service.js',
    'lib/live-daily-data-sync.js',
    'lib/quilt-data-service.js',
    'lib/archive-service.js',
    'lib/quote-service.js',
    'lib/quilt-renderer-v2.js',
    'scripts/generate-nightly-ig-images.cjs',
    'scripts/sync-notion-to-firestore.cjs',
    'scripts/smoke-deps.cjs'
  ];
  for (const rel of files) {
    runNodeCheck(rel);
    ok(`${rel} syntax`);
  }
}

function smokeWorkflowYaml() {
  const dir = path.join(ROOT, '.github', 'workflows');
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'));
  if (!files.length) {
    throw new Error('no workflow files found');
  }
  for (const name of files) {
    const filePath = path.join(dir, name);
    const res = spawnSync('ruby', ['-ryaml', '-e', 'YAML.load_file(ARGV[0])', filePath], {
      encoding: 'utf8',
      timeout: 10000
    });
    if (res.error) throw res.error;
    if (res.status !== 0) {
      throw new Error(`${name}: ${String(res.stderr || res.stdout).slice(0, 300)}`);
    }
    ok(`workflow YAML ${name}`);
  }
}

function smokePackageJson() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  if (!String(pkg.engines?.node || '').includes('20')) {
    throw new Error('package.json engines.node should target Node 20');
  }
  ok('package.json engines.node');
}

function smokeDeps() {
  const res = spawnSync(process.execPath, [path.join(__dirname, 'smoke-deps.cjs')], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60000,
    env: process.env
  });
  process.stdout.write(res.stdout || '');
  process.stderr.write(res.stderr || '');
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error('smoke-deps failed');
  }
}

function main() {
  console.log('Running CI smoke checks...\n');
  try {
    smokePackageJson();
  } catch (err) {
    fail('package.json', err);
  }
  try {
    smokeWorkflowYaml();
  } catch (err) {
    fail('workflow YAML', err);
  }
  try {
    smokeSyntax();
  } catch (err) {
    fail('syntax', err);
  }
  try {
    smokeDeps();
  } catch (err) {
    fail('dependencies', err);
  }
  console.log('');
  if (process.exitCode) {
    console.error('CI smoke checks failed.');
    process.exit(process.exitCode);
  }
  console.log('All CI smoke checks passed.');
}

main();
