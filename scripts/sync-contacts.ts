#!/usr/bin/env npx ts-node
/**
 * sync-contacts.ts
 *
 * Syncs contacts between Google Sheets and Obsidian vault.
 *
 * Sheet → Obsidian: New/updated rows in the sheet create/update .md notes
 * Obsidian → Sheet: New .md notes in Contacts/Network/ append rows to the sheet
 * Deduplication:   Detects duplicate rows (by name, email, or LinkedIn URL),
 *                  merges their data, and removes the duplicates from the sheet.
 *
 * Run manually:   npx ts-node scripts/sync-contacts.ts
 * Run via cron:   scheduled as a nanoclaw task
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const SHEET_ID = process.env.GOOGLE_CONTACTS_SHEET_ID || '1znTsVDzQe9m8xJHxlasy4uMjKtXwzYSn31TPWekOJPA';
const OBSIDIAN_DIR = process.env.OBSIDIAN_VAULT || '/root/obsidian-vault';
const NETWORK_DIR = path.join(OBSIDIAN_DIR, 'Contacts', 'Network');
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN!;

// "Enriched Data" tab (gid=743094631) — the active user-facing tab
// Columns A–AA (27 total):
//   A  First Name       B  Last Name        C  Full Name
//   D  Company          E  Title            F  Category
//   G  Relationship     H  Source           I  Email
//   J  Business Phone   K  Mobile           L  Location
//   M  Date Added       N  Priority         O  Notes
//   P  LinkedIn URL     Q  Twitter URL      R  Current Company
//   S  Current Title    T  Phone (Verified) U  Enrichment Status
//   V  Last Enriched    W  Enrichment Src   X  Confidence Score
//   Y  Data Quality     Z  Enrichment Notes AA Tags
const ENRICHED_TAB = 'Enriched Data';
const SHEET_RANGE = `${ENRICHED_TAB}!A2:AA`;

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function httpsRequest(options: https.RequestOptions, body?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
    grant_type: 'refresh_token',
  }).toString();

  const raw = await httpsRequest({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
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
  const res = JSON.parse(raw);
  return res.values || [];
}

async function sheetsAppend(token: string, rows: string[][]): Promise<void> {
  const body = JSON.stringify({ values: rows });
  await httpsRequest({
    hostname: 'sheets.googleapis.com',
    path: `/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(ENRICHED_TAB + '!A:AA')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);
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
      'Content-Length': Buffer.byteLength(body),
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

// ── Note parsing ──────────────────────────────────────────────────────────────

interface Contact {
  // Columns A–C
  firstName: string;
  lastName: string;
  fullName: string;
  // Columns D–H
  company: string;
  role: string;         // Title (E)
  category: string;
  relationship: string;
  source: string;
  // Columns I–N
  email: string;
  phone: string;        // Business Phone (J)
  mobile: string;
  location: string;
  dateAdded: string;
  priority: string;
  // Columns O–Q
  notes: string;
  linkedin: string;     // LinkedIn URL (P)
  twitter: string;      // Twitter URL (Q)
  // Columns R–Z (enrichment)
  currentCompany: string;
  currentTitle: string;
  phoneVerified: string;
  enrichmentStatus: string;
  lastEnrichedDate: string;
  enrichmentSource: string;
  confidenceScore: string;
  dataQuality: string;
  enrichmentNotes: string;
  // Column AA
  tags: string;         // semicolon-separated: "HNW; Family Office; Latin America"
}

function parseNote(filePath: string): Contact {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath, '.md');

  const get = (label: string) => {
    const match = content.match(new RegExp(`^##\\s+${label}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'mi'));
    return match ? match[1].replace(/^<!--.*-->$/gm, '').trim() : '';
  };

  const frontmatter = (key: string) => {
    const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return match ? match[1].trim() : '';
  };

  return {
    fullName: fileName.replace(/-/g, ' '),
    company: get('Role / Company').split('\n')[0] || '',
    role: get('Role / Company').split('\n')[1] || '',
    category: frontmatter('category'),
    email: get('Links').match(/Email:\s*(.+)/)?.[1] || '',
    phone: '',
    linkedin: get('Links').match(/LinkedIn:\s*(.+)/)?.[1] || '',
    twitter: get('Links').match(/Twitter\/X:\s*(.+)/)?.[1] || '',
    howWeKnow: get('How We Know Each Other'),
    topics: get('Topics / Channels in Common'),
    notes: get('Notes from HubSpot'),
    lastContact: frontmatter('last-contact'),
    followUp: '',
    obsidianNote: `Contacts/Network/${path.basename(filePath, '.md')}`,
  };
}

function contactToRow(c: Contact): string[] {
  return [
    c.firstName, c.lastName, c.fullName,
    c.company, c.role, c.category, c.relationship, c.source,
    c.email, c.phone, c.mobile, c.location, c.dateAdded, c.priority,
    c.notes, c.linkedin, c.twitter,
    c.currentCompany, c.currentTitle, c.phoneVerified,
    c.enrichmentStatus, c.lastEnrichedDate, c.enrichmentSource,
    c.confidenceScore, c.dataQuality, c.enrichmentNotes,
    c.tags,
  ];
}

function rowToContact(row: string[]): Contact {
  const pad = (arr: string[], len: number) => [...arr, ...Array(len).fill('')].slice(0, len);
  const r = pad(row, 27);
  return {
    firstName: r[0], lastName: r[1], fullName: r[2],
    company: r[3], role: r[4], category: r[5], relationship: r[6], source: r[7],
    email: r[8], phone: r[9], mobile: r[10], location: r[11],
    dateAdded: r[12], priority: r[13], notes: r[14],
    linkedin: r[15], twitter: r[16],
    currentCompany: r[17], currentTitle: r[18], phoneVerified: r[19],
    enrichmentStatus: r[20], lastEnrichedDate: r[21], enrichmentSource: r[22],
    confidenceScore: r[23], dataQuality: r[24], enrichmentNotes: r[25],
    tags: r[26],
  };
}

/** Convert "HNW; Family Office; Latin America" → ["hnw", "family-office", "latin-america"] */
function tagsToObsidian(tags: string): string[] {
  return tags
    .split(';')
    .map(t => t.trim().toLowerCase().replace(/\s+/g, '-'))
    .filter(Boolean);
}

/** Full name → slug: "Daniel Kim" → "Daniel-Kim" */
function nameToSlug(fullName: string): string {
  return fullName.trim().replace(/\s+/g, '-');
}

// ── Deduplication ─────────────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Union-find: merge groups of duplicate contacts by name, email, or LinkedIn URL.
 *  Returns deduplicated contacts (merged) and the count of rows removed. */
function deduplicateContacts(contacts: Contact[]): { deduped: Contact[]; removed: number } {
  const n = contacts.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(i: number): number {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  }
  function unite(a: number, b: number) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }

  // Build lookup maps for O(n) grouping
  const byName = new Map<string, number>();
  const byEmail = new Map<string, number>();
  const byLinkedIn = new Map<string, number>();

  contacts.forEach((c, i) => {
    const name = normalizeName(c.fullName);
    if (name) {
      const prev = byName.get(name);
      if (prev !== undefined) unite(prev, i); else byName.set(name, i);
    }
    const email = c.email.toLowerCase().trim();
    if (email) {
      const prev = byEmail.get(email);
      if (prev !== undefined) unite(prev, i); else byEmail.set(email, i);
    }
    const li = c.linkedin.toLowerCase().trim().replace(/\/$/, '');
    if (li) {
      const prev = byLinkedIn.get(li);
      if (prev !== undefined) unite(prev, i); else byLinkedIn.set(li, i);
    }
  });

  // Group by root
  const groups = new Map<number, number[]>();
  contacts.forEach((_, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  });

  // Merge each group into one contact
  const deduped: Contact[] = [];
  let removed = 0;

  for (const [, members] of groups) {
    if (members.length === 1) {
      deduped.push(contacts[members[0]]);
      continue;
    }
    removed += members.length - 1;
    const cs = members.map(i => contacts[i]);
    const pick = (...vals: string[]) => vals.filter(Boolean).sort((a, b) => b.length - a.length)[0] || '';
    const merged: Contact = {
      fullName:    pick(...cs.map(c => c.fullName)),
      company:     pick(...cs.map(c => c.company)),
      role:        pick(...cs.map(c => c.role)),
      category:    pick(...cs.map(c => c.category)),
      email:       pick(...cs.map(c => c.email)),
      phone:       pick(...cs.map(c => c.phone)),
      linkedin:    pick(...cs.map(c => c.linkedin)),
      twitter:     pick(...cs.map(c => c.twitter)),
      howWeKnow:   pick(...cs.map(c => c.howWeKnow)),
      topics:      pick(...cs.map(c => c.topics)),
      notes:       cs.map(c => c.notes).filter(Boolean).join('\n---\n'),
      lastContact: pick(...cs.map(c => c.lastContact)),
      followUp:    pick(...cs.map(c => c.followUp)),
      obsidianNote: pick(...cs.map(c => c.obsidianNote)),
      // Merge tags: union of all unique tags across duplicates
      tags: [...new Set(cs.flatMap(c => c.tags.split(';').map(t => t.trim()).filter(Boolean)))].join('; '),
    };
    console.log(`  Merged duplicate: ${merged.fullName} (${members.length} rows → 1)`);
    deduped.push(merged);
  }

  return { deduped, removed };
}

function contactToNote(c: Contact): string {
  const obsidianTags = tagsToObsidian(c.tags);
  const tagsYaml = obsidianTags.length > 0
    ? `tags:\n${obsidianTags.map(t => `  - ${t}`).join('\n')}`
    : 'tags: []';
  const company = c.currentCompany || c.company || '';
  const title = c.currentTitle || c.role || '';
  return `---
type: contact
category: ${c.category || 'professional'}
relationship: ${c.relationship || ''}
source: ${c.source || 'google-sheets'}
date-added: ${c.dateAdded || new Date().toISOString().slice(0, 10)}
location: ${c.location || ''}
priority: ${c.priority || ''}
${tagsYaml}
---

# ${c.fullName}

## Role / Company
${company}
${title}

## Contact Info
- Email: ${c.email || ''}
- Phone: ${c.phone || c.mobile || c.phoneVerified || ''}
- Location: ${c.location || ''}

## Links
- LinkedIn: ${c.linkedin || ''}
- Twitter/X: ${c.twitter || ''}

## Notes
${c.notes || ''}

## Enrichment Notes
${c.enrichmentNotes || ''}
`;
}

// ── Sync logic ────────────────────────────────────────────────────────────────

async function sync() {
  console.log('Getting access token...');
  const token = await getAccessToken();

  fs.mkdirSync(NETWORK_DIR, { recursive: true });

  // 1. Read sheet (skip header row)
  console.log('Reading sheet...');
  const rows = await sheetsGet(token, SHEET_RANGE);
  const rawContacts = rows.filter(r => r[0]?.trim()).map(rowToContact);
  console.log(`  ${rawContacts.length} contacts in sheet`);

  // 1a. Deduplicate sheet rows
  console.log('Checking for duplicates...');
  const { deduped, removed } = deduplicateContacts(rawContacts);
  if (removed > 0) {
    console.log(`  Found ${removed} duplicate row(s) — rewriting sheet...`);
    await sheetsClear(token, SHEET_RANGE);
    await sheetsUpdate(token, SHEET_RANGE, deduped.map(contactToRow));
    console.log(`  Sheet rewritten with ${deduped.length} unique contacts.`);
  } else {
    console.log('  No duplicates found.');
  }
  const sheetContacts = deduped;
  console.log(`  ${sheetContacts.length} contacts after deduplication`);

  // 2. Read obsidian notes
  const noteFiles = fs.existsSync(NETWORK_DIR)
    ? fs.readdirSync(NETWORK_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'))
    : [];
  const noteNames = new Set(noteFiles.map(f => f.replace(/-/g, ' ').replace('.md', '').toLowerCase()));
  const sheetNames = new Set(sheetContacts.map(c => c.fullName.toLowerCase()));
  console.log(`  ${noteFiles.length} notes in Obsidian`);

  let created = 0, updated = 0, appended = 0;

  // Sheet → Obsidian: create/update notes for sheet rows (full-name slugs)
  for (const contact of sheetContacts) {
    if (!contact.fullName) continue;
    const slug = nameToSlug(contact.fullName);
    const notePath = path.join(NETWORK_DIR, `${slug}.md`);
    const noteContent = contactToNote(contact);

    if (!fs.existsSync(notePath)) {
      fs.writeFileSync(notePath, noteContent);
      console.log(`  Created note: ${slug}.md`);
      created++;
    } else {
      // Update if sheet has more data (notes or enrichment)
      const existing = fs.readFileSync(notePath, 'utf-8');
      const hasNewData = (contact.notes && !existing.includes(contact.notes))
        || (contact.enrichmentNotes && !existing.includes(contact.enrichmentNotes))
        || (contact.tags && !existing.includes(contact.tags));
      if (hasNewData) {
        fs.writeFileSync(notePath, noteContent);
        console.log(`  Updated note: ${slug}.md`);
        updated++;
      }
    }
  }

  // Obsidian → Sheet: append notes not in sheet
  const toAppend: string[][] = [];
  for (const file of noteFiles) {
    const notePath = path.join(NETWORK_DIR, file);
    try {
      const contact = parseNote(notePath);
      if (!sheetNames.has(contact.fullName.toLowerCase())) {
        toAppend.push(contactToRow(contact));
        console.log(`  Appending to sheet: ${contact.fullName}`);
        appended++;
      }
    } catch (e) {
      console.warn(`  Skipping ${file}: ${e}`);
    }
  }

  if (toAppend.length > 0) {
    await sheetsAppend(token, toAppend);
  }

  console.log(`\nDone. Created ${created} notes, updated ${updated}, appended ${appended} to sheet.`);
}

// Load .env if running standalone
if (!process.env.GOOGLE_CLIENT_ID) {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
      const [k, ...v] = line.split('=');
      if (k && v.length) process.env[k.trim()] = v.join('=').trim();
    });
  }
}

sync().catch(e => { console.error(e); process.exit(1); });
