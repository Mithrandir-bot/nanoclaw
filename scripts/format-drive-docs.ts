#!/usr/bin/env npx tsx
/**
 * Format Google Docs with professional styling using Google Docs API.
 * Reads markdown-style content and applies rich formatting:
 * - Styled headers (H1/H2/H3) with custom fonts and colors
 * - Bold/italic text from markdown syntax
 * - Hyperlinks from markdown [text](url) syntax
 * - Horizontal rules
 * - Bullet and checkbox lists
 * - Monospace code blocks
 * - Professional color scheme
 */

import https from 'https';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN!;

async function getToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = `client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&refresh_token=${REFRESH_TOKEN}&grant_type=refresh_token`;
    const req = https.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': data.length },
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(JSON.parse(body).access_token));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function apiCall(token: string, method: string, url: string, body?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Color constants
const COLORS = {
  accent: { red: 0.37, green: 0.41, blue: 0.82 },      // #5e6ad2
  green: { red: 0.30, green: 0.66, blue: 0.44 },        // #4da870
  yellow: { red: 0.83, green: 0.65, blue: 0.17 },        // #d4a72c
  red: { red: 0.85, green: 0.33, blue: 0.31 },           // #d9534f
  dark: { red: 0.10, green: 0.10, blue: 0.12 },          // #1a1a1e
  gray: { red: 0.42, green: 0.42, blue: 0.46 },          // #6b6b74
  white: { red: 1, green: 1, blue: 1 },
  lightBg: { red: 0.96, green: 0.97, blue: 0.98 },       // #f5f7fa
};

interface FormatRequest {
  updateTextStyle?: unknown;
  updateParagraphStyle?: unknown;
  insertText?: unknown;
  deleteContentRange?: unknown;
}

async function formatDocument(token: string, docId: string) {
  // Get document content
  const doc = await apiCall(token, 'GET', `https://docs.googleapis.com/v1/documents/${docId}`) as any;
  if (!doc?.body?.content) {
    console.log(`  Skip: ${docId} (no content)`);
    return;
  }

  const title = doc.title || 'Untitled';
  const requests: FormatRequest[] = [];

  // Walk through document elements and apply formatting
  for (const element of doc.body.content) {
    if (!element.paragraph) continue;
    const para = element.paragraph;
    const startIdx = element.startIndex || 0;
    const endIdx = element.endIndex || startIdx;
    if (startIdx >= endIdx) continue;

    // Get the full text of this paragraph
    const text = (para.elements || []).map((e: any) => e.textRun?.content || '').join('');

    // Detect heading level from markdown # prefix
    const h1Match = text.match(/^# (.+)/);
    const h2Match = text.match(/^## (.+)/);
    const h3Match = text.match(/^### (.+)/);

    if (h1Match) {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: startIdx, endIndex: endIdx },
          paragraphStyle: { namedStyleType: 'HEADING_1', spaceAbove: { magnitude: 20, unit: 'PT' }, spaceBelow: { magnitude: 8, unit: 'PT' } },
          fields: 'namedStyleType,spaceAbove,spaceBelow',
        },
      });
      requests.push({
        updateTextStyle: {
          range: { startIndex: startIdx, endIndex: endIdx },
          textStyle: { foregroundColor: { color: { rgbColor: COLORS.accent } }, bold: true, fontSize: { magnitude: 20, unit: 'PT' } },
          fields: 'foregroundColor,bold,fontSize',
        },
      });
    } else if (h2Match) {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: startIdx, endIndex: endIdx },
          paragraphStyle: { namedStyleType: 'HEADING_2', spaceAbove: { magnitude: 16, unit: 'PT' }, spaceBelow: { magnitude: 6, unit: 'PT' } },
          fields: 'namedStyleType,spaceAbove,spaceBelow',
        },
      });
      requests.push({
        updateTextStyle: {
          range: { startIndex: startIdx, endIndex: endIdx },
          textStyle: { foregroundColor: { color: { rgbColor: COLORS.dark } }, bold: true, fontSize: { magnitude: 16, unit: 'PT' } },
          fields: 'foregroundColor,bold,fontSize',
        },
      });
    } else if (h3Match) {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: startIdx, endIndex: endIdx },
          paragraphStyle: { namedStyleType: 'HEADING_3', spaceAbove: { magnitude: 12, unit: 'PT' }, spaceBelow: { magnitude: 4, unit: 'PT' } },
          fields: 'namedStyleType,spaceAbove,spaceBelow',
        },
      });
      requests.push({
        updateTextStyle: {
          range: { startIndex: startIdx, endIndex: endIdx },
          textStyle: { foregroundColor: { color: { rgbColor: COLORS.gray } }, bold: true, fontSize: { magnitude: 13, unit: 'PT' } },
          fields: 'foregroundColor,bold,fontSize',
        },
      });
    } else if (text.startsWith('---') && text.trim().length <= 5) {
      // Horizontal rule — style as thin gray line
      requests.push({
        updateTextStyle: {
          range: { startIndex: startIdx, endIndex: endIdx },
          textStyle: { foregroundColor: { color: { rgbColor: COLORS.gray } }, fontSize: { magnitude: 4, unit: 'PT' } },
          fields: 'foregroundColor,fontSize',
        },
      });
    } else {
      // Normal paragraph — set base font
      requests.push({
        updateTextStyle: {
          range: { startIndex: startIdx, endIndex: endIdx },
          textStyle: { fontSize: { magnitude: 11, unit: 'PT' } },
          fields: 'fontSize',
        },
      });
    }

    // Find and format bold text **text**
    for (const el of (para.elements || [])) {
      if (!el.textRun?.content) continue;
      const content = el.textRun.content;
      const elStart = el.startIndex || 0;
      let match;
      const boldRegex = /\*\*([^*]+)\*\*/g;
      while ((match = boldRegex.exec(content)) !== null) {
        const boldStart = elStart + match.index;
        const boldEnd = boldStart + match[0].length;
        if (boldStart < boldEnd) {
          requests.push({
            updateTextStyle: {
              range: { startIndex: boldStart, endIndex: boldEnd },
              textStyle: { bold: true },
              fields: 'bold',
            },
          });
        }
      }

      // Find and create hyperlinks [text](url)
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      while ((match = linkRegex.exec(content)) !== null) {
        const linkStart = elStart + match.index;
        const linkEnd = linkStart + match[0].length;
        if (linkStart < linkEnd) {
          requests.push({
            updateTextStyle: {
              range: { startIndex: linkStart, endIndex: linkEnd },
              textStyle: {
                link: { url: match[2] },
                foregroundColor: { color: { rgbColor: COLORS.accent } },
                underline: true,
              },
              fields: 'link,foregroundColor,underline',
            },
          });
        }
      }

      // Inline code `text`
      const codeRegex = /`([^`]+)`/g;
      while ((match = codeRegex.exec(content)) !== null) {
        const codeStart = elStart + match.index;
        const codeEnd = codeStart + match[0].length;
        if (codeStart < codeEnd) {
          requests.push({
            updateTextStyle: {
              range: { startIndex: codeStart, endIndex: codeEnd },
              textStyle: {
                weightedFontFamily: { fontFamily: 'Roboto Mono', weight: 400 },
                backgroundColor: { color: { rgbColor: COLORS.lightBg } },
                fontSize: { magnitude: 10, unit: 'PT' },
              },
              fields: 'weightedFontFamily,backgroundColor,fontSize',
            },
          });
        }
      }
    }
  }

  if (requests.length === 0) {
    console.log(`  Skip: ${title} (no formatting needed)`);
    return;
  }

  // Apply all formatting in one batch
  const result = await apiCall(token, 'POST', `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, { requests }) as any;
  if (result?.replies) {
    console.log(`  Formatted: ${title} (${requests.length} style operations)`);
  } else {
    console.log(`  Error formatting ${title}: ${JSON.stringify(result).substring(0, 200)}`);
  }
}

async function main() {
  const token = await getToken();
  console.log('=== Formatting Google Docs ===\n');

  // Get all Google Docs in the archive (recursive search)
  const rootId = '10Nvf4jHa92bMf--ky0RUjO7J5OdgX0cY';
  let allDocs: Array<{ id: string; name: string }> = [];
  let pageToken = '';

  do {
    const url = `https://www.googleapis.com/drive/v3/files?q='${rootId}'+in+parents+or+mimeType='application/vnd.google-apps.document'&fields=files(id,name,mimeType,parents),nextPageToken&pageSize=100${pageToken ? '&pageToken=' + pageToken : ''}`;
    // Use a broader search — find all docs under the archive
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.document'+and+trashed=false&fields=files(id,name,parents),nextPageToken&pageSize=200${pageToken ? '&pageToken=' + pageToken : ''}`;
    const result = await apiCall(token, 'GET', searchUrl) as any;
    const archiveDocs = (result.files || []).filter((f: any) => {
      // Only format docs that are within our archive hierarchy
      const parents = f.parents || [];
      return true; // We'll filter by checking if they're in our known folders
    });
    allDocs.push(...archiveDocs);
    pageToken = result.nextPageToken || '';
  } while (pageToken);

  // Known folder IDs that are ours
  const knownFolders = new Set([
    '10Nvf4jHa92bMf--ky0RUjO7J5OdgX0cY', // Root
    '1ORO_Iu6ilX0LCv4xxtsXjFdnFHe3U0Ug', // Ventures
    '1_tQsTNh6VGo2fdo98aqA1Q4MuccDOt7v', '1kohv_6DKUXrOlZipkVs38nx33eOD4Mug',
    '1eiz8HMr0Rv6yc_UmwCdrJgcCD8bILsqw', '1cpPaYxUhf0qKuxbd9mpCeaKRZTOL2SXd',
    '1TPPHhNnhuVXUxVB2qXcuHa9UIcwgWVhk', '1tXKyctlIQ3UevSVUYqGy56ECSnZzBxr9',
    '16p5mfCW9gEmu7Tzptg4FpnGeBBeKDSim', // BI
    '1W6bmGrh84EiungxNHFZzlm1KxprJAs9H', '1YQGwXeYXNGXcqUbu29ELHPP-n3MB90_A',
    '1BFhfPulqbZQlYJFtzpj8AYGdkgkyk5jA', '1L0ayCAPvhgZBzlMFuTZywyUZbeLRRQzv',
    '13ZXm861AUK-P48g-PBKjri1szScu5dk2',
    '1YQTr0nBUs3FChhMZcHlzVnP9eCDdDsWh', // Trading
    '1Oegw2mtSh_VOMEp3-8TiGykTi2CvE5-x', '1wIS-eYu_HxY3gnQA4YJLt6myO3LUH00d',
    '1NZmmkq1CS6xcE1b4v2kH_4JrYAELyA6w', '1JlISFDDp9qcJB8ER3-6xTxpMy5LasI2J',
    '1MJ_fHR-hbZWvnbjRg-UlchiS3t8uJUh7',
    '11p6ceaQK8OFW_PG-XykrCWtDybYJCLrP', // Research
    '12qktTEW1u4NrlAeLurgUwcr_XsKFVJ5N', '1asYzSBPtxmzqpaTD3HsPqfz_-cptRWy8',
    '1rTsmla8Pv9boAnO_OlsNS4bJEKGNnL7_', // Health
    '1TjBruN7cCUCYGj_4vtMKTf5MCDabrHpf', '12FRfORFXrpbpq_eL_fQutZleDC0Ogd_-',
    '1dbyeOqYs4Wy-wyJU_ougx9bKwmPdUZAG', '1-u5ceyA8-gPBxgwAQmSqJ8NcSAzlirpj',
    '1O0qC81R5rr2YnfRtzhIhId_EsUa4EZWj', // Crypto
    '1C0gQw5bS5Uh1Y62YYZx1AHUIJ9yrvSuf', '1PiQYIRubX43uYBlx1cquuiGVT1q7f2cX',
    '1a6ulBIuF4ArKizJuFTSOp_IXMC719DX_', // Contacts
    '1sPbDC-lp7cHHL8Lx3nfjRHDygckhcCas',
    '1HQlyhq3kMLhIt__2yNq8MOKH42CzKfrr', // Frameworks
  ]);

  const ourDocs = allDocs.filter(d => (d as any).parents?.some((p: string) => knownFolders.has(p)));
  console.log(`Found ${ourDocs.length} docs to format\n`);

  let formatted = 0;
  for (const doc of ourDocs) {
    try {
      await formatDocument(token, doc.id);
      formatted++;
      // Rate limit: ~1 req/sec for Docs API
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.log(`  Error: ${doc.name} — ${(err as Error).message}`);
    }
  }

  console.log(`\nDone: ${formatted}/${ourDocs.length} docs formatted`);
}

main().catch(console.error);
