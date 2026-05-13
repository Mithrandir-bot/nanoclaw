#!/usr/bin/env npx tsx
import { getBrowserContext, runScript, ScriptResult, config } from '../lib/browser.js';
import { getProfile } from '../lib/scrape.js';

interface Input {
  query?: string;
}

async function handler(input: Input): Promise<ScriptResult> {
  // Empty / "me" / "self" → own profile via /me redirect
  const profileRef = (input.query ?? '').trim() || 'me';

  const context = await getBrowserContext();
  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto('https://www.linkedin.com/feed/', {
      waitUntil: 'domcontentloaded',
      timeout: config.timeouts.navigation,
    });
    await page.waitForTimeout(config.timeouts.pageLoad);
    if (page.url().includes('/login') || page.url().includes('/checkpoint')) {
      return { success: false, message: 'LinkedIn session expired — re-run scripts/setup.ts over VNC.' };
    }
    const info = await getProfile(page, profileRef);
    return { success: true, message: 'Profile fetched', data: info };
  } finally {
    await context.close();
  }
}

runScript<Input>(handler);
