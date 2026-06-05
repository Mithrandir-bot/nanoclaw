# Hedgerow — Hedging & Pricing Venues (2026)

**Concept recap.** Hedgerow charges a small business a fee to underwrite a defined-event promo ("if the home team wins, your meal is free"; "if it rains > X inches on event day, refunds issued"; "free coffee if the local team scores 4+ goals"). To run this profitably Hedgerow needs one of two things per event:
1. **A hedge venue** — a liquid market where Hedgerow can lay off (buy a payoff that covers) the contingent liability, so a winning customer outcome is funded by the hedge.
2. **A pricing/settlement source** — authoritative data (and ideally a historical base rate) to price the fee and settle the parametric event, even if no hedge exists (then Hedgerow self-insures / pools risk).

This document surveys every realistic venue/category for 2026, then ranks them.

---

## 1. Kalshi (CFTC-regulated event exchange) — *baseline incumbent*

- **What it offers:** Federally regulated (CFTC Designated Contract Market) binary event contracts settling 0/100¢. Fully legal for US businesses and individuals; a US LLC can hold an account.
- **Coverage:** Very broad. Sports now ~80%+ of monthly volume (NFL/NBA/MLB/soccer game-winners, totals, series). **Weather** markets exist (daily high-temp by city, rainfall, snowfall, hurricane counts) but are tiny — ~$4.4M, ~0.2% of volume. Elections, econ, culture. **No hyper-local event coverage** (a specific town's festival, a single small-college game).
- **Liquidity/volume:** Largest US-regulated venue; ~$1.3B+/month, $52B cumulative by Mar 2026. Major-league sports and macro markets are deep; niche/weather markets are thin (wide spreads, low size).
- **US legal status:** Strongest of any venue — explicitly CFTC-regulated, legal in nearly all states (some state AG friction over sports but federally preempted to date).
- **API:** Mature REST API (events, markets, order book, bid/ask, volume, order placement/cancel). Well-documented, fee-free to use. Best programmatic-hedge ergonomics of the regulated set.
- **Fees:** Taker ≈ `0.07 × C × P × (1−P)`; maker ≈ `0.0175 × ...` (often effectively 0 as a resting maker). At P=0.50, taker ≈ $0.0175/contract (~1.75% of notional at midpoint). Cheap for hedging.
- **Usability for Hedgerow:** **Best regulated hedge venue today** for major-league sports promos and macro events. Legal, API-driven, settles itself. Weakness: weather and any local/niche event have little or no liquidity → can price-reference but cannot reliably hedge there.

## 2. Polymarket (now CFTC-regulated US venue via QCEX) — *deepest sports liquidity*

- **What it offers:** Largest prediction market globally (>$3B/month trades by Oct 2025). Returned to US users Dec 2025 via a **CFTC-licensed intermediary (QCEX)** after a Nov 2025 Amended Order of Designation; now operates as a federally regulated, intermediated exchange (trades via FCMs).
- **Coverage:** Sports (deep), politics, crypto, culture, some weather/event markets. Generally the deepest liquidity per market of any prediction venue. Still **no true local/small-event coverage.**
- **Liquidity/volume:** Highest in the category — best fills and tightest spreads for popular sports/macro contracts.
- **US legal status:** Legal federally as of 2026, **but geographically gated.** Sports/entertainment/election contracts banned in **Nevada**, and platform unavailable in **AZ, IL, MA, MD, MI, MT, NJ, NV, OH.** A Hedgerow customer/event in those states can't be hedged here even if Hedgerow's entity is elsewhere — creates per-event jurisdiction checks.
- **API:** Excellent. Three APIs — **Gamma** (market data), **Data** (positions/activity), **CLOB** (order book + place/cancel orders). Official Python SDK (`py-clob-client`). Wallet/EIP-712 signed orders; all APIs free beyond trading fees. Most automation-friendly of the whole set.
- **Fees:** US venue is simplest — **flat 0.10% taker fee** on premium, 0% maker, $0.001 min/trade. (Intl venue: maker free, taker `0.0625 × P × (1−P)` on a subset of markets.) Cheapest large-scale hedge fees available.
- **Usability for Hedgerow:** **Best raw hedge venue for liquidity + API**, ideal for sports-outcome promos. Main caveat is the state availability matrix — Hedgerow must geo-screen each promo's jurisdiction before relying on it.

## 3. PredictIt — *not usable*

- Survived CFTC shutdown via amended no-action letter (Jul 2025); raised per-contract cap to $3,500, removed per-market trader cap.
- **Politics/elections only**, tiny size, no sports/weather, US-only quirky access, basic data API. Position caps make commercial-scale hedging impossible. **Not a hedge venue for Hedgerow** — irrelevant to small-business promos.

## 4. Manifold — *pricing/forecast reference only*

- Returned to **play-money (Mana) only** after sunsetting real-money "sweepcash" Mar 2025. Zero US regulatory exposure precisely because no real money.
- Has a clean API and can host arbitrary user-created markets (including local/niche questions Kalshi won't list).
- **Cannot hedge** (no real money). Possible use: a *crowd-forecast / base-rate signal* for pricing odd local events that have no other data — but treat as soft signal only, not settlement. Low priority.

## 5. Regulated sportsbooks & odds APIs (DraftKings, FanDuel, BetMGM via aggregators) — *pricing proxy, NOT a clean hedge*

- **What they offer:** The richest, most granular real-time **pricing source** for sports outcomes — exactly the implied probabilities Hedgerow needs to price "if the team wins" promos.
- **API availability:** Major books (DraftKings, FanDuel, BetMGM, Caesars) have **no public API.** Access is via aggregators: **The Odds API** (~40 books, 500 req/mo free, credit-based), **SportsGameOdds** ($99–$499/mo, 80+ books incl. Pinnacle), **OddsPapi** (350+ books incl. sharps), **SportsDataIO/OpticOdds**. Entry ~$20–50/mo, enterprise $1,000+/mo.
- **As a PRICING source:** **Excellent and recommended** — use vig-stripped consensus odds (especially a sharp book like Pinnacle) as the fair-probability input to set Hedgerow's fee. Cheap, broad, programmatic.
- **As a HEDGE venue:** **Problematic.** (a) Hedging by *placing bets* requires Hedgerow to hold sportsbook accounts and wager — legally a bettor, not a regulated risk-transfer; books **limit/ban accounts that only win or look like arbitrage/matched betting**, so a systematic hedging book gets shut off fast. (b) A *business* placing repeated large hedging wagers raises gambling-law and account-ToS issues; "businesses generally may not accept bets or promote wagering" and can't reliably operate as a bettor at scale. (c) State-by-state licensing. **Verdict: best pricing proxy in the report, but do not architect the hedge on sportsbook accounts** — route the actual hedge to Kalshi/Polymarket instead.

## 6. CME Group weather futures/options (HDD/CDD/CAT) — *the only regulated weather hedge, but thin & coarse*

- **What it offers:** Exchange-traded, CFTC-regulated **Heating/Cooling Degree Day (HDD/CDD)** and **Cumulative Average Temperature (CAT)** futures & options. Contract unit $20 × index for US cities. The legitimate, regulated way to hedge temperature risk.
- **Coverage:** **Only ~13 US cities** (NY…Portland) + 4 European. **Temperature-based only** — measures monthly/seasonal degree-day accumulation, **not** "did it rain on Saturday." No rainfall/snow/single-day precipitation contracts.
- **Liquidity:** Historically thin, episodic, wide spreads outside core seasonal contracts; fine for utilities/energy hedging seasonal volume, poor for a single-day, single-town promo.
- **API/access:** Tradable via any futures broker (IBKR etc.) and CME market-data APIs; needs a futures account, not retail-friendly for micro-hedges.
- **Usability for Hedgerow:** **Weak direct fit.** A one-day "rain refund" promo cannot be hedged with monthly degree-day futures (basis mismatch + wrong peril + wrong granularity + low liquidity). Useful only if Hedgerow ever aggregates *seasonal temperature exposure across many promos in a covered city* into a portfolio hedge. For day-of-event weather, CME is **not** the answer.

## 7. Parametric weather data & insurance (NOAA/NWS, Tomorrow.io, Arbol/dClimate) — *the realistic weather path*

- **Authoritative settlement data (free/cheap, programmatic):**
  - **NOAA NCEI / Climate Data Online + NWS api.weather.gov** — free, government, authoritative; ideal **settlement oracle** for "rainfall at station X exceeded Y." Gold standard for dispute-free parametric settlement.
  - **Tomorrow.io** — commercial weather API, 60+ data layers, hyperlocal, insurance-grade; good for **pricing and real-time monitoring**; paid tiers.
- **Risk transfer / capacity:**
  - **Arbol (on dClimate)** — builds **bespoke parametric weather coverage** (rainfall, temp, wind triggers) using NWS/government data, fast objective payouts, customizable triggers/amounts. This is effectively a **reinsurance/capacity partner** Hedgerow could buy custom day-of-event weather protection from, rather than a market to trade.
- **Usability for Hedgerow:** **This is the correct stack for weather promos.** Price with Tomorrow.io + NOAA historical base rates; **settle on NOAA/NWS** station data (objective, free, defensible); **lay off tail risk via a parametric carrier like Arbol** for custom single-day/single-location triggers that exchanges can't touch. No liquid public *market* for day-specific local weather — so it's data-priced + carrier-hedged, not exchange-hedged.

## 8. Crypto / onchain options & event protocols — *not relevant in 2026*

- Polymarket already covers the onchain prediction use case (and is now the regulated US route). General onchain options (e.g., DeFi options vaults) are for crypto-price exposure, not sports/weather/local events, and add custody, regulatory, and counterparty risk with no event coverage benefit. **No advantage over Kalshi/Polymarket for Hedgerow. Skip.**

## 9. Prize-indemnity insurance (Beazley, Tokio Marine HCC, Odds On Promotions, ESP, American Hole 'n One) — *the closest existing analog & a real hedge for "feat" promos*

- **What it offers:** The incumbent industry doing **exactly what Hedgerow does** for low-probability *feat* contests: hole-in-one, half-court shot, field-goal kick, home run, blue-line goal, "score N goals," etc. Organizer pays a **fixed fee (typically 3–15% of prize value)**; carrier pays the prize if the feat occurs. Underwriters: **Beazley, Tokio Marine HCC, Odds On Promotions, ESP Specialty, American Hole 'n One.**
- **Usability for Hedgerow:** Two roles. (1) **Reinsurance/capacity backstop** — Hedgerow can *buy* prize-indemnity cover to lay off promos that have no tradable market (skill feats, "free meal if a specific play happens"), turning self-insurance into purchased coverage. (2) **Competitive/benchmark** — their 3–15% pricing is the market rate Hedgerow's fees must beat or undercut with better UX/automation. **Strong fit as a hedge for non-market "feat" events**, and the clearest comp for the whole business.

---

## Ranked shortlist — most viable hedge / pricing venues for Hedgerow

| Rank | Venue | Best for | Role |
|------|-------|----------|------|
| **1** | **Polymarket (US/QCEX)** | Major-league sports-outcome promos | Primary **hedge** — deepest liquidity, best API, cheapest fees (0.10% taker). Caveat: state geo-gating. |
| **2** | **Kalshi** | Sports + macro/econ promos; legal certainty | Primary **hedge** (regulated, broadest legality) + cross-check on Polymarket pricing. |
| **3** | **Sports odds aggregators (The Odds API / SportsGameOdds / Pinnacle consensus)** | Pricing any sports promo | **Pricing source only** — vig-stripped fair odds. Do NOT hedge by placing sportsbook bets (account limits + gambling-law risk). |
| **4** | **Parametric weather stack: NOAA/NWS (settle) + Tomorrow.io (price) + Arbol (capacity)** | Weather promos (rain/temp/snow day-of-event) | **Pricing + settlement + carrier hedge.** The real weather solution; no liquid market needed. |
| **5** | **Prize-indemnity carriers (Beazley, Tokio Marine HCC, Odds On)** | Skill-feat & non-market promos | **Reinsurance backstop** + pricing benchmark (3–15% of prize). |
| **6** | **CME HDD/CDD/CAT weather futures** | Aggregated seasonal temperature exposure only | Niche portfolio hedge; wrong granularity/peril for single-event weather. |
| — | PredictIt, Manifold, onchain options | — | Not usable (caps / play-money / no event coverage). Manifold = soft forecast signal at most. |

### What each is BEST for
- **Sports outcomes (major league):** Hedge on **Polymarket** (depth/fees) with **Kalshi** as regulated backup; **price** off consensus sportsbook odds.
- **Sports outcomes (minor/college/local team):** Price off odds APIs if listed; if no market depth → **self-insure or buy prize-indemnity**.
- **Weather (rain/temp on event day):** **Price** (Tomorrow.io + NOAA history), **settle** (NOAA/NWS station data), **hedge tail** via **Arbol** parametric cover.
- **Skill feats / "free meal if X play happens":** **Prize-indemnity** carriers — the proven model.

### Biggest gaps — events with NO viable hedge venue (must self-insure or buy bespoke cover)
1. **Hyper-local events** — a specific town festival, a single small-college/high-school game, "if our local team makes the playoffs." No prediction market lists these; sportsbooks rarely price them. → Self-insure with pooled base-rate pricing, or bespoke prize-indemnity.
2. **Single-day, single-location weather** — exchanges (CME) are monthly/coarse/13-cities; no liquid market exists. → Data-priced + **Arbol**-style parametric carrier; not exchange-hedgeable.
3. **Sports promos in geo-banned states (NV, AZ, IL, MA, MD, MI, MT, NJ, OH)** — Polymarket unavailable/sports-banned; Kalshi partially contested. → Route hedge through Kalshi where legal, else self-insure for those jurisdictions.
4. **Idiosyncratic/skill events** (eating contests, attendance milestones, "10,000th customer") — no market and often no clean parametric data. → Self-insure with conservative pricing; prize-indemnity for high-value prizes.

### Architectural takeaway
Hedgerow should be built as a **pricing + routing engine**, not a single-venue bet:
- **Price** every promo from the cheapest authoritative source (odds APIs for sports, NOAA+Tomorrow.io for weather, historical base rates for feats).
- **Route the hedge** to the best legal venue: Polymarket/Kalshi for tradable sports/macro; Arbol/prize-indemnity carriers for weather and feats.
- **Self-insure the residual** (local/idiosyncratic events) from a reserve pool, sized off the same base-rate models — this is where Hedgerow keeps margin and bears real risk, so pricing discipline there is existential.

---

## Sources
- [Polymarket returns to US (Reason)](https://reason.com/2026/01/04/the-return-of-polymarket/) · [Polymarket CFTC approval (TheBulldog)](https://www.thebulldog.law/polymarket-receives-cftc-approval-to-resume-us-operations-after-years-offshore) · [Polymarket legal status (GamblingInsider)](https://www.gamblinginsider.com/in-depth/106291/is-polymarket-legal-in-the-us) · [Polymarket Wikipedia](https://en.wikipedia.org/wiki/Polymarket)
- [Polymarket API Introduction (docs)](https://docs.polymarket.com/api-reference/introduction) · [Polymarket API Guide 2026 (pm.wiki)](https://pm.wiki/learn/polymarket-api)
- [Kalshi API – Get Event](https://docs.kalshi.com/api-reference/events/get-event) · [Kalshi volume (DefiRate)](https://defirate.com/prediction-markets/volume/kalshi/) · [Kalshi Wikipedia](https://en.wikipedia.org/wiki/Kalshi) · [Kalshi event contracts (Deadspin)](https://deadspin.com/prediction-markets/kalshi/event-contracts/)
- [Kalshi vs Polymarket fees (Laika Labs)](https://laikalabs.ai/prediction-markets/kalshi-vs-polymarket-fees-comparison) · [Kalshi Fee Schedule Feb 2026 (PDF)](https://kalshi.com/docs/kalshi-fee-schedule.pdf) · [Prediction market fees (DefiRate)](https://defirate.com/prediction-markets/fees/)
- [PredictIt shutdown/no-action (iGB)](https://igamingbusiness.com/legal-compliance/legal/us-regulators-to-shut-down-political-betting-site-predictit/) · [PredictIt review 2026 (Tech-Insider)](https://tech-insider.org/prediction-markets/platforms/predictit-review/) · [PredictIt Wikipedia](https://en.wikipedia.org/wiki/PredictIt)
- [Manifold review 2026 (CryptoSlate)](https://cryptoslate.com/prediction-markets/manifold-predictions-review/) · [Manifold Wikipedia](https://en.wikipedia.org/wiki/Manifold_(prediction_market))
- [The Odds API](https://the-odds-api.com/) · [SportsDataIO odds API](https://sportsdata.io/live-odds-api) · [Odds API pricing 2026 (OddsPapi)](https://oddspapi.io/blog/odds-api-pricing-2026-comparison/) · [Sportsbook API 2026 (sportsapis.dev)](https://sportsapis.dev/sportsbook-api)
- [Hedging legality (BettingUSA)](https://www.bettingusa.com/sports/hedging/) · [Sportsbook account limits (ProfitDuel)](https://www.profitduel.com/blog/avoid-sportsbook-account-limited) · [Sports betting laws for small business (Rocket Lawyer)](https://www.rocketlawyer.com/the-briefing-room/sports-betting-laws-by-state-what-small-businesses-should-know) · [Exchange to hedge sports risk (LegalSportsReport)](https://www.legalsportsreport.com/46503/us-sportsbooks-hedging/)
- [CME weather futures (CME education)](https://www.cmegroup.com/education/articles-and-reports/managing-climate-risk-with-cme-group-weather-futures-and-options) · [Hedging weather risk (CME)](https://www.cmegroup.com/education/lessons/hedging-weather-risk.html) · [CME weather products](https://www.cmegroup.com/markets/weather.html) · [CME Degree Days rulebook Ch.403](https://www.cmegroup.com/rulebook/CME/IV/400/403/403.pdf)
- [NOAA NCEI CDO web services v2](https://www.ncdc.noaa.gov/cdo-web/webservices/v2) · [NWS api.weather.gov FAQ](https://weather-gov.github.io/api/general-faqs) · [Tomorrow.io weather API](https://www.tomorrow.io/weather-api/) · [Tomorrow.io insurance](https://www.tomorrow.io/solutions/insurance/) · [Arbol solutions](https://www.arbol.io/solutions) · [Arbol parametric/crop](https://www.arbol.io/post/how-ai-and-parametric-models-are-revolutionizing-risk-protection-for-crop-insurance)
- [Prize indemnity (Beazley)](https://www.beazley.com/en-US/products/contingency-usa/prize-indemnity/) · [Prize indemnity insurance (Wikipedia)](https://en.wikipedia.org/wiki/Prize_indemnity_insurance) · [Odds On Promotions](https://www.oddsonpromotions.com/prize-indemnity-insurance) · [Tokio Marine HCC prize indemnity](https://www.tmhcc.com/en/products/contingency/prize-indemnity)
