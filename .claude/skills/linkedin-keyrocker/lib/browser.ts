/**
 * LinkedIn integration — Playwright session + Voyager helpers
 *
 * Mirrors x-integration/lib/browser.ts but adds:
 *   - stealth fingerprint (navigator.webdriver, UA, plugins)
 *   - Voyager JSON request helper with Csrf-Token + X-Restli headers
 *   - inter-request spacing to dodge velocity detection
 */

import { chromium, BrowserContext, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';

export { config };

export interface ScriptResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export async function readInput<T>(): Promise<T> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => {
      data += c;
    });
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error(`Invalid JSON input: ${err}`));
      }
    });
    process.stdin.on('error', reject);
  });
}

export function writeResult(result: ScriptResult): void {
  console.log(JSON.stringify(result));
}

export function cleanupLockFiles(): void {
  for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    const p = path.join(config.browserDataDir, f);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* swallow */
      }
    }
  }
}

/**
 * Launch a stealth-patched persistent Chromium context.
 * Headed (xvfb-run wraps this process in production) — Gemini's call.
 */
export async function getBrowserContext(): Promise<BrowserContext> {
  if (!fs.existsSync(config.authPath)) {
    throw new Error(
      'LinkedIn auth not configured. Run scripts/setup.ts over VNC/X-forwarding to log in.',
    );
  }

  cleanupLockFiles();

  const context = await chromium.launchPersistentContext(config.browserDataDir, {
    ...(config.chromePath ? { executablePath: config.chromePath } : {}),
    headless: false,
    viewport: config.viewport,
    userAgent: config.userAgent,
    args: config.chromeArgs,
    ignoreDefaultArgs: config.chromeIgnoreDefaultArgs,
  });

  // Stealth init script: runs in every page before any site script.
  // Hides the most obvious automation tells.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5].map(() => ({ name: 'Chrome PDF Plugin' })),
    });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    // @ts-ignore
    window.chrome = { runtime: {} };
  });

  return context;
}

/**
 * Detect logged-out / checkpoint state — LinkedIn redirects to /login/ or
 * /checkpoint/ when the session has expired.
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  const url = page.url();
  if (url.includes('/login') || url.includes('/checkpoint') || url.includes('/uas/login')) {
    return false;
  }
  // Voyager 401 also indicates expired session.
  try {
    const me = await page.context().request.get(`${config.voyagerBase}/me`, {
      headers: voyagerHeaders(await getCsrfToken(page)),
    });
    return me.status() === 200;
  } catch {
    return false;
  }
}

/**
 * Extract the JSESSIONID cookie, strip the quoting, and use it as the
 * Csrf-Token header value (LinkedIn's own SPA does this).
 */
export async function getCsrfToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies('https://www.linkedin.com');
  const jsession = cookies.find((c) => c.name === 'JSESSIONID');
  if (!jsession) throw new Error('JSESSIONID cookie missing — session expired');
  // Cookie value is wrapped in quotes: "ajax:1234..."
  return jsession.value.replace(/^"|"$/g, '');
}

export function voyagerHeaders(csrf: string, accept = 'application/vnd.linkedin.normalized+json+2.1'): Record<string, string> {
  return {
    accept,
    'csrf-token': csrf,
    'x-restli-protocol-version': '2.0.0',
    'x-li-lang': 'en_US',
    'x-li-track':
      '{"clientVersion":"1.13.0","mpVersion":"1.13.0","osName":"web","timezoneOffset":-5,"timezone":"America/New_York","deviceFormFactor":"DESKTOP","mpName":"voyager-web"}',
  };
}

let lastRequestAt = 0;
/**
 * Enforce a minimum gap between Voyager calls inside a single script run.
 * Adds jitter to avoid metronome-like patterns.
 */
export async function paceRequest(): Promise<void> {
  const now = Date.now();
  const gap = now - lastRequestAt;
  if (gap < config.minRequestSpacingMs) {
    const wait = config.minRequestSpacingMs - gap + Math.floor(Math.random() * 400);
    await new Promise((r) => setTimeout(r, wait));
  }
  lastRequestAt = Date.now();
}

/**
 * Voyager JSON GET. Returns parsed JSON or throws.
 *
 * urlPath is appended to /voyager/api (e.g. "/me" or
 * "/voyagerMessagingGraphQL/graphql?queryId=...").
 *
 * Pass acceptOverride to use a different accept header — needed for the
 * newer GraphQL endpoints which serve dense JSON only when asked nicely.
 */
export async function voyagerGet<T = unknown>(
  page: Page,
  urlPath: string,
  acceptOverride?: string,
): Promise<T> {
  await paceRequest();
  const csrf = await getCsrfToken(page);
  const resp = await page.context().request.get(`${config.voyagerBase}${urlPath}`, {
    headers: voyagerHeaders(csrf, acceptOverride),
  });
  if (!resp.ok()) {
    throw new Error(`Voyager ${urlPath} returned ${resp.status()}`);
  }
  return (await resp.json()) as T;
}

/**
 * Standard script entry-point wrapper — reads stdin JSON, runs handler,
 * writes one JSON line to stdout.
 */
export async function runScript<T>(handler: (input: T) => Promise<ScriptResult>): Promise<void> {
  try {
    const input = await readInput<T>();
    const result = await handler(input);
    writeResult(result);
  } catch (err) {
    writeResult({
      success: false,
      message: `Script execution failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    process.exit(1);
  }
}
