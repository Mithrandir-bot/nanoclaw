/**
 * LinkedIn integration — configuration
 */

import path from 'path';

const PROJECT_ROOT = process.env.NANOCLAW_ROOT || process.cwd();

export const config = {
  // Persistent Chromium user-data-dir (cookies, localStorage, fingerprint).
  // Set up once via scripts/setup.ts over VNC/X-forwarding.
  browserDataDir: path.join(PROJECT_ROOT, 'data', 'linkedin-browser-profile'),

  // Marker file written after a successful setup
  authPath: path.join(PROJECT_ROOT, 'data', 'linkedin-auth.json'),

  // Display for Xvfb-driven headed mode in production runs.
  // Override via LINKEDIN_DISPLAY env var.
  display: process.env.LINKEDIN_DISPLAY || ':99',

  // Chromium executable. Leave undefined to use Playwright's bundled
  // chromium (auto-installed at ~/.cache/ms-playwright/). Override via
  // CHROME_PATH env var only if you have a specific Chrome build to use.
  chromePath: process.env.CHROME_PATH || undefined,

  viewport: { width: 1366, height: 900 },

  // User agent for stealth — recent stable Chrome on macOS (matches typical desktop)
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',

  timeouts: {
    navigation: 30000,
    pageLoad: 4000,
    afterClick: 1200,
    elementWait: 8000,
  },

  // Anti-detection: minimum delay between any two Voyager/DOM requests inside one script run
  minRequestSpacingMs: 1500,

  // Daily quota on people-search to dodge LinkedIn's Commercial Use Limit.
  // Tracked in data/linkedin-quota.json.
  searchDailyCap: 20,
  quotaPath: path.join(PROJECT_ROOT, 'data', 'linkedin-quota.json'),

  // Host-side velocity throttle: if more than `throttleMaxCalls` requests
  // arrive within `throttleWindowMs`, force a `throttleCooldownMs` pause.
  throttleMaxCalls: 3,
  throttleWindowMs: 60_000,
  throttleCooldownMs: 30_000,

  // Voyager API base
  voyagerBase: 'https://www.linkedin.com/voyager/api',

  chromeArgs: [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--disable-features=IsolateOrigins,site-per-process',
  ],

  chromeIgnoreDefaultArgs: ['--enable-automation'],
};
