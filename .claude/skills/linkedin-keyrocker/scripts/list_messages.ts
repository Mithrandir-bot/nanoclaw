#!/usr/bin/env npx tsx
import { getBrowserContext, runScript, ScriptResult, config } from '../lib/browser.js';
import { listThreads } from '../lib/scrape.js';

interface Input {
  limit?: number;
  unreadOnly?: boolean;
}

async function handler(input: Input): Promise<ScriptResult> {
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

    const threads = await listThreads(page, {
      limit: input.limit ?? 15,
      unreadOnly: input.unreadOnly ?? false,
      includeSponsored: false,
    });

    return {
      success: true,
      message: `Found ${threads.length} thread(s)`,
      data: threads,
    };
  } finally {
    await context.close();
  }
}

runScript<Input>(handler);
