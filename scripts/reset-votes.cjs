#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] != null && process.env[key] !== '') continue;
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadDotEnv();

const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccountPath = path.join(__dirname, '..', 'firebase-adminsdk-local.json');
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
}

const db = admin.firestore();
const dateKey = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
console.log('Resetting votes for dateKey:', dateKey);

async function reset() {
  const ref = db.collection('quiltNames').doc(dateKey);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log('No quiltNames document found for today.');
    process.exit(0);
  }
  const data = snap.data();
  const resetWords = (data.words || []).map(w => ({ ...w, votes: 0 }));
  await ref.set({ words: resetWords, winningQuiltName: '' }, { merge: true });
  console.log(`Done. Reset ${resetWords.length} words to 0 votes, cleared winningQuiltName.`);
  process.exit(0);
}

reset().catch(e => { console.error(e); process.exit(1); });
