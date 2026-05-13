/**
 * LinkedIn scraping logic.
 *
 * Voyager endpoints first. For Profile + Thread views we also support a
 * DOM-scrape fallback when Voyager 4xxs (per Gemini critique — those two
 * surfaces are the stable ones). Everything else fails loud and returns
 * a "maintenance required" error so Keyrocker can tell Master to re-sync.
 */

import { Page } from 'playwright';
import { voyagerGet } from './browser.js';

// LinkedIn rotates these GraphQL queryIds when they redeploy the messaging SPA.
// If a 4xx starts coming back, capture the new id from a logged-in browser's
// network panel and bump these constants.
const QID_CONVERSATIONS = 'messengerConversations.0d5e6781bbee71c3e51c8843c6519f48';
const QID_MESSAGES = 'messengerMessages.5846eeb71c981f11e0134cb6626cc314';

let cachedMailboxUrn: string | null = null;
let cachedOwnSlug: string | null = null;

async function getMailboxUrn(page: Page): Promise<string> {
  if (cachedMailboxUrn) return cachedMailboxUrn;
  const me = await voyagerGet<any>(page, '/me');
  const dashUrn: string | undefined = me?.included?.find?.((x: any) => x?.dashEntityUrn)
    ?.dashEntityUrn;
  // Fallback: derive from miniProfile URN
  const profileSuffix: string | undefined = me?.data?.['*miniProfile']?.split(':').pop();
  cachedMailboxUrn = dashUrn ?? (profileSuffix ? `urn:li:fsd_profile:${profileSuffix}` : '');
  if (!cachedMailboxUrn) throw new Error('Could not resolve mailbox URN from /me');
  return cachedMailboxUrn;
}

/**
 * Resolve any "profile reference" into the canonical public slug.
 *
 * Accepts:
 *   - "" / "me" / "myself" / "self"          → resolve via /me redirect
 *   - "https://www.linkedin.com/in/jdoe/"    → "jdoe"
 *   - "jdoe"                                 → "jdoe"
 *   - "urn:li:fsd_profile:ACoAAAA..."        → resolve via in/URN redirect
 *   - "ACoAAAA..." (bare URN id)             → same
 */
async function resolveSlug(page: Page, input: string): Promise<string> {
  const trimmed = (input ?? '').trim();
  const lc = trimmed.toLowerCase();

  // "me" path: cached for the lifetime of the script
  if (!trimmed || lc === 'me' || lc === 'myself' || lc === 'self') {
    if (cachedOwnSlug) return cachedOwnSlug;
    const urn = await getMailboxUrn(page);
    cachedOwnSlug = await resolveUrnToSlug(page, urn);
    return cachedOwnSlug;
  }

  // Full URL with /in/<slug>/
  const urlMatch = trimmed.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (urlMatch) return urlMatch[1];

  // URN: "urn:li:fsd_profile:XXX" or "urn:li:fs_miniProfile:XXX" or bare "ACo..."
  const urnMatch = trimmed.match(/^urn:li:[a-z_]+:([A-Za-z0-9_-]+)$/);
  if (urnMatch) return resolveUrnToSlug(page, trimmed);
  if (/^ACo[A-Za-z0-9_-]+$/.test(trimmed)) return resolveUrnToSlug(page, trimmed);

  // Already a bare slug
  if (/^[a-z0-9\-]+$/i.test(trimmed)) return trimmed;

  throw new Error(`Could not resolve profile reference: ${trimmed.slice(0, 80)}`);
}

async function resolveUrnToSlug(page: Page, urnOrId: string): Promise<string> {
  // /in/<URN>/ redirects to /in/<slug>/
  const id = urnOrId.startsWith('urn:') ? urnOrId.split(':').pop()! : urnOrId;
  await page.goto(`https://www.linkedin.com/in/${id}/`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(2500);
  const finalUrl = page.url();
  const m = finalUrl.match(/\/in\/([^/?#]+)/);
  if (!m) throw new Error(`URN-to-slug redirect failed; final URL: ${finalUrl}`);
  return m[1];
}

function extractName(node: any): { name: string; headline?: string; profileUrl?: string } {
  const member = node?.participantType?.member;
  if (!member) return { name: '(unknown)' };
  const first = member?.firstName?.text ?? '';
  const last = member?.lastName?.text ?? '';
  const headline = member?.headline?.text;
  const slugMatch = (member?.profileUrl ?? '').match(/\/in\/([^/?]+)/);
  return {
    name: `${first} ${last}`.trim() || '(unknown)',
    headline,
    profileUrl: slugMatch ? `https://www.linkedin.com/in/${slugMatch[1]}/` : member?.profileUrl,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  DMs
// ─────────────────────────────────────────────────────────────────────────────

export interface DmThread {
  thread_url: string;
  participant_name: string;
  participant_headline?: string;
  participant_company?: string;
  last_snippet: string;
  unread: boolean;
  last_activity_iso: string;
  is_sponsored: boolean;
}

export interface DmMessage {
  sender: string;
  text: string;
  sent_iso: string;
}

/**
 * List recent message threads (via the messaging GraphQL endpoint).
 * Sponsored InMail filtered out by default.
 */
export async function listThreads(
  page: Page,
  opts: { limit?: number; unreadOnly?: boolean; includeSponsored?: boolean },
): Promise<DmThread[]> {
  const limit = opts.limit ?? 15;
  const mailboxUrn = await getMailboxUrn(page);
  const variables = `(mailboxUrn:${encodeURIComponent(mailboxUrn)})`;

  const data = await voyagerGet<any>(
    page,
    `/voyagerMessagingGraphQL/graphql?queryId=${QID_CONVERSATIONS}&variables=${variables}`,
    'application/graphql',
  );

  const elements: any[] = data?.data?.messengerConversationsBySyncToken?.elements ?? [];
  const threads: DmThread[] = [];

  for (const conv of elements) {
    const categories: string[] = conv?.categories ?? [];
    const isSponsored =
      categories.includes('SPONSORED') ||
      categories.includes('INMAIL') ||
      categories.includes('SPONSORED_INMAIL');
    if (isSponsored && !opts.includeSponsored) continue;

    const unread = (conv?.unreadCount ?? 0) > 0 || conv?.read === false;
    if (opts.unreadOnly && !unread) continue;

    // Find the OTHER participant (not me)
    const participants: any[] = conv?.conversationParticipants ?? [];
    const me = mailboxUrn;
    const other = participants.find((p) => p?.hostIdentityUrn !== me) ?? participants[0];
    const info = extractName(other);

    const threadUrl: string =
      conv?.conversationUrl ??
      `https://www.linkedin.com/messaging/thread/${conv?.backendUrn?.split(':').pop() ?? ''}/`;

    const lastMsg = conv?.messages?.elements?.[0];
    const snippet = lastMsg?.body?.text ?? lastMsg?.subject ?? '';

    threads.push({
      thread_url: threadUrl,
      participant_name: info.name,
      participant_headline: info.headline,
      participant_company: extractCompanyFromHeadline(info.headline),
      last_snippet: snippet.slice(0, 240),
      unread,
      last_activity_iso: conv?.lastActivityAt
        ? new Date(conv.lastActivityAt).toISOString()
        : new Date().toISOString(),
      is_sponsored: isSponsored,
    });

    if (threads.length >= limit) break;
  }

  return threads;
}

/**
 * Read full message history of one thread (via GraphQL).
 */
export async function readThread(
  page: Page,
  threadUrl: string,
  limit = 20,
): Promise<DmMessage[]> {
  const threadId = extractThreadId(threadUrl);
  if (!threadId) throw new Error('Could not parse thread id from URL');

  const mailboxUrn = await getMailboxUrn(page);
  // conversationUrn shape: urn:li:msg_conversation:(<mailboxUrn>,<threadId>)
  const conversationUrn = `urn:li:msg_conversation:(${mailboxUrn},${threadId})`;
  const variables = `(conversationUrn:${encodeURIComponent(conversationUrn)})`;

  try {
    const data = await voyagerGet<any>(
      page,
      `/voyagerMessagingGraphQL/graphql?queryId=${QID_MESSAGES}&variables=${variables}`,
      'application/graphql',
    );
    const elements: any[] =
      data?.data?.messengerMessagesBySyncToken?.elements ??
      data?.data?.messengerMessagesByAnchorTimestamp?.elements ??
      [];
    return elements
      .slice(0, limit)
      .map((m) => {
        const sender = m?.sender;
        const info = sender ? extractName(sender) : { name: '(unknown)' };
        return {
          sender: info.name,
          text: m?.body?.text ?? '',
          sent_iso: m?.deliveredAt ? new Date(m.deliveredAt).toISOString() : '',
        };
      })
      .filter((m) => m.text);
  } catch (voyagerErr) {
    return readThreadFromDom(page, threadUrl, limit, voyagerErr as Error);
  }
}

async function readThreadFromDom(
  page: Page,
  threadUrl: string,
  limit: number,
  voyagerErr: Error,
): Promise<DmMessage[]> {
  await page.goto(threadUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  const items = await page
    .locator('li.msg-s-message-list__event')
    .all()
    .catch(() => []);
  if (items.length === 0) {
    throw new Error(`Voyager failed (${voyagerErr.message}) and DOM fallback found no messages`);
  }
  const out: DmMessage[] = [];
  for (const li of items.slice(-limit)) {
    const sender = (await li.locator('.msg-s-message-group__name').first().textContent().catch(() => '')) ?? '';
    const text = (await li.locator('.msg-s-event-listitem__body').first().textContent().catch(() => '')) ?? '';
    out.push({ sender: sender.trim(), text: text.trim(), sent_iso: '' });
  }
  return out;
}

function extractThreadId(url: string): string | null {
  const m = url.match(/\/messaging\/thread\/([^/]+)/);
  return m ? m[1] : null;
}

function extractCompanyFromHeadline(headline?: string): string | undefined {
  if (!headline) return undefined;
  const at = headline.match(/\s+at\s+(.+)$/i);
  return at ? at[1].trim() : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Recent activity (replaces home-feed scraping; bounded to one profile)
// ─────────────────────────────────────────────────────────────────────────────

export interface ActivityPost {
  posted_iso: string;
  text: string;
  reactions: number;
  comments: number;
  permalink: string;
}

export async function getRecentActivity(
  page: Page,
  profileRef: string,
  limit = 10,
): Promise<ActivityPost[]> {
  const slug = await resolveSlug(page, profileRef);
  const url = `https://www.linkedin.com/in/${slug}/recent-activity/all/`;

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(5000);

  // Scroll a bit so lazy-rendered posts attach to the DOM
  for (let y = 200; y < 1200 + limit * 300; y += 500) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(700);
  }

  const posts = await page.evaluate(() => {
    const out: Array<{
      urn: string;
      text: string;
      reactions: string;
      comments: string;
    }> = [];
    const selectors = [
      'div.feed-shared-update-v2',
      'li.profile-creator-shared-feed-update__container',
      'div[data-urn^="urn:li:activity"]',
    ];
    let nodes: Element[] = [];
    for (const s of selectors) {
      nodes = Array.from(document.querySelectorAll(s));
      if (nodes.length) break;
    }
    for (const n of nodes) {
      const text =
        n.querySelector(
          '.update-components-text, .feed-shared-update-v2__description, .feed-shared-inline-show-more-text, .feed-shared-text',
        )?.textContent?.trim() ||
        n.textContent?.trim()?.slice(0, 1000) ||
        '';
      const urn =
        n.getAttribute('data-urn') ||
        n.querySelector('[data-urn^="urn:li:activity"]')?.getAttribute('data-urn') ||
        '';
      const reactions =
        n
          .querySelector(
            '.social-details-social-counts__reactions-count, button[aria-label*="reaction"]',
          )
          ?.textContent?.trim() || '';
      const comments =
        n
          .querySelector(
            '.social-details-social-counts__comments, button[aria-label*="comment"]',
          )
          ?.textContent?.trim() || '';
      out.push({ urn, text: text.slice(0, 1200), reactions, comments });
    }
    return out;
  });

  return posts
    .filter((p) => p.text)
    .slice(0, limit)
    .map((p) => {
      const id = p.urn.match(/urn:li:activity:(\d+)/)?.[1];
      return {
        posted_iso: '',
        text: p.text,
        reactions: parseSocialCount(p.reactions),
        comments: parseSocialCount(p.comments),
        permalink: id ? `https://www.linkedin.com/feed/update/urn:li:activity:${id}/` : '',
      };
    });
}

function parseSocialCount(s: string): number {
  if (!s) return 0;
  const m = s.match(/(\d[\d,]*)/);
  if (!m) return 0;
  return parseInt(m[1].replace(/,/g, ''), 10) || 0;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Profile + Company lookup
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfileInfo {
  name: string;
  headline: string;
  current_role?: string;
  current_company?: string;
  location?: string;
  url: string;
}

export async function getProfile(page: Page, profileRef: string): Promise<ProfileInfo> {
  const slug = await resolveSlug(page, profileRef);
  const url = `https://www.linkedin.com/in/${slug}/`;

  // Always re-navigate even if resolveSlug landed us here, so the page is fresh.
  if (!page.url().includes(`/in/${slug}`)) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
  await page.waitForTimeout(3500);

  // Scroll a bit so LinkedIn's lazy-render attaches headline + experience nodes
  for (let y = 100; y < 1200; y += 300) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(500);
  }

  const info = await page.evaluate(() => {
    // Name: <title> is the most reliable. Format: "<Name> | LinkedIn".
    const titleName = (document.title || '').replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();
    // Fallback to a section h2 that isn't a known section label
    const sectionLabels = new Set([
      'about', 'experience', 'education', 'skills', 'activity', 'people you may know',
      'suggested for you', 'analytics', 'recommendations', 'languages', 'interests',
      'you might like', 'top voice on linkedin', 'notifications', 'featured',
    ]);
    const h2Name = Array.from(document.querySelectorAll('section h2'))
      .map((h) => (h.textContent || '').trim())
      .find((t) => t && !sectionLabels.has(t.toLowerCase()) && !/^\d+ /.test(t));

    const name = titleName || h2Name || '';

    // Headline: appears as a sibling of the name in the top card. LinkedIn
    // rotates classes; look for divs immediately after the name's h1/h2 that
    // contain non-empty text and aren't a section heading.
    let headline = '';
    const topCard = document.querySelector('section.artdeco-card, main section:first-of-type, section.profile-photo-edit__photo-container');
    if (topCard) {
      const all = Array.from(topCard.querySelectorAll('div, span'))
        .map((el) => (el.textContent || '').trim())
        .filter((t) => t && t.length > 8 && t.length < 220);
      headline =
        all.find((t) => /@|·/.test(t) && !/\d+ followers?/i.test(t) && !/\d+ connections?/i.test(t)) ||
        all.find((t) => !/\d+ followers?/i.test(t) && !/\d+ connections?/i.test(t)) ||
        '';
    }

    // Experience section
    let currentRole: string | undefined;
    let currentCompany: string | undefined;
    const expSection = document.querySelector('section[id="experience"], div#experience')?.closest('section');
    if (expSection) {
      const firstLi = expSection.querySelector('li');
      currentRole = firstLi?.querySelector('span[aria-hidden="true"]')?.textContent?.trim();
      currentCompany = firstLi?.querySelectorAll('span.t-14.t-normal')?.[0]?.textContent?.trim()?.split(' · ')[0];
    }

    // Location: look for a small text element with a known location pattern
    const location =
      Array.from(document.querySelectorAll('span'))
        .map((el) => (el.textContent || '').trim())
        .find((t) => /,\s*(United States|UK|Brazil|Spain|Germany|France|Singapore|Hong Kong|Japan|Canada|Mexico|Argentina|Colombia|Venezuela|Florida|Texas|California|New York|Miami|London|Madrid|Berlin|Paris)/i.test(t) && t.length < 80) ||
      '';

    return { name, headline, currentRole, currentCompany, location };
  });

  if (!info.name) {
    throw new Error('LinkedIn integration needs re-sync (profile page returned no recognisable data)');
  }

  return {
    name: info.name,
    headline: info.headline,
    current_role: info.currentRole || undefined,
    current_company: info.currentCompany || undefined,
    location: info.location || undefined,
    url,
  };
}

export interface CompanyInfo {
  name: string;
  industry?: string;
  size?: string;
  description?: string;
  url: string;
}

export async function getCompany(page: Page, urlOrSlug: string): Promise<CompanyInfo> {
  const slug = extractCompanySlug(urlOrSlug) ?? urlOrSlug.trim();
  // Voyager only — no DOM fallback per simplified plan
  const data = await voyagerGet<any>(
    page,
    `/organization/companies?q=universalName&universalName=${encodeURIComponent(slug)}`,
  );
  const company = (data?.elements ?? [])[0];
  if (!company) {
    throw new Error('LinkedIn integration needs re-sync (company lookup returned no data)');
  }
  return {
    name: company?.name ?? slug,
    industry: company?.industries?.[0],
    size: company?.staffCountRange ? `${company.staffCountRange.start ?? '?'}–${company.staffCountRange.end ?? '?'}` : undefined,
    description: company?.description?.slice(0, 500),
    url: `https://www.linkedin.com/company/${slug}/`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  People search (quota-gated upstream in host.ts)
// ─────────────────────────────────────────────────────────────────────────────

export interface PersonHit {
  name: string;
  headline?: string;
  url: string;
}

export async function searchPeople(page: Page, query: string, limit = 5): Promise<PersonHit[]> {
  const data = await voyagerGet<any>(
    page,
    `/search/blended?keywords=${encodeURIComponent(query)}&filters=List(resultType-%3EPEOPLE)&count=${limit}`,
  );
  const elements: any[] = data?.elements ?? [];
  const hits: PersonHit[] = [];
  for (const cluster of elements) {
    for (const el of cluster?.elements ?? []) {
      const mini = el?.hitInfo?.com_linkedin_voyager_search_SearchProfile?.miniProfile;
      if (!mini) continue;
      hits.push({
        name: `${mini.firstName ?? ''} ${mini.lastName ?? ''}`.trim(),
        headline: mini.occupation,
        url: `https://www.linkedin.com/in/${mini.publicIdentifier}/`,
      });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}

// ─────────────────────────────────────────────────────────────────────────────
//  helpers
// ─────────────────────────────────────────────────────────────────────────────

function extractPublicId(input: string): string | null {
  const m = input.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (m) return m[1];
  if (/^[a-z0-9\-]+$/i.test(input.trim())) return input.trim();
  return null;
}

function extractCompanySlug(input: string): string | null {
  const m = input.match(/linkedin\.com\/company\/([^/?#]+)/);
  if (m) return m[1];
  if (/^[a-z0-9\-]+$/i.test(input.trim())) return input.trim();
  return null;
}
