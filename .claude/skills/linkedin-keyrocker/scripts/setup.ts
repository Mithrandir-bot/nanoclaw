#!/usr/bin/env npx tsx
/**
 * One-time LinkedIn login.
 *
 * Designed to be run interactively over VNC or SSH X-forwarding:
 *
 *   # On your laptop:
 *   ssh -X user@server   (or open a VNC session)
 *
 *   # On the server, with $DISPLAY exported:
 *   npx dotenv -e .env -- npx tsx .claude/skills/linkedin-keyrocker/scripts/setup.ts
 *
 * The script launches headed Chromium pointed at LinkedIn login, then waits
 * for you to type credentials + complete 2FA / security challenge. When it
 * detects you've landed on /feed/, it writes data/linkedin-auth.json and
 * exits. Persistent profile is preserved at data/linkedin-browser-profile/.
 */

import { chromium } from 'playwright';
import * as readline from 'readline';
import fs from 'fs';
import path from 'path';
import { config, cleanupLockFiles } from '../lib/browser.js';

async function setup(): Promise<void> {
  console.log('=== LinkedIn Authentication Setup (Keyrocker) ===\n');

  if (!process.env.DISPLAY && !process.env.LINKEDIN_DISPLAY) {
    console.log('WARNING: no $DISPLAY detected. Setup needs a graphical session.');
    console.log('Options:');
    console.log('  - SSH with X-forwarding:  ssh -X user@host  (then re-run this)');
    console.log('  - VNC session:            xvfb-run -a npx tsx ... (then VNC to :99)');
    console.log('  - Local desktop terminal\n');
    process.exit(2);
  }

  console.log(`Chrome path: ${config.chromePath}`);
  console.log(`Profile dir: ${config.browserDataDir}`);
  console.log(`DISPLAY:     ${process.env.DISPLAY || config.display}\n`);

  fs.mkdirSync(path.dirname(config.authPath), { recursive: true });
  fs.mkdirSync(config.browserDataDir, { recursive: true });
  cleanupLockFiles();

  console.log('Launching Chromium...\n');
  const context = await chromium.launchPersistentContext(config.browserDataDir, {
    ...(config.chromePath ? { executablePath: config.chromePath } : {}),
    headless: false,
    viewport: config.viewport,
    userAgent: config.userAgent,
    args: config.chromeArgs.slice(0, 5),
    ignoreDefaultArgs: config.chromeIgnoreDefaultArgs,
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.goto('https://www.linkedin.com/login');

  console.log('Please log in to LinkedIn in the browser window.');
  console.log('Complete 2FA / security challenge if prompted.');
  console.log('Once you see your home feed, press Enter here.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) =>
    rl.question('Press Enter when logged in... ', () => {
      rl.close();
      resolve();
    }),
  );

  console.log('\nVerifying login state...');
  await page.goto('https://www.linkedin.com/feed/');
  await page.waitForTimeout(4000);

  const onFeed = page.url().includes('/feed/');
  const navOk = await page
    .locator('nav.global-nav, [data-test-global-nav]')
    .first()
    .isVisible()
    .catch(() => false);

  if (onFeed && navOk) {
    fs.writeFileSync(
      config.authPath,
      JSON.stringify({ authenticated: true, timestamp: new Date().toISOString() }, null, 2),
    );
    console.log('\nAuthentication successful.');
    console.log(`Session saved to: ${config.browserDataDir}`);
    console.log('\nNext steps:');
    console.log('  1. Warm up the profile by browsing LinkedIn manually for ~3 days');
    console.log('     before enabling the cron, so the trust score builds.');
    console.log('  2. systemctl restart nanoclaw');
  } else {
    console.log('\nCould not verify login. Current URL:', page.url());
    console.log('Re-run setup once logged in.');
  }

  await context.close();
}

setup().catch((err) => {
  console.error('Setup failed:', err?.message ?? err);
  process.exit(1);
});
