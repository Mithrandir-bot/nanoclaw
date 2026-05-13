#!/usr/bin/env npx tsx
import { getBrowserContext, runScript, ScriptResult, config } from '../lib/browser.js';
import { readThread } from '../lib/scrape.js';

interface Input {
  thread_url: string;
  limit?: number;
}

async function handler(input: Input): Promise<ScriptResult> {
  if (!input.thread_url) return { success: false, message: 'Missing thread_url' };

  const context = await getBrowserContext();
  try {
    const page = context.pages()[0] || (await context.newPage());
    // Land on feed first so the session is fully warmed before Voyager calls.
    await page.goto('https://www.linkedin.com/feed/', {
      waitUntil: 'domcontentloaded',
      timeout: config.timeouts.navigation,
    });
    await page.waitForTimeout(config.timeouts.pageLoad);

    if (page.url().includes('/login') || page.url().includes('/checkpoint')) {
      return { success: false, message: 'LinkedIn session expired — re-run scripts/setup.ts over VNC.' };
    }

    const messages = await readThread(page, input.thread_url, input.limit ?? 20);
    return {
      success: true,
      message: `Read ${messages.length} message(s)`,
      data: messages,
    };
  } finally {
    await context.close();
  }
}

runScript<Input>(handler);
