#!/usr/bin/env npx ts-node
/**
 * fix-phones.ts — Re-import phone numbers from batch source data
 * and format columns K (Mobile) and J (Business Phone) with (xxx) xxx-xxxx format
 *
 * Run:  npx ts-node scripts/fix-phones.ts [--dry-run]
 */

import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';

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
const CONTACTS_DIR = '/root/nanoclaw/nanoclaw/groups/contacts';

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
  return JSON.parse(raw).access_token;
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

// ── Phone formatting ──────────────────────────────────────────────────────────

/**
 * Format a phone number to (xxx) xxx-xxxx for US numbers.
 * International numbers get +CC (xxx) xxx-xxxx or preserved as-is.
 * Returns the formatted string, or the original if not parseable.
 */
function formatPhone(raw: string): string {
  if (!raw || raw === '-' || raw === '#ERROR!') return '';

  const cleaned = raw.trim();

  // Handle extension separately
  let ext = '';
  const extMatch = cleaned.match(/\s*(?:ext\.?|x)\s*(\d+)\s*$/i);
  if (extMatch) {
    ext = ` ext. ${extMatch[1]}`;
  }
  const base = extMatch ? cleaned.slice(0, extMatch.index) : cleaned;

  // Strip all non-digit chars except leading +
  const hasPlus = base.startsWith('+');
  const digits = base.replace(/\D/g, '');

  if (!digits) return cleaned; // can't parse

  // 10-digit US number
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}${ext}`;
  }

  // 11-digit starting with 1 (US with country code)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}${ext}`;
  }

  // International: +CC then remaining digits
  if (hasPlus || digits.length > 11) {
    // Try common patterns
    // +44 (UK): +44 XXXX XXXXXX
    if (digits.startsWith('44') && digits.length >= 12) {
      return `+44 ${digits.slice(2, 6)} ${digits.slice(6)}${ext}`;
    }
    // +55 (Brazil): +55 (XX) XXXXX-XXXX
    if (digits.startsWith('55') && digits.length >= 12) {
      const area = digits.slice(2, 4);
      const num = digits.slice(4);
      return `+55 (${area}) ${num.slice(0, 5)}-${num.slice(5)}${ext}`;
    }
    // +54 (Argentina)
    if (digits.startsWith('54')) {
      return `+54 ${digits.slice(2)}${ext}`;
    }
    // Generic international: +CC remaining
    if (digits.length > 10) {
      // Assume 1-3 digit country code
      const cc = digits.startsWith('1') ? '1' : digits.slice(0, 2);
      const rest = digits.slice(cc.length);
      if (rest.length === 10) {
        return `+${cc} (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6)}${ext}`;
      }
      return `+${cc} ${rest}${ext}`;
    }

    // Short international
    return `+${digits}${ext}`;
  }

  // Fallback: return original cleaned
  return cleaned;
}

// ── Build phone lookup from source data ───────────────────────────────────────

function buildPhoneLookup(): Map<string, string> {
  const lookup = new Map<string, string>();

  // Batch 1 & 2: parse from Python scripts
  for (const file of ['import_blockfi_contacts.py', 'import_blockfi_batch2.py']) {
    const fpath = path.join(CONTACTS_DIR, file);
    if (!fs.existsSync(fpath)) continue;
    const content = fs.readFileSync(fpath, 'utf-8');

    // Match both orderings of email/phone in dict literals
    const re1 = /"email":\s*"([^"]*)"[^}]*"phone":\s*"([^"]*)"/g;
    const re2 = /"phone":\s*"([^"]*)"[^}]*"email":\s*"([^"]*)"/g;

    let match;
    while ((match = re1.exec(content)) !== null) {
      const [, email, phone] = match;
      if (phone && phone.trim() && phone.trim() !== '-') {
        lookup.set(email.toLowerCase().trim(), phone.trim());
      }
    }
    while ((match = re2.exec(content)) !== null) {
      const [, phone, email] = match;
      if (phone && phone.trim() && phone.trim() !== '-') {
        lookup.set(email.toLowerCase().trim(), phone.trim());
      }
    }
  }

  // Batches 3-5: JSON files
  for (const batch of [3, 4, 5]) {
    const fpath = path.join(CONTACTS_DIR, `blockfi_batch${batch}_contacts.json`);
    if (!fs.existsSync(fpath)) continue;
    const data: Array<{ email?: string; phone?: string }> = JSON.parse(fs.readFileSync(fpath, 'utf-8'));
    for (const d of data) {
      const email = (d.email || '').toLowerCase().trim();
      const phone = (d.phone || '').trim();
      if (email && phone && phone !== '-') {
        lookup.set(email, phone);
      }
    }
  }

  return lookup;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');

  // Build phone lookup
  const phoneLookup = buildPhoneLookup();
  console.log(`Phone lookup: ${phoneLookup.size} entries from source data\n`);

  const token = await getAccessToken();
  console.log('Reading sheet...');
  const rawRows = await sheetsGet(token, `${ENRICHED_TAB}!A2:AB`);
  const data = rawRows.map(r => [...r, ...Array(28).fill('')].slice(0, 28));
  console.log(`${data.length} rows\n`);

  // Column indices: J=9 (BizPhone), K=10 (Mobile), L=11 (SecPhone)
  let phonesRestored = 0;
  let phonesFormatted = 0;

  for (let i = 0; i < data.length; i++) {
    const email = (data[i][8] || '').toLowerCase().trim();
    const name = data[i][2] || `${data[i][0]} ${data[i][1]}`.trim();

    // Step 1: Re-import phones from source data for #ERROR! cells
    const mobileVal = data[i][10].trim();
    if (mobileVal === '#ERROR!' && email && phoneLookup.has(email)) {
      const sourcePhone = phoneLookup.get(email)!;
      const formatted = formatPhone(sourcePhone);
      console.log(`  RESTORE K Row ${i + 2}: "${name}" | #ERROR! → "${formatted}" (source: "${sourcePhone}")`);
      data[i][10] = formatted;
      phonesRestored++;
    }

    // Also check if BizPhone has #ERROR!
    const bizVal = data[i][9].trim();
    if (bizVal === '#ERROR!' && email && phoneLookup.has(email)) {
      // Only restore to biz phone if mobile already has data
      if (data[i][10].trim() && data[i][10].trim() !== '#ERROR!') {
        // Mobile already has data, put source phone in biz phone
        const sourcePhone = phoneLookup.get(email)!;
        const formatted = formatPhone(sourcePhone);
        console.log(`  RESTORE J Row ${i + 2}: "${name}" | #ERROR! → "${formatted}" (source: "${sourcePhone}")`);
        data[i][9] = formatted;
        phonesRestored++;
      } else if (!data[i][10].trim()) {
        // Mobile is empty, move restored phone there instead and clear biz
        const sourcePhone = phoneLookup.get(email)!;
        const formatted = formatPhone(sourcePhone);
        console.log(`  RESTORE K Row ${i + 2}: "${name}" | J=#ERROR!, moving to K → "${formatted}"`);
        data[i][10] = formatted;
        data[i][9] = '';
        phonesRestored++;
      }
    }

    // Step 2: Format existing phone numbers in J, K, L
    for (const col of [9, 10, 11]) {
      const colName = ['J', 'K', 'L'][col - 9];
      const val = data[i][col].trim();
      if (!val || val === 'Pending' || val === '#ERROR!') continue;

      const formatted = formatPhone(val);
      if (formatted !== val) {
        console.log(`  FORMAT ${colName} Row ${i + 2}: "${val}" → "${formatted}"`);
        data[i][col] = formatted;
        phonesFormatted++;
      }
    }
  }

  // Check remaining #ERROR! that couldn't be restored
  let unresolvedErrors = 0;
  for (let i = 0; i < data.length; i++) {
    for (const col of [9, 10, 11]) {
      if (data[i][col].trim() === '#ERROR!') {
        const name = data[i][2] || `${data[i][0]} ${data[i][1]}`.trim();
        const email = data[i][8] || '';
        console.log(`  UNRESOLVED ${['J', 'K', 'L'][col - 9]} Row ${i + 2}: "${name}" (email="${email}") — no source data found`);
        // Clear it since we can't recover the data
        data[i][col] = '';
        unresolvedErrors++;
      }
    }
  }

  console.log(`\n════════════════════════════════════════`);
  console.log('SUMMARY');
  console.log('════════════════════════════════════════');
  console.log(`Phones restored from source: ${phonesRestored}`);
  console.log(`Phones reformatted: ${phonesFormatted}`);
  console.log(`Unresolved #ERROR! cleared: ${unresolvedErrors}`);
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
