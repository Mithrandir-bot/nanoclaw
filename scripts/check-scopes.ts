#!/usr/bin/env npx tsx
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
  const tokenResult = await oauth2Client.getAccessToken();
  const token = tokenResult.token;
  if (!token) { console.log('Failed to get token'); return; }

  const tokenInfo = await oauth2Client.getTokenInfo(token);
  console.log('Current scopes:');
  for (const s of tokenInfo.scopes || []) console.log(' ', s);
  console.log('\nExpiry:', tokenInfo.expiry_date ? new Date(tokenInfo.expiry_date).toISOString() : 'unknown');

  // Check GCP project number from token info
  console.log('\nAudience/azp:', (tokenInfo as any).azp || 'unknown');

  // Try to get API key info via the apikeys.googleapis.com API
  const apikeys = google.apikeys({ version: 'v2', auth: oauth2Client });
  try {
    // List keys - need to know the project ID
    // Try to get project info from the client ID
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    // GCP project ID is embedded in various places, let's try to discover
    console.log('\nClient ID prefix:', clientId.split('-')[0]);

    // Try cloud resource manager to find the project
    const crm = google.cloudresourcemanager({ version: 'v1', auth: oauth2Client });
    const projects = await crm.projects.list();
    console.log('\nGCP Projects:');
    for (const p of projects.data.projects || []) {
      console.log(`  ${p.projectId} (${p.name}) - ${p.lifecycleState}`);
    }
  } catch (err: any) {
    console.log('\nCould not list GCP projects:', err.message?.slice(0, 200));
  }
}

main().catch(console.error);
