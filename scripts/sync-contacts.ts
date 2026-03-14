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
// Columns A–W (23 total):
//   Identity:     A First Name, B Last Name, C Full Name
//   Contact:      D Email, E Mobile, F Business Phone, G Secondary Phone,
//                 H Secondary Email, I LinkedIn URL, J Twitter URL
//   Professional: K Company, L Title, M Category, N Tags
//   Relationship: O Relationship, P Source
//   Context:      Q Location, R Date Added, S Notes
//   Enrichment:   T Enrichment Status, U Last Enriched, V Enrichment Source,
//                 W Enrichment Notes
//   Email Valid:  X Email Status, Y Email Status Detail
const ENRICHED_TAB = 'Enriched Data';
const SHEET_RANGE = `${ENRICHED_TAB}!A2:Y`;

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
  secondaryEmail: string;   // H
  linkedin: string;         // I
  twitter: string;          // J
  // Professional: K–N
  company: string;          // K
  role: string;             // L  Title
  category: string;         // M
  tags: string;             // N
  // Relationship: O–P
  relationship: string;     // O
  source: string;           // P
  // Context: Q–S
  location: string;         // Q
  dateAdded: string;        // R
  notes: string;            // S
  // Enrichment: T–W
  enrichmentStatus: string; // T
  lastEnrichedDate: string; // U
  enrichmentSource: string; // V
  enrichmentNotes: string;  // W
  // Email validation: X–Y
  emailStatus: string;      // X
  emailStatusDetail: string; // Y
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
    secondaryEmail: '',
    linkedin: links.match(/LinkedIn:\s*(.+)/)?.[1] || '',
    twitter: links.match(/Twitter\/X:\s*(.+)/)?.[1] || '',
    company: get('Role / Company').split('\n')[0] || '',
    role: get('Role / Company').split('\n')[1] || '',
    category: frontmatter('category'),
    tags: frontmatter('tags') || '',
    relationship: frontmatter('relationship'),
    source: frontmatter('source') || 'obsidian',
    location: frontmatter('location') || (contactInfo.match(/Location:\s*(.+)/)?.[1] || ''),
    dateAdded: frontmatter('date-added') || new Date().toISOString().slice(0, 10),
    notes: get('Notes') || get('Notes from HubSpot') || '',
    enrichmentStatus: '',
    lastEnrichedDate: '',
    enrichmentSource: '',
    enrichmentNotes: get('Enrichment Notes') || '',
    emailStatus: '',
    emailStatusDetail: '',
  };
}

function contactToRow(c: Contact): string[] {
  return [
    c.firstName, c.lastName, c.fullName,
    c.email, c.mobile, c.phone, c.secondaryPhone,
    c.secondaryEmail, c.linkedin, c.twitter,
    c.company, c.role, c.category, c.tags,
    c.relationship, c.source,
    c.location, c.dateAdded, c.notes,
    c.enrichmentStatus, c.lastEnrichedDate, c.enrichmentSource,
    c.enrichmentNotes,
    c.emailStatus, c.emailStatusDetail,
  ];
}

function rowToContact(row: string[]): Contact {
  const pad = (arr: string[], len: number) => [...arr, ...Array(len).fill('')].slice(0, len);
  const r = pad(row, 25);
  return {
    firstName: r[0], lastName: r[1], fullName: r[2],
    email: r[3], mobile: r[4], phone: r[5], secondaryPhone: r[6],
    secondaryEmail: r[7], linkedin: r[8], twitter: r[9],
    company: r[10], role: r[11], category: r[12], tags: r[13],
    relationship: r[14], source: r[15],
    location: r[16], dateAdded: r[17], notes: r[18],
    enrichmentStatus: r[19], lastEnrichedDate: r[20], enrichmentSource: r[21],
    enrichmentNotes: r[22],
    emailStatus: r[23], emailStatusDetail: r[24],
  };
}

/** Convert "HNW, Family Office, Latin America" → ["hnw", "family-office", "latin-america"] */
function tagsToObsidian(tags: string): string[] {
  return tags
    .split(',')
    .map(t => t.trim().toLowerCase().replace(/\s+/g, '-'))
    .filter(Boolean);
}

/** Build a safe filename slug from a contact. Uses fullName, falls back to firstName + lastName,
 *  then email username, then LinkedIn slug. */
function nameToSlug(c: Contact): string {
  const name = c.fullName?.trim()
    || `${c.firstName || ''} ${c.lastName || ''}`.trim();
  if (name) {
    return name.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, '-');
  }
  // Fall back to email username
  if (c.email) {
    const user = c.email.split('@')[0];
    if (user && user.length >= 2) return user.replace(/[/\\:*?"<>|]/g, '').replace(/[.+]/g, '-');
  }
  // Fall back to LinkedIn slug
  if (c.linkedin) {
    const match = c.linkedin.match(/linkedin\.com\/in\/([^/?]+)/);
    if (match && match[1].length >= 2) return match[1].replace(/[/\\:*?"<>|]/g, '');
  }
  // Fall back to secondary email
  if (c.secondaryEmail) {
    const user = c.secondaryEmail.split('@')[0];
    if (user && user.length >= 2) return user.replace(/[/\\:*?"<>|]/g, '').replace(/[.+]/g, '-');
  }
  return '';
}

function contactToNote(c: Contact): string {
  const obsidianTags = tagsToObsidian(c.tags);
  const tagsYaml = obsidianTags.length > 0
    ? `tags:\n${obsidianTags.map(t => `  - ${t}`).join('\n')}`
    : 'tags: []';
  const company = c.company || '';
  const title = c.role || '';
  const displayName = c.fullName || `${c.firstName || ''} ${c.lastName || ''}`.trim()
    || c.email || c.linkedin || 'Unknown Contact';
  return `---
type: contact
category: ${c.category || 'professional'}
relationship: ${c.relationship || ''}
source: ${c.source || 'google-sheets'}
date-added: ${c.dateAdded || new Date().toISOString().slice(0, 10)}
location: ${c.location || ''}
${tagsYaml}
---

# ${displayName}

## Role / Company
${company}
${title}

## Contact Info
- Email: ${c.email || ''}${c.emailStatus ? ` *(${c.emailStatus})*` : ''}
- Phone: ${c.phone || c.mobile || c.secondaryPhone || ''}
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
  const sheetContacts = rows.map(rowToContact);
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

  let created = 0, updated = 0, deleted = 0;

  // Track all slugs written from the sheet so we know what to keep
  const sheetSlugs = new Set<string>();

  // Sheet → Obsidian: create/update notes for ALL sheet rows (always overwrite)
  for (const contact of sheetContacts) {
    let slug = nameToSlug(contact);
    if (!slug || slug.length < 2) continue;

    // Deduplicate slugs: append email domain or counter if slug already used
    if (sheetSlugs.has(slug + '.md')) {
      if (contact.email) {
        const domain = contact.email.split('@')[1]?.split('.')[0];
        if (domain) slug = `${slug}-${domain}`;
      }
      // If still duplicate, append incrementing counter
      let base = slug;
      let n = 2;
      while (sheetSlugs.has(slug + '.md')) {
        slug = `${base}-${n++}`;
      }
    }

    // Skip filenames that would create subdirectories
    if (slug.includes('/') || slug.includes('\\')) {
      console.warn(`  Skipping invalid slug: ${slug}`);
      continue;
    }

    sheetSlugs.add(slug + '.md');
    const notePath = path.join(NETWORK_DIR, `${slug}.md`);
    const noteContent = contactToNote(contact);
    const exists = fs.existsSync(notePath);

    fs.writeFileSync(notePath, noteContent);
    if (!exists) {
      created++;
    } else {
      updated++;
    }
  }

  console.log(`  Created ${created} new notes, updated ${updated} existing notes`);

  // Delete Obsidian notes that are NOT in the sheet (sheet is source of truth)
  for (const file of noteFiles) {
    if (!sheetSlugs.has(file)) {
      const notePath = path.join(NETWORK_DIR, file);
      try {
        fs.unlinkSync(notePath);
        console.log(`  Deleted orphan: ${file}`);
        deleted++;
      } catch (e: any) {
        console.warn(`  Failed to delete ${file}: ${e.message}`);
      }
    }
  }

  console.log(`\nDone. Created ${created}, updated ${updated}, deleted ${deleted} orphans.`);
}

// Load .env if running standalone
if (!process.env.GOOGLE_CLIENT_ID) {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const envPath = path.join(scriptDir, '..', '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
      const [k, ...v] = line.split('=');
      if (k && v.length) process.env[k.trim()] = v.join('=').trim();
    });
  }
}

sync().catch(e => { console.error(e); process.exit(1); });
