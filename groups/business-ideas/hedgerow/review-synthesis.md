# Hedgerow site review — synthesis (Gemini 3 + Grok 4.3, 2026-06-02)

Two independent full-site audits. Where both agreed = high confidence. Full reviews: `review-gemini.md`, `review-grok.md`. Conversion playbook (separate research): `conversion-best-practices.md`.

## TIER 1 — Critical (both reviewers, or compliance)
1. **Compliance-term leakage (BOTH).** Visible labels/IDs still say "Get Coverage" (button), "Premium", "Coverage", "Policy". Confirmed: 24×premium, 11×coverage, 2×policy. Fix VISIBLE text → "flat fee", "payoff", "Run This Promotion", "Reference"/"Promo ID". (Internal var `lastCalc.premium` can stay to avoid breaking wiring; scrub displayed text + button labels.)
2. **Date picker not constrained (BOTH).** `#eventDate` has no min/max, so users guess a date and fail the 15–120-day window. Set `min`/`max` on the input so invalid dates grey out before clicking.
3. **Fuel CTA bait (BOTH).** Fuel shows the same "Run This Promotion" CTA but can't be bound. Change fuel's result CTA to "Request a quote" / lead capture.
4. **"No live market" dead-end → lead capture (BOTH).** Sports with no market currently ends at a message. Convert to: "This matchup isn't trading yet — get notified" + email field. High conversion value.

## TIER 2 — High-impact UX
5. **Replace native `alert()`** (exposure <$250 etc.) with inline `.reject-msg` styling (Grok).
6. **AI designer → calculator handoff (BOTH).** `useDesignedPromo()` must populate `matchupInput` for custom category + auto-scroll/auto-price so it isn't a dead pre-fill.
7. **Loading states** on "See My Flat Fee", "Design my promo", checkout buttons (pulse on `estOddsBox` while pricing).
8. **Empty-field validation** — red-border required inputs instead of silent/alert.
9. **"Is this insurance?" FAQ** — explicit "No — marketing promotion tool, not insurance" (compliance + trust).

## TIER 3 — Trust / polish / a11y
10. **Copy-link button** on the partner/affiliate referral URL (BOTH).
11. **aria-live** on `#estOddsBox`/`#calcResult`; **keyboard support** on FAQ accordion; mobile contrast in the dark calculator section (Grok).
12. **Stablecoin microcopy** — "USDC = digital dollar, 1:1 USD" tooltip (Gemini).
13. **Trust icons use emoji-like entities** (`&#9745;` etc.) — replace with SVG/text (Grok; aligns with no-emoji rule).
14. **Hero hierarchy** — shorten lead, bold the "if X happens we pay YOU $Y" line, add secondary "Browse use cases" link.
15. **Deduplicate repeated copy** (the "pay you the same day" line repeats across hero/FAQ/calc).

## Non-issues (flagged but OK by design)
- "noindex / Private demo banner missing from source" — correct; injected server-side on the demo instance only.
- "2026 footer is future-dated" — it IS 2026.
