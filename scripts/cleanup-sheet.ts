#!/usr/bin/env npx ts-node
/**
 * cleanup-sheet.ts — One-time sheet cleanup script
 *
 * 1. Cleans column S (Current Company): extracts company names from LinkedIn
 *    headlines that contain titles, taglines, pipe separators, hashtags, etc.
 * 2. Adds missing LinkedIn URLs (column Q) for contacts sourced from LinkedIn.
 *
 * Run:  npx ts-node scripts/cleanup-sheet.ts [--dry-run]
 */

import * as fs from 'fs';
import * as https from 'https';

const DRY_RUN = process.argv.includes('--dry-run');

// Load .env
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

// ── Column S cleanup logic ────────────────────────────────────────────────────

/** Common title keywords that indicate the value is a job title, not a company */
const TITLE_PATTERNS = [
  /^(ceo|cfo|coo|cto|cmo|cio|cpo|cso|svp|vp|evp|avp|md)\b/i,
  /^(senior|junior|chief|head|director|manager|associate|analyst|partner|founder|co-founder|president|chairman|principal)\b/i,
  /^(managing\s+director|executive\s+director|general\s+manager|vice\s+president)\b/i,
  /board\s+director/i,
  /^public\s+&\s+private\b/i,
];

/** Patterns that indicate LinkedIn headline junk */
const HEADLINE_JUNK = [
  /^#/,                         // starts with hashtag
  /^\$/,                        // starts with dollar sign
  /^<\/?/,                      // HTML-like
  /dedicated\s+non-profit/i,    // personal statements
  /scaling\s+(platforms|businesses)/i,
  /pioneering/i,
  /powering\b/i,
  /not\s+your\s+typical/i,
  /connecting\s+capital/i,
  /forging\s+new\s+paths/i,
];

/**
 * Clean a column S value. Returns the cleaned company name,
 * or empty string if the value is not a company name.
 */
function cleanCompanyValue(raw: string, colD: string, colT: string): { cleaned: string; reason?: string } {
  const s = raw.trim();
  if (!s) return { cleaned: '' };

  // If S exactly matches D (case-insensitive), it's already correct
  if (colD && s.toLowerCase() === colD.toLowerCase()) {
    return { cleaned: s };
  }

  // "Company detail: X" → extract X
  const companyDetail = s.match(/^company\s+detail:\s*(.+)/i);
  if (companyDetail) {
    return { cleaned: companyDetail[1].trim(), reason: 'extracted from "Company detail:"' };
  }

  // Handle pipe-separated FIRST (before junk check, since first segment is often the company)
  // Also handle "|" without spaces (e.g., "Binance |speaker")
  if (s.includes('|')) {
    const parts = s.split(/\s*\|\s*/);
    let first = parts[0].trim();

    // Clean up first segment: remove trailing junk after comma or dash if segment is long
    if (first.length > 30) {
      // "Company, Your Gateway To..." → "Company" (skip if comma is inside parentheses)
      const firstComma = first.indexOf(',');
      const firstParen = first.indexOf('(');
      const commaInsideParens = firstParen >= 0 && firstComma > firstParen;
      const commaClean = commaInsideParens ? first : first.replace(/,\s+[A-Z][a-z].*$/, '');
      if (commaClean.length > 1 && commaClean.length < first.length) first = commaClean;
      // "Company - Long Description..." → "Company" (only if description is long)
      const dashClean = first.match(/^(.+?)\s+[-–—]\s+.{20,}$/);
      if (dashClean) first = dashClean[1].trim();
      // "Company Focused On Market-neutral..." → truncate at common filler words
      const fillerClean = first.match(/^([A-Z0-9][A-Za-z0-9\s&\.\-'()®]+?)\s+(?:Focused|Building|Scaling|Powering|Driving|Helping|Transforming|Pioneering|Infrastructure)\b/i);
      if (fillerClean && fillerClean[1].length > 1) first = fillerClean[1].trim();
    }

    // Clean up "Company & Investor" → "Company"
    first = first.replace(/\s+&\s+investor$/i, '').trim();

    // Reject first segments that are clearly not companies
    const isNumericAge = /^\d+\s+years?\s+old$/i.test(first);
    if (isNumericAge) {
      first = '';
    }

    // If the first part looks like a company name (not a title), use it
    if (first.length > 1 && !TITLE_PATTERNS.some(p => p.test(first))) {
      return { cleaned: first, reason: 'took first pipe segment' };
    }
    // Try to find a company via "at Company" in any segment
    for (const part of parts) {
      const atMatch = part.match(/\bat\s+([A-Z0-9][A-Za-z0-9\s&\.\-']+)/);
      if (atMatch) return { cleaned: atMatch[1].trim(), reason: 'extracted from pipe segment' };
    }
    // First segment is a title and no company found in any segment
    return { cleaned: '', reason: 'pipe segments are all titles/descriptions' };
  }

  // "Title at Company" or "Title at Company - description"
  const titleAtCompany = s.match(/^.+?\bat\s+([A-Z0-9][A-Za-z0-9\s&\.\-'()]+?)(?:\s*[\|\-–—.]|\s*$)/);
  if (titleAtCompany && TITLE_PATTERNS.some(p => p.test(s))) {
    const company = titleAtCompany[1].trim().replace(/\s*[\-–—].*$/, '');
    return { cleaned: company, reason: 'extracted "at Company" from title' };
  }

  // Check for headline junk patterns (after pipe/title extraction)
  for (const pattern of HEADLINE_JUNK) {
    if (pattern.test(s)) {
      // Try "at Company" as last resort
      const atMatch = s.match(/\bat\s+([A-Z0-9][A-Za-z0-9\s&\.\-']+?)(?:\s*[\|\-–—]|\s*$)/);
      if (atMatch) return { cleaned: atMatch[1].trim(), reason: 'extracted from headline' };
      return { cleaned: '', reason: 'headline junk' };
    }
  }

  // Pure title check (no company extractable)
  if (TITLE_PATTERNS.some(p => p.test(s)) && !s.includes(' at ')) {
    // Values with ® are company names, not titles
    if (/®/.test(s)) return { cleaned: s };

    // "Founder/CEO of X" → extract X
    const ofMatch = s.match(/\b(?:of|at)\s+([A-Z0-9][A-Za-z0-9\s&\.\-']+?)(?:\s*[\|\-–—.]|\s*$)/i);
    if (ofMatch) return { cleaned: ofMatch[1].trim(), reason: 'extracted company from "of/at X"' };

    return { cleaned: '', reason: 'pure title, no company' };
  }

  // Very long values (>120 chars) are likely LinkedIn headlines
  if (s.length > 120) {
    // Try "at Company" extraction
    const atMatch = s.match(/\bat\s+([A-Z0-9][A-Za-z0-9\s&\.\-']+?)(?:\s*[\|\-–—,]|\s*$)/);
    if (atMatch) return { cleaned: atMatch[1].trim(), reason: 'extracted from long headline' };

    // Try to find company name at start before a dash or pipe
    const firstPart = s.split(/\s*[\|\-–—]\s*/)[0].trim();
    if (firstPart.length < 60 && firstPart.length > 1) {
      return { cleaned: firstPart, reason: 'took first segment of long value' };
    }

    return { cleaned: '', reason: 'too long, no company extractable' };
  }

  // "Company. Ex-something" or "Company - long description"
  const dotEx = s.match(/^([A-Z0-9][A-Za-z0-9\s&\.\-']+?)\.\s+Ex[-\s]/i);
  if (dotEx) {
    return { cleaned: dotEx[1].trim(), reason: 'removed ". Ex-..." suffix' };
  }

  // "Company - long description" where description > 40 chars
  const dashParts = s.split(/\s*[\-–—]\s*/);
  if (dashParts.length > 1) {
    const afterDash = dashParts.slice(1).join(' - ');
    if (afterDash.length > 40 && dashParts[0].length < 60) {
      return { cleaned: dashParts[0].trim(), reason: 'removed long dash description' };
    }
  }

  // Otherwise keep as-is (it's probably a legitimate company name)
  return { cleaned: s };
}

/**
 * Construct a likely LinkedIn profile URL from a name.
 * LinkedIn slugs are lowercase, hyphenated: "first-last"
 */
function nameToLinkedInSlug(firstName: string, lastName: string): string {
  const clean = (s: string) => s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/,.*$/, '')  // remove credentials after comma
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const first = clean(firstName);
  const last = clean(lastName);
  if (!first || !last) return '';
  return `${first}-${last}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');
  const token = await getAccessToken();

  console.log('Reading sheet...');
  const rows = await sheetsGet(token, `${ENRICHED_TAB}!A2:AB`);
  console.log(`${rows.length} rows`);

  // Pad all rows to 28 columns
  const padded = rows.map(r => [...r, ...Array(28).fill('')].slice(0, 28));

  let sChanged = 0;
  let qAdded = 0;

  for (let i = 0; i < padded.length; i++) {
    const r = padded[i];
    const rowNum = i + 2;
    const name = r[2] || `${r[0] || ''} ${r[1] || ''}`.trim();
    const colD = (r[3] || '').trim();   // Company
    const colS = (r[18] || '').trim();  // Current Company
    const colT = (r[19] || '').trim();  // Current Title

    // --- Clean column S ---
    if (colS) {
      const { cleaned, reason } = cleanCompanyValue(colS, colD, colT);
      if (cleaned !== colS) {
        if (reason) {
          console.log(`  S Row ${rowNum}: "${name}" | "${colS}" → "${cleaned}" (${reason})`);
        }
        padded[i][18] = cleaned;
        sChanged++;
      }
    }

    // --- Add missing LinkedIn URL for LinkedIn-sourced contacts ---
    const source = (r[7] || '').trim();
    const linkedinUrl = (r[16] || '').trim();
    if (source.toLowerCase() === 'linkedin' && !linkedinUrl) {
      const slug = nameToLinkedInSlug(r[0] || '', r[1] || '');
      if (slug) {
        const url = `https://www.linkedin.com/in/${slug}`;
        console.log(`  Q Row ${rowNum}: "${name}" → ${url}`);
        padded[i][16] = url;
        qAdded++;
      }
    }
  }

  console.log(`\nSummary: ${sChanged} column S changes, ${qAdded} LinkedIn URLs added`);

  if (!DRY_RUN && (sChanged > 0 || qAdded > 0)) {
    console.log('Writing changes to sheet...');
    // Write in batches of 1000 rows to avoid API limits
    const BATCH_SIZE = 1000;
    for (let start = 0; start < padded.length; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE, padded.length);
      const range = `${ENRICHED_TAB}!A${start + 2}:AB${end + 1}`;
      const batch = padded.slice(start, end);
      await sheetsUpdate(token, range, batch);
      console.log(`  Written rows ${start + 2}–${end + 1}`);
    }
    console.log('Done!');
  } else if (DRY_RUN) {
    console.log('(dry run — no changes written)');
  } else {
    console.log('No changes needed.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
