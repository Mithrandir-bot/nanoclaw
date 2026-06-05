# E2E click-through analysis — GEMINI 3

### 1. PER-FEATURE VERDICT

*   **Weather Pricing (incl. One-Click/Scroll):** **PASS**. `weather-tampa-blankThreshold-oneclick` successfully autofilled "11.5", calculated a 22% live price, and performed a smooth scroll to the results (`scrollY: 2033`).
*   **6 Can’t-Price States (Logic Check):** **PASS**. Data shows the backend correctly handles edge cases (Too soon, Too far, Peak Hurricane, Too likely, Unknown city, Low exposure) with 422/404 errors and matching descriptive user-facing caveats.
*   **Sports:** **PARTIAL**. While the logic handles "no live market" gracefully (`sports-real-matchup`), the category relies entirely on external liquidity (Polymarket/Kalshi). Functional as designed, but "offseason" messaging is the frequent state.
*   **Fuel:** **PASS**. `fuel-estimate-requestquote` returned an 27% estimate and a successful $900 quote for the user.
*   **AI-Designer Handoff:** **PARTIAL**. The "Design My Promo" tool successfully populates the calculator (`ai-designer-handoff`), but the resulting data reveals a logic gap (see Bugs).
*   **Checkout (Card/ACH/USDC):** **PASS**. All three methods successfully triggered the Stripe integration and modal visibility.
*   **Waitlist / Partner / Chat / FAQ:** **PASS**. Leads captured, affiliate links generated, and chat/accordion interactions functioned without error.
*   **Nav / Mobile UI:** **PASS**. Desktop links are anchored correctly; the mobile hamburger and sticky CTA are visible and non-overlapping.

---

### 2. REAL BUGS & REGRESSIONS

**Major Defect: AI-Designer Handoff Logic Gap**
*   **Symptom:** In `ai-designer-handoff`, the data shows `calcResultVisible: false` even though the calculator was populated.
*   **Evidence:** The AI populated `matchup` with a long sentence: *"Colorado Rockies score 10 runs or more in any home game in July."*
*   **Diagnosis:** The Sports calculator expects a specific team/matchup to poll an API. The AI is passing a "Season Milestone" or "Custom Condition" into the Sports `matchup` field. Because this isn't a simple team name, the backend can't find a market and fails to price automatically.
*   **Fix:** Adjust the AI handoff to check if the generated idea is a **complex condition**; if so, it should populate the "Something Else" (Custom) category instead of "Sports," or the Sports UI must allow a "Request Quote" fallback when a search returns no market.

---

### 3. TOP 5 HIGH-VALUE FIXES

1.  **Fix AI-Handoff Mapping (Priority: High):**
    *   **Remedy:** Update the "Design My Promo" script. If the generated event contains more than 3 words (indicating a complex rule like "score 10 runs" vs just "Rockies"), force the `category` to "Something Else". This ensures the user sees a "Request Quote" button instead of a dead "No market found" error. (Ref: `ai-designer-handoff`)
2.  **Add "Hurricane Season" Calendar Blocking (Priority: Medium):**
    *   **Remedy:** On the frontend, if "Miami" or "Tampa" is selected, gray out Aug-Oct on the date picker. Currently, the user selects a date and *then* gets a 404/Caveat. Blocking it pre-click improves UX. (Ref: `weather-hurricane-miami-sept`)
3.  **Sports Search "Auto-Suggest" (Priority: Medium):**
    *   **Remedy:** Users are typing gibberish or non-trading teams. Add a simple dropdown/autocomplete for the Sports field populated by the live markets list to prevent the "No market" dead-end. (Ref: `sports-gibberish-nomarket-lead`)
4.  **Increase Visibility of $250 Minimum (Priority: Low):**
    *   **Remedy:** In `weather-exposure-too-low`, the user hit a wall. Add a small "Min. $250" placeholder or label directly inside the Exposure input field to prevent the error-state trigger.
5.  **Expand "Too Soon" Threshold (Priority: Low):**
    *   **Remedy:** The current limit is 15 days (`weather-too-soon-+5d`). Consider adding a "Notify me when this is priceable" button for dates 5-14 days out to capture the lead instead of just showing a 422 error.
