# Hedgerow site review — GROK 4.3

**Audit of Hedgerow single-page site (index.html)**

**NAV / HEADER**
- Location: `<nav>` and `.nav-cta` (Get Early Access).
- Issues: (1) Nav links use anchor IDs but “Pricing” points to `#calculator` while the visible heading is “Promo Pricing”; inconsistent terminology. (2) Mobile menu button exists but has no ARIA-expanded state; `.nav-links` toggles `.open` via inline onclick. (3) Sticky nav has no mobile-safe padding on small screens when open.
- Fixes: Change nav text to “Pricing” consistently; add `aria-expanded`/`aria-controls`; move mobile menu handling to a proper JS function. 
- Impact: Med (clarity + a11y).

**HERO**
- Location: `.hero`, badge “All upside. No risk.”, lead paragraph, `.hero-triggers`.
- Issues: (1) Long lead paragraph repeats “if it happens, we pay YOU the payoff the same day” phrasing that is later echoed verbatim in FAQ/calc result; feels redundant. (2) No visual hierarchy or secondary CTA below the hero-cta button. (3) Trigger chips use `&mdash;` but lack `aria-label` separation.
- Fixes: Shorten lead to 2–3 short sentences; add subtle secondary link “Browse use cases” to `#use-cases`; make trigger divs into a `<ul>` with proper semantics.
- Impact: Med (conversion + clarity).

**PROOF BAR**
- Location: `.proof-bar` with four `.proof-stat` blocks.
- Issues: Stats are static; “$0 Risk to your business” is strong but not backed by any social proof logos or real customer names (dead end for trust).
- Fix: Add 3–4 small enterprise or local logos (or keep minimal) or remove the stat if unsubstantiated.
- Impact: Low.

**HOW IT WORKS (#how)**
- Location: Four `.step` cards.
- Issues: (1) Step 2 copy says “That is the payoff we pay you” – slightly awkward. (2) All steps centered on same background card; no visual progression or connecting line on desktop.
- Fix: Edit step 2 to “Tell us what you want to promise your customers if the event happens. We pay you that amount the same day so you can deliver it at no cost to you.” Keep four-column grid but add subtle connector on ≥900 px.
- Impact: Low.

**CALCULATOR (#calculator) – core conversion flow**
- Location: `.calc-section`, all form groups, `#presetChips`, `#calcResult`, `calculate()` function, reject states.
- Interactive flows & states audited exhaustively:
  - Category select → `onCategoryChange()` correctly shows/hides groups, renders chips, calls `resetOdds()`.
  - Preset chips call `applyPreset()` (only fills text/exposure/source, never prob) – correct.
  - Date input (`#eventDate`) is mirrored to hidden weather/fuel fields – good.
  - “See My Flat Fee” (`calculate()`) requires real source resolution via `/api/resolve` or `/api/odds`.
    - Matchup (sports/milestone/custom): returns `found=false` → `showNoOdds("We can't price this yet — there's no live market...")` → result panel hidden. Correct.
    - Weather: 422 → exact server note shown; 404/flat fallback → “Enter a U.S. city...”. Correct.
    - Fuel: same window/unpriceable handling. Correct.
    - Valid resolved prob → `showResolvedOdds()` (live or estimate) + `renderQuote()` shows result panel with two outcome cards, two scenarios, risk-summary, settle-source, and “Run This Promotion” CTA.
  - Errors: exposure <250 shows native `alert` (poor UX). No loading state on button beyond disabled text. No empty-state handling if user clears fields after a result.
  - Copy issues inside flow: “Get Coverage” button text in `.get-coverage-btn` (forbidden term), “coPremium”/`cfPremium` labels in modal, result disclaimer still says “Illustrative estimate”.
  - Mobile: `.calc-inline-row` stacks, but two-column `.calc-container` becomes 1-col correctly; however date + threshold fields have no vertical spacing on 480 px.
- Fixes:
  1. Replace every “Get Coverage” button/onclick text with “Run This Promotion”.
  2. Replace any remaining “premium” variable or label with “flat fee” (search: `coPremium`, `cfPremium`, `premium` in order summary).
  3. Replace `alert()` calls with inline `.reject-msg` style elements.
  4. Add `aria-live="polite"` to `#estOddsBox` and `#calcResult`.
  5. Disable “See My Flat Fee” button until exposure ≥250 and required fields present for the mode.
- Impact: High (conversion + compliance + trust).

**AI PROMO DESIGNER (#designPromo)**
- Location: `.dp-form`, `designPromo()`, `renderDesignedPromo()`, `useDesignedPromo()`.
- Issues: (1) “Design my promo” button has no loading state beyond the output pane (inconsistent with calculator). (2) `useDesignedPromo()` prefills calculator but does not scroll to and auto-open the result panel; user must still click “See My Flat Fee”. (3) Datalist options use ampersand; one option (“Brewery / taproom”) already appears in use-cases.
- Fixes: Show `.dp-loading` on submit; after successful render, highlight the “Use this promo” button or auto-scroll calculator with the result panel open if a value is set. Clean datalist duplication.
- Impact: Med.

**USE CASES (#use-cases)**
- Location: Six `.vertical-card` items.
- Issues: Two cards use “sports” icon class for non-sports verticals; live-weather line only appears on successful oracle fetch and is otherwise hidden (no graceful empty state). Examples use numbers that cannot appear in the calculator without a real source (minor).
- Fix: Standardize icon classes or add new ones; always render the live line container and show “— live reading unavailable” if fetch fails.
- Impact: Low.

**TRUST SECTION**
- Location: `.trust-section` with three items.
- Issues: Icons use emoji-like entities (`&#9745;`, `&#9878;`) which the global rule prohibits.
- Fix: Replace with SVG or text-only.
- Impact: Low.

**FAQ (#faq)**
- Location: `.faq-list`.
- Issues: Several answers repeat long phrases verbatim from hero/calculator; “You pay one flat fee upfront, and that’s it” appears multiple times. Accordion has no keyboard support (Enter/Space on `.faq-q`).
- Fixes: Deduplicate copy; add keyboard listeners.
- Impact: Med (copy consistency).

**PARTNER / AFFILIATE FORM (#partners)**
- Location: `.partners-form`, `submitAffiliate()`.
- Issues: Success state shows ref link but no follow-up action or “copy link” button; error uses `.partners-error` which is not cleared on new submit. Form does not capture the stored ref on load.
- Fix: Add one-click copy to the ref link; preserve `getStoredRef()` value.
- Impact: Med (conversion).

**CHAT WIDGET (injected at end)**
- Location: `#hwToggle`, `#hwPanel`, `QA_PAIRS`, `getAnswer()`.
- Issues: (1) Entire widget created via `document.createElement` and appended — works but not present in initial HTML (minor dead-end risk if JS fails). (2) Fallback when no match is shown but no option to escalate to waitlist. (3) No character limit or rate-limiting visible.
- Fix: Ensure chat button has fixed `aria-label` including brand; add “Join waitlist” chip when fallback fires.
- Impact: Low.

**CHECKOUT MODAL**
- Location: `#checkoutModal`, two steps (`#checkoutStep1`, `#checkoutStep2`), `submitCheckout()` overload in second script tag.
- Issues: (1) Internal labels still contain “Premium” (`coPremium`, `cfPremium`). (2) Payment method “Stablecoin” description lists tokens but the backend script only passes `method: pm` without token selection. (3) Success step shows “Promo ID” (`cfPolicy`) but the footer disclaimer and proto-banner say it is only a prototype. (4) No loading or error state for the Stripe redirect path in the injected `submitCheckout`.
- Fixes: Rename all premium labels to “Flat fee”. Add loading state on checkout button. Make the success “Promo ID” labeled “Reference” instead.
- Impact: High (compliance + conversion).

**FOOTER**
- Location: Footer text and links.
- Issues: Year “2026” is future-dated; repeated compliance sentence is good but slightly redundant with the hero.
- Fix: Change to current year or remove specific year.
- Impact: Low.

**CROSS-CUTTING ISSUES**
- No `noindex` meta or “Private demo” banner is visible in the provided HTML source (comment says they are injected).
- All CTAs eventually ask for email or payment; first meaningful action (calculator) is frictionless until the final “Run This Promotion” step.
- Mobile: All grids stack correctly below 700 px, but form labels and field-help text are small and may fail WCAG contrast in the dark calculator section.
- Consistency: Mixed use of “promo” vs “promotion”; three places still risk insurance-adjacent language.

**PRIORITIZED TOP-15 IMPROVEMENT LIST**

1. (High) Replace every instance of “premium”, “Get Coverage”, and insurance-adjacent labels in calculator result, checkout modal, and JS with “flat fee” / “Run This Promotion”.
2. (High) Remove native `alert()` calls in calculator; surface all errors with the existing `.reject-msg` styling.
3. (High) Ensure `calculate()` never displays a number unless `/api/resolve` or `/api/odds` returns a real resolved value (already true in code; add unit test / defensive guard).
4. (High) Make checkout success step use “Reference” instead of “Promo ID” and keep proto-banner visible.
5. (High) Add `aria-live` regions and keyboard support to FAQ and calculator odds/result panels.
6. (Med) Add inline error state + loading state to partner and AI designer forms consistent with calculator.
7. (Med) Shorten repetitive hero/FAQ copy blocks so the value proposition is stated once crisply.
8. (Med) Disable “See My Flat Fee” until exposure ≥250 and required inputs for the active category mode are present.
9. (Med) Replace trust-section icon entities with SVGs or Unicode that pass contrast.
10. (Med) Add one-click copy button to the generated affiliate ref link.
11. (Med) Ensure the mobile nav menu sets `aria-expanded` correctly and traps focus when open.
12. (Low) Pre-fill the stored `?ref` value into the partner form automatically.
13. (Low) Make the live-weather line always render (with fallback text) instead of toggling display:none.
14. (Low) Standardize “promo” vs “promotion” terminology across nav, headings, and buttons.
15. (Low) Update footer year and clean up the redundant compliance sentence.
