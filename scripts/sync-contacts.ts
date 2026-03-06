#!/usr/bin/env npx ts-node
/**
 * sync-contacts.ts
 *
 * Syncs contacts between Google Sheets and Obsidian vault.
 *
 * Sheet → Obsidian: New/updated rows in the sheet create/update .md notes
 * Obsidian → Sheet: New .md notes in Contacts/Network/ append rows to the sheet
 *
 * IMPORTANT: This script NEVER modifies or deletes sheet rows. It is read-only
 * for the sheet (except appending new rows from Obsidian). Deduplication is
 * handled separately by the agent's Python scripts which have proper merge logic.
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
// Columns A–X (24 total):
//   Identity:     A First Name, B Last Name, C Full Name
//   Contact:      D Email, E Mobile, F Business Phone, G Secondary Phone,
//                 H Phone (Verified), I LinkedIn URL, J Twitter URL
//   Professional: K Company, L Title, M Category, N Tags
//   Relationship: O Relationship, P Source, Q Priority
//   Context:      R Location, S Date Added, T Notes
//   Enrichment:   U Enrichment Status, V Last Enriched, W Enrichment Source,
//                 X Enrichment Notes
const ENRICHED_TAB = 'Enriched Data';
const SHEET_RANGE = `${ENRICHED_TAB}!A2:X`;

// Minimum row count to consider the sheet "populated". If below this threshold,
// skip Obsidian→Sheet appends to avoid flooding an empty/in-progress sheet.
const MIN_SHEET_ROWS = 50;

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
    path: `/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(ENRICHED_TAB + '!A:X')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);
}

// ── Note parsing ──────────────────────────────────────────────────────────────

interface Contact {
  // Identity: A–C
  firstName: string;        // A
  lastName: string;         // B
  fullName: string;         // C
  // Contact: D–J
  email: string;            // D
  mobile: string;           // E
  phone: string;            // F  Business Phone
  secondaryPhone: string;   // G
  phoneVerified: string;    // H
  linkedin: string;         // I
  twitter: string;          // J
  // Professional: K–N
  company: string;          // K
  role: string;             // L  Title
  category: string;         // M
  tags: string;             // N
  // Relationship: O–Q
  relationship: string;     // O
  source: string;           // P
  priority: string;         // Q
  // Context: R–T
  location: string;         // R
  dateAdded: string;        // S
  notes: string;            // T
  // Enrichment: U–X
  enrichmentStatus: string; // U
  lastEnrichedDate: string; // V
  enrichmentSource: string; // W
  enrichmentNotes: string;  // X
}

function parseNote(filePath: string): Contact | null {
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

  const fullName = fileName.replace(/-/g, ' ');
  // Require at least a first and last name (2+ words) to avoid junk entries
  const nameParts = fullName.trim().split(/\s+/);
  if (nameParts.length < 2) {
    return null;
  }

  const contactInfo = get('Contact Info');
  const links = get('Links');

  return {
    firstName: nameParts[0],
    lastName: nameParts.slice(1).join(' '),
    fullName,
    email: contactInfo.match(/Email:\s*(.+)/)?.[1] || links.match(/Email:\s*(.+)/)?.[1] || '',
    mobile: '',
    phone: contactInfo.match(/Phone:\s*(.+)/)?.[1] || '',
    secondaryPhone: '',
    phoneVerified: '',
    linkedin: links.match(/LinkedIn:\s*(.+)/)?.[1] || '',
    twitter: links.match(/Twitter\/X:\s*(.+)/)?.[1] || '',
    company: get('Role / Company').split('\n')[0] || '',
    role: get('Role / Company').split('\n')[1] || '',
    category: frontmatter('category'),
    tags: frontmatter('tags') || '',
    relationship: frontmatter('relationship'),
    source: frontmatter('source') || 'obsidian',
    priority: frontmatter('priority'),
    location: frontmatter('location') || (contactInfo.match(/Location:\s*(.+)/)?.[1] || ''),
    dateAdded: frontmatter('date-added') || new Date().toISOString().slice(0, 10),
    notes: get('Notes') || get('Notes from HubSpot') || '',
    enrichmentStatus: '',
    lastEnrichedDate: '',
    enrichmentSource: '',
    enrichmentNotes: get('Enrichment Notes') || '',
  };
}

function contactToRow(c: Contact): string[] {
  return [
    c.firstName, c.lastName, c.fullName,
    c.email, c.mobile, c.phone, c.secondaryPhone,
    c.phoneVerified, c.linkedin, c.twitter,
    c.company, c.role, c.category, c.tags,
    c.relationship, c.source, c.priority,
    c.location, c.dateAdded, c.notes,
    c.enrichmentStatus, c.lastEnrichedDate, c.enrichmentSource,
    c.enrichmentNotes,
  ];
}

function rowToContact(row: string[]): Contact {
  const pad = (arr: string[], len: number) => [...arr, ...Array(len).fill('')].slice(0, len);
  const r = pad(row, 24);
  return {
    firstName: r[0], lastName: r[1], fullName: r[2],
    email: r[3], mobile: r[4], phone: r[5], secondaryPhone: r[6],
    phoneVerified: r[7], linkedin: r[8], twitter: r[9],
    company: r[10], role: r[11], category: r[12], tags: r[13],
    relationship: r[14], source: r[15], priority: r[16],
    location: r[17], dateAdded: r[18], notes: r[19],
    enrichmentStatus: r[20], lastEnrichedDate: r[21], enrichmentSource: r[22],
    enrichmentNotes: r[23],
  };
}

/** Convert "HNW, Family Office, Latin America" → ["hnw", "family-office", "latin-america"] */
function tagsToObsidian(tags: string): string[] {
  return tags
    .split(',')
    .map(t => t.trim().toLowerCase().replace(/\s+/g, '-'))
    .filter(Boolean);
}

/** Build a safe filename slug from a contact. Uses fullName, falls back to firstName + lastName. */
function nameToSlug(c: Contact): string {
  const name = c.fullName?.trim()
    || `${c.firstName || ''} ${c.lastName || ''}`.trim();
  if (!name) return '';
  // Remove characters that are invalid in filenames
  return name.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, '-');
}

function contactToNote(c: Contact): string {
  const obsidianTags = tagsToObsidian(c.tags);
  const tagsYaml = obsidianTags.length > 0
    ? `tags:\n${obsidianTags.map(t => `  - ${t}`).join('\n')}`
    : 'tags: []';
  const company = c.company || '';
  const title = c.role || '';
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
  const sheetContacts = rows.filter(r => r[0]?.trim()).map(rowToContact);
  console.log(`  ${sheetContacts.length} contacts in sheet`);

  // 2. Read obsidian notes
  const noteFiles = fs.existsSync(NETWORK_DIR)
    ? fs.readdirSync(NETWORK_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'))
    : [];
  console.log(`  ${noteFiles.length} notes in Obsidian`);

  // Build lookup set of sheet fullNames (lowercased) for matching
  const sheetNames = new Set(sheetContacts.map(c => c.fullName.toLowerCase().trim()).filter(Boolean));
  // Also index by firstName+lastName for contacts where fullName might differ
  for (const c of sheetContacts) {
    const altName = `${c.firstName} ${c.lastName}`.toLowerCase().trim();
    if (altName) sheetNames.add(altName);
  }

  let created = 0, updated = 0, appended = 0;

  // Sheet → Obsidian: create/update notes for sheet rows
  for (const contact of sheetContacts) {
    const slug = nameToSlug(contact);
    if (!slug || slug.length < 3) continue; // skip empty/too-short names

    const notePath = path.join(NETWORK_DIR, `${slug}.md`);

    // Skip filenames that would create subdirectories (e.g., names with /)
    if (slug.includes('/') || slug.includes('\\')) {
      console.warn(`  Skipping invalid slug: ${slug}`);
      continue;
    }

    const noteContent = contactToNote(contact);

    if (!fs.existsSync(notePath)) {
      try {
        fs.writeFileSync(notePath, noteContent);
        console.log(`  Created note: ${slug}.md`);
        created++;
      } catch (e: any) {
        console.warn(`  Failed to create ${slug}.md: ${e.message}`);
      }
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
  // Guard: only append if sheet has a reasonable number of rows.
  // If sheet appears empty/near-empty, skip to avoid flooding during agent operations.
  if (sheetContacts.length < MIN_SHEET_ROWS) {
    console.log(`  Sheet has only ${sheetContacts.length} rows (< ${MIN_SHEET_ROWS}). Skipping Obsidian→Sheet append.`);
  } else {
    const toAppend: string[][] = [];
    for (const file of noteFiles) {
      const notePath = path.join(NETWORK_DIR, file);
      try {
        const contact = parseNote(notePath);
        if (!contact) continue; // skip notes that don't parse to valid contacts
        if (!sheetNames.has(contact.fullName.toLowerCase().trim())) {
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
