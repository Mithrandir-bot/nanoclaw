#!/usr/bin/env npx ts-node
/**
 * merge-company-title.ts — Merge D/S (Company) and E/T (Title) columns
 *
 * 1. Job-change rows (D≠S, genuinely different): preserve "Previous: E at D" in Notes
 * 2. D-only rows (S empty): copy D → S
 * 3. WE codes in E: move to Notes as "WE Code: xxx", clear E
 * 4. Subset/variant rows: S is the better version, no action needed
 * 5. Fix 2 OCR errors in S
 * 6. For all rows: E becomes cleared (real titles live in T)
 *
 * Run:  npx ts-node scripts/merge-company-title.ts [--dry-run]
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

const COL = {
  FIRST: 0, LAST: 1, FULL: 2, COMPANY: 3, TITLE: 4, CATEGORY: 5,
  RELATIONSHIP: 6, SOURCE: 7, EMAIL: 8, BIZ_PHONE: 9, MOBILE: 10,
  SEC_PHONE: 11, LOCATION: 12, DATE_ADDED: 13, PRIORITY: 14,
  NOTES: 15, LINKEDIN: 16, TWITTER: 17, CUR_COMPANY: 18, CUR_TITLE: 19,
  PHONE_VERIFIED: 20, ENRICH_STATUS: 21, LAST_ENRICHED: 22,
  ENRICH_SOURCE: 23, CONFIDENCE: 24, DATA_QUALITY: 25,
  ENRICH_NOTES: 26, TAGS: 27,
};

function cell(row: string[], col: number): string {
  return (row[col] || '').trim();
}

function isWECode(title: string): boolean {
  return /^(Banker|Client|Trustee|Lawyer|Fund Rep|Rm|Svp)([_\-]|$)/i.test(title);
}

function isGenuinelyDifferent(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a.toLowerCase() === b.toLowerCase()) return false;
  const aClean = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const bClean = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (aClean.includes(bClean) || bClean.includes(aClean)) return false;
  const aFirst = a.split(/[\s,]+/)[0].toLowerCase();
  const bFirst = b.split(/[\s,]+/)[0].toLowerCase();
  if (aFirst === bFirst && aFirst.length > 2) return false;
  return true;
}

function appendToNotes(existing: string, addition: string): string {
  if (!existing) return addition;
  if (existing.includes(addition)) return existing; // avoid duplicates
  return `${existing}\n${addition}`;
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');

  const token = await getAccessToken();
  console.log('Reading sheet...');
  const rawRows = await sheetsGet(token, `${ENRICHED_TAB}!A2:AB`);
  const data = rawRows.map(r => [...r, ...Array(28).fill('')].slice(0, 28));
  console.log(`${data.length} rows\n`);

  let dCopiedToS = 0;
  let weCodesMoved = 0;
  let jobHistoryPreserved = 0;
  let ocrFixed = 0;
  let eTitlesMoved = 0;

  for (let i = 0; i < data.length; i++) {
    const rowNum = i + 2;
    const name = cell(data[i], COL.FULL) || `${cell(data[i], COL.FIRST)} ${cell(data[i], COL.LAST)}`.trim();
    const d = cell(data[i], COL.COMPANY);
    const s = cell(data[i], COL.CUR_COMPANY);
    const e = cell(data[i], COL.TITLE);
    const t = cell(data[i], COL.CUR_TITLE);
    const notes = data[i][COL.NOTES] || '';

    // ── Fix OCR errors in S ──────────────────────────────────────────────
    if (s === 'Deal' && d === 'Deel') {
      console.log(`  FIX OCR S Row ${rowNum}: "${name}" — "Deal" → "Deel"`);
      data[i][COL.CUR_COMPANY] = 'Deel';
      ocrFixed++;
    }
    if (s === 'CreaseetStreet' && d === 'Crowdstreet') {
      console.log(`  FIX OCR S Row ${rowNum}: "${name}" — "CreaseetStreet" → "CrowdStreet"`);
      data[i][COL.CUR_COMPANY] = 'CrowdStreet';
      ocrFixed++;
    }

    // ── D-only rows: copy D → S ──────────────────────────────────────────
    if (d && !s) {
      console.log(`  COPY D→S Row ${rowNum}: "${name}" — "${d}"`);
      data[i][COL.CUR_COMPANY] = d;
      dCopiedToS++;
    }

    // ── Job changes: preserve history in Notes ───────────────────────────
    // Only for genuinely different companies (after OCR fix)
    const sNow = cell(data[i], COL.CUR_COMPANY);
    if (d && sNow && isGenuinelyDifferent(d, sNow)) {
      // Build history string
      let prevTitle = '';
      if (e && !isWECode(e)) {
        prevTitle = e;
      }

      if (prevTitle) {
        const history = `Previous: ${prevTitle} at ${d}`;
        console.log(`  HISTORY Row ${rowNum}: "${name}" — "${history}"`);
        data[i][COL.NOTES] = appendToNotes(data[i][COL.NOTES], history);
        jobHistoryPreserved++;
      } else {
        // No real title, just preserve company
        const history = `Previous company: ${d}`;
        console.log(`  HISTORY Row ${rowNum}: "${name}" — "${history}"`);
        data[i][COL.NOTES] = appendToNotes(data[i][COL.NOTES], history);
        jobHistoryPreserved++;
      }
    }

    // ── WE codes in E: move to Notes ─────────────────────────────────────
    if (e && isWECode(e)) {
      const codeNote = `WE Code: ${e}`;
      console.log(`  WE CODE Row ${rowNum}: "${name}" — E="${e}" → Notes`);
      data[i][COL.NOTES] = appendToNotes(data[i][COL.NOTES], codeNote);
      data[i][COL.TITLE] = '';
      weCodesMoved++;
    }

    // ── Non-WE titles in E where T exists and differs: move E to Notes ───
    // If E has a real title and T has a different real title, preserve E
    if (e && !isWECode(e) && t && e.toLowerCase() !== t.toLowerCase()) {
      // Check if E is substantively different from T (not just a subset)
      const eLow = e.toLowerCase().replace(/[^a-z0-9]/g, '');
      const tLow = t.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!eLow.includes(tLow) && !tLow.includes(eLow)) {
        // Genuinely different title — only preserve if it's meaningful
        // Skip if already preserved as part of job change history above
        if (!d || !sNow || !isGenuinelyDifferent(d, sNow)) {
          // Same company, different title = role change
          const titleHistory = `Previous title: ${e}`;
          if (!data[i][COL.NOTES].includes(titleHistory) && !data[i][COL.NOTES].includes(`Previous: ${e}`)) {
            console.log(`  TITLE HISTORY Row ${rowNum}: "${name}" — E="${e}" (T="${t}")`);
            data[i][COL.NOTES] = appendToNotes(data[i][COL.NOTES], titleHistory);
            eTitlesMoved++;
          }
        }
      }
    }

    // ── Copy T → E for all rows where T has data ─────────────────────────
    // After moving codes/history, E should reflect the current title
    const tNow = cell(data[i], COL.CUR_TITLE);
    if (tNow) {
      data[i][COL.TITLE] = tNow;
    }
    // If E still has something but T is empty, leave E as-is (it's the only title)
  }

  console.log(`\n════════════════════════════════════════`);
  console.log('SUMMARY');
  console.log('════════════════════════════════════════');
  console.log(`D copied to S (company preserved): ${dCopiedToS}`);
  console.log(`WE codes moved to Notes: ${weCodesMoved}`);
  console.log(`Job history preserved in Notes: ${jobHistoryPreserved}`);
  console.log(`Title changes preserved in Notes: ${eTitlesMoved}`);
  console.log(`OCR errors fixed: ${ocrFixed}`);
  console.log('════════════════════════════════════════');

  if (!DRY_RUN) {
    console.log('\nWriting changes to sheet...');
    const BATCH_SIZE = 1000;
    for (let start = 0; start < data.length; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE, data.length);
      const range = `${ENRICHED_TAB}!A${start + 2}:AB${end + 1}`;
      await sheetsUpdate(token, range, data.slice(start, end));
      console.log(`  Written rows ${start + 2}–${end + 1}`);
    }
    console.log('Done!');
  } else {
    console.log('\n(dry run — no changes written)');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
