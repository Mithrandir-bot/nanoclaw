#!/usr/bin/env node
/**
 * Fetch all finalized Kalshi weather markets with price data.
 * Runs in batches with rate limiting to avoid API throttling.
 * Saves progress incrementally so it can resume if interrupted.
 */
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'groups', 'trading', 'kalshi-weather-bot', 'data');
const OUTPUT = path.join(DATA_DIR, 'kalshi-historical.json');
const PROGRESS = path.join(DATA_DIR, 'kalshi-fetch-progress.json');
const BASE = '/trade-api/v2';

// Load credentials
const db = new Database(path.join(__dirname, '..', 'store', 'messages.db'), { readonly: true });
const encKey = process.env.SECRETS_ENCRYPTION_KEY;

if (!encKey) {
  console.error('SECRETS_ENCRYPTION_KEY not set');
  process.exit(1);
}

function decrypt(stored) {
  const key = Buffer.from(encKey, 'hex');
  const [ivHex, tagHex, dataHex] = stored.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(dataHex, 'hex')).toString('utf-8') + decipher.final('utf-8');
}

const apiKey = decrypt(db.prepare('SELECT encrypted_value FROM secrets WHERE name=?').get('kalshi_api_key').encrypted_value);
const apiSecret = decrypt(db.prepare('SELECT encrypted_value FROM secrets WHERE name=?').get('kalshi_api_secret').encrypted_value);

function sign(method, fullPath, ts) {
  const pk = crypto.createPrivateKey(apiSecret);
  return crypto.sign('sha256', Buffer.from(ts + method + fullPath), {
    key: pk, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32
  }).toString('base64');
}

function get(apiPath) {
  return new Promise((resolve, reject) => {
    const fullPath = BASE + apiPath;
    const ts = String(Math.floor(Date.now() / 1000));
    https.get({
      hostname: 'api.elections.kalshi.com',
      path: fullPath,
      headers: {
        'Accept': 'application/json',
        'KALSHI-ACCESS-KEY': apiKey,
        'KALSHI-ACCESS-SIGNATURE': sign('GET', fullPath, ts),
        'KALSHI-ACCESS-TIMESTAMP': ts,
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { reject(new Error(d.substring(0, 300))); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log(`[${new Date().toISOString()}] Starting Kalshi historical fetch...`);

  // Load progress
  let existing = [];
  let fetched = new Set();
  try {
    existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf-8'));
    fetched = new Set(existing.map(m => m.ticker));
    console.log(`Loaded ${existing.length} existing markets (resuming)`);
  } catch { }

  // Step 1: Get all finalized market tickers
  const cities = ['KXHIGHNY', 'KXHIGHCHI', 'KXHIGHMIA', 'KXHIGHDEN'];
  const allTickers = [];

  for (const city of cities) {
    const r = await get(`/events?series_ticker=${city}&limit=100&with_nested_markets=true`);
    for (const e of (r.events || [])) {
      for (const m of (e.markets || [])) {
        if (m.status === 'finalized' && m.result && !fetched.has(m.ticker)) {
          allTickers.push({ ticker: m.ticker, city: city.replace('KXHIGH', ''), event: e.event_ticker, result: m.result });
        }
      }
    }
    console.log(`${city}: found ${allTickers.filter(t => t.city === city.replace('KXHIGH', '')).length} new finalized markets`);
    await sleep(200);
  }

  console.log(`Total to fetch: ${allTickers.length} (${existing.length} already done)`);

  // Step 2: Fetch details in batches
  let count = 0;
  const BATCH = 50;

  for (let i = 0; i < allTickers.length; i++) {
    const t = allTickers[i];
    try {
      const detail = await get(`/markets/${t.ticker}`);
      const md = detail.market || {};

      existing.push({
        ticker: t.ticker,
        city: t.city,
        event: t.event,
        subtitle: md.subtitle || md.yes_sub_title || '',
        result: t.result,
        last_price: parseFloat(md.last_price_dollars || '0'),
        prev_price: parseFloat(md.previous_price_dollars || '0'),
        volume: parseInt(md.volume_fp || '0'),
        open_interest: parseInt(md.open_interest_fp || '0'),
        settlement_value: parseFloat(md.settlement_value_dollars || '0'),
        floor_strike: md.floor_strike,
        cap_strike: md.cap_strike,
        close_time: md.close_time,
        settlement_ts: md.settlement_ts,
      });
      count++;

      // Save progress every BATCH
      if (count % BATCH === 0) {
        fs.writeFileSync(OUTPUT, JSON.stringify(existing, null, 2));
        console.log(`[${new Date().toISOString()}] Progress: ${existing.length} total (${count} new this run)`);
      }
    } catch (e) {
      console.log(`  Error on ${t.ticker}: ${e.message.substring(0, 80)}`);
    }
    await sleep(150); // ~6-7 req/sec, within rate limits
  }

  // Final save
  fs.writeFileSync(OUTPUT, JSON.stringify(existing, null, 2));
  console.log(`\n[${new Date().toISOString()}] Complete: ${existing.length} total markets saved`);

  // Quick analysis
  const byCity = {};
  for (const m of existing) {
    if (!byCity[m.city]) byCity[m.city] = { count: 0, yes: 0, no: 0, vol: 0, correct: 0 };
    byCity[m.city].count++;
    if (m.result === 'yes') byCity[m.city].yes++;
    else byCity[m.city].no++;
    byCity[m.city].vol += m.volume;
    if ((m.prev_price > 0.5) === (m.result === 'yes')) byCity[m.city].correct++;
  }

  console.log('\n=== ANALYSIS ===');
  for (const [city, d] of Object.entries(byCity)) {
    console.log(`${city}: ${d.count} markets, ${d.yes} YES / ${d.no} NO, accuracy=${Math.round(d.correct / d.count * 100)}%, avg vol=${Math.round(d.vol / d.count)}`);
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
