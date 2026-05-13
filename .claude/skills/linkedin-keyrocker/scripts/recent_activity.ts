#!/usr/bin/env npx tsx
import { getBrowserContext, runScript, ScriptResult, config } from '../lib/browser.js';
import { getRecentActivity } from '../lib/scrape.js';

interface Input {
  profile_url?: string;
  limit?: number;
}

async function handler(input: Input): Promise<ScriptResult> {
  // Empty / "me" / "self" means "my own profile" — resolved via /me inside getRecentActivity
  const profileRef = (input.profile_url ?? '').trim() || 'me';

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
    const posts = await getRecentActivity(page, profileRef, input.limit ?? 10);
    return { success: true, message: `Found ${posts.length} post(s)`, data: posts };
  } finally {
    await context.close();
  }
}

runScript<Input>(handler);
