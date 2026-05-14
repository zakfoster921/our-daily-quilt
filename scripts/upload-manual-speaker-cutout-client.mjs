#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  where
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';

const CONFIG = {
  apiKey: 'AIzaSyBqMJlchU_luM5-XcPo0USDUjsM60Qfoqg',
  authDomain: 'our-daily.firebaseapp.com',
  projectId: 'our-daily',
  storageBucket: 'our-daily.firebasestorage.app',
  messagingSenderId: '337201931314',
  appId: '1:337201931314:web:fb5677846d03eb285ac82b'
};

function parseArgs(argv) {
  const out = { uploadFile: '', date: 'today' };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--upload-file=')) out.uploadFile = a.slice('--upload-file='.length).trim();
    else if (a.startsWith('--date=')) out.date = a.slice('--date='.length).trim();
  }
  return out;
}

function getAppDateKey(d = new Date()) {
  const adjusted = new Date(d);
  if (d.getUTCHours() < 7) adjusted.setUTCDate(adjusted.getUTCDate() - 1);
  return `${adjusted.getUTCFullYear()}-${String(adjusted.getUTCMonth() + 1).padStart(2, '0')}-${String(adjusted.getUTCDate()).padStart(2, '0')}`;
}

function safeName(value) {
  return (
    String(value || 'speaker')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'speaker'
  );
}

function cutoutPayload(cutoutUrl, imageUrl) {
  return {
    speaker_cutout_url: cutoutUrl,
    speaker_cutout_source_url: imageUrl,
    speaker_cutout_updated_at: serverTimestamp()
  };
}

function assignmentCutoutPayload(cutoutUrl, imageUrl) {
  return {
    speakerCutoutUrlSnapshot: cutoutUrl,
    speakerCutoutSourceUrlSnapshot: imageUrl,
    speaker_cutout_updated_at: serverTimestamp()
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.uploadFile) throw new Error('Missing --upload-file=/path/to/cutout.png');
  const uploadFile = path.resolve(args.uploadFile);
  const png = fs.readFileSync(uploadFile);
  const dateKey = args.date === 'today' ? getAppDateKey() : args.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error(`Invalid --date value: ${args.date}`);

  const app = initializeApp(CONFIG);
  const auth = getAuth(app);
  await signInAnonymously(auth);
  const db = getFirestore(app);
  const storage = getStorage(app);

  const assignmentRef = doc(db, 'dailyQuoteAssignments', dateKey);
  const assignmentSnap = await getDoc(assignmentRef);
  if (!assignmentSnap.exists()) throw new Error(`No dailyQuoteAssignments/${dateKey} document found`);
  const assignment = assignmentSnap.data() || {};
  const sourceId = String(assignment.sourceId || '').trim();
  const author = String(assignment.authorSnapshot || assignment.author || '').trim();
  const imageUrl = String(
    assignment.speakerImageUrlSnapshot ||
      assignment.speaker_image_url_snapshot ||
      assignment.speakerImageUrl ||
      assignment.speaker_image_url ||
      ''
  ).trim();
  if (!sourceId) throw new Error(`dailyQuoteAssignments/${dateKey} has no sourceId`);

  const objectPath = `quilt-reveals/${safeName(author)}-${dateKey}-speaker-cutout-manual.png`;
  const fileRef = ref(storage, objectPath);
  await uploadBytes(fileRef, png, {
    contentType: 'image/png',
    cacheControl: 'public, max-age=31536000'
  });
  const cutoutUrl = await getDownloadURL(fileRef);

  await setDoc(assignmentRef, assignmentCutoutPayload(cutoutUrl, imageUrl), { merge: true });
  console.log(`[manual-cutout] patched dailyQuoteAssignments/${dateKey}`);

  await setDoc(doc(db, 'quotes', sourceId), cutoutPayload(cutoutUrl, imageUrl), { merge: true });
  console.log(`[manual-cutout] patched quotes/${sourceId}`);

  const bySource = await getDocs(query(collection(db, 'dailyQuoteAssignments'), where('sourceId', '==', sourceId)));
  let extraAssignments = 0;
  for (const snap of bySource.docs) {
    if (snap.id === dateKey) continue;
    await setDoc(snap.ref, assignmentCutoutPayload(cutoutUrl, imageUrl), { merge: true });
    extraAssignments += 1;
  }
  console.log(`[manual-cutout] patched ${extraAssignments} additional assignment doc(s) for sourceId=${sourceId}`);
  console.log(`[manual-cutout] url=${cutoutUrl}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`[manual-cutout] failed: ${error.message}`);
    process.exit(1);
  });
