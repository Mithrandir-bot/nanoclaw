/**
 * LinkedIn Integration — Host IPC Handler (keyrocker group only)
 *
 * Mirrors x-integration/host.ts. Adds:
 *   - keyrocker-only gate
 *   - host-side velocity throttle
 *   - daily quota check for search_people
 *   - xvfb-run wrapper so the Playwright subprocess gets a graphical display
 *     even when nanoclaw runs under systemd with no $DISPLAY
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: { target: 'pino-pretty', options: { colorize: true } },
});
const ALLOWED_GROUP = 'keyrocker';
// ─── velocity throttle (per-process, simple sliding window) ──────────────
const THROTTLE_MAX = 3;
const THROTTLE_WINDOW_MS = 60_000;
const THROTTLE_COOLDOWN_MS = 30_000;
const callLog = [];
async function throttle() {
    const now = Date.now();
    while (callLog.length && now - callLog[0] > THROTTLE_WINDOW_MS)
        callLog.shift();
    if (callLog.length >= THROTTLE_MAX) {
        logger.info({ recentCalls: callLog.length }, 'LinkedIn velocity throttle — cooling down');
        await new Promise((r) => setTimeout(r, THROTTLE_COOLDOWN_MS));
        callLog.length = 0;
    }
    callLog.push(Date.now());
}
// ─── daily search quota ──────────────────────────────────────────────────
const SEARCH_DAILY_CAP = 20;
function checkAndIncrementSearchQuota() {
    const quotaPath = path.join(process.cwd(), 'data', 'linkedin-quota.json');
    const today = new Date().toISOString().slice(0, 10);
    let q = { date: today, count: 0 };
    if (fs.existsSync(quotaPath)) {
        try {
            q = JSON.parse(fs.readFileSync(quotaPath, 'utf-8'));
            if (q.date !== today)
                q = { date: today, count: 0 };
        }
        catch {
            q = { date: today, count: 0 };
        }
    }
    if (q.count >= SEARCH_DAILY_CAP)
        return { ok: false, remaining: 0 };
    q.count += 1;
    fs.mkdirSync(path.dirname(quotaPath), { recursive: true });
    fs.writeFileSync(quotaPath, JSON.stringify(q));
    return { ok: true };
}
// ─── subprocess runner with xvfb-run wrapper ─────────────────────────────
async function runScript(script, args) {
    await throttle();
    const scriptPath = path.join(process.cwd(), '.claude', 'skills', 'linkedin-keyrocker', 'scripts', `${script}.ts`);
    return new Promise((resolve) => {
        // Wrap in xvfb-run so Chromium has a display even under systemd.
        // -a chooses a free display; -s "-screen 0 1366x900x24" matches viewport.
        const useXvfb = !process.env.DISPLAY && !process.env.LINKEDIN_NO_XVFB;
        const cmd = useXvfb ? 'xvfb-run' : 'npx';
        const cmdArgs = useXvfb
            ? ['-a', '-s', '-screen 0 1366x900x24', 'npx', 'tsx', scriptPath]
            : ['tsx', scriptPath];
        const proc = spawn(cmd, cmdArgs, {
            cwd: process.cwd(),
            env: { ...process.env, NANOCLAW_ROOT: process.cwd() },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => {
            stdout += d.toString();
        });
        proc.stderr.on('data', (d) => {
            stderr += d.toString();
        });
        proc.stdin.write(JSON.stringify(args));
        proc.stdin.end();
        const timer = setTimeout(() => {
            proc.kill('SIGTERM');
            resolve({ success: false, message: 'LinkedIn script timed out (180s)' });
        }, 180_000);
        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code !== 0) {
                resolve({
                    success: false,
                    message: `LinkedIn script exited ${code}: ${stderr.slice(0, 400)}`,
                });
                return;
            }
            try {
                const lines = stdout.trim().split('\n').filter(Boolean);
                resolve(JSON.parse(lines[lines.length - 1]));
            }
            catch {
                resolve({
                    success: false,
                    message: `Failed to parse output: ${stdout.slice(0, 200)}`,
                });
            }
        });
        proc.on('error', (err) => {
            clearTimeout(timer);
            resolve({ success: false, message: `Failed to spawn: ${err.message}` });
        });
    });
}
function writeResult(dataDir, sourceGroup, requestId, result) {
    const resultsDir = path.join(dataDir, 'ipc', sourceGroup, 'linkedin_results');
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(path.join(resultsDir, `${requestId}.json`), JSON.stringify(result));
}
/**
 * Dispatch entry. Returns true when the IPC type belongs to LinkedIn
 * (even on policy-block, so the generic "Unknown IPC type" warning is
 * suppressed).
 */
export async function handleLinkedInIpc(data, sourceGroup, dataDir) {
    const type = data.type;
    if (!type?.startsWith('linkedin_'))
        return false;
    if (sourceGroup !== ALLOWED_GROUP) {
        logger.warn({ sourceGroup, type }, 'LinkedIn IPC rejected: only keyrocker may use this integration');
        return true;
    }
    const requestId = data.requestId;
    if (!requestId) {
        logger.warn({ type }, 'LinkedIn IPC rejected: missing requestId');
        return true;
    }
    logger.info({ type, requestId }, 'Processing LinkedIn request');
    let result;
    switch (type) {
        case 'linkedin_list_recent_messages':
            result = await runScript('list_messages', {
                limit: data.limit ?? 15,
                unreadOnly: data.unread_only ?? false,
            });
            break;
        case 'linkedin_read_thread':
            if (!data.thread_url) {
                result = { success: false, message: 'Missing thread_url' };
                break;
            }
            result = await runScript('read_thread', {
                thread_url: data.thread_url,
                limit: data.limit ?? 20,
            });
            break;
        case 'linkedin_recent_activity':
            if (!data.profile_url) {
                result = { success: false, message: 'Missing profile_url' };
                break;
            }
            result = await runScript('recent_activity', {
                profile_url: data.profile_url,
                limit: data.limit ?? 10,
            });
            break;
        case 'linkedin_get_profile':
            if (!data.query) {
                result = { success: false, message: 'Missing query' };
                break;
            }
            result = await runScript('get_profile', { query: data.query });
            break;
        case 'linkedin_get_company':
            if (!data.query) {
                result = { success: false, message: 'Missing query' };
                break;
            }
            result = await runScript('get_company', { query: data.query });
            break;
        case 'linkedin_search_people': {
            if (!data.query) {
                result = { success: false, message: 'Missing query' };
                break;
            }
            const q = checkAndIncrementSearchQuota();
            if (!q.ok) {
                result = {
                    success: false,
                    message: `LinkedIn search daily cap reached (${SEARCH_DAILY_CAP}/day). Resets at midnight UTC.`,
                };
                break;
            }
            result = await runScript('search_people', {
                query: data.query,
                limit: data.limit ?? 5,
            });
            break;
        }
        default:
            return false;
    }
    writeResult(dataDir, sourceGroup, requestId, result);
    if (result.success) {
        logger.info({ type, requestId }, 'LinkedIn request completed');
    }
    else {
        logger.error({ type, requestId, message: result.message }, 'LinkedIn request failed');
    }
    return true;
}
//# sourceMappingURL=host.js.map