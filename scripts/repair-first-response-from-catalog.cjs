#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Restore first_response on dailyQuoteAssignments + quotes/{sourceId}
 * from quotes/{YYYY-MM-DD} catalog when community reflection sync overwrote it.
 *
 * Usage (from project root):
 *   node scripts/repair-first-response-from-catalog.cjs 2026-05-18 --dry-run
 *   node scripts/repair-first-response-from-catalog.cjs 2026-05-18
 *
 * Credentials (pick one):
 *   - .env with GOOGLE_APPLICATION_CREDENTIALS_JSON={...}
 *   - .env with GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   - .env with FIREBASE_PROJECT_ID=our-daily after: gcloud auth application-default login
 *
 * Or use production (no local creds):
 *   curl -X POST "https://our-daily-quilt-production.up.railway.app/api/admin/repair-first-response" \
 *     -H "Content-Type: application/json" \
 *     -H "x-reset-token: YOUR_RESET_TOKEN" \
 *     -d '{"appDateKey":"2026-05-18","dryRun":true}'
 */
const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {
  /* optional */
}

const admin = require('firebase-admin');
const { isDateDocId } = require('./lib/first-response-fields.cjs');
const { repairFirstResponseFromCatalog } = require('./lib/repair-first-response-from-catalog-lib.cjs');

function initFirestore() {
  if (admin.apps.length) return admin.firestore();

  const json = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (json && String(json).trim()) {
    const sa = JSON.parse(json);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID || 'our-daily'
    });
    return admin.firestore();
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(path.resolve(credPath))) {
    const sa = JSON.parse(fs.readFileSync(path.resolve(credPath), 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID || 'our-daily'
    });
    return admin.firestore();
  }

  const projectId = String(process.env.FIREBASE_PROJECT_ID || 'our-daily').trim();
  if (projectId && projectId !== 'your-project-id') {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId
    });
    return admin.firestore();
  }

  throw new Error(
    [
      'No Firebase credentials found.',
      '',
      'Option A — add a .env file in the project root with:',
      '  GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account",...}',
      '  (copy from Firebase Console → Project settings → Service accounts → Generate key)',
      '',
      'Option B — gcloud login:',
      '  gcloud auth application-default login',
      '  echo "FIREBASE_PROJECT_ID=our-daily" >> .env',
      '',
      'Option C — run on Railway (uses server creds already configured):',
      '  curl -X POST "https://our-daily-quilt-production.up.railway.app/api/admin/repair-first-response" \\',
      '    -H "Content-Type: application/json" \\',
      '    -H "x-reset-token: YOUR_RESET_TOKEN" \\',
      '    -d \'{"appDateKey":"2026-05-18","dryRun":true}\''
    ].join('\n')
  );
}

async function main() {
  const dateKey = String(process.argv[2] || '').trim();
  const dryRun = process.argv.includes('--dry-run');
  if (!isDateDocId(dateKey)) {
    console.error('Usage: node scripts/repair-first-response-from-catalog.cjs YYYY-MM-DD [--dry-run]');
    process.exit(1);
  }

  const db = initFirestore();
  const result = await repairFirstResponseFromCatalog(db, dateKey, {
    dryRun,
    FieldValue: admin.firestore.FieldValue
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.success) process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
