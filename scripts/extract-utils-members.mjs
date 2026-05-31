#!/usr/bin/env node
/**
 * Extract Utils static members from our-daily-beta.html line ranges into lib/*.js
 * Usage: node scripts/extract-utils-members.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'our-daily-beta.html'), 'utf8').split('\n');

const outputs = [
  {
    file: 'lib/utils-blob.js',
    header:
      'Blob/data URL helpers for Instagram uploads. Extends UtilsCore. Requires lib/utils-core.js first.',
    ranges: [[22183, 22203]]
  },
  {
    file: 'lib/utils-zapier.js',
    header:
      'Zapier reel guards, captions, and Firestore triangle serialization. Extends UtilsCore.',
    ranges: [[22205, 22315]]
  },
  {
    file: 'lib/utils-quilt-render.js',
    header:
      'HST/inset render geometry, film grain, and canvas helpers. Extends UtilsCore. Requires lib/utils-quilt.js.',
    ranges: [[22318, 23189]]
  },
  {
    file: 'lib/utils-instagram.js',
    header:
      'Firestore sanitize and instagram-images/{dateKey} upload writers. Extends UtilsCore.',
    ranges: [[23190, 23795]]
  }
];

function transform(text) {
  return text
    .replace(/Utils\./g, 'UtilsCore.')
    .replace(/\blocalStorage\b/g, 'root.localStorage')
    .replace(/\bwindow\./g, 'root.')
    .replace(/\bdocument\./g, 'root.document.')
    .replace(/\bCONFIG\b/g, 'root.CONFIG')
    .replace(/\bodqPromiseWithTimeout\b/g, 'root.odqPromiseWithTimeout')
    .replace(/\bodqIsCapacitorNative\b/g, 'root.odqIsCapacitorNative')
    .replace(/root\.root\./g, 'root.');
}

function parseMembers(lines) {
  const members = [];
  let pendingComments = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith('/**') || trimmed.startsWith('*') || trimmed.startsWith('//')) {
      pendingComments.push(line);
      i++;
      continue;
    }
    if (!line.startsWith('static ')) {
      i++;
      continue;
    }
    const stripped = line.slice(7);
    const chunk = [...pendingComments, stripped];
    pendingComments = [];
    let depth = 0;
    for (const c of stripped) {
      if (c === '{' || c === '[' || c === '(') depth++;
      if (c === '}' || c === ']' || c === ')') depth--;
    }
    i++;
    while (i < lines.length && depth > 0) {
      chunk.push(lines[i]);
      for (const c of lines[i]) {
        if (c === '{' || c === '[' || c === '(') depth++;
        if (c === '}' || c === ']' || c === ')') depth--;
      }
      i++;
    }
    members.push(transform(chunk.join('\n')));
  }
  return members;
}

const isMethod = (member) => {
  const code = member.replace(/^(\/\*\*[\s\S]*?\*\/\s*)+/, '').trim();
  return /^[A-Za-z_]\w*\s*\(/.test(code) || /^async\s+[A-Za-z_]\w*\s*\(/.test(code);
};

function membersToObjectLiteral(members) {
  return members
    .map((member) => {
      if (isMethod(member)) {
        return member.trimEnd().replace(/;\s*$/, '') + ',';
      }
      const commentMatch = member.match(/^(\/\*\*[\s\S]*?\*\/\s*)/);
      const comment = commentMatch ? commentMatch[1] : '';
      const rest = comment ? member.slice(comment.length) : member;
      const eq = rest.indexOf('=');
      if (eq === -1) throw new Error('bad field: ' + member.slice(0, 120));
      const nameOnly = rest.slice(0, eq).trim();
      const value = rest.slice(eq + 1).trim().replace(/;\s*$/, '');
      return `${comment}${nameOnly}: ${value},`;
    })
    .map((entry) => entry.split('\n').map((l) => (l ? '    ' + l : l)).join('\n'))
    .join('\n');
}

for (const out of outputs) {
  const chunkLines = [];
  for (const [start, end] of out.ranges) {
    chunkLines.push(...html.slice(start - 1, end).map((l) => l.replace(/^      /, '')));
  }
  const members = parseMembers(chunkLines);
  const body = membersToObjectLiteral(members);
  const file = `/**
 * ${out.header}
 */
(function (root) {
  'use strict';

  const UtilsCore = root.UtilsCore;
  if (!UtilsCore) {
    throw new Error('lib/utils-core.js must load before ${path.basename(out.file)}');
  }

  Object.assign(UtilsCore, {
${body}
  });
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
`.replace(/,\n  \}\);/, '\n  });');

  const dest = path.join(root, out.file);
  fs.writeFileSync(dest, file);
  try {
    new Function(file);
  } catch (err) {
    console.error('parse failed for', out.file, err.message);
    process.exit(1);
  }
  console.log('wrote', out.file, `(${members.length} members)`);
}
