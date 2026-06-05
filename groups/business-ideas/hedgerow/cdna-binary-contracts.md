# Hedgerow — CDNA (Crypto.com) Binary / Event Contracts: Post-Migration Re-Evaluation

**Date:** 2026-06-02
**Question:** Now that Crypto.com has absorbed Nadex into CDNA, can Hedgerow actually USE it for BINARY CONTRACTS — as a hedge venue and/or a regulated product wrapper? Did the Crypto.com move change the earlier SKIP-as-hedge verdict?
**Supersedes the open questions in:** `nadex-evaluation.md` (2026-06-02)

---

## TL;DR VERDICT

**Hedge venue: still SKIP. Regulated B2B wrapper: upgraded to PARTIAL → TEST-worthy.**

The Crypto.com migration changed **two** facts that were previously uncertain, but it did **not** change the hedge conclusion:

1. **NEW — Weather contracts confirmed live post-migration.** CDNA now lists true binary weather event contracts: daily city high/low temperature, precipitation (rain & snow), and severe-weather, settled to specific NOAA stations. Our prior note said "post-migration unclear / de-emphasized." It is NOT unclear anymore — they exist. **But Kalshi is still "the clear leader in the weather category" with deeper, more granular city-level books; CDNA weather is the thinner copy.**
2. **NEW — A real B2B distribution stack now exists and is being used.** Three live templates in 2026: DraftKings Predictions (Feb 2026), **High Roller (ROLR) signed a Definitive Agreement Apr 14 2026 to operate as a CFTC-registered Introducing Broker connecting to Crypto.com's FCM**, and **Plaee**, an API-first "plug-and-play" infrastructure layer that lets fintechs integrate CDNA event contracts "within weeks" where *customers become members of the DCM* (so the deploying operator may not need its own broker registration). This is materially more concrete than the single DraftKings precedent we had before.

**What did NOT change — the hedge disqualifier:**
- **There is still no public developer API for CDNA event contracts.** The institutional path is **FIX 4.4**, available only to FCM members / connected institutions — and the public `exchange-docs.crypto.com` FIX/REST/WS API covers **only crypto spot/margin/perps/futures, NOT the event contracts.** So a small business cannot self-serve read event-contract prices or place binary orders. Kalshi still wins outright: free, open REST API, no membership gate.

**Net:** The Crypto.com move makes CDNA a **better candidate for the regulated-wrapper PIVOT** (weather is real; the IB/infra path is proven) but does **nothing** to make it a usable systematic **hedge** venue. For hedging, Kalshi remains strictly dominant.

---

## 1. POST-MIGRATION PRODUCT — what CDNA lists NOW (2026)

**Categories live inside the Crypto.com app / OG / Predict (all powered by CDNA):**
- **Sports** — the marquee category (NFL, NBA, Premier League, Super Bowl, March Madness; winners/spreads/totals/props/parlays). Crypto.com-era addition; legacy Nadex didn't do major-league sports.
- **Weather — YES, confirmed live.** Daily high/low temperature for major cities, precipitation (rain & snow), and severe-weather events. **Tied to specific verifiable data sources (named NOAA weather stations).** This is the key fact that was "unclear" before and is now confirmed.
- **Economics / financials** — Fed decisions, inflation/CPI, employment/payrolls, financial indicators.
- **Crypto** — cryptocurrency event contracts (native Crypto.com category).
- **Politics, culture, entertainment** — elections, policy/approval, cultural & entertainment outcomes.

**Are they true binaries?** Yes. CFTC-regulated **Yes/No** contracts, order-book driven, live prices, structured in **$1 / $10 / $100 tiers**, starting at $1 with capped risk — the 0-to-100 binary payoff inherited from Nadex's spec. Buy at the offer = max loss; max profit = 100 − cost.

**Expiries / tenors:** Event-horizon for prediction-style contracts (resolve at the event), plus the legacy short-dated binaries (intraday/daily/weekly) for FX/index/commodity. The very short tenors that mismatch a multi-week SMB promo are still the norm for the legacy binary book.

**Availability:** 49 states + DC. **New York excluded.** (Relevant: Hedgerow's FL focus is fine; NY customers would be blocked.)

---

## 2. PROGRAMMATIC ACCESS — did Crypto.com bring an API the standalone Nadex lacked?

**Partially — but NOT a public/self-serve API for event contracts.**

- **FIX 4.4 institutional DMA exists** (FIX API for the Crypto.com Exchange): advanced order types, read-only drop-copy sessions for surveillance, block trading. This is genuinely more than the API-less standalone Nadex had.
- **BUT the public, documented Crypto.com Exchange API (`exchange-docs.crypto.com`) covers only crypto spot / margin / perpetual swaps / futures — it does NOT cover the CDNA event contracts.** Confirmed by fetching the docs: no event-contract / prediction-market endpoints.
- **Event-contract programmatic access is gated behind membership/partnership**, not open:
  - **FIX connectivity** is for FCM members / connected institutions.
  - **Plaee** offers an "API-first plug-and-play" integration into CDNA liquidity pools — but it's a B2B onboarding for operators building a consumer product, not a free read/trade API a back-office hedging script can hit.
- **No free, documented, self-serve REST API to read event-contract prices or place binary orders** the way Kalshi provides. Third-party "Crypto.com prediction API" vendors (e.g., TRUEPREDiCT) are wrappers/scrapers, not official.

**Bottom line:** Crypto.com brought institutional FIX + a partner-onboarding API layer (Plaee), but **not** an open developer API for event contracts. For a small business that wants to *programmatically read and lay off* binaries, this is still effectively closed. **Kalshi's open REST API remains the only practical programmatic venue.**

---

## 3. HEDGE-VENUE FIT for Hedgerow — SKIP (unchanged)

**Do their binaries cover our core book (weather + local sports)?**
- **Weather: yes at the macro/major-city level** (NOAA-station temp/precip/severe). **No** for hyper-local "our town's festival weekend" — same gap as everyone. CDNA weather is thinner than Kalshi's.
- **Local / minor-league sports: no.** Major-league only. The local-team angle that differentiates Hedgerow is not listed by any DCM (no liquidity, no economic purpose).
- **So CDNA can nominally touch the *commoditized* slice of our book (major-city weather, major-league sports, macro), but not the *differentiated local* slice — which is exactly where Hedgerow's edge lives and where no DCM will list contracts.**

**Why it still fails as a hedge venue (the disqualifier is unchanged):**
1. **No usable API for event contracts.** A systematic lay-off venue must be programmatically readable and order-routable by us. CDNA event contracts are FIX/FCM-member-gated; no open API. **Kalshi gives us the same perils WITH a free REST API.**
2. **Tenor mismatch** on the legacy binary book (intraday→weekly vs multi-week/month promos).
3. **Thinner books** than Kalshi on weather/energy; can't move size.
4. **No local coverage** — the only perils CDNA lists are the ones Kalshi also lists and reads better.

**Verdict (hedge): SKIP.** Strictly dominated by Kalshi for every overlapping peril. The Crypto.com migration confirmed weather exists but did nothing about the API gap, which is the actual blocker. **The earlier SKIP-as-hedge conclusion stands.**

---

## 4. PRODUCT / WRAPPER FIT — B2B intermediary path is now PROVEN and repeatable

This is where the Crypto.com move genuinely improves the picture. There are now **three live distribution templates**, and they map to **two distinct registration burdens**:

| Path | What it is | Registration burden | Fit for Hedgerow |
|---|---|---|---|
| **Introducing Broker** (High Roller / ROLR, Apr 2026) | You register as a CFTC IB and connect to Crypto.com's FCM; you surface CDNA contracts to your customers | **You must obtain CFTC IB registration** (+ NFA membership), connect to FCM (Foris DAX) | Heaviest; you become a regulated derivatives intermediary |
| **Plaee infrastructure** (API-first) | A turnkey tech layer; you integrate CDNA contracts "within weeks"; **customers become members of the DCM directly**, trades clear at CDNA | Plaee positions it as **removing the need for independent broker registration** — operator rides CDNA's regulatory status. (Exact operator-side obligations not fully disclosed — must confirm.) | **Lightest documented path** — worth a direct inquiry |
| **Distributor / brand** (DraftKings Predictions, Underdog Predict) | Consumer brand surfaces CDNA contracts to its own users | Brand-level arrangement w/ CDNA; IB/FCM plumbing behind the scenes | Reference architecture |

**The DraftKings-Predictions-style B2B2C path the prior note asked about clearly EXISTS and is being signed by multiple parties in 2026** (DraftKings, High Roller, Underdog, Plaee-powered operators). So the answer to "is there an intermediary path to surface CFTC binaries to our SMB customers?" is **YES.**

**But the model-breaking caveats from the prior eval are unchanged:**
1. **Flips Hedgerow from house/insurer → intermediary/referrer.** On a DCM the *customer* holds the contract and the *exchange* is the CCP counterparty. We earn routing/intermediary economics, not underwriting spread. Guts the current revenue model.
2. **No insurable-interest requirement** — good for "not insurance" legality, but means the SMB is *hedging/speculating on its own*, not buying coverage from us. It's advisory/brokerage, not a coverage product.
3. **Only the commoditized perils qualify.** A DCM won't list "this diner's home team" or "our town's festival" — no liquidity. The wrapper legitimizes exactly the perils that DON'T need Hedgerow's local edge.
4. **Registration cost.** IB path = CFTC IB + NFA. Plaee path *claims* to avoid independent broker registration — that single claim is the highest-value thing to verify, because if true it's a fast, low-reg way to surface regulated binaries.

**Verdict (wrapper): PARTIAL → worth a TEST-grade inquiry.** The path is now proven and there's a possibly-low-registration on-ramp (Plaee). Still converts us from insurer to broker and only covers commoditized perils.

---

## 5. VERDICT vs Kalshi (incumbent)

| Dimension | CDNA / Crypto.com (2026) | Kalshi |
|---|---|---|
| Regulatory | CFTC DCM + DCO + FCM (full stack) | CFTC DCM |
| **Public event-contract API** | **None** (FIX is FCM-member-gated; public API is crypto-only) | **Free, mature, open REST API** |
| Weather contracts | **Yes, live** (NOAA temp/precip/severe) but thinner | **Category leader** — granular city-level, deepest book |
| Sports | Major-league, fast-growing | ~80% of volume |
| Econ / macro | Fed, CPI, payrolls | Broad |
| Binary 0–100, $1/$10/$100 tiers | Yes | Yes |
| Local / minor-league perils | No | No |
| Hedge ergonomics | **Poor** (no API, thin, tenor) | **Good** (API + depth) |
| B2B2C intermediary path | **Proven & multiplying** (DraftKings, High Roller IB, Underdog, Plaee infra) | Same DCM status — should ask; less public B2B2C precedent |

**FINAL:**
- **For HEDGING our payouts: SKIP CDNA. Use Kalshi.** The Crypto.com move (weather now confirmed) does NOT overturn this — the no-API gate is the blocker and it's unchanged. Kalshi covers the same perils with an open API.
- **For the regulated PRODUCT WRAPPER pivot: CDNA is now a credible PARTIAL** thanks to the proven, multiplying B2B distribution stack (esp. the Plaee "no independent broker registration" claim). But it (a) only legitimizes commoditized perils, (b) turns Hedgerow into a broker not an insurer, and (c) still needs the registration question answered. **Run the same inquiry against Kalshi in parallel** — Kalshi has the API and is the incumbent, so if either offers an intermediary path, Kalshi is the better counterparty for everything except the wrapper-precedent depth (where CDNA now leads).

---

## SINGLE MOST USEFUL NEXT STEP

**Email Plaee (CDNA's API-first infrastructure partner) and CDNA partnerships with the one question that decides the wrapper pivot:**

> "Can an operator surface CDNA's CFTC-regulated event contracts (incl. weather temp/precip and major-league sports) to its own SMB customers via Plaee's integration **without obtaining its own CFTC IB/FCM registration** — i.e., do our customers become DCM members directly and trade/clear at CDNA? If independent registration IS required, is it IB-only (CFTC IB + NFA) like the High Roller deal?"

Send the **identical** inquiry to **Kalshi partnerships** (Kalshi has the open API + is our incumbent). The answer — specifically whether the Plaee path avoids broker registration — determines whether the regulated-wrapper pivot is fast/cheap enough to TEST. **Do NOT build any hedge on CDNA; for any market-implied weather/energy signal or lay-off, use Kalshi's API.**

---

## Sources
- [How to trade event contracts — Crypto.com US](https://crypto.com/us/prediction/learn/how-to-trade-event-contracts) · [Crypto.com Predict](https://crypto.com/en/prediction/)
- [Crypto.com launches OG prediction market (Feb 2026, PRNewswire)](https://www.prnewswire.com/news-releases/cryptocom-launches-og--a-new-prediction-market-experience-302677076.html) · [Crypto.com OG launch (company news)](https://crypto.com/en/company-news/cryptocom-launches-og-a-new-prediction-market-experience)
- [Weather prediction markets 2026 — Kalshi leads, CDNA/Underdog listed (BettingUSA)](https://www.bettingusa.com/prediction-markets/weather/) · [Climate/weather event contracts (Robinhood Learn)](https://robinhood.com/us/en/learn/articles/trading-climate-weather-event-contracts/)
- [High Roller (ROLR) → CDNA Definitive Agreement, CFTC IB connecting to FCM (StockTitan)](https://www.stocktitan.net/news/ROLR/high-roller-technologies-executes-definitive-agreement-with-crypto-h6bkl154kcc6.html) · [High Roller stock soars on CDNA deal (CoinDesk, Apr 2026)](https://www.coindesk.com/markets/2026/04/14/high-roller-stock-more-than-doubles-on-prediction-markets-partnership-with-crypto-com)
- [DraftKings expands prediction markets via CDNA (GlobeNewswire, Feb 2026)](https://www.globenewswire.com/news-release/2026/02/06/3234063/0/en/DraftKings-Expands-Prediction-Markets-Catalog-in-Deal-With-Crypto-com.html)
- [Plaee partners with Crypto.com — API-first CFTC-compliant infra, customers become DCM members](https://crypto.com/en/company-news/plaee-partners-with-cryptocom-to-launch-cftc-compliant-prediction-market-technology-infrastructure-in-the-us)
- [Crypto.com full-stack CFTC licenses (DCM/DCO/FCM)](https://crypto.com/us/company-news/cryptocom-becomes-first-major-crypto-platform-to-obtain-a-full-stack-of-cftc-derivatives-licenses)
- [Crypto.com Exchange FIX API (GEN 3.0) — crypto only](https://crypto.com/en/product-news/fixapi) · [Crypto.com Derivatives API docs — spot/margin/perps/futures, no event contracts](https://exchange-docs.crypto.com/derivatives/index.html)
- [Crypto.com sports event trading (Help Center)](https://help.crypto.com/en/articles/10208780-sports-event-trading)
