#!/usr/bin/env npx ts-node
/**
 * reorg-columns.ts — Remove 4 columns and reorganize into logical order
 *
 * REMOVES: D (Company), T (Current Title), Y (Confidence Score), Z (Data Quality)
 *
 * NEW ORDER (24 columns, A–X):
 *   Identity:     A First Name, B Last Name, C Full Name
 *   Contact:      D Email, E Mobile, F Business Phone, G Secondary Phone,
 *                 H Phone (Verified), I LinkedIn URL, J Twitter URL
 *   Professional: K Company, L Title, M Category, N Tags
 *   Relationship: O Relationship, P Source, Q Priority
 *   Context:      R Location, S Date Added, T Notes
 *   Enrichment:   U Enrichment Status, V Last Enriched, W Enrichment Source,
 *                 X Enrichment Notes
 *
 * Run:  npx ts-node scripts/reorg-columns.ts [--dry-run]
 */

import * as fs from 'fs';
import * as https from 'https';

const DRY_RUN = process.argv.includes('--dry-run');

const envPath = '/root/nanoclaw/nanoclaw/.env';
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

const SHEET_ID = process.env.GOOGLE_CONTACTS_SHEET_ID!;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN!;
const ENRICHED_TAB = 'Enriched Data';

function httpsRequest(options: https.RequestOptions, body?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', (c: string) => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN, grant_type: 'refresh_token',
  }).toString();
  const raw = await httpsRequest({
    hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body).toString() },
  }, body);
  const res = JSON.parse(raw);
  if (!res.access_token) throw new Error('Failed to get access token: ' + raw);
  return res.access_token;
}

async function sheetsGet(token: string, range: string): Promise<string[][]> {
  const raw = await httpsRequest({
    hostname: 'sheets.googleapis.com',
    path: `/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`,
    headers: { Authorization: `Bearer ${token}` },
  });
  return JSON.parse(raw).values || [];
}

async function sheetsUpdate(token: string, range: string, values: string[][]): Promise<void> {
  const body = JSON.stringify({ values });
  await httpsRequest({
    hostname: 'sheets.googleapis.com',
    path: `/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body).toString(),
    },
  }, body);
}

async function sheetsClear(token: string, range: string): Promise<void> {
  const body = JSON.stringify({});
  await httpsRequest({
    hostname: 'sheets.googleapis.com',
    path: `/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:clear`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body).toString(),
    },
  }, body);
}

// OLD column indices (0-27, A-AB)
const OLD = {
  FIRST: 0, LAST: 1, FULL: 2, COMPANY: 3, TITLE: 4, CATEGORY: 5,
  RELATIONSHIP: 6, SOURCE: 7, EMAIL: 8, BIZ_PHONE: 9, MOBILE: 10,
  SEC_PHONE: 11, LOCATION: 12, DATE_ADDED: 13, PRIORITY: 14,
  NOTES: 15, LINKEDIN: 16, TWITTER: 17, CUR_COMPANY: 18, CUR_TITLE: 19,
  PHONE_VERIFIED: 20, ENRICH_STATUS: 21, LAST_ENRICHED: 22,
  ENRICH_SOURCE: 23, CONFIDENCE: 24, DATA_QUALITY: 25,
  ENRICH_NOTES: 26, TAGS: 27,
};

// Columns to REMOVE: D(3), T(19), Y(24), Z(25)
const REMOVE_INDICES = new Set([OLD.COMPANY, OLD.CUR_TITLE, OLD.CONFIDENCE, OLD.DATA_QUALITY]);

// New column order: map from new index → old index
// Identity
// A=First, B=Last, C=Full
// Contact
// D=Email, E=Mobile, F=BizPhone, G=SecPhone, H=PhoneVerified, I=LinkedIn, J=Twitter
// Professional
// K=CurCompany(→"Company"), L=Title, M=Category, N=Tags
// Relationship
// O=Relationship, P=Source, Q=Priority
// Context
// R=Location, S=DateAdded, T=Notes
// Enrichment
// U=EnrichStatus, V=LastEnriched, W=EnrichSource, X=EnrichNotes

const NEW_ORDER: { oldIdx: number; newHeader: string }[] = [
  { oldIdx: OLD.FIRST,          newHeader: 'First Name' },
  { oldIdx: OLD.LAST,           newHeader: 'Last Name' },
  { oldIdx: OLD.FULL,           newHeader: 'Full Name' },
  { oldIdx: OLD.EMAIL,          newHeader: 'Email' },
  { oldIdx: OLD.MOBILE,         newHeader: 'Mobile' },
  { oldIdx: OLD.BIZ_PHONE,      newHeader: 'Business Phone' },
  { oldIdx: OLD.SEC_PHONE,      newHeader: 'Secondary Phone' },
  { oldIdx: OLD.PHONE_VERIFIED, newHeader: 'Phone (Verified)' },
  { oldIdx: OLD.LINKEDIN,       newHeader: 'LinkedIn URL' },
  { oldIdx: OLD.TWITTER,        newHeader: 'Twitter URL' },
  { oldIdx: OLD.CUR_COMPANY,    newHeader: 'Company' },
  { oldIdx: OLD.TITLE,          newHeader: 'Title' },
  { oldIdx: OLD.CATEGORY,       newHeader: 'Category' },
  { oldIdx: OLD.TAGS,           newHeader: 'Tags' },
  { oldIdx: OLD.RELATIONSHIP,   newHeader: 'Relationship' },
  { oldIdx: OLD.SOURCE,         newHeader: 'Source' },
  { oldIdx: OLD.PRIORITY,       newHeader: 'Priority' },
  { oldIdx: OLD.LOCATION,       newHeader: 'Location' },
  { oldIdx: OLD.DATE_ADDED,     newHeader: 'Date Added' },
  { oldIdx: OLD.NOTES,          newHeader: 'Notes' },
  { oldIdx: OLD.ENRICH_STATUS,  newHeader: 'Enrichment Status' },
  { oldIdx: OLD.LAST_ENRICHED,  newHeader: 'Last Enriched' },
  { oldIdx: OLD.ENRICH_SOURCE,  newHeader: 'Enrichment Source' },
  { oldIdx: OLD.ENRICH_NOTES,   newHeader: 'Enrichment Notes' },
];

const NEW_COL_COUNT = NEW_ORDER.length; // 24

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');
  console.log(`Removing 4 columns, reorganizing 24 remaining into logical order\n`);

  // Verify no removed column is in new order
  for (const idx of REMOVE_INDICES) {
    if (NEW_ORDER.some(n => n.oldIdx === idx)) {
      throw new Error(`BUG: removed column index ${idx} found in new order`);
    }
  }

  // Verify all non-removed columns are accounted for
  for (let i = 0; i < 28; i++) {
    if (!REMOVE_INDICES.has(i) && !NEW_ORDER.some(n => n.oldIdx === i)) {
      throw new Error(`BUG: old column index ${i} not in remove set or new order`);
    }
  }

  console.log('NEW COLUMN LAYOUT:');
  console.log('──────────────────');
  for (let i = 0; i < NEW_ORDER.length; i++) {
    const letter = String.fromCharCode(65 + i);
    const { oldIdx, newHeader } = NEW_ORDER[i];
    const oldLetter = String.fromCharCode(65 + oldIdx);
    const moved = oldLetter !== letter ? ` (was ${oldLetter})` : '';
    console.log(`  ${letter}  ${newHeader}${moved}`);
  }
  console.log('');

  const token = await getAccessToken();
  console.log('Reading sheet...');
  const rawRows = await sheetsGet(token, `${ENRICHED_TAB}!A2:AB`);
  const data = rawRows.map(r => [...r, ...Array(28).fill('')].slice(0, 28));
  console.log(`${data.length} rows\n`);

  // Build new header
  const newHeader = NEW_ORDER.map(n => n.newHeader);

  // Reorder all data rows
  const newData: string[][] = [];
  for (const row of data) {
    const newRow: string[] = [];
    for (const { oldIdx } of NEW_ORDER) {
      newRow.push(row[oldIdx] || '');
    }
    newData.push(newRow);
  }

  // Verify row count
  console.log(`Reordered ${newData.length} rows into ${NEW_COL_COUNT} columns`);

  // Spot-check first row
  const firstOld = data[0];
  const firstNew = newData[0];
  console.log(`\nSpot check row 2:`);
  console.log(`  First Name: "${firstNew[0]}" (was A: "${firstOld[0]}")`);
  console.log(`  Email:      "${firstNew[3]}" (was I: "${firstOld[8]}")`);
  console.log(`  Company:    "${firstNew[10]}" (was S: "${firstOld[18]}")`);
  console.log(`  Title:      "${firstNew[11]}" (was E: "${firstOld[4]}")`);
  console.log(`  Notes:      "${firstNew[19].slice(0, 50)}..." (was P: "${firstOld[15].slice(0, 50)}...")`);

  // Check for data in columns beyond X (old AB=27) that might get lost
  // After writing 24 cols (A-X), old columns Y-AB (indices 24-27) need to be cleared
  const lastNewCol = String.fromCharCode(65 + NEW_COL_COUNT - 1); // X
  console.log(`\nNew range: A-${lastNewCol} (${NEW_COL_COUNT} columns)`);
  console.log(`Old columns Y-AB will be cleared after write\n`);

  if (!DRY_RUN) {
    // Write new header
    console.log('Writing new header...');
    await sheetsUpdate(token, `${ENRICHED_TAB}!A1:${lastNewCol}1`, [newHeader]);

    // Write reordered data in batches
    console.log('Writing reordered data...');
    const BATCH_SIZE = 1000;
    for (let start = 0; start < newData.length; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE, newData.length);
      const range = `${ENRICHED_TAB}!A${start + 2}:${lastNewCol}${end + 1}`;
      await sheetsUpdate(token, range, newData.slice(start, end));
      console.log(`  Written rows ${start + 2}–${end + 1}`);
    }

    // Clear the leftover old columns (Y through AB = columns 25-28, i.e., Y1:AB6797)
    console.log('Clearing leftover old columns (Y-AB)...');
    await sheetsClear(token, `${ENRICHED_TAB}!Y1:AB${newData.length + 1}`);
    console.log('  Cleared.');

    console.log('Done!');
  } else {
    console.log('(dry run — no changes written)');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
