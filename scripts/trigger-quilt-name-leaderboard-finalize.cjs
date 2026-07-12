#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Finalize quilt-name leaderboard submission phase (07:00 + 8h UTC).
 * POST /api/quilt-name-leaderboard-finalize with RESET_TOKEN.
 */
const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

function resolveFinalizeUrl() {
  const direct = String(process.env.QUILT_NAME_LEADERBOARD_FINALIZE_URL || process.env.RESET_URL || '').trim();
  if (direct) {
    return direct.includes('/api/quilt-name-leaderboard-finalize')
      ? direct
      : `${direct.replace(/\/$/, '').replace(/\/api\/daily-reset$/, '')}/api/quilt-name-leaderboard-finalize`;
  }
  const domain = String(process.env.RAILWAY_PUBLIC_DOMAIN || '').trim();
  if (domain) {
    const host = domain.replace(/^https?:\/\//, '');
    return `https://${host}/api/quilt-name-leaderboard-finalize`;
  }
  return '';
}

async function main() {
  loadDotEnv();
  const token = String(process.env.RESET_TOKEN || '').trim();
  const url = resolveFinalizeUrl();
  if (!token) {
    console.error('Missing RESET_TOKEN');
    process.exit(1);
  }
  if (!url) {
    console.error('Missing QUILT_NAME_LEADERBOARD_FINALIZE_URL, RESET_URL, or RAILWAY_PUBLIC_DOMAIN');
    process.exit(1);
  }

  const dateKey = String(process.argv[2] || process.env.QUILT_NAME_LEADERBOARD_DATE_KEY || '').trim();
  const force = process.argv.includes('--force')
    || String(process.env.QUILT_NAME_LEADERBOARD_FORCE || '').trim().toLowerCase() === 'true';
  const body = JSON.stringify({
    source: 'railway-cron',
    ...(dateKey ? { dateKey } : {}),
    ...(force ? { force: true } : {})
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-reset-token': token
    },
    body
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(text);
  if (!res.ok) process.exit(1);
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    console.error('Response was not JSON');
    process.exit(1);
  }
  if (!data || data.success !== true) {
    console.error('Finalize returned success=false');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
