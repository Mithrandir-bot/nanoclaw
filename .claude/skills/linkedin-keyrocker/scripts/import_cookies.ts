#!/usr/bin/env npx tsx
/**
 * Import LinkedIn cookies into the persistent Chromium profile.
 *
 * Usage:
 *   npx tsx .claude/skills/linkedin-keyrocker/scripts/import_cookies.ts < cookies.json
 *
 * Or paste the JSON interactively, then Ctrl+D:
 *   npx tsx .claude/skills/linkedin-keyrocker/scripts/import_cookies.ts
 *   [paste JSON]
 *   ^D
 *
 * Accepts the Cookie-Editor / EditThisCookie / "Get cookies.txt LOCALLY"
 * JSON export format — an array of cookie objects, each with at least
 *   name, value, domain  (and optionally path, expirationDate, secure, httpOnly, sameSite).
 *
 * After importing, this script:
 *   1. Launches headed Chromium under Xvfb (no display needed)
 *   2. Adds the cookies to the context
 *   3. Navigates to linkedin.com/feed/ to verify the session works
 *   4. Writes data/linkedin-auth.json if the global nav renders
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { config, cleanupLockFiles } from '../lib/browser.js';

interface InputCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expirationDate?: number;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  hostOnly?: boolean;
}

function readAllStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { buf += c; });
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', reject);
  });
}

function normalizeSameSite(s?: string): 'Strict' | 'Lax' | 'None' | undefined {
  if (!s) return undefined;
  const m = s.toLowerCase();
  if (m === 'strict') return 'Strict';
  if (m === 'lax' || m === 'unspecified') return 'Lax';
  if (m === 'no_restriction' || m === 'none') return 'None';
  return undefined;
}

async function main() {
  const raw = await readAllStdin();
  if (!raw.trim()) {
    console.error('No JSON received on stdin. Paste the cookie export, then press Ctrl+D.');
    process.exit(1);
  }

  let cookies: InputCookie[];
  try {
    const parsed = JSON.parse(raw);
    cookies = Array.isArray(parsed) ? parsed : parsed.cookies;
    if (!Array.isArray(cookies)) throw new Error('expected an array');
  } catch (err) {
    console.error('Could not parse cookie JSON:', (err as Error).message);
    process.exit(1);
  }

  const liCookies = cookies.filter((c) => (c.domain ?? '').includes('linkedin.com'));
  if (liCookies.length === 0) {
    console.error('No linkedin.com cookies found in the export. Make sure you exported cookies while ON linkedin.com.');
    process.exit(1);
  }

  const liAt = liCookies.find((c) => c.name === 'li_at');
  const jsession = liCookies.find((c) => c.name === 'JSESSIONID');
  if (!liAt || !jsession) {
    console.error(
      `Required cookies missing. Found: ${liCookies.map((c) => c.name).join(', ')}`,
    );
    console.error('Need at minimum li_at (auth) and JSESSIONID (CSRF). Export again while logged in.');
    process.exit(1);
  }

  console.log(`Importing ${liCookies.length} LinkedIn cookie(s) — including li_at + JSESSIONID...`);

  fs.mkdirSync(config.browserDataDir, { recursive: true });
  fs.mkdirSync(path.dirname(config.authPath), { recursive: true });
  cleanupLockFiles();

  const playwrightCookies = liCookies.map((c) => {
    const exp = c.expirationDate ?? c.expires;
    return {
      name: c.name,
      value: c.value,
      domain: c.domain ?? '.linkedin.com',
      path: c.path ?? '/',
      expires: typeof exp === 'number' ? Math.floor(exp) : -1,
      httpOnly: !!c.httpOnly,
      secure: c.secure !== false,
      sameSite: normalizeSameSite(c.sameSite) ?? 'Lax',
    };
  });

  const context = await chromium.launchPersistentContext(config.browserDataDir, {
    ...(config.chromePath ? { executablePath: config.chromePath } : {}),
    headless: true, // safe for one-shot import; the cron run will be headed+Xvfb
    viewport: config.viewport,
    userAgent: config.userAgent,
    args: config.chromeArgs,
    ignoreDefaultArgs: config.chromeIgnoreDefaultArgs,
  });

  try {
    await context.addCookies(playwrightCookies as Parameters<typeof context.addCookies>[0]);

    const page = await context.newPage();
    await page.goto('https://www.linkedin.com/feed/', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.waitForTimeout(4000);

    const finalUrl = page.url();
    const onFeed = finalUrl.includes('/feed/');
    const navOk = await page
      .locator('nav.global-nav, [data-test-global-nav]')
      .first()
      .isVisible()
      .catch(() => false);

    if (onFeed && navOk) {
      fs.writeFileSync(
        config.authPath,
        JSON.stringify(
          {
            authenticated: true,
            method: 'cookie_import',
            timestamp: new Date().toISOString(),
            cookieCount: liCookies.length,
          },
          null,
          2,
        ),
      );
      console.log('\nLogged in successfully.');
      console.log(`Session stored at: ${config.browserDataDir}`);
      console.log('You can now use the LinkedIn tools or unpause the cron.');
    } else {
      console.error('\nCookie import succeeded but login verification failed.');
      console.error(`Landed on: ${finalUrl}`);
      console.error('LinkedIn likely tagged the session as new-device. Two options:');
      console.error('  1. Open the LinkedIn email/SMS for a "new sign-in" link and click "Yes, this was me", then re-export cookies.');
      console.error('  2. Use the VNC route instead (more durable).');
      process.exit(2);
    }
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error('Cookie import failed:', err?.message ?? err);
  process.exit(1);
});
