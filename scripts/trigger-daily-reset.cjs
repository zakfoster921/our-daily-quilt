#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * One-shot daily reset for Railway Cron (or local smoke).
 * POST /api/daily-reset with RESET_TOKEN. Exits 0 on success, 1 on failure.
 *
 * Env:
 *   RESET_TOKEN (required)
 *   RESET_URL — full URL, e.g. https://…/api/daily-reset (preferred)
 *   RAILWAY_PUBLIC_DOMAIN — used if RESET_URL unset (https://{domain}/api/daily-reset)
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

function resolveResetUrl() {
  const direct = String(process.env.RESET_URL || '').trim();
  if (direct) {
    return direct.includes('/api/daily-reset')
      ? direct
      : `${direct.replace(/\/$/, '')}/api/daily-reset`;
  }
  const domain = String(process.env.RAILWAY_PUBLIC_DOMAIN || '').trim();
  if (domain) {
    const host = domain.replace(/^https?:\/\//, '');
    return `https://${host}/api/daily-reset`;
  }
  return '';
}

async function main() {
  loadDotEnv();
  const token = String(process.env.RESET_TOKEN || '').trim();
  const url = resolveResetUrl();
  if (!token) {
    console.error('Missing RESET_TOKEN');
    process.exit(1);
  }
  if (!url) {
    console.error('Missing RESET_URL or RAILWAY_PUBLIC_DOMAIN');
    process.exit(1);
  }

  const body = JSON.stringify({ source: 'railway-cron', mode: 'daily' });
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
    console.error('Daily reset returned success=false');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
