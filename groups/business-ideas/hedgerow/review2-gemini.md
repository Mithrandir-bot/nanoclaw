# Hedgerow review 2 + new use cases - GEMINI 3

### PART 1 - FULL REVIEW

**Feature Status:**
*   **Weather Pricing Engine: PASS.** Real-world data shows 422/404 handling is robust. Specific blockages for Hurricane season and date-range constraints (15–120 days) function correctly.
*   **AI Promo Designer: PASS.** Successfully bridges the gap from abstract business types (e.g., Scoop Up the Savings) to concrete calculator inputs.
*   **Lead Capture & Demand Tracking: PASS.** Correctly captures intent for unpriceable events (sports markets not yet open) and fuel quote requests.
*   **Checkout Workflow: PASS.** Stripe redirect logic is verified; payment method selection (Card/ACH/USDC) persists correctly to the backend.
*   **Mobile UX: PASS.** Sticky CTA and Chat widget positioning rules prevent overlap on small viewports.

**Bugs/Regressions:**
*   *None observed in E2E JSON.* The 404/422 responses are confirmed "expected" behavior for out-of-bounds or non-existent geographic/market data.

**Top 5 Improvements:**
1.  **Trust/Proof:** Replace the static "$0 Risk" stat with a "Settlement Log" or rotating "Recent Verification" feed (e.g., *"Event Resolved: Rain > 0.1in in Jacksonville on Oct 12 - Payouts Sent"*).
2.  **Conversion:** Add a "See Climatology" link next to weather odds. Businesses feel more secure paying when they see the 10-year historical chart.
3.  **UX:** In the `weather-too-soon` scenario, the calculator clears the result panel entirely. It should instead show a "Pre-order" state where the fee is locked but the promotion is held until the 14-day window opens.
4.  **Copy:** Clarify "Exposure" further. Small business owners often confuse it with budget. Use: *"Highest possible payout you need to make."*
5.  **Reassurance:** Add the specific NWS Station ID or Sports Exchange name to the "Settled by" line (e.g., *"Settled by National Weather Service Station #KTPA"*).

---

### PART 2 - NEW BUSINESS USE CASES

| Business Type | Clean Binary Trigger (Oracle) | Customer-facing Promo Line | Insurable Interest / Pain | Odds Band |
| :--- | :--- | :--- | :--- | :--- |
| **HVAC / AC Repair** | Max Temp $\ge$ 98°F (NWS) | "If it hits 98°, everyone gets a free filter/tune-up!" | Techs are idle in mild weather; spikes cause overtime costs. | Low |
| **Roofing / Gutter Co.** | Total Rain $\ge$ 3.0" in 24h (NWS) | "If we get a 3-inch deluge, your repair is 50% off!" | Rainy days stop work entirely; funds the labor for the backlog. | Low/Med |
| **Ski / Winter Retail** | Snowfall $\ge$ 6.0" on [Date] (NWS) | "If it dumps 6 inches on Xmas, your coat is free!" | Low-snow years kill inventory turnover. | Low |
| **Airport Parking** | Fuel Price $\le$ $2.75 (EIA/AAA) | "If gas drops below $2.75, your parking is free!" | High fuel drives travelers to shuttles/rideshares instead of driving. | Med |
| **Car Washes** | Rain $\ge$ 0.01" on Saturday (NWS) | "If a single drop falls, get a free 'Gold' wash next week." | Rain on weekends destroys 40-60% of weekly revenue. | Med |
| **Local MLB Bar** | Team Makes Postseason (Official MLB) | "If the [Team] makes October, the first round is on us!" | Playoff runs drive 3x foot traffic; funds the "party" to lure them in. | Med/High |
| **Garden Centers** | Low Temp $\le$ 32°F after April 15 (NWS) | "A late frost? We replace your dead plants for free!" | Late cold snaps cause immediate product loss and consumer fear. | Low |
| **Solar Installers** | 5+ Consecutive Rainy Days (NWS) | "Cloudy week? We pay your first month's solar bill!" | Overcomes consumer "What if it's cloudy?" objection during sales. | Low |
| **Marathon/Race Org.** | AQI $\ge$ 150 (Official Air Quality Index) | "Code Red Air Day? Full refund on race entry." | Smoke/smog force cancellations; creates auto-refund pool. | Low |
| **Energy Auditors** | Heating Degree Days $\ge$ X (NWS) | "Record cold month? Your energy audit is free!" | High utility bills make homeowners "budget-scared" of upgrades. | Med |

**Excluded Ideas:**
*   *Construction "Wind Delay":* Subjective—damage depends on gust vs. sustained. Excluded for lack of binary public oracle for "on-site" wind.
*   *Player "Double-Double" Promos:* Prop bets. Excluded per rule—too niche/volatile; moneyline win is the only clean binary.
*   *Conference "Attendance" Drops:* Verifiable, but not by a *public* real-time oracle (requires manual internal audit).
