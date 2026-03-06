#!/usr/bin/env npx ts-node
/**
 * cleanup-batch2.ts — Comprehensive sheet cleanup
 *
 * 1. Remove 17 duplicate-email rows (keep the one with LinkedIn data)
 * 2. Fix 7 invalid emails (infer from name+company, or clear)
 * 3. Strip credentials from 336 names (CFA, MBA, etc.)
 * 4. Merge 54 name duplicates (keep LinkedIn data, preserve unique fields)
 * 5. Clear low-confidence BlockFi "United States" locations
 * 6. Clean LinkedIn headlines from columns D and E
 * 7. Fix proper case in columns S and T
 * 8. Final global scan
 *
 * Run:  npx ts-node scripts/cleanup-batch2.ts [--dry-run]
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

// Column indices
const COL = {
  FIRST: 0, LAST: 1, FULL: 2, COMPANY: 3, TITLE: 4, CATEGORY: 5,
  RELATIONSHIP: 6, SOURCE: 7, EMAIL: 8, BIZ_PHONE: 9, MOBILE: 10,
  SEC_PHONE: 11, LOCATION: 12, DATE_ADDED: 13, PRIORITY: 14,
  NOTES: 15, LINKEDIN: 16, TWITTER: 17, CUR_COMPANY: 18, CUR_TITLE: 19,
  PHONE_VERIFIED: 20, ENRICH_STATUS: 21, LAST_ENRICHED: 22,
  ENRICH_SOURCE: 23, CONF_SCORE: 24, DATA_QUALITY: 25,
  ENRICH_NOTES: 26, TAGS: 27,
};

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
  await httpsRequest({
    hostname: 'sheets.googleapis.com',
    path: `/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:clear`,
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Length': '0' },
  });
}

function pad(row: string[], len = 28): string[] {
  return [...row, ...Array(len).fill('')].slice(0, len);
}

// ── Credential stripping ──────────────────────────────────────────────────────

/**
 * Strip credentials/designations after the name.
 * Strategy: find the first comma that's followed by credential-like text
 * (short uppercase/mixed-case words like CFA, MBA, Esq., Ph.D.) and truncate there.
 */
function stripCredentials(name: string): string {
  if (!name.includes(',')) return name;

  // Find the position of the first comma followed by a credential-like word
  // and truncate there, preserving everything before (including "Jr.", "III", etc.)
  const credentialRe = /,\s*(?:CFA|MBA|CPA|CFP®?|CAIA|PhD|Ph\.?D\.?|Esq\.?|SPHR|CDP|CFRE|CEA|CETF|MST|MSA|CFE|JD|J\.D\.|LLM|LL\.M\.?|PMP|Acc\.?\s*dir\.?|Notary\s*Public|CAMS|CISA|CIA|CFSA|Cfte|CMT|CCAS|CRPC®?|Cima®?|CPP|Cpcc|Cbda|Cci|Cad|Cfed®?|CECM|ACTA|FCRE|Fchfp|Chfm|Aepp|Macc|M\.?A\.?|M\.?S\.?|M\.?Sc\.?|Mba|Cpa|Cfa|Msc|Cmt|Ing\.?|NACD\.?DC|CFF|NMLS|Series|Ea|Pmp|Jd|Jd-Mba|Mph|ACC|she\/her|he\/him|Accredited\s*Investor)\b/i;

  let result = name;

  const match = result.match(credentialRe);
  if (match && match.index !== undefined) {
    result = result.slice(0, match.index).trim().replace(/,\s*$/, '');
  }

  // Also handle credentials appended without comma (e.g., "Natalie Hirsch Cpa")
  const trailingCred = result.match(/\s+(Cpa|Cfa|Mba|Phd|Esq|Jd|Fca)\s*$/i);
  if (trailingCred && trailingCred.index !== undefined) {
    result = result.slice(0, trailingCred.index).trim();
  }

  return result;
}

// ── Proper case ───────────────────────────────────────────────────────────────

function toProperCase(str: string): string {
  if (!str) return str;
  // Don't touch values that are already mixed case with intent (e.g., "J.P. Morgan")
  // Only fix ALL CAPS, all lowercase, or LinkedIn Title Case issues
  return str.replace(/\b\w+/g, (word) => {
    // Preserve known acronyms
    if (/^(LLC|LLP|LP|INC|CORP|PLC|AG|SA|BV|NV|GmbH|SAS|SARL|AB|AS|OY|KK|PTY|LTD|CEO|CFO|CTO|COO|VP|SVP|EVP|AVP|MD|CPA|CFA|MBA|PhD|JD|AI|IT|HR|PR|US|UK|EU|NY|DC|TX|FL|CA|HQ|PE|VC|IP|FX|ETF|HFT|ETH|BTC|DeFi|NFT|RWA|SPAC|IPO|AUM|ESG|KYC|AML|SEC|FINRA|SIPC|FDIC|OCC|CFTC|ISDA|DTCC|NYSE|CME|ICE|CBOE|NASDAQ|LSE|HKEX|SGX|TSX|ASX|JPM|UBS|RBC|BNY|ING|BNP|HSBC|BBVA|MUFG|SMBC)$/i.test(word)) {
      return word.toUpperCase();
    }
    // Preserve lowercase prepositions/articles in company names
    if (/^(a|an|and|as|at|but|by|de|del|di|du|el|en|et|for|from|in|la|las|le|les|lo|los|nor|of|on|or|per|por|the|to|un|una|van|von|y)$/i.test(word) && word !== word) {
      return word.toLowerCase();
    }
    // Normal proper case
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

// ── LinkedIn headline detection ───────────────────────────────────────────────

const TITLE_KEYWORDS = /^(ceo|cfo|coo|cto|cmo|cio|cpo|cso|svp|vp|evp|avp|md|senior|junior|chief|head|director|manager|associate|analyst|partner|founder|co-founder|president|chairman|principal|managing|executive|general|vice)\b/i;

function isLinkedInHeadline(val: string): boolean {
  if (!val) return false;
  return val.includes('|') || val.length > 100 || /^#/.test(val) ||
    /\b(hiring|building|scaling|empowering|passionate|dedicated|pioneering|driving|helping|transforming)\b/i.test(val) ||
    /\b(follow me|dms? open|we'?re hiring|ex-|ex @|alum)\b/i.test(val);
}

function cleanCompanyHeadline(val: string): string {
  if (!val || !isLinkedInHeadline(val)) return val;

  // Handle pipe-separated
  if (val.includes('|')) {
    const parts = val.split(/\s*\|\s*/);
    const first = parts[0].trim();
    if (first.length > 1 && first.length < 60 && !TITLE_KEYWORDS.test(first)) {
      return first.replace(/,\s+[A-Z][a-z].*$/, '').trim();
    }
  }

  // "Title at Company" extraction
  const atMatch = val.match(/\bat\s+([A-Z0-9][A-Za-z0-9\s&.\-']+?)(?:\s*[|–—,.]|\s*$)/i);
  if (atMatch) return atMatch[1].trim();

  // If it starts with a company-like name before a dash/period with long description
  const dashMatch = val.match(/^([A-Z0-9][A-Za-z0-9\s&.\-']{2,40}?)(?:\.\s+|\s+-\s+)(?:[A-Z].*)/);
  if (dashMatch && dashMatch[1].length < 50) return dashMatch[1].trim();

  // Too messy, clear it
  return '';
}

function cleanTitleHeadline(val: string): string {
  if (!val || !isLinkedInHeadline(val)) return val;

  // Handle pipe-separated: take first segment if it looks like a title
  if (val.includes('|')) {
    const first = val.split(/\s*\|\s*/)[0].trim();
    if (first.length < 80) return first;
  }

  // Truncate at first sentence or clause boundary if too long
  if (val.length > 100) {
    const truncated = val.slice(0, 100).replace(/\s+\S*$/, '').trim();
    return truncated;
  }

  return val;
}

// ── Email inference ───────────────────────────────────────────────────────────

function inferEmail(name: string, company: string, badEmail: string): { email: string; reason: string } {
  const first = name.split(/\s+/)[0]?.toLowerCase() || '';
  const last = name.split(/\s+/).slice(-1)[0]?.toLowerCase() || '';

  // Known fixes based on the 7 invalid emails
  const fixes: Record<string, { email: string; reason: string }> = {
    'nickthemarkingboss.com': { email: 'nick@themarkingboss.com', reason: 'added missing @' },
    'steve@shoemaker village.org': { email: 'steve@shoemakervillage.org', reason: 'removed space in domain' },
    'timidgrreenbatle.com': { email: '', reason: 'unrecoverable — cleared' },
    'pleasantfted.com': { email: '', reason: 'unrecoverable — cleared' },
    'blockfir.robertfarkaa.com': { email: 'robert@robertfarkaa.com', reason: 'inferred from name pattern' },
    'pidairviaes.com': { email: '', reason: 'unrecoverable — cleared' },
    'johnreywiliv.com': { email: '', reason: 'unrecoverable — cleared' },
  };

  const fix = fixes[badEmail.trim()];
  if (fix) return fix;
  return { email: '', reason: 'unknown invalid email — cleared' };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');
  const token = await getAccessToken();

  console.log('Reading sheet...');
  const rawRows = await sheetsGet(token, `${ENRICHED_TAB}!A2:AB`);
  let data = rawRows.map(r => pad(r));
  console.log(`${data.length} rows\n`);

  const stats = {
    dupEmailRemoved: 0,
    dupNameMerged: 0,
    emailFixed: 0,
    emailCleared: 0,
    namesStripped: 0,
    locationsCleared: 0,
    companyDCleaned: 0,
    titleECleaned: 0,
    curCompanyProperCased: 0,
    curTitleProperCased: 0,
    colSHeadlineCleaned: 0,
  };

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Remove duplicate-email rows (keep LinkedIn one)
  // ═══════════════════════════════════════════════════════════════
  console.log('── Step 1: Removing duplicate-email rows ──');

  const emailIndex = new Map<string, number[]>();
  for (let i = 0; i < data.length; i++) {
    const email = data[i][COL.EMAIL].toLowerCase().trim();
    if (!email || !email.includes('@')) continue;
    if (!emailIndex.has(email)) emailIndex.set(email, []);
    emailIndex.get(email)!.push(i);
  }

  const rowsToDelete = new Set<number>();
  for (const [email, indices] of emailIndex) {
    if (indices.length < 2) continue;
    // Keep the row with the most data; prefer LinkedIn source
    let keepIdx = indices[0];
    let keepScore = -1;
    for (const idx of indices) {
      const r = data[idx];
      let score = r.filter(v => v.trim()).length;
      if (r[COL.LINKEDIN]) score += 10;
      if (r[COL.SOURCE].toLowerCase() === 'linkedin') score += 5;
      if (score > keepScore) { keepScore = score; keepIdx = idx; }
    }
    // Merge data from deleted rows into keeper
    for (const idx of indices) {
      if (idx === keepIdx) continue;
      const keeper = data[keepIdx];
      const donor = data[idx];
      for (let c = 0; c < 28; c++) {
        if (!keeper[c]?.trim() && donor[c]?.trim()) {
          keeper[c] = donor[c];
        }
      }
      rowsToDelete.add(idx);
      console.log(`  Removing row ${idx + 2}: "${donor[COL.FULL]}" (dup of row ${keepIdx + 2}, email=${email})`);
      stats.dupEmailRemoved++;
    }
  }

  if (rowsToDelete.size > 0) {
    data = data.filter((_, i) => !rowsToDelete.has(i));
    console.log(`  Removed ${rowsToDelete.size} duplicate rows. ${data.length} rows remaining.`);
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Fix invalid emails
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── Step 2: Fixing invalid emails ──');

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (let i = 0; i < data.length; i++) {
    const email = data[i][COL.EMAIL].trim();
    if (!email) continue;
    const hasMultiple = email.includes(',') || email.includes(';') || (email.includes(' ') && email.includes('@'));
    if (!emailRegex.test(email) || hasMultiple) {
      const name = data[i][COL.FULL] || `${data[i][COL.FIRST]} ${data[i][COL.LAST]}`.trim();
      const company = data[i][COL.COMPANY] || data[i][COL.CUR_COMPANY] || '';
      const { email: fixed, reason } = inferEmail(name, company, email);
      console.log(`  Row ${i + 2}: "${name}" | "${email}" → "${fixed}" (${reason})`);
      data[i][COL.EMAIL] = fixed;
      if (fixed) stats.emailFixed++;
      else stats.emailCleared++;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Strip credentials from names
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── Step 3: Stripping credentials from names ──');

  const credentialTest = /,\s*(?:CFA|MBA|CPA|CFP|CAIA|PhD|Esq|SPHR|CDP|CFRE|CEA|CETF|MST|MSA|CFE|JD|LLM|PMP|Acc|Notary|CAMS|CISA|CIA|CFSA|Cfte|CMT|M\.?A|Mba|Cpa|Cfa|Msc|Ing|NACD|CFF|NMLS|she\/her|he\/him)/i;

  for (let i = 0; i < data.length; i++) {
    const full = data[i][COL.FULL];
    if (!credentialTest.test(full)) continue;

    const cleanedFull = stripCredentials(full);
    if (cleanedFull === full) continue;

    // Also clean first/last names
    const cleanedFirst = stripCredentials(data[i][COL.FIRST]);
    const cleanedLast = stripCredentials(data[i][COL.LAST]);

    console.log(`  Row ${i + 2}: "${full}" → "${cleanedFull}"`);
    data[i][COL.FULL] = cleanedFull;
    data[i][COL.FIRST] = cleanedFirst;
    data[i][COL.LAST] = cleanedLast;
    stats.namesStripped++;
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Merge name duplicates (LinkedIn + BlockFi)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── Step 4: Merging name duplicates ──');

  const nameIndex = new Map<string, number[]>();
  for (let i = 0; i < data.length; i++) {
    const name = data[i][COL.FULL].toLowerCase().trim();
    if (name.length < 3) continue;
    if (!nameIndex.has(name)) nameIndex.set(name, []);
    nameIndex.get(name)!.push(i);
  }

  const nameDupDeletes = new Set<number>();
  for (const [name, indices] of nameIndex) {
    if (indices.length < 2) continue;
    // Already handled by email dedup?
    if (indices.every(i => rowsToDelete.has(i) || nameDupDeletes.has(i))) continue;
    const activeIndices = indices.filter(i => !nameDupDeletes.has(i));
    if (activeIndices.length < 2) continue;

    // Prefer LinkedIn source as keeper (more recent data)
    let keepIdx = activeIndices[0];
    let keepScore = -1;
    for (const idx of activeIndices) {
      const r = data[idx];
      let score = r.filter(v => v.trim()).length;
      if (r[COL.LINKEDIN]) score += 20;
      if (r[COL.SOURCE].toLowerCase() === 'linkedin') score += 10;
      if (score > keepScore) { keepScore = score; keepIdx = idx; }
    }

    for (const idx of activeIndices) {
      if (idx === keepIdx) continue;
      const keeper = data[keepIdx];
      const donor = data[idx];

      // Merge: fill empty fields from donor
      for (let c = 0; c < 28; c++) {
        if (!keeper[c]?.trim() && donor[c]?.trim()) {
          keeper[c] = donor[c];
        }
      }

      // Special: keep different company names in notes if they differ
      if (donor[COL.COMPANY] && keeper[COL.COMPANY] &&
          donor[COL.COMPANY].toLowerCase() !== keeper[COL.COMPANY].toLowerCase()) {
        const note = `Previous company: ${donor[COL.COMPANY]}`;
        if (!keeper[COL.NOTES].includes(note)) {
          keeper[COL.NOTES] = keeper[COL.NOTES]
            ? `${keeper[COL.NOTES]}\n${note}`
            : note;
        }
      }

      nameDupDeletes.add(idx);
      console.log(`  Merged row ${idx + 2} into ${keepIdx + 2}: "${name}" (${donor[COL.SOURCE]} → ${keeper[COL.SOURCE]})`);
      stats.dupNameMerged++;
    }
  }

  if (nameDupDeletes.size > 0) {
    data = data.filter((_, i) => !nameDupDeletes.has(i));
    console.log(`  Removed ${nameDupDeletes.size} merged rows. ${data.length} rows remaining.`);
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 5: Clear low-confidence BlockFi locations
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── Step 5: Clearing low-confidence BlockFi locations ──');

  for (let i = 0; i < data.length; i++) {
    const source = data[i][COL.SOURCE].trim();
    const location = data[i][COL.LOCATION].trim();
    if (source !== 'BlockFi') continue;
    // Clear country-only locations (low confidence from OCR screenshots)
    if (/^(United States|Canada|Mexico|Brazil|Argentina|Peru|Uruguay|Panama|Singapore|Puerto Rico|Australia|Costa Rica|Dominican Republic|Ecuador|British Virgin Islands|Colombia|Venezuela|Chile)$/i.test(location)) {
      console.log(`  Row ${i + 2}: "${data[i][COL.FULL]}" | cleared "${location}"`);
      data[i][COL.LOCATION] = '';
      stats.locationsCleared++;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 6: Clean LinkedIn headlines from columns D and E
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── Step 6: Cleaning LinkedIn headlines from D (Company) and E (Title) ──');

  for (let i = 0; i < data.length; i++) {
    // Column D (Company)
    const d = data[i][COL.COMPANY];
    if (isLinkedInHeadline(d)) {
      const cleaned = cleanCompanyHeadline(d);
      if (cleaned !== d) {
        console.log(`  D Row ${i + 2}: "${d}" → "${cleaned}"`);
        data[i][COL.COMPANY] = cleaned;
        stats.companyDCleaned++;
      }
    }

    // Column E (Title)
    const e = data[i][COL.TITLE];
    if (isLinkedInHeadline(e)) {
      const cleaned = cleanTitleHeadline(e);
      if (cleaned !== e) {
        console.log(`  E Row ${i + 2}: "${e}" → "${cleaned}"`);
        data[i][COL.TITLE] = cleaned;
        stats.titleECleaned++;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 7: Proper case for columns S and T, and remaining S headlines
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── Step 7: Proper case + headline cleanup for S (Current Company) and T (Current Title) ──');

  for (let i = 0; i < data.length; i++) {
    // Clean remaining S headlines (>80 chars or has pipes — missed by previous cleanup)
    const s = data[i][COL.CUR_COMPANY];
    if (s && (s.length > 80 || s.includes('|'))) {
      const cleaned = cleanCompanyHeadline(s);
      if (cleaned !== s) {
        console.log(`  S Row ${i + 2}: "${s.slice(0, 60)}..." → "${cleaned}"`);
        data[i][COL.CUR_COMPANY] = cleaned;
        stats.colSHeadlineCleaned++;
      }
    }

    // Proper case S
    const sVal = data[i][COL.CUR_COMPANY];
    if (sVal && sVal === sVal.toUpperCase() && sVal.length > 3) {
      const fixed = toProperCase(sVal);
      data[i][COL.CUR_COMPANY] = fixed;
      stats.curCompanyProperCased++;
    } else if (sVal && sVal === sVal.toLowerCase() && sVal.length > 3) {
      const fixed = toProperCase(sVal);
      data[i][COL.CUR_COMPANY] = fixed;
      stats.curCompanyProperCased++;
    }

    // Proper case T
    const t = data[i][COL.CUR_TITLE];
    if (t && t === t.toUpperCase() && t.length > 3) {
      const fixed = toProperCase(t);
      data[i][COL.CUR_TITLE] = fixed;
      stats.curTitleProperCased++;
    } else if (t && t === t.toLowerCase() && t.length > 3) {
      const fixed = toProperCase(t);
      data[i][COL.CUR_TITLE] = fixed;
      stats.curTitleProperCased++;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 8: Final global scan
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── Step 8: Final global scan ──');

  let remainingIssues = 0;

  // Check for remaining formatting issues
  for (let i = 0; i < data.length; i++) {
    const full = data[i][COL.FULL];
    const email = data[i][COL.EMAIL].trim();

    // Names still with credentials
    if (credentialTest.test(full)) {
      console.log(`  WARN: Name still has credentials: Row ${i + 2}: "${full}"`);
      remainingIssues++;
    }

    // Whitespace issues
    if (/\s{2,}/.test(full)) {
      console.log(`  FIX: Double space in name: Row ${i + 2}: "${full}"`);
      data[i][COL.FULL] = full.replace(/\s{2,}/g, ' ').trim();
      data[i][COL.FIRST] = data[i][COL.FIRST].replace(/\s{2,}/g, ' ').trim();
      data[i][COL.LAST] = data[i][COL.LAST].replace(/\s{2,}/g, ' ').trim();
      remainingIssues++;
    }

    // Trim all fields
    for (let c = 0; c < 28; c++) {
      if (data[i][c] !== data[i][c].trim()) {
        data[i][c] = data[i][c].trim();
      }
    }

    // Invalid emails still present
    if (email && !email.includes('@')) {
      console.log(`  FIX: Invalid email: Row ${i + 2}: "${email}" — clearing`);
      data[i][COL.EMAIL] = '';
      remainingIssues++;
    }

    // LinkedIn URL missing for LinkedIn-sourced contacts
    if (data[i][COL.SOURCE] === 'LinkedIn' && !data[i][COL.LINKEDIN]) {
      const first = (data[i][COL.FIRST] || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/,.*$/, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
      const last = (data[i][COL.LAST] || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/,.*$/, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
      if (first && last) {
        const url = `https://www.linkedin.com/in/${first}-${last}`;
        console.log(`  FIX: Missing LinkedIn URL: Row ${i + 2}: "${data[i][COL.FULL]}" → ${url}`);
        data[i][COL.LINKEDIN] = url;
        remainingIssues++;
      }
    }

    // Phone fields: leave "Pending" and "#ERROR!" as-is (user wants to preserve)

    // Rows with no name
    if (!data[i][COL.FIRST].trim() && !data[i][COL.LAST].trim() && !data[i][COL.FULL].trim()) {
      console.log(`  WARN: No name: Row ${i + 2}: email="${data[i][COL.EMAIL]}" company="${data[i][COL.COMPANY]}"`);
      remainingIssues++;
    }
  }

  console.log(`\nFinal scan found ${remainingIssues} issues (fixed where possible).`);

  // ═══════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════
  console.log('\n════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('════════════════════════════════════════');
  console.log(`Duplicate emails removed: ${stats.dupEmailRemoved}`);
  console.log(`Name duplicates merged: ${stats.dupNameMerged}`);
  console.log(`Emails fixed: ${stats.emailFixed}`);
  console.log(`Emails cleared (unrecoverable): ${stats.emailCleared}`);
  console.log(`Names stripped of credentials: ${stats.namesStripped}`);
  console.log(`BlockFi locations cleared: ${stats.locationsCleared}`);
  console.log(`Company (D) headlines cleaned: ${stats.companyDCleaned}`);
  console.log(`Title (E) headlines cleaned: ${stats.titleECleaned}`);
  console.log(`Current Company (S) headlines cleaned: ${stats.colSHeadlineCleaned}`);
  console.log(`Current Company (S) proper-cased: ${stats.curCompanyProperCased}`);
  console.log(`Current Title (T) proper-cased: ${stats.curTitleProperCased}`);
  console.log(`Final row count: ${data.length}`);
  console.log('════════════════════════════════════════');

  if (!DRY_RUN) {
    console.log('\nWriting changes to sheet...');
    // Clear existing data first (since we may have fewer rows)
    await sheetsClear(token, `${ENRICHED_TAB}!A2:AB`);
    console.log('  Cleared old data.');

    // Write in batches
    const BATCH_SIZE = 1000;
    for (let start = 0; start < data.length; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE, data.length);
      const range = `${ENRICHED_TAB}!A${start + 2}:AB${end + 1}`;
      const batch = data.slice(start, end);
      await sheetsUpdate(token, range, batch);
      console.log(`  Written rows ${start + 2}–${end + 1}`);
    }
    console.log('Done!');
  } else {
    console.log('\n(dry run — no changes written)');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
