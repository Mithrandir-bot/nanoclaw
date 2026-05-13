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
/**
 * Dispatch entry. Returns true when the IPC type belongs to LinkedIn
 * (even on policy-block, so the generic "Unknown IPC type" warning is
 * suppressed).
 */
export declare function handleLinkedInIpc(data: Record<string, unknown>, sourceGroup: string, dataDir: string): Promise<boolean>;
//# sourceMappingURL=host.d.ts.map