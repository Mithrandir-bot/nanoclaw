#!/usr/bin/env npx tsx
/**
 * Google Workspace API Integration Test
 * Tests all available Google APIs with current OAuth credentials.
 */
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

// Load .env manually (no dotenv dependency)
const envPath = path.resolve(import.meta.dirname, '..', '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN!;
const MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY!;
const SHEET_ID = process.env.GOOGLE_CONTACTS_SHEET_ID!;

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

interface TestResult {
  api: string;
  status: 'SUCCESS' | 'FAIL';
  details: string;
  scopeNeeded?: string;
}

const results: TestResult[] = [];

async function testGmail() {
  console.log('\n=== Testing Gmail API ===');
  try {
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    console.log(`  Email: ${profile.data.emailAddress}`);
    console.log(`  Total messages: ${profile.data.messagesTotal}`);

    const messages = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 5,
      q: 'is:inbox',
    });
    const count = messages.data.messages?.length || 0;
    console.log(`  Recent inbox messages: ${count}`);

    results.push({
      api: 'Gmail',
      status: 'SUCCESS',
      details: `Email: ${profile.data.emailAddress}, ${profile.data.messagesTotal} total messages, ${count} recent inbox`,
    });
  } catch (err: any) {
    const msg = err.message || String(err);
    const scopeHint = msg.includes('insufficient') ? 'https://www.googleapis.com/auth/gmail.readonly' : undefined;
    console.log(`  FAIL: ${msg}`);
    results.push({ api: 'Gmail', status: 'FAIL', details: msg, scopeNeeded: scopeHint });
  }
}

async function testSheets() {
  console.log('\n=== Testing Google Sheets API ===');
  try {
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const title = meta.data.properties?.title;
    const sheetNames = meta.data.sheets?.map(s => s.properties?.title) || [];
    console.log(`  Sheet: ${title}`);
    console.log(`  Tabs: ${sheetNames.join(', ')}`);

    // Read first few rows from first sheet
    const range = `${sheetNames[0]}!A1:D5`;
    const data = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range,
    });
    const rowCount = data.data.values?.length || 0;
    console.log(`  Sample rows read: ${rowCount}`);

    results.push({
      api: 'Google Sheets',
      status: 'SUCCESS',
      details: `Sheet: "${title}", tabs: [${sheetNames.join(', ')}], read ${rowCount} sample rows`,
    });
  } catch (err: any) {
    const msg = err.message || String(err);
    console.log(`  FAIL: ${msg}`);
    results.push({ api: 'Google Sheets', status: 'FAIL', details: msg, scopeNeeded: 'https://www.googleapis.com/auth/spreadsheets.readonly' });
  }
}

async function testDrive() {
  console.log('\n=== Testing Google Drive API ===');
  try {
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const files = await drive.files.list({
      pageSize: 10,
      fields: 'files(id, name, mimeType, modifiedTime)',
      orderBy: 'modifiedTime desc',
    });
    const fileList = files.data.files || [];
    console.log(`  Recent files: ${fileList.length}`);
    for (const f of fileList.slice(0, 5)) {
      console.log(`    - ${f.name} (${f.mimeType})`);
    }

    results.push({
      api: 'Google Drive',
      status: 'SUCCESS',
      details: `Listed ${fileList.length} recent files. Top: ${fileList.slice(0, 3).map(f => f.name).join(', ')}`,
    });
  } catch (err: any) {
    const msg = err.message || String(err);
    console.log(`  FAIL: ${msg}`);
    results.push({ api: 'Google Drive', status: 'FAIL', details: msg, scopeNeeded: 'https://www.googleapis.com/auth/drive.readonly' });
  }
}

async function testCalendar() {
  console.log('\n=== Testing Google Calendar API ===');
  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const calList = await calendar.calendarList.list();
    const calendars = calList.data.items || [];
    console.log(`  Calendars: ${calendars.length}`);
    for (const c of calendars.slice(0, 5)) {
      console.log(`    - ${c.summary} (${c.id})`);
    }

    // Get upcoming events from primary calendar
    const events = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 5,
      singleEvents: true,
      orderBy: 'startTime',
    });
    const eventList = events.data.items || [];
    console.log(`  Upcoming events: ${eventList.length}`);
    for (const e of eventList) {
      const start = e.start?.dateTime || e.start?.date;
      console.log(`    - ${e.summary} @ ${start}`);
    }

    results.push({
      api: 'Google Calendar',
      status: 'SUCCESS',
      details: `${calendars.length} calendars, ${eventList.length} upcoming events`,
    });
  } catch (err: any) {
    const msg = err.message || String(err);
    console.log(`  FAIL: ${msg}`);
    results.push({ api: 'Google Calendar', status: 'FAIL', details: msg, scopeNeeded: 'https://www.googleapis.com/auth/calendar.readonly' });
  }
}

async function testDocs() {
  console.log('\n=== Testing Google Docs API ===');
  try {
    // First find a doc via Drive
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const docs = await drive.files.list({
      pageSize: 5,
      q: "mimeType='application/vnd.google-apps.document'",
      fields: 'files(id, name)',
      orderBy: 'modifiedTime desc',
    });
    const docList = docs.data.files || [];
    console.log(`  Recent docs: ${docList.length}`);

    if (docList.length > 0) {
      const docsApi = google.docs({ version: 'v1', auth: oauth2Client });
      const doc = await docsApi.documents.get({ documentId: docList[0].id! });
      console.log(`  Read doc: "${doc.data.title}" (${doc.data.body?.content?.length || 0} content elements)`);
      results.push({
        api: 'Google Docs',
        status: 'SUCCESS',
        details: `Found ${docList.length} docs. Read: "${doc.data.title}"`,
      });
    } else {
      results.push({
        api: 'Google Docs',
        status: 'SUCCESS',
        details: 'API accessible but no documents found',
      });
    }
  } catch (err: any) {
    const msg = err.message || String(err);
    console.log(`  FAIL: ${msg}`);
    results.push({ api: 'Google Docs', status: 'FAIL', details: msg, scopeNeeded: 'https://www.googleapis.com/auth/documents.readonly' });
  }
}

async function testMaps() {
  console.log('\n=== Testing Google Maps API ===');
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=Miami,FL&key=${MAPS_API_KEY}`;
    const resp = await fetch(url);
    const data = await resp.json() as any;

    if (data.status === 'OK' && data.results?.length > 0) {
      const loc = data.results[0].geometry.location;
      console.log(`  Geocoded "Miami, FL" -> ${loc.lat}, ${loc.lng}`);
      results.push({
        api: 'Google Maps (Geocoding)',
        status: 'SUCCESS',
        details: `Geocoded "Miami, FL" -> lat: ${loc.lat}, lng: ${loc.lng}`,
      });
    } else {
      console.log(`  API returned: ${data.status} - ${data.error_message || 'no error message'}`);
      results.push({
        api: 'Google Maps (Geocoding)',
        status: 'FAIL',
        details: `Status: ${data.status}, ${data.error_message || 'no details'}`,
      });
    }
  } catch (err: any) {
    const msg = err.message || String(err);
    console.log(`  FAIL: ${msg}`);
    results.push({ api: 'Google Maps (Geocoding)', status: 'FAIL', details: msg });
  }
}

async function testYouTube() {
  console.log('\n=== Testing YouTube API ===');
  try {
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const channels = await youtube.channels.list({
      part: ['snippet', 'statistics'],
      mine: true,
    });
    const ch = channels.data.items?.[0];
    if (ch) {
      console.log(`  Channel: ${ch.snippet?.title} (${ch.statistics?.subscriberCount} subs)`);
      results.push({
        api: 'YouTube',
        status: 'SUCCESS',
        details: `Channel: ${ch.snippet?.title}, ${ch.statistics?.subscriberCount} subscribers`,
      });
    } else {
      results.push({
        api: 'YouTube',
        status: 'SUCCESS',
        details: 'API accessible, no channel found for this account',
      });
    }
  } catch (err: any) {
    const msg = err.message || String(err);
    const needsScope = msg.includes('insufficient') || msg.includes('forbidden');
    console.log(`  FAIL: ${msg}`);
    results.push({
      api: 'YouTube',
      status: 'FAIL',
      details: msg.slice(0, 200),
      scopeNeeded: needsScope ? 'https://www.googleapis.com/auth/youtube.readonly' : undefined,
    });
  }
}

async function main() {
  console.log('Google Workspace API Integration Test');
  console.log('=====================================');
  console.log(`Time: ${new Date().toISOString()}`);

  // Get token info first
  try {
    const tokenInfo = await oauth2Client.getAccessToken();
    console.log(`\nAccess token obtained: ${tokenInfo.token ? 'YES' : 'NO'}`);
  } catch (err: any) {
    console.log(`\nFailed to get access token: ${err.message}`);
    console.log('All tests will likely fail.');
  }

  await testGmail();
  await testSheets();
  await testDrive();
  await testCalendar();
  await testDocs();
  await testMaps();
  await testYouTube();

  // Summary
  console.log('\n\n========== SUMMARY ==========');
  const pass = results.filter(r => r.status === 'SUCCESS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  console.log(`${pass} PASSED, ${fail} FAILED out of ${results.length} APIs tested\n`);

  for (const r of results) {
    const icon = r.status === 'SUCCESS' ? 'PASS' : 'FAIL';
    console.log(`[${icon}] ${r.api}: ${r.details.slice(0, 120)}`);
    if (r.scopeNeeded) console.log(`       Scope needed: ${r.scopeNeeded}`);
  }
}

main().catch(console.error);
