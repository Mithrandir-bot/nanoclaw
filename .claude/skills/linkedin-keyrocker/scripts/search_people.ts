#!/usr/bin/env npx tsx
import { getBrowserContext, runScript, ScriptResult, config } from '../lib/browser.js';
import { searchPeople } from '../lib/scrape.js';

interface Input {
  query: string;
  limit?: number;
}

async function handler(input: Input): Promise<ScriptResult> {
  if (!input.query) return { success: false, message: 'Missing query' };

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
    const hits = await searchPeople(page, input.query, input.limit ?? 5);
    return { success: true, message: `Found ${hits.length} person(s)`, data: hits };
  } finally {
    await context.close();
  }
}

runScript<Input>(handler);
