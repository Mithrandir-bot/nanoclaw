#!/usr/bin/env npx ts-node
/**
 * fix-remaining.ts — Fix all remaining issues from diagnostic scan
 *
 * 1. Clear #ERROR! and #NAME? in Title (E) and Notes (P) — 3 contacts, 6 cells
 * 2. Clear truncated phone fragments (5 rows with partial digits)
 * 3. Decode HTML entities in row 5680 (&#39; → ')
 * 4. Delete 2 completely empty rows (3994, 4155)
 * 5. Fix invalid email with double-dot (row 6474)
 * 6. Clean up Priority column — remove stale numeric values
 * 7. Clear remaining "United States" country-only locations (9 rows)
 * 8. Clear "Pending" values in column U (Phone Verified) — these are stale placeholders
 *
 * Run:  npx ts-node scripts/fix-remaining.ts [--dry-run]
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

const SHEET_ID = process.env.GOOGLE_CONTACTS_SHEET_ID || '1znTsVDzQe9m8xJHxlasy4uMjKtXwzYSn31TPWekOJPA';
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

async function sheetsBatchDelete(token: string, sheetGid: number, rowIndices: number[]): Promise<void> {
  // Delete rows from bottom to top so indices don't shift
  const sorted = [...rowIndices].sort((a, b) => b - a);
  const requests = sorted.map(idx => ({
    deleteDimension: {
      range: { sheetId: sheetGid, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 },
    },
  }));
  const body = JSON.stringify({ requests });
  await httpsRequest({
    hostname: 'sheets.googleapis.com',
    path: `/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body).toString(),
    },
  }, body);
}

// Column indices
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

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
}

function properCase(s: string): string {
  if (!s) return s;
  return s.split(/(\s+)/).map(word => {
    if (/^\s+$/.test(word)) return word;
    // Keep short prepositions lowercase unless first word
    if (/^(de|del|di|da|la|le|van|von|el|al|bin)$/i.test(word)) return word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join('');
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');

  const token = await getAccessToken();
  console.log('Reading sheet...');
  const rawRows = await sheetsGet(token, `${ENRICHED_TAB}!A2:AB`);
  const data = rawRows.map(r => [...r, ...Array(28).fill('')].slice(0, 28));
  console.log(`${data.length} rows\n`);

  let changes = 0;
  const emptyRows: number[] = []; // 0-indexed row indices (in sheet terms, row index = i + 1 for header)

  for (let i = 0; i < data.length; i++) {
    const rowNum = i + 2;
    const name = cell(data[i], COL.FULL) || `${cell(data[i], COL.FIRST)} ${cell(data[i], COL.LAST)}`.trim();

    // ── FIX 1: Clear #ERROR! and #NAME? in any column ────────────────────
    for (let col = 0; col < 28; col++) {
      const val = cell(data[i], col);
      if (val === '#ERROR!' || val === '#NAME?' || val === '#REF!' || val === '#VALUE!' || val === '#N/A') {
        const colLetter = String.fromCharCode(65 + col);
        console.log(`  CLEAR ${colLetter} Row ${rowNum}: "${name}" — ${val}`);
        data[i][col] = '';
        changes++;
      }
    }

    // ── FIX 2: Clear truncated phone fragments ───────────────────────────
    for (const colIdx of [COL.BIZ_PHONE, COL.MOBILE, COL.SEC_PHONE]) {
      const phone = cell(data[i], colIdx);
      if (!phone) continue;
      const digits = phone.replace(/\D/g, '');
      // Phone fragments: too few digits, or starts with dash (truncated)
      if (digits.length < 7 || /^-\d+$/.test(phone.trim())) {
        const colLetter = String.fromCharCode(65 + colIdx);
        console.log(`  CLEAR ${colLetter} Row ${rowNum}: "${name}" — truncated phone "${phone}"`);
        data[i][colIdx] = '';
        changes++;
      }
    }

    // ── FIX 3: Decode HTML entities ──────────────────────────────────────
    for (let col = 0; col < 28; col++) {
      const val = data[i][col];
      if (/&#\d+;|&amp;|&lt;|&gt;/.test(val)) {
        const decoded = decodeHtmlEntities(val);
        if (decoded !== val) {
          const colLetter = String.fromCharCode(65 + col);
          console.log(`  DECODE ${colLetter} Row ${rowNum}: "${val}" → "${decoded}"`);
          data[i][col] = decoded;
          changes++;
        }
      }
    }

    // ── FIX 4: Mark completely empty rows for deletion ───────────────────
    const hasAnyData = data[i].some(v => v.trim() !== '');
    if (!hasAnyData) {
      console.log(`  DELETE Row ${rowNum}: completely empty`);
      emptyRows.push(i + 1); // sheet row index (0-based, +1 for header row)
    }
    // Also check for rows with no name AND no email AND no company
    if (!cell(data[i], COL.FIRST) && !cell(data[i], COL.LAST) && !cell(data[i], COL.FULL) && !cell(data[i], COL.EMAIL)) {
      const hasPhone = cell(data[i], COL.MOBILE) || cell(data[i], COL.BIZ_PHONE);
      if (!hasPhone) {
        // Check if row has any meaningful data at all
        const meaningful = [COL.COMPANY, COL.TITLE, COL.LINKEDIN, COL.CUR_COMPANY, COL.NOTES].some(c => cell(data[i], c));
        if (!meaningful && hasAnyData) {
          console.log(`  DELETE Row ${rowNum}: no name, email, phone, or meaningful data`);
          emptyRows.push(i + 1);
        }
      }
    }

    // ── FIX 5: Fix invalid email with double-dot ─────────────────────────
    const email = cell(data[i], COL.EMAIL);
    if (email && /\.\./.test(email)) {
      const fixed = email.replace(/\.\.+/g, '.');
      console.log(`  FIX EMAIL Row ${rowNum}: "${name}" — "${email}" → "${fixed}"`);
      data[i][COL.EMAIL] = fixed;
      changes++;
    }

    // ── FIX 6: Clean up Priority column ──────────────────────────────────
    const priority = cell(data[i], COL.PRIORITY);
    if (priority && /^\d+$/.test(priority)) {
      // Stale numeric values — these are not valid priorities
      console.log(`  CLEAR O Row ${rowNum}: "${name}" — stale numeric priority "${priority}"`);
      data[i][COL.PRIORITY] = '';
      changes++;
    }

    // ── FIX 7: Clear country-only locations ──────────────────────────────
    const location = cell(data[i], COL.LOCATION);
    if (location === 'United States' || location === 'US' || location === 'USA') {
      console.log(`  CLEAR M Row ${rowNum}: "${name}" — country-only location "${location}"`);
      data[i][COL.LOCATION] = '';
      changes++;
    }

    // ── FIX 8: Clear "Pending" in Phone Verified (U) ────────────────────
    if (cell(data[i], COL.PHONE_VERIFIED) === 'Pending') {
      console.log(`  CLEAR U Row ${rowNum}: "${name}" — stale "Pending" phone verified`);
      data[i][COL.PHONE_VERIFIED] = '';
      changes++;
    }

    // ── FIX 9: Fix names — HTML-decoded names need proper case ───────────
    // Fix all-lowercase first/last names
    const first = data[i][COL.FIRST].trim();
    const last = data[i][COL.LAST].trim();
    if (first && first.length > 2 && first === first.toLowerCase() && /^[a-z]/.test(first)) {
      // Skip if it contains special chars that indicate intentional casing
      if (!/[®™]/.test(first)) {
        const fixed = properCase(first);
        if (fixed !== first) {
          console.log(`  CASE A Row ${rowNum}: "${first}" → "${fixed}"`);
          data[i][COL.FIRST] = fixed;
          changes++;
        }
      }
    }
    if (last && last.length > 2 && last === last.toLowerCase() && /^[a-z]/.test(last)) {
      if (!/[®™]/.test(last)) {
        const fixed = properCase(last);
        if (fixed !== last) {
          console.log(`  CASE B Row ${rowNum}: "${last}" → "${fixed}"`);
          data[i][COL.LAST] = fixed;
          changes++;
        }
      }
    }

    // Fix ALL CAPS names
    if (first && first.length > 2 && first === first.toUpperCase() && /^[A-Z]{3,}$/.test(first)) {
      const fixed = properCase(first);
      console.log(`  CASE A Row ${rowNum}: "${first}" → "${fixed}"`);
      data[i][COL.FIRST] = fixed;
      changes++;
    }
    if (last && last.length > 2 && last === last.toUpperCase() && /^[A-Z]{3,}$/.test(last)) {
      const fixed = properCase(last);
      console.log(`  CASE B Row ${rowNum}: "${last}" → "${fixed}"`);
      data[i][COL.LAST] = fixed;
      changes++;
    }

    // Rebuild Full Name (C) if First+Last changed
    const newFirst = cell(data[i], COL.FIRST);
    const newLast = cell(data[i], COL.LAST);
    const fullName = cell(data[i], COL.FULL);
    if (newFirst && newLast) {
      const expected = `${newFirst} ${newLast}`;
      if (fullName && fullName !== expected) {
        // Only update if the old full name was just first+last (not a different format)
        const oldExpected = `${first} ${last}`;
        if (fullName === oldExpected || fullName.toLowerCase() === oldExpected.toLowerCase()) {
          data[i][COL.FULL] = expected;
          // Don't count as a separate change — it's part of the name fix
        }
      }
    }

    // ── FIX 10: Clean special Unicode chars from names ───────────────────
    // Some names have invisible Unicode markers (e.g., ‎ = LTR mark, ₿)
    for (const colIdx of [COL.FIRST, COL.LAST, COL.FULL]) {
      const val = data[i][colIdx];
      if (!val) continue;
      // Remove zero-width and directional markers
      const cleaned = val.replace(/[\u200E\u200F\u200B\u200C\u200D\uFEFF]/g, '').trim();
      if (cleaned !== val) {
        const colLetter = String.fromCharCode(65 + colIdx);
        console.log(`  CLEAN ${colLetter} Row ${rowNum}: removed invisible Unicode chars`);
        data[i][colIdx] = cleaned;
        changes++;
      }
    }
  }

  // ── FIX 11: Fix header — "Last Enriched Date" → "Last Enriched" ───────
  // (read header separately)
  const headerRows = await sheetsGet(token, `${ENRICHED_TAB}!A1:AB1`);
  const header = headerRows[0] || [];
  let headerChanged = false;
  if ((header[22] || '').trim() === 'Last Enriched Date') {
    console.log(`\n  FIX HEADER W1: "Last Enriched Date" → "Last Enriched"`);
    header[22] = 'Last Enriched';
    headerChanged = true;
  }

  // Deduplicate empty rows list
  const uniqueEmptyRows = [...new Set(emptyRows)];

  console.log(`\n════════════════════════════════════════`);
  console.log('SUMMARY');
  console.log('════════════════════════════════════════');
  console.log(`Cell fixes: ${changes}`);
  console.log(`Rows to delete: ${uniqueEmptyRows.length}`);
  console.log(`Header fix: ${headerChanged ? 'yes' : 'no'}`);
  console.log('════════════════════════════════════════');

  if (!DRY_RUN) {
    // Write header if changed
    if (headerChanged) {
      console.log('\nWriting header fix...');
      await sheetsUpdate(token, `${ENRICHED_TAB}!A1:AB1`, [header]);
    }

    // Write data changes
    if (changes > 0) {
      console.log('Writing data fixes...');
      const BATCH_SIZE = 1000;
      for (let start = 0; start < data.length; start += BATCH_SIZE) {
        const end = Math.min(start + BATCH_SIZE, data.length);
        const range = `${ENRICHED_TAB}!A${start + 2}:AB${end + 1}`;
        await sheetsUpdate(token, range, data.slice(start, end));
        console.log(`  Written rows ${start + 2}–${end + 1}`);
      }
    }

    // Delete empty rows (after writing, since deletion shifts indices)
    if (uniqueEmptyRows.length > 0) {
      console.log(`Deleting ${uniqueEmptyRows.length} empty rows...`);
      // Need the sheet's gid for batchUpdate
      const metaRaw = await httpsRequest({
        hostname: 'sheets.googleapis.com',
        path: `/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`,
        headers: { Authorization: `Bearer ${token}` },
      });
      const meta = JSON.parse(metaRaw);
      const enrichedSheet = meta.sheets.find((s: any) => s.properties.title === ENRICHED_TAB);
      if (enrichedSheet) {
        const gid = enrichedSheet.properties.sheetId;
        await sheetsBatchDelete(token, gid, uniqueEmptyRows);
        console.log('  Empty rows deleted.');
      }
    }

    console.log('Done!');
  } else {
    console.log('\n(dry run — no changes written)');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
