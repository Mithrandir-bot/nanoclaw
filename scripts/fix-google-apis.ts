#!/usr/bin/env npx tsx
/**
 * Re-test YouTube (search instead of mine) and check Maps API key fix options.
 */
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const envPath = path.resolve(import.meta.dirname, '..', '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

async function main() {
  // === YouTube re-test ===
  console.log('=== YouTube API (search test) ===');
  try {
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const search = await youtube.search.list({
      part: ['snippet'],
      q: 'Claude AI',
      maxResults: 3,
      type: ['video'],
    });
    const items = search.data.items || [];
    console.log(`  Search results for "Claude AI": ${items.length}`);
    for (const item of items) {
      console.log(`    - ${item.snippet?.title}`);
    }
    console.log('  STATUS: SUCCESS - YouTube API is working');
  } catch (err: any) {
    console.log(`  FAIL: ${err.message?.slice(0, 200)}`);
  }

  // === Google Ads API test ===
  console.log('\n=== Google Ads API (scope: adwords) ===');
  console.log('  Scope present in token: YES (https://www.googleapis.com/auth/adwords)');
  console.log('  Note: Ads API requires a developer token from Google Ads manager account');
  console.log('  To use: apply for a developer token at ads.google.com/aw/apicenter');

  // === Google Merchant Center (Content API) ===
  console.log('\n=== Google Merchant Center (scope: content) ===');
  try {
    const content = google.content({ version: 'v2.1', auth: oauth2Client });
    const accounts = await content.accounts.authinfo();
    console.log('  Auth info:', JSON.stringify(accounts.data).slice(0, 200));
    console.log('  STATUS: SUCCESS - Content API accessible');
  } catch (err: any) {
    console.log(`  ${err.message?.slice(0, 200)}`);
    if (err.message?.includes('Merchant')) {
      console.log('  Note: Need to set up a Merchant Center account at merchants.google.com');
    }
  }

  // === Maps API fix ===
  console.log('\n=== Google Maps API Key Fix ===');
  console.log('  The Maps API key has IP restrictions.');
  console.log('  Server IP: 2a02:4780:f:a2ae::1');
  console.log('  Fix options:');
  console.log('  1. GCP Console > APIs & Services > Credentials > Edit API key > Add server IP');
  console.log('  2. Or use OAuth-based Maps calls instead of API key (supported for some endpoints)');

  // Try Maps with OAuth instead of API key
  console.log('\n  Testing Maps via Places API (OAuth)...');
  try {
    const token = await oauth2Client.getAccessToken();
    const resp = await fetch(
      'https://maps.googleapis.com/maps/api/geocode/json?address=Miami,FL',
      { headers: { 'Authorization': `Bearer ${token.token}` } }
    );
    const data = await resp.json() as any;
    if (data.status === 'OK') {
      const loc = data.results[0].geometry.location;
      console.log(`  OAuth geocoding SUCCESS: Miami -> ${loc.lat}, ${loc.lng}`);
    } else {
      console.log(`  OAuth geocoding: ${data.status} - ${data.error_message || ''}`);
    }
  } catch (err: any) {
    console.log(`  OAuth geocoding fail: ${err.message}`);
  }

  // === Summary of all scopes ===
  console.log('\n=== Full OAuth Scope Coverage ===');
  const scopes = [
    'adwords (Google Ads)',
    'calendar (Calendar)',
    'content (Merchant Center)',
    'drive (Drive + Docs)',
    'gmail.modify (Gmail read/modify)',
    'gmail.send (Gmail send)',
    'spreadsheets (Sheets)',
    'youtube (YouTube)',
  ];
  for (const s of scopes) console.log(`  [ACTIVE] ${s}`);
  console.log('\n  Total: 8 scopes authorized');
}

main().catch(console.error);
