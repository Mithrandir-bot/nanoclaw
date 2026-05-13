---
name: linkedin-keyrocker
description: LinkedIn integration for the Keyrocker work-assistant group. Read-only access to DMs, profile/company lookup, recent-activity scraping, people search. Browser automation via Playwright + xvfb-run; persistent Chromium profile on host.
---

# LinkedIn — Keyrocker only

Read-only LinkedIn access for the Keyrocker Telegram channel. Mirrors the
x-integration skill's split-process architecture but with stealth-patched
Playwright and Voyager JSON API as the primary fetch path.

> Restricted to `group_folder === 'keyrocker'`. Other groups cannot invoke
> these tools.

## Tools (all read-only)

| MCP tool | What it does |
|---|---|
| `mcp__linkedin__list_recent_messages(limit?, unread_only?)` | List recent DM threads (skips Sponsored InMail by default) |
| `mcp__linkedin__read_thread(thread_url, limit?)` | Full message history for one thread |
| `mcp__linkedin__recent_activity(profile_url, limit?)` | Recent posts from one specific profile (use this instead of the global feed) |
| `mcp__linkedin__get_profile(query)` | Profile lookup by URL or public id |
| `mcp__linkedin__get_company(query)` | Company page lookup by URL or slug |
| `mcp__linkedin__search_people(query, limit?)` | People search — hard-capped at 20/day to dodge LinkedIn's Commercial Use Limit |

## Architecture

```
┌─────────────────────────────────────────────────┐
│ Container (keyrocker group)                     │
│  └── ipc-mcp-stdio.ts registers linkedin_* tools│
│      └── writes /workspace/ipc/tasks/*.json     │
│          polls /workspace/ipc/linkedin_results/ │
└──────────────────┬──────────────────────────────┘
                   │ (file IPC)
                   ▼
┌─────────────────────────────────────────────────┐
│ Host (Node, systemd)                            │
│  └── src/ipc.ts → handleLinkedInIpc()           │
│      └── velocity throttle + search quota       │
│      └── spawn `xvfb-run npx tsx scripts/*.ts`  │
│          └── Playwright (stealth) + Voyager API │
└─────────────────────────────────────────────────┘
```

## Setup

```bash
# 1. Install Playwright + Xvfb
npm install playwright
sudo apt-get install -y xvfb

# 2. One-time interactive login (needs $DISPLAY)
ssh -X you@host
export DISPLAY=:0   # or whatever your X session is
npx tsx .claude/skills/linkedin-keyrocker/scripts/setup.ts

# 3. Warm-up period: log in to LinkedIn manually via the same profile and
#    browse for ~3 days before turning on the cron. Anti-detection
#    "trust score" needs human-looking activity first.

# 4. Verify
cat data/linkedin-auth.json  # → {"authenticated":true, ...}

# 5. Restart the service
systemctl restart nanoclaw
```

## Operational notes

- **Headed via Xvfb** in production. host.ts auto-prefixes the subprocess with `xvfb-run` when no `$DISPLAY` is set. Headless was rejected (Gemini call): a headless browser polling from a data-center IP every 2h is the fastest path to an account flag.
- **Velocity throttle**: 3 LinkedIn calls within 60s → 30s cooldown (enforced in host.ts).
- **Search quota**: hard cap of 20 people-search/day (`data/linkedin-quota.json`, resets at UTC midnight).
- **Voyager auth**: `Csrf-Token` derived from `JSESSIONID` cookie + `X-Restli-Protocol-Version: 2.0.0`. Required headers — without them every Voyager endpoint 403s.
- **Fallback**: DOM scrape fallback exists only for Profile + Thread (the stable surfaces). Everything else fails loud so Keyrocker can tell Master to re-sync rather than silently returning wrong data.
- **Sponsored InMail** filtered by default; the DM digest cron suppresses these entirely.

## Files

```
.claude/skills/linkedin-keyrocker/
├── SKILL.md             # this doc
├── lib/
│   ├── config.ts        # paths, viewport, quotas
│   ├── browser.ts       # stealth Playwright + Voyager helpers
│   └── scrape.ts        # DM / activity / profile / company / search
└── scripts/
    ├── setup.ts         # one-time headed login (VNC/X-forwarding)
    ├── list_messages.ts
    ├── read_thread.ts
    ├── recent_activity.ts
    ├── get_profile.ts
    ├── get_company.ts
    └── search_people.ts
```

## Wiring (already applied to canonical files)

- `src/linkedin-host.ts` — IPC dispatcher (compiled with the main TS build)
- `src/ipc.ts` — imports and calls `handleLinkedInIpc` before the default branch
- `container/agent-runner/src/ipc-mcp-stdio.ts` — registers 6 `linkedin_*` tools when `groupFolder === 'keyrocker'`
- `data/sessions/keyrocker/agent-runner-src/ipc-mcp-stdio.ts` — per-group copy synced from canonical
- `groups/keyrocker/CLAUDE.md` — describes the tools and when to use them

## Troubleshooting

```bash
# Session expired?  Re-run setup over VNC/X-forwarding.
npx tsx .claude/skills/linkedin-keyrocker/scripts/setup.ts

# Logs
grep -i "linkedin_\|handleLinkedInIpc" logs/nanoclaw.log | tail -30

# Test a tool from the host without the agent loop:
echo '{"limit":5,"unreadOnly":true}' | \
  xvfb-run -a npx tsx .claude/skills/linkedin-keyrocker/scripts/list_messages.ts

# Lock files (if Chromium fails to launch)
rm -f data/linkedin-browser-profile/Singleton{Lock,Socket,Cookie}
```
