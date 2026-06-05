# Hedgerow site review — GEMINI 3

This is a high-fidelity audit of the **Hedgerow** landing page. As a senior reviewer, my focus is on bridging the gap between a "complex financial product" and a "simple marketing tool" while maximizing conversion and trust.

---

### 1. Hero Section
*   **Issue:** The subheadline "No accounts. No paperwork." is great, but the "Private demo · sandbox" disclaimer described in the backend behavior is missing from the provided code (it says it's "injected," but user expectations are high).
*   **Friction:** The hero copy is long. "You run the promo — 'Free wings if the Bucs win.' If it happens, we pay YOU..." is the core value prop, but it's buried in a paragraph.
*   **Risk:** "Pick a fun, local event" is vague. Users might think it's social media contests.
*   **Fix:** Use a split-bolding technique. Bold the specific "If X happens, we pay YOU Y."
*   **Impact:** **High** (Clarity of novel product).

### 2. How It Works
*   **Issue:** Step 4 mentions "USDC." For a local "Sports Bar" or "Car Dealership," this introduces massive friction and "scam" vibes if they don't know what a stablecoin is.
*   **Friction:** Steps are text-heavy.
*   **Fix:** Focus on Bank Transfer (ACH) as the primary and label USDC as "Digital Dollars (USDC)."
*   **Impact:** **High** (Trust).

### 3. Pricing Calculator (The Core Interactive Flow)
This is the most complex part of the site. I've traced the logic flows:

*   **A. The "Miami Heat" Dead End (Matchup Flow):**
    *   **State:** User enters "Miami Heat vs Lakers." Server returns `found: false` because no market exists.
    *   **Current UX:** The result panel stays hidden. The odds box shows a long text error.
    *   **The Issue:** The user is left at a dead end with no "Next Step."
    *   **Fix:** When a market isn't found, change the "See My Flat Fee" button to "Get Notified When Markets Open" and collect an email.
    *   **Impact:** **High** (Conversion).

*   **B. Hurricane/Blackout Logic (Weather Flow):**
    *   **State:** User selects Tampa, August 15. The server refuses due to hurricane blackout.
    *   **Risk:** The current `showNoOdds` message is generic.
    *   **Fix:** Explicitly state: "We cannot price hurricane-prone regions between Aug-Oct. Please pick a different date or event type."
    *   **Impact:** **Med** (Compliance/UX).

*   **C. The "Too Soon" / "Too Far" States:**
    *   **Friction:** The calculator doesn't visually indicate the 15-120 day window *before* the user picks a date. The user has to guess, click, and fail.
    *   **Fix:** Use the `min` and `max` attributes on the `<input type="date">` to grey out invalid dates on the browser's date picker.
    *   **Impact:** **High** (Friction).

*   **D. "Fuel" Pricing Confusion:**
    *   **Issue:** Code says Fuel is "ESTIMATE only" and cannot be bound. However, it uses the same "See My Flat Fee" button as boundable sports events.
    *   **Risk:** Users will try to buy a fuel hedge and feel "baited" when they can't.
    *   **Fix:** Change the result button from "Run This Promotion" to "Contact for Quote" specifically for the fuel category.
    *   **Impact:** **High** (Legal/Trust).

### 4. AI Designer Flow
*   **Flow:** Inputs -> `designPromo()` -> `renderDesignedPromo()` -> `useDesignedPromo()`.
*   **Issue:** In `useDesignedPromo`, the JS tries to map the AI's "Event" to a category. If the AI suggests "Free Coffee if it's Monday," the mapping falls back to "Custom," but the "Custom" category requires a "Matchup" input which will be empty.
*   **Fix:** Ensure `useDesignedPromo` populates the `matchupInput` field with the AI's trigger text if the category is 'custom'.
*   **Impact:** **Med** (Broken Flow).

### 5. Checkout Modal & Payment
*   **Issue:** The modal uses the term "Coverage" and "Premium" in IDs (e.g., `coCoverage`, `coPremium`).
*   **Compliance Risk:** You specifically stated: "must avoid insurance/coverage/premium/policy."
*   **Fix:** Change `coCoverage` label to "Your Payoff" and `coPremium` to "Flat Fee." Update variable names to `fee` and `payoff`.
*   **Impact:** **High** (Compliance).

### 6. Partner Form
*   **Issue:** The form returns a raw link. There is no "Copy to Clipboard" affordance. Mobile users will struggle to highlight and copy accurately.
*   **Fix:** Add a "Copy Link" button next to the generated referral URL.
*   **Impact:** **Med** (UX).

---

### PRIORITIZED TOP-15 IMPROVEMENTS

1.  **Compliance Audit (Critical):** Rename `cfPolicy` to `cfPromoID`, `coPremium` to `coFee`, and `coCoverage` to `coPayoff`. Eliminate "Coverage" from all UI text immediately.
2.  **Date Picker Constraints:** Add `min` and `max` attributes to the `#eventDate` input to reflect the 15-120 day pricing window.
3.  **Fuel Category Logic:** Change the CTA button in the result panel to "Request Fuel Quote" instead of "Run This Promotion" since it is not server-authoritative for instant checkout.
4.  **The "No Market" Lead Gen:** If Sports/Milestone results in "no live market," display a lead form: "This matchup isn't trading yet. Enter your email and we'll ping you when it's live."
5.  **USDC Translation:** Add a tooltip or microcopy next to the Stablecoin option: "USDC is a digital dollar pegged 1:1 to USD. Best for instant payoff."
6.  **AI Designer Mapping:** Add a catch-all in `useDesignedPromo()` that copies the suggested trigger into the `matchupInput` so the calculator isn't empty after "Use this promo" is clicked.
7.  **Social Proof Realism:** The "Proof Bar" says `$0 Risk`. While true, it feels "too good." Change one stat to "Settled on Official Data" to emphasize the lack of "casino" vibes.
8.  **Hurricane Blackout Microcopy:** Hardcode a check for FL/Gulf + Aug-Oct to show a helpful "Seasonal Blackout" message before the user even clicks "Calculate."
9.  **Calculator State Persistence:** If a user clicks "Use This Promo," scroll them to the *top* of the calculator, not just the section. Currently, the result panel might be obscured.
10. **Empty State Validation:** Red-border the "Matchup" or "City" inputs if the user clicks "See My Flat Fee" without filling them.
11. **Partner Link UX:** Add a one-click `navigator.clipboard` button for the referral link.
12. **Hero Vertical Spacing:** The `.hero-lead` and `.hero-sub` are very similar. Merge them or increase the font-weight of the lead to sharpen the visual hierarchy.
13. **Mobile Table Alignment:** In the Checkout Modal, `order-row` elements will cramp on 320px screens. Use a stack layout for those labels on mobile.
14. **FAQ Clarity:** Add a question: "Is this insurance?" Answer: "No. Hedgerow is a marketing promotion tool. We fund your marketing giveaway, we do not insure your business losses." (Crucial for compliance).
15. **Visual Feedback:** Add a subtle loading pulse to the `estOddsBox` when it is in the "Pricing..." state so it doesn't look like the calculator is frozen.
