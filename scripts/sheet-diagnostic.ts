#!/usr/bin/env npx ts-node
/**
 * sheet-diagnostic.ts — Full sheet diagnostic scan
 *
 * Checks for: data quality, missing fields, formatting issues,
 * duplicate detection, email validation, CRM readiness, and layout analysis.
 *
 * Run:  npx ts-node scripts/sheet-diagnostic.ts
 */

import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';

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
const COL_LETTER: Record<number, string> = {};
for (const [k, v] of Object.entries(COL)) COL_LETTER[v] = String.fromCharCode(65 + v);

function cell(row: string[], col: number): string {
  return (row[col] || '').trim();
}

// ── Validators ───────────────────────────────────────────────────────────────

function isValidEmail(email: string): { valid: boolean; issue?: string } {
  if (!email) return { valid: true }; // empty is not invalid, just missing
  const trimmed = email.trim().toLowerCase();

  // Basic format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { valid: false, issue: 'invalid format' };
  }
  // Common typos
  if (trimmed.endsWith('.con')) return { valid: false, issue: 'likely .com typo (.con)' };
  if (trimmed.endsWith('.cim')) return { valid: false, issue: 'likely .com typo (.cim)' };
  if (trimmed.endsWith('.vom')) return { valid: false, issue: 'likely .com typo (.vom)' };
  if (/gmal\.com$/i.test(trimmed)) return { valid: false, issue: 'likely gmail.com typo (gmal.com)' };
  if (/gmial\.com$/i.test(trimmed)) return { valid: false, issue: 'likely gmail.com typo (gmial.com)' };
  if (/gmai\.com$/i.test(trimmed)) return { valid: false, issue: 'likely gmail.com typo (gmai.com)' };
  if (/gamil\.com$/i.test(trimmed)) return { valid: false, issue: 'likely gmail.com typo (gamil.com)' };
  if (/gnail\.com$/i.test(trimmed)) return { valid: false, issue: 'likely gmail.com typo (gnail.com)' };
  if (/yahooo?\.com$/i.test(trimmed) && !trimmed.endsWith('yahoo.com')) return { valid: false, issue: 'likely yahoo.com typo' };
  if (/hotmial\.com$/i.test(trimmed)) return { valid: false, issue: 'likely hotmail.com typo' };
  if (/outlok\.com$/i.test(trimmed)) return { valid: false, issue: 'likely outlook.com typo' };

  // Suspicious patterns
  if (/\.\.|@@|^\./.test(trimmed)) return { valid: false, issue: 'contains .. or @@ or starts with .' };
  if (/\s/.test(trimmed)) return { valid: false, issue: 'contains whitespace' };

  // Check for likely OCR errors in domain
  const domain = trimmed.split('@')[1];
  if (/^\d+\.\w+$/.test(domain)) return { valid: false, issue: 'domain looks numeric (OCR?)' };
  if (domain.length < 4) return { valid: false, issue: 'domain too short' };

  // Known throwaway domains
  const throwaway = ['mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email', 'yopmail.com'];
  if (throwaway.includes(domain)) return { valid: false, issue: 'throwaway domain' };

  return { valid: true };
}

function isValidPhone(phone: string): { valid: boolean; issue?: string } {
  if (!phone) return { valid: true };
  if (phone === 'Pending' || phone === '#ERROR!') return { valid: false, issue: phone };
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return { valid: false, issue: `too few digits (${digits.length})` };
  if (digits.length > 15) return { valid: false, issue: `too many digits (${digits.length})` };
  // Check for obviously wrong patterns like all same digit
  if (/^(\d)\1+$/.test(digits)) return { valid: false, issue: 'all same digit' };
  // Check formatting — should be (xxx) xxx-xxxx for US
  if (digits.length === 10 && !/^\(\d{3}\) \d{3}-\d{4}/.test(phone)) {
    return { valid: false, issue: 'US number not in (xxx) xxx-xxxx format' };
  }
  return { valid: true };
}

function isValidLinkedIn(url: string): { valid: boolean; issue?: string } {
  if (!url) return { valid: true };
  if (!/^https?:\/\/(www\.)?linkedin\.com\/in\//i.test(url)) {
    if (/linkedin\.com/i.test(url)) return { valid: false, issue: 'LinkedIn URL not a profile link' };
    return { valid: false, issue: 'not a LinkedIn URL' };
  }
  return { valid: true };
}

function isValidDate(date: string): boolean {
  if (!date) return true;
  // Expect YYYY-MM-DD or MM/DD/YYYY or similar
  return /^\d{4}-\d{2}-\d{2}$/.test(date) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(date) || /^\d{4}\/\d{2}\/\d{2}$/.test(date);
}

// ── Source data loaders ──────────────────────────────────────────────────────

function loadSourceEmails(): Set<string> {
  const emails = new Set<string>();

  // Python batch files
  for (const file of ['import_blockfi_contacts.py', 'import_blockfi_batch2.py', 'import_blockfi_batch3.py',
    'import_blockfi_batch4.py', 'import_blockfi_batch5.py', 'import_blockfi_batch6.py']) {
    const fpath = path.join(CONTACTS_DIR, file);
    if (!fs.existsSync(fpath)) continue;
    const content = fs.readFileSync(fpath, 'utf-8');
    const re = /"email":\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      if (m[1].trim()) emails.add(m[1].trim().toLowerCase());
    }
  }

  // JSON batch files
  for (const batch of [3, 4, 5]) {
    const fpath = path.join(CONTACTS_DIR, `blockfi_batch${batch}_contacts.json`);
    if (!fs.existsSync(fpath)) continue;
    const data: Array<{ email?: string }> = JSON.parse(fs.readFileSync(fpath, 'utf-8'));
    for (const d of data) {
      if (d.email) emails.add(d.email.trim().toLowerCase());
    }
  }

  // LinkedIn connections
  const liPath = path.join(CONTACTS_DIR, 'linkedin_connections_parsed.json');
  if (fs.existsSync(liPath)) {
    const data: Array<{ email?: string; Email?: string }> = JSON.parse(fs.readFileSync(liPath, 'utf-8'));
    for (const d of data) {
      const e = (d.email || d.Email || '').trim().toLowerCase();
      if (e) emails.add(e);
    }
  }

  // Ayco contacts
  const aycoPath = path.join(CONTACTS_DIR, 'ayco_contacts.json');
  if (fs.existsSync(aycoPath)) {
    const data: Array<{ email?: string }> = JSON.parse(fs.readFileSync(aycoPath, 'utf-8'));
    for (const d of data) {
      if (d.email) emails.add(d.email.trim().toLowerCase());
    }
  }

  return emails;
}

function loadSourcePhones(): Map<string, string> {
  const phones = new Map<string, string>();
  for (const file of ['import_blockfi_contacts.py', 'import_blockfi_batch2.py']) {
    const fpath = path.join(CONTACTS_DIR, file);
    if (!fs.existsSync(fpath)) continue;
    const content = fs.readFileSync(fpath, 'utf-8');
    const re1 = /"email":\s*"([^"]*)"[^}]*"phone":\s*"([^"]*)"/g;
    const re2 = /"phone":\s*"([^"]*)"[^}]*"email":\s*"([^"]*)"/g;
    let m;
    while ((m = re1.exec(content)) !== null) {
      if (m[2].trim() && m[2].trim() !== '-') phones.set(m[1].toLowerCase().trim(), m[2].trim());
    }
    while ((m = re2.exec(content)) !== null) {
      if (m[1].trim() && m[1].trim() !== '-') phones.set(m[2].toLowerCase().trim(), m[1].trim());
    }
  }
  for (const batch of [3, 4, 5]) {
    const fpath = path.join(CONTACTS_DIR, `blockfi_batch${batch}_contacts.json`);
    if (!fs.existsSync(fpath)) continue;
    const data: Array<{ email?: string; phone?: string }> = JSON.parse(fs.readFileSync(fpath, 'utf-8'));
    for (const d of data) {
      if (d.email && d.phone && d.phone.trim() !== '-') phones.set(d.email.toLowerCase().trim(), d.phone.trim());
    }
  }
  return phones;
}

// ── Main diagnostic ──────────────────────────────────────────────────────────

async function main() {
  const out: string[] = [];
  const log = (s: string) => { console.log(s); out.push(s); };

  log('╔══════════════════════════════════════════════════════════════════╗');
  log('║              FULL SHEET DIAGNOSTIC REPORT                      ║');
  log('║              ' + new Date().toISOString().slice(0, 19) + '                          ║');
  log('╚══════════════════════════════════════════════════════════════════╝\n');

  const token = await getAccessToken();
  log('Reading sheet...');
  const headerRow = await sheetsGet(token, `${ENRICHED_TAB}!A1:AB1`);
  const rawRows = await sheetsGet(token, `${ENRICHED_TAB}!A2:AB`);
  const data = rawRows.map(r => [...r, ...Array(28).fill('')].slice(0, 28));
  log(`Total rows: ${data.length}\n`);

  // ── 1. HEADER VALIDATION ──────────────────────────────────────────────────
  log('═══════════════════════════════════════════════════════════════════');
  log('1. HEADER / COLUMN LAYOUT VALIDATION');
  log('═══════════════════════════════════════════════════════════════════');

  const expectedHeaders = [
    'First Name', 'Last Name', 'Full Name', 'Company', 'Title', 'Category',
    'Relationship', 'Source', 'Email', 'Business Phone', 'Mobile', 'Secondary Phone',
    'Location', 'Date Added', 'Priority', 'Notes', 'LinkedIn URL', 'Twitter URL',
    'Current Company', 'Current Title', 'Phone (Verified)', 'Enrichment Status',
    'Last Enriched', 'Enrichment Source', 'Confidence Score', 'Data Quality',
    'Enrichment Notes', 'Tags',
  ];

  const headers = headerRow[0] || [];
  let headerIssues = 0;
  for (let i = 0; i < 28; i++) {
    const actual = (headers[i] || '').trim();
    const expected = expectedHeaders[i];
    if (actual !== expected) {
      log(`  MISMATCH Col ${String.fromCharCode(65 + i)}: expected "${expected}", got "${actual}"`);
      headerIssues++;
    }
  }
  if (headerIssues === 0) log('  All 28 column headers match expected layout.');
  log('');

  // ── 2. COMPLETENESS ANALYSIS ──────────────────────────────────────────────
  log('═══════════════════════════════════════════════════════════════════');
  log('2. FIELD COMPLETENESS ANALYSIS');
  log('═══════════════════════════════════════════════════════════════════');

  const fieldCounts: Record<string, number> = {};
  const fieldNames = expectedHeaders;
  for (let col = 0; col < 28; col++) {
    let count = 0;
    for (const row of data) {
      if (cell(row, col)) count++;
    }
    fieldCounts[fieldNames[col]] = count;
  }

  log('  Column              | Populated |   Empty | Fill Rate');
  log('  ────────────────────┼───────────┼─────────┼──────────');
  for (let col = 0; col < 28; col++) {
    const name = fieldNames[col].padEnd(20);
    const filled = fieldCounts[fieldNames[col]];
    const empty = data.length - filled;
    const pct = ((filled / data.length) * 100).toFixed(1);
    log(`  ${name} | ${String(filled).padStart(9)} | ${String(empty).padStart(7)} | ${pct.padStart(5)}%`);
  }
  log('');

  // ── 3. CRITICAL FIELD ISSUES ──────────────────────────────────────────────
  log('═══════════════════════════════════════════════════════════════════');
  log('3. CRITICAL FIELD ISSUES (names, email, company)');
  log('═══════════════════════════════════════════════════════════════════');

  const issues: { row: number; name: string; col: string; issue: string; value: string }[] = [];

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const rowNum = i + 2;
    const first = cell(r, COL.FIRST);
    const last = cell(r, COL.LAST);
    const full = cell(r, COL.FULL);
    const name = full || `${first} ${last}`.trim();

    // Missing name entirely
    if (!first && !last && !full) {
      issues.push({ row: rowNum, name: '(empty)', col: 'A/B/C', issue: 'NO NAME — completely empty row?', value: `Email: ${cell(r, COL.EMAIL)}` });
    }
    // First name missing but last exists
    else if (!first && last) {
      issues.push({ row: rowNum, name, col: 'A', issue: 'Missing first name', value: `Last: ${last}` });
    }
    // Last name missing but first exists
    else if (first && !last) {
      issues.push({ row: rowNum, name, col: 'B', issue: 'Missing last name', value: `First: ${first}` });
    }

    // Full name doesn't match First + Last
    if (first && last && full) {
      const expected = `${first} ${last}`;
      if (full !== expected && full.toLowerCase() !== expected.toLowerCase()) {
        // Only flag if significantly different (not just case)
        const fullNorm = full.toLowerCase().replace(/[^a-z]/g, '');
        const expNorm = expected.toLowerCase().replace(/[^a-z]/g, '');
        if (fullNorm !== expNorm) {
          issues.push({ row: rowNum, name, col: 'C', issue: 'Full name mismatch', value: `"${full}" vs "${expected}"` });
        }
      }
    }

    // Name has remaining credentials
    if (first && /,\s*(CFA|MBA|CPA|CFP|PhD|Esq|JD|CAIA|FCA|PMP)/i.test(first)) {
      issues.push({ row: rowNum, name, col: 'A', issue: 'Credentials in first name', value: first });
    }
    if (last && /,\s*(CFA|MBA|CPA|CFP|PhD|Esq|JD|CAIA|FCA|PMP)/i.test(last)) {
      issues.push({ row: rowNum, name, col: 'B', issue: 'Credentials in last name', value: last });
    }

    // Name has ALL CAPS or all lowercase (except single-word names)
    if (first && first.length > 2 && first === first.toUpperCase() && /[A-Z]/.test(first)) {
      issues.push({ row: rowNum, name, col: 'A', issue: 'ALL CAPS first name', value: first });
    }
    if (last && last.length > 2 && last === last.toUpperCase() && /[A-Z]/.test(last)) {
      issues.push({ row: rowNum, name, col: 'B', issue: 'ALL CAPS last name', value: last });
    }
    if (first && first.length > 2 && first === first.toLowerCase()) {
      issues.push({ row: rowNum, name, col: 'A', issue: 'all lowercase first name', value: first });
    }
    if (last && last.length > 2 && last === last.toLowerCase()) {
      issues.push({ row: rowNum, name, col: 'B', issue: 'all lowercase last name', value: last });
    }

    // Email with no name
    const email = cell(r, COL.EMAIL);
    if (email && !first && !last) {
      issues.push({ row: rowNum, name: '(empty)', col: 'I', issue: 'Email exists but no name', value: email });
    }

    // No email AND no phone AND no linkedin — orphan record
    const mobile = cell(r, COL.MOBILE);
    const bizPhone = cell(r, COL.BIZ_PHONE);
    const linkedin = cell(r, COL.LINKEDIN);
    if (!email && !mobile && !bizPhone && !linkedin && name !== '(empty)') {
      issues.push({ row: rowNum, name, col: 'I/K/Q', issue: 'No email, phone, or LinkedIn — uncontactable', value: '' });
    }

    // Company but no title, or title but no company
    const company = cell(r, COL.COMPANY);
    const title = cell(r, COL.TITLE);
    // Not flagging this — too noisy

    // #ERROR! values in any cell
    for (let col = 0; col < 28; col++) {
      if (cell(r, col) === '#ERROR!') {
        issues.push({ row: rowNum, name, col: COL_LETTER[col], issue: '#ERROR! value', value: `Col ${COL_LETTER[col]}` });
      }
    }

    // "Pending" values
    for (let col = 0; col < 28; col++) {
      if (cell(r, col) === 'Pending') {
        issues.push({ row: rowNum, name, col: COL_LETTER[col], issue: 'Pending value', value: `Col ${COL_LETTER[col]}` });
      }
    }
  }

  // Print issues grouped by type
  const issuesByType = new Map<string, typeof issues>();
  for (const issue of issues) {
    const key = issue.issue;
    if (!issuesByType.has(key)) issuesByType.set(key, []);
    issuesByType.get(key)!.push(issue);
  }

  for (const [type, items] of issuesByType) {
    log(`\n  [${type}] — ${items.length} occurrences`);
    const show = items.slice(0, 10);
    for (const item of show) {
      log(`    Row ${item.row}: "${item.name}" | ${item.value}`);
    }
    if (items.length > 10) log(`    ... and ${items.length - 10} more`);
  }
  log('');

  // ── 4. EMAIL VALIDATION ───────────────────────────────────────────────────
  log('═══════════════════════════════════════════════════════════════════');
  log('4. EMAIL VALIDATION');
  log('═══════════════════════════════════════════════════════════════════');

  const emailIssues: { row: number; name: string; email: string; issue: string }[] = [];
  const emailSet = new Map<string, number[]>(); // email → rows

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const email = cell(r, COL.EMAIL);
    const name = cell(r, COL.FULL) || `${cell(r, COL.FIRST)} ${cell(r, COL.LAST)}`.trim();

    if (email) {
      const { valid, issue } = isValidEmail(email);
      if (!valid) {
        emailIssues.push({ row: i + 2, name, email, issue: issue! });
      }

      const norm = email.toLowerCase();
      if (!emailSet.has(norm)) emailSet.set(norm, []);
      emailSet.get(norm)!.push(i + 2);
    }
  }

  log(`\n  Invalid emails: ${emailIssues.length}`);
  for (const e of emailIssues.slice(0, 20)) {
    log(`    Row ${e.row}: "${e.name}" | ${e.email} — ${e.issue}`);
  }
  if (emailIssues.length > 20) log(`    ... and ${emailIssues.length - 20} more`);

  // Duplicate emails
  const dupEmails = [...emailSet.entries()].filter(([, rows]) => rows.length > 1);
  log(`\n  Duplicate emails: ${dupEmails.length}`);
  for (const [email, rows] of dupEmails.slice(0, 20)) {
    const names = rows.map(r => {
      const d = data[r - 2];
      return cell(d, COL.FULL) || `${cell(d, COL.FIRST)} ${cell(d, COL.LAST)}`.trim();
    });
    log(`    "${email}" — rows ${rows.join(', ')} (${names.join(' / ')})`);
  }
  if (dupEmails.length > 20) log(`    ... and ${dupEmails.length - 20} more`);

  // Emails with no name
  let emailNoName = 0;
  for (let i = 0; i < data.length; i++) {
    if (cell(data[i], COL.EMAIL) && !cell(data[i], COL.FIRST) && !cell(data[i], COL.LAST)) emailNoName++;
  }
  log(`  Emails with no associated name: ${emailNoName}`);
  log('');

  // ── 5. PHONE VALIDATION ──────────────────────────────────────────────────
  log('═══════════════════════════════════════════════════════════════════');
  log('5. PHONE NUMBER VALIDATION');
  log('═══════════════════════════════════════════════════════════════════');

  const phoneIssues: { row: number; name: string; col: string; phone: string; issue: string }[] = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const name = cell(r, COL.FULL) || `${cell(r, COL.FIRST)} ${cell(r, COL.LAST)}`.trim();
    for (const [colIdx, colName] of [[COL.BIZ_PHONE, 'J'], [COL.MOBILE, 'K'], [COL.SEC_PHONE, 'L']] as [number, string][]) {
      const phone = cell(r, colIdx);
      if (phone) {
        const { valid, issue } = isValidPhone(phone);
        if (!valid) {
          phoneIssues.push({ row: i + 2, name, col: colName, phone, issue: issue! });
        }
      }
    }
  }

  // Count phones by column
  let jCount = 0, kCount = 0, lCount = 0;
  for (const r of data) {
    if (cell(r, COL.BIZ_PHONE)) jCount++;
    if (cell(r, COL.MOBILE)) kCount++;
    if (cell(r, COL.SEC_PHONE)) lCount++;
  }
  log(`  Business Phone (J): ${jCount} populated`);
  log(`  Mobile (K): ${kCount} populated`);
  log(`  Secondary Phone (L): ${lCount} populated`);
  log(`  Phone issues: ${phoneIssues.length}`);
  for (const p of phoneIssues.slice(0, 20)) {
    log(`    Row ${p.row} Col ${p.col}: "${p.name}" | "${p.phone}" — ${p.issue}`);
  }
  if (phoneIssues.length > 20) log(`    ... and ${phoneIssues.length - 20} more`);
  log('');

  // ── 6. DUPLICATE NAME DETECTION ──────────────────────────────────────────
  log('═══════════════════════════════════════════════════════════════════');
  log('6. POTENTIAL DUPLICATE NAMES');
  log('═══════════════════════════════════════════════════════════════════');

  const nameMap = new Map<string, number[]>();
  for (let i = 0; i < data.length; i++) {
    const first = cell(data[i], COL.FIRST).toLowerCase();
    const last = cell(data[i], COL.LAST).toLowerCase();
    if (!first || !last) continue;
    const key = `${first}|${last}`;
    if (!nameMap.has(key)) nameMap.set(key, []);
    nameMap.get(key)!.push(i + 2);
  }

  const dupNames = [...nameMap.entries()].filter(([, rows]) => rows.length > 1);
  log(`  Duplicate name pairs: ${dupNames.length}`);
  for (const [name, rows] of dupNames.slice(0, 20)) {
    const [f, l] = name.split('|');
    const emails = rows.map(r => cell(data[r - 2], COL.EMAIL) || '(no email)');
    log(`    "${f} ${l}" — rows ${rows.join(', ')} | emails: ${emails.join(', ')}`);
  }
  if (dupNames.length > 20) log(`    ... and ${dupNames.length - 20} more`);
  log('');

  // ── 7. SOURCE DATA COVERAGE ───────────────────────────────────────────────
  log('═══════════════════════════════════════════════════════════════════');
  log('7. SOURCE DATA COVERAGE');
  log('═══════════════════════════════════════════════════════════════════');

  const sourceEmails = loadSourceEmails();
  const sourcePhones = loadSourcePhones();
  const sheetEmails = new Set<string>();
  for (const r of data) {
    const e = cell(r, COL.EMAIL).toLowerCase();
    if (e) sheetEmails.add(e);
  }

  let missingFromSheet = 0;
  const missingExamples: string[] = [];
  for (const email of sourceEmails) {
    if (!sheetEmails.has(email)) {
      missingFromSheet++;
      if (missingExamples.length < 15) missingExamples.push(email);
    }
  }

  log(`  Source emails total: ${sourceEmails.size}`);
  log(`  Sheet emails total: ${sheetEmails.size}`);
  log(`  Source emails NOT in sheet: ${missingFromSheet}`);
  if (missingExamples.length) {
    log('  Examples of missing source emails:');
    for (const e of missingExamples) log(`    ${e}`);
  }

  // Phones in source but not in sheet
  let phonesLostCount = 0;
  const phonesLostExamples: { email: string; phone: string }[] = [];
  for (const [email, phone] of sourcePhones) {
    let found = false;
    for (const r of data) {
      if (cell(r, COL.EMAIL).toLowerCase() === email) {
        if (cell(r, COL.MOBILE) || cell(r, COL.BIZ_PHONE) || cell(r, COL.SEC_PHONE)) {
          found = true;
        }
        break;
      }
    }
    if (!found) {
      phonesLostCount++;
      if (phonesLostExamples.length < 10) phonesLostExamples.push({ email, phone });
    }
  }
  log(`  Source phones NOT in sheet: ${phonesLostCount}`);
  if (phonesLostExamples.length) {
    for (const p of phonesLostExamples) log(`    ${p.email} → ${p.phone}`);
  }
  log('');

  // ── 8. SOURCE / CATEGORY DISTRIBUTION ─────────────────────────────────────
  log('═══════════════════════════════════════════════════════════════════');
  log('8. SOURCE & CATEGORY DISTRIBUTION');
  log('═══════════════════════════════════════════════════════════════════');

  const sourceDist = new Map<string, number>();
  const catDist = new Map<string, number>();
  const relDist = new Map<string, number>();
  const priorityDist = new Map<string, number>();

  for (const r of data) {
    const src = cell(r, COL.SOURCE) || '(empty)';
    const cat = cell(r, COL.CATEGORY) || '(empty)';
    const rel = cell(r, COL.RELATIONSHIP) || '(empty)';
    const pri = cell(r, COL.PRIORITY) || '(empty)';
    sourceDist.set(src, (sourceDist.get(src) || 0) + 1);
    catDist.set(cat, (catDist.get(cat) || 0) + 1);
    relDist.set(rel, (relDist.get(rel) || 0) + 1);
    priorityDist.set(pri, (priorityDist.get(pri) || 0) + 1);
  }

  log('\n  Source breakdown:');
  for (const [k, v] of [...sourceDist.entries()].sort((a, b) => b[1] - a[1])) {
    log(`    ${k.padEnd(30)} ${v}`);
  }
  log('\n  Category breakdown:');
  for (const [k, v] of [...catDist.entries()].sort((a, b) => b[1] - a[1])) {
    log(`    ${k.padEnd(30)} ${v}`);
  }
  log('\n  Relationship breakdown:');
  for (const [k, v] of [...relDist.entries()].sort((a, b) => b[1] - a[1])) {
    log(`    ${k.padEnd(30)} ${v}`);
  }
  log('\n  Priority breakdown:');
  for (const [k, v] of [...priorityDist.entries()].sort((a, b) => b[1] - a[1])) {
    log(`    ${k.padEnd(30)} ${v}`);
  }
  log('');

  // ── 9. ENRICHMENT STATUS ──────────────────────────────────────────────────
  log('═══════════════════════════════════════════════════════════════════');
  log('9. ENRICHMENT STATUS');
  log('═══════════════════════════════════════════════════════════════════');

  const enrichDist = new Map<string, number>();
  let hasLinkedIn = 0, hasTwitter = 0, hasCurCompany = 0, hasCurTitle = 0;
  for (const r of data) {
    const status = cell(r, COL.ENRICH_STATUS) || '(empty)';
    enrichDist.set(status, (enrichDist.get(status) || 0) + 1);
    if (cell(r, COL.LINKEDIN)) hasLinkedIn++;
    if (cell(r, COL.TWITTER)) hasTwitter++;
    if (cell(r, COL.CUR_COMPANY)) hasCurCompany++;
    if (cell(r, COL.CUR_TITLE)) hasCurTitle++;
  }

  for (const [k, v] of [...enrichDist.entries()].sort((a, b) => b[1] - a[1])) {
    log(`  ${k.padEnd(30)} ${v}`);
  }
  log(`\n  LinkedIn URLs: ${hasLinkedIn} (${((hasLinkedIn / data.length) * 100).toFixed(1)}%)`);
  log(`  Twitter URLs: ${hasTwitter} (${((hasTwitter / data.length) * 100).toFixed(1)}%)`);
  log(`  Current Company: ${hasCurCompany} (${((hasCurCompany / data.length) * 100).toFixed(1)}%)`);
  log(`  Current Title: ${hasCurTitle} (${((hasCurTitle / data.length) * 100).toFixed(1)}%)`);
  log('');

  // ── 10. LINKEDIN URL VALIDATION ───────────────────────────────────────────
  log('═══════════════════════════════════════════════════════════════════');
  log('10. LINKEDIN URL VALIDATION');
  log('═══════════════════════════════════════════════════════════════════');

  const liIssues: { row: number; name: string; url: string; issue: string }[] = [];
  for (let i = 0; i < data.length; i++) {
    const url = cell(data[i], COL.LINKEDIN);
    if (url) {
      const { valid, issue } = isValidLinkedIn(url);
      if (!valid) {
        const name = cell(data[i], COL.FULL) || `${cell(data[i], COL.FIRST)} ${cell(data[i], COL.LAST)}`.trim();
        liIssues.push({ row: i + 2, name, url, issue: issue! });
      }
    }
  }
  log(`  LinkedIn URL issues: ${liIssues.length}`);
  for (const li of liIssues.slice(0, 15)) {
    log(`    Row ${li.row}: "${li.name}" | ${li.url} — ${li.issue}`);
  }
  if (liIssues.length > 15) log(`    ... and ${liIssues.length - 15} more`);

  // Source=LinkedIn but no LinkedIn URL
  let liSourceNoUrl = 0;
  for (const r of data) {
    if (cell(r, COL.SOURCE).toLowerCase() === 'linkedin' && !cell(r, COL.LINKEDIN)) liSourceNoUrl++;
  }
  log(`  Source=LinkedIn but no LinkedIn URL: ${liSourceNoUrl}`);
  log('');

  // ── 11. DATE FORMAT CONSISTENCY ───────────────────────────────────────────
  log('═══════════════════════════════════════════════════════════════════');
  log('11. DATE FORMAT CONSISTENCY');
  log('═══════════════════════════════════════════════════════════════════');

  const dateFormats = new Map<string, number>();
  let badDates = 0;
  for (const r of data) {
    const d = cell(r, COL.DATE_ADDED);
    if (!d) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) dateFormats.set('YYYY-MM-DD', (dateFormats.get('YYYY-MM-DD') || 0) + 1);
    else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d)) dateFormats.set('M/D/YYYY', (dateFormats.get('M/D/YYYY') || 0) + 1);
    else if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(d)) dateFormats.set('M/D/YY', (dateFormats.get('M/D/YY') || 0) + 1);
    else { dateFormats.set('other', (dateFormats.get('other') || 0) + 1); badDates++; }
  }
  for (const [fmt, count] of dateFormats) {
    log(`  ${fmt.padEnd(20)} ${count}`);
  }
  if (badDates) log(`  Non-standard dates: ${badDates}`);
  log('');

  // ── 12. LOCATION ANALYSIS ─────────────────────────────────────────────────
  log('═══════════════════════════════════════════════════════════════════');
  log('12. LOCATION ANALYSIS');
  log('═══════════════════════════════════════════════════════════════════');

  const locDist = new Map<string, number>();
  for (const r of data) {
    const loc = cell(r, COL.LOCATION) || '(empty)';
    locDist.set(loc, (locDist.get(loc) || 0) + 1);
  }
  log(`  Unique locations: ${locDist.size}`);
  log('  Top 25 locations:');
  const topLocs = [...locDist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  for (const [loc, count] of topLocs) {
    log(`    ${loc.padEnd(45)} ${count}`);
  }

  // Suspicious location patterns
  const suspiciousLocs: { row: number; name: string; loc: string; issue: string }[] = [];
  for (let i = 0; i < data.length; i++) {
    const loc = cell(data[i], COL.LOCATION);
    if (!loc) continue;
    // Just country name with no city/state
    if (loc === 'United States' || loc === 'US' || loc === 'USA') {
      // Already cleaned in batch2, but check
      suspiciousLocs.push({ row: i + 2, name: cell(data[i], COL.FULL) || `${cell(data[i], COL.FIRST)} ${cell(data[i], COL.LAST)}`.trim(), loc, issue: 'country only, no city/state' });
    }
    // All caps location
    if (loc.length > 3 && loc === loc.toUpperCase()) {
      suspiciousLocs.push({ row: i + 2, name: cell(data[i], COL.FULL) || `${cell(data[i], COL.FIRST)} ${cell(data[i], COL.LAST)}`.trim(), loc, issue: 'ALL CAPS' });
    }
  }
  log(`\n  Suspicious locations: ${suspiciousLocs.length}`);
  const locByType = new Map<string, number>();
  for (const s of suspiciousLocs) {
    locByType.set(s.issue, (locByType.get(s.issue) || 0) + 1);
  }
  for (const [issue, count] of locByType) {
    log(`    ${issue}: ${count}`);
  }
  log('');

  // ── 13. CRM READINESS ASSESSMENT ──────────────────────────────────────────
  log('═══════════════════════════════════════════════════════════════════');
  log('13. CRM READINESS ASSESSMENT');
  log('═══════════════════════════════════════════════════════════════════');

  // CRM minimum fields: First, Last, Email
  let crmReady = 0;
  let hasEmailOnly = 0;
  let hasNameOnly = 0;
  let hasAll3 = 0;
  let hasNone = 0;
  let hasPhoneAny = 0;
  let hasCompanyAny = 0;

  for (const r of data) {
    const hasFirst = !!cell(r, COL.FIRST);
    const hasLast = !!cell(r, COL.LAST);
    const hasEmail = !!cell(r, COL.EMAIL);
    const hasPhone = !!(cell(r, COL.MOBILE) || cell(r, COL.BIZ_PHONE));
    const hasCompany = !!(cell(r, COL.COMPANY) || cell(r, COL.CUR_COMPANY));

    if (hasFirst && hasLast && hasEmail) hasAll3++;
    if (hasFirst && hasLast && !hasEmail) hasNameOnly++;
    if (hasEmail && (!hasFirst || !hasLast)) hasEmailOnly++;
    if (!hasFirst && !hasLast && !hasEmail) hasNone++;
    if (hasFirst && hasLast && hasEmail && hasPhone) crmReady++;
    if (hasPhone) hasPhoneAny++;
    if (hasCompany) hasCompanyAny++;
  }

  log(`  Total rows: ${data.length}`);
  log(`  Has First + Last + Email: ${hasAll3} (${((hasAll3 / data.length) * 100).toFixed(1)}%)`);
  log(`  Has First + Last + Email + Phone: ${crmReady} (${((crmReady / data.length) * 100).toFixed(1)}%)`);
  log(`  Has name but no email: ${hasNameOnly} (${((hasNameOnly / data.length) * 100).toFixed(1)}%)`);
  log(`  Has email but incomplete name: ${hasEmailOnly} (${((hasEmailOnly / data.length) * 100).toFixed(1)}%)`);
  log(`  Missing name AND email: ${hasNone}`);
  log(`  Has any phone: ${hasPhoneAny} (${((hasPhoneAny / data.length) * 100).toFixed(1)}%)`);
  log(`  Has any company: ${hasCompanyAny} (${((hasCompanyAny / data.length) * 100).toFixed(1)}%)`);

  // Column mapping for common CRMs
  log('\n  CRM COLUMN MAPPING RECOMMENDATIONS:');
  log('  ────────────────────────────────────');
  log('  Current Layout → HubSpot / Salesforce mapping:');
  log('    A First Name        → First Name (standard)');
  log('    B Last Name         → Last Name (standard)');
  log('    C Full Name         → REMOVE (computed field, CRMs generate this)');
  log('    D Company           → Company (at time of import)');
  log('    E Title             → Job Title (at time of import)');
  log('    F Category          → Contact Type / Lead Source Category');
  log('    G Relationship      → Custom: Relationship Strength');
  log('    H Source            → Lead Source');
  log('    I Email             → Email');
  log('    J Business Phone    → Phone (Office)');
  log('    K Mobile            → Mobile Phone');
  log('    L Secondary Phone   → Other Phone — CONSIDER MERGING into Notes if sparse');
  log('    M Location          → SPLIT into: City, State/Province, Country');
  log('    N Date Added        → Create Date / Custom: Date Added');
  log('    O Priority          → Lead Score / Custom: Priority');
  log('    P Notes             → Description / Notes');
  log('    Q LinkedIn URL      → LinkedIn Profile URL');
  log('    R Twitter URL       → Twitter Profile URL');
  log('    S Current Company   → Company (if D is stale, use S)');
  log('    T Current Title     → Job Title (if E is stale, use T)');
  log('    U Phone (Verified)  → REMOVE (empty / unused)');
  log('    V Enrichment Status → Custom: Enrichment Status or REMOVE');
  log('    W Last Enriched     → Custom: Last Enriched Date or REMOVE');
  log('    X Enrichment Source → REMOVE (internal tracking)');
  log('    Y Confidence Score  → REMOVE (internal tracking)');
  log('    Z Data Quality      → REMOVE (internal tracking)');
  log('    AA Enrichment Notes → REMOVE (internal tracking)');
  log('    AB Tags             → Tags / Contact Tags');

  // ── 14. LAYOUT IMPROVEMENTS ───────────────────────────────────────────────
  log('\n═══════════════════════════════════════════════════════════════════');
  log('14. LAYOUT IMPROVEMENT RECOMMENDATIONS');
  log('═══════════════════════════════════════════════════════════════════');

  // Check if Column S/T overlap with D/E
  let sMatchesD = 0, tMatchesE = 0, sDiffD = 0, tDiffE = 0;
  let sOnlyEmpty = 0, dOnlyEmpty = 0;
  for (const r of data) {
    const d = cell(r, COL.COMPANY).toLowerCase();
    const s = cell(r, COL.CUR_COMPANY).toLowerCase();
    const e = cell(r, COL.TITLE).toLowerCase();
    const t = cell(r, COL.CUR_TITLE).toLowerCase();
    if (s && d && s === d) sMatchesD++;
    if (s && d && s !== d) sDiffD++;
    if (s && !d) dOnlyEmpty++;
    if (!s && d) sOnlyEmpty++;
    if (t && e && t === e) tMatchesE++;
    if (t && e && t !== e) tDiffE++;
  }
  log(`\n  Company field overlap (D vs S):`);
  log(`    D and S identical: ${sMatchesD}`);
  log(`    D and S different (S is updated): ${sDiffD}`);
  log(`    S populated, D empty: ${dOnlyEmpty}`);
  log(`    D populated, S empty: ${sOnlyEmpty}`);

  log(`\n  Title field overlap (E vs T):`);
  log(`    E and T identical: ${tMatchesE}`);
  log(`    E and T different (T is updated): ${tDiffE}`);

  log('\n  RECOMMENDED LAYOUT CHANGES FOR CRM UPLOAD:');
  log('  ──────────────────────────────────────────');
  log('  1. MERGE Company: Use S (Current Company) as primary, fall back to D.');
  log('     → Single "Company" column. Keep D as "Original Company" if history needed.');
  log('  2. MERGE Title: Use T (Current Title) as primary, fall back to E.');
  log('     → Single "Job Title" column.');
  log('  3. SPLIT Location (M) into City, State, Country columns.');
  log('     → Most CRMs require separate address fields.');
  log('  4. REMOVE computed columns: C (Full Name), U-AA (enrichment internals).');
  log('     → CRMs compute Full Name; enrichment metadata is internal.');
  log('  5. STANDARDIZE dates to YYYY-MM-DD (ISO 8601).');
  log('  6. ADD "Email Verified" boolean column for email verification results.');
  log('  7. MOVE Tags (AB) closer to core fields (after Source).');

  log('\n  EMAIL VERIFICATION PREP:');
  log('  ────────────────────────');
  const emailsForVerification = data.filter(r => cell(r, COL.EMAIL)).length;
  const uniqueEmails = new Set(data.filter(r => cell(r, COL.EMAIL)).map(r => cell(r, COL.EMAIL).toLowerCase())).size;
  const domainDist = new Map<string, number>();
  for (const r of data) {
    const email = cell(r, COL.EMAIL);
    if (!email) continue;
    const domain = email.split('@')[1]?.toLowerCase();
    if (domain) domainDist.set(domain, (domainDist.get(domain) || 0) + 1);
  }
  log(`  Emails to verify: ${emailsForVerification} (${uniqueEmails} unique)`);
  log(`  Unique domains: ${domainDist.size}`);
  log('  Top 20 domains:');
  for (const [domain, count] of [...domainDist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    log(`    ${domain.padEnd(35)} ${count}`);
  }

  // Estimate verification costs
  log(`\n  Estimated verification costs (bulk email verification services):`);
  log(`    ZeroBounce: ~$${(uniqueEmails * 0.008).toFixed(0)} ($0.008/email)`);
  log(`    NeverBounce: ~$${(uniqueEmails * 0.008).toFixed(0)} ($0.008/email)`);
  log(`    Hunter.io: ~$${(uniqueEmails * 0.01).toFixed(0)} ($0.01/email)`);
  log(`    MillionVerifier: ~$${(uniqueEmails * 0.0005).toFixed(0)} ($0.0005/email, cheapest)`);

  // ── 15. GLOBAL ERROR SCAN ─────────────────────────────────────────────────
  log('\n═══════════════════════════════════════════════════════════════════');
  log('15. GLOBAL ERROR SCAN');
  log('═══════════════════════════════════════════════════════════════════');

  // Scan all cells for known error patterns
  const errorPatterns = ['#ERROR!', '#REF!', '#NAME?', '#VALUE!', '#N/A', '#DIV/0!', '#NULL!'];
  let errorCount = 0;
  for (let i = 0; i < data.length; i++) {
    for (let col = 0; col < 28; col++) {
      const val = cell(data[i], col);
      if (errorPatterns.includes(val)) {
        const name = cell(data[i], COL.FULL) || `${cell(data[i], COL.FIRST)} ${cell(data[i], COL.LAST)}`.trim();
        if (errorCount < 20) {
          log(`  Row ${i + 2} Col ${COL_LETTER[col]}: "${name}" — ${val}`);
        }
        errorCount++;
      }
    }
  }
  if (errorCount > 20) log(`  ... and ${errorCount - 20} more`);
  if (errorCount === 0) log('  No spreadsheet errors found (#ERROR!, #REF!, etc.)');

  // Check for HTML/encoded content
  let htmlCount = 0;
  for (let i = 0; i < data.length; i++) {
    for (let col = 0; col < 28; col++) {
      const val = cell(data[i], col);
      if (/<[a-z][\s\S]*>/i.test(val) || /&amp;|&lt;|&gt;|&#\d+;/.test(val)) {
        if (htmlCount < 5) {
          const name = cell(data[i], COL.FULL) || `${cell(data[i], COL.FIRST)} ${cell(data[i], COL.LAST)}`.trim();
          log(`  HTML/encoded content Row ${i + 2} Col ${COL_LETTER[col]}: "${name}" — "${val.slice(0, 80)}..."`);
        }
        htmlCount++;
      }
    }
  }
  if (htmlCount > 5) log(`  ... and ${htmlCount - 5} more HTML/encoded cells`);
  if (htmlCount === 0) log('  No HTML/encoded content found.');

  // Very long values (possible data dumps)
  let longCount = 0;
  for (let i = 0; i < data.length; i++) {
    for (let col = 0; col < 28; col++) {
      const val = cell(data[i], col);
      if (val.length > 500) {
        if (longCount < 5) {
          const name = cell(data[i], COL.FULL) || `${cell(data[i], COL.FIRST)} ${cell(data[i], COL.LAST)}`.trim();
          log(`  Very long value Row ${i + 2} Col ${COL_LETTER[col]} (${val.length} chars): "${name}" — "${val.slice(0, 80)}..."`);
        }
        longCount++;
      }
    }
  }
  if (longCount > 5) log(`  ... and ${longCount - 5} more very long cells`);
  if (longCount === 0) log('  No excessively long cell values found.');
  log('');

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  log('╔══════════════════════════════════════════════════════════════════╗');
  log('║                    DIAGNOSTIC SUMMARY                          ║');
  log('╚══════════════════════════════════════════════════════════════════╝');
  log(`  Total rows: ${data.length}`);
  log(`  Header issues: ${headerIssues}`);
  log(`  Critical field issues: ${issues.length}`);
  log(`  Email issues: ${emailIssues.length}`);
  log(`  Duplicate emails: ${dupEmails.length}`);
  log(`  Phone issues: ${phoneIssues.length}`);
  log(`  Duplicate names: ${dupNames.length}`);
  log(`  Source emails missing from sheet: ${missingFromSheet}`);
  log(`  Spreadsheet errors: ${errorCount}`);
  log(`  CRM-ready rows (name+email+phone): ${crmReady} / ${data.length}`);
  log(`  Rows needing email verification: ${emailsForVerification}`);

  // Write report to file
  const reportPath = '/tmp/sheet-diagnostic-report.txt';
  fs.writeFileSync(reportPath, out.join('\n'));
  log(`\nFull report saved to: ${reportPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
