#!/usr/bin/env node
/**
 * Extract a class from our-daily-beta.html into lib/*.js (globalThis export pattern).
 * Usage: node scripts/extract-class-module.mjs ArchiveService 26662 29107 lib/archive-service.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , className, startStr, endStr, relOut, description = ''] = process.argv;
if (!className || !startStr || !endStr || !relOut) {
  console.error(
    'Usage: node scripts/extract-class-module.mjs ClassName startLine endLine lib/out.js "description"'
  );
  process.exit(1);
}

const start = Number(startStr);
const end = Number(endStr);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'our-daily-beta.html'), 'utf8').split('\n');
const body = html
  .slice(start - 1, end)
  .map((line) => line.replace(/^    /, ''))
  .join('\n');

if (!body.startsWith(`class ${className}`)) {
  console.error(`Expected class ${className} at line ${start}, got:`, body.slice(0, 80));
  process.exit(1);
}

const desc =
  description ||
  `${className} extracted from monolithic HTML. Loaded before the main app module.`;
const globalName = className;
const file = `/**
 * ${desc}
 * Exposes globalThis.${globalName}.
 */
(function (root) {
  'use strict';

${body}

  root.${globalName} = ${className};
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
`;

const dest = path.join(root, relOut);
fs.writeFileSync(dest, file);
try {
  new Function(file);
} catch (err) {
  console.error('parse failed:', err.message);
  process.exit(1);
}
console.log(`wrote ${relOut} (${end - start + 1} lines)`);
