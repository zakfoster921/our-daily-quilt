'use strict';
// node scripts/lab-quilt-smoke.cjs [out.png]  — renders a sample day through lib/lab-quilt.js (needs `canvas` for the PNG step)
const fs = require('fs'), path = require('path');
const L = require('../lib/lab-quilt.js');
const days = require('../lab/data/days.json');
const day = days[days.length - 2];
const blocks = day.colors.map((color, i) => ({ color, contributorId: `user${i}` }));
const q = L.buildLabQuilt(blocks, day.date);
const seen = new Set(); q.owners.forEach((o) => o.forEach((u) => seen.add(u)));
console.log(`date ${day.date} style ${q.style} colors ${q.colorCount} shapes ${q.model.shapes.length} contributors-with-a-shape ${seen.size}/${new Set(q.contributorIds).size} version ${q.version}`);
const again = L.buildLabQuilt(blocks, day.date);
console.log('deterministic:', JSON.stringify(again.model.shapes) === JSON.stringify(q.model.shapes));
for (let i = 0; i < 6; i++) { const d = new Date(Date.UTC(2026, 10, 4 + i)).toISOString().slice(0, 10); process.stdout.write(`${d}:${L.styleForDateKey(d)} `); }
console.log();
try {
  const { createCanvas } = require('canvas');
  const out = process.argv[2] || path.join(__dirname, 'lab-quilt-smoke.png');
  fs.writeFileSync(out, L.renderLabQuiltPng(createCanvas, q.model)); console.log('wrote', out);
} catch (e) { console.log('PNG step skipped:', e.message.split('\n')[0]); }
