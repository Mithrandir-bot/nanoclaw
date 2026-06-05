# Hedgerow — Nadex / CDNA (Crypto.com Derivatives North America) Evaluation

**Date:** 2026-06-02
**Question:** Is Nadex (https://www.nadex.com/) a useful *deeper product wrapper* and/or *hedging venue* for Hedgerow?

---

## TL;DR VERDICT

**PARTIAL — and the "Nadex" you'd evaluate no longer exists as a standalone retail exchange.**

- **As a HEDGE venue: SKIP.** No public API (discontinued ~2023, never restored after the migration), so it cannot be a programmatic lay-off venue. Kalshi already does everything Nadex/CDNA could hedge for us — fuel/commodities, econ events, weather, sports — *with* a mature free API. There is no hedge Nadex can do that Kalshi can't do better.
- **As a regulatory PRODUCT WRAPPER: PARTIAL / WATCH — this is the only genuinely interesting angle.** The regulated successor entity, **CDNA**, holds a *full stack of CFTC licenses (DCM + DCO + FCM)* and already distributes its CFTC-regulated event contracts **through third-party intermediaries (DraftKings Predictions)** in a B2B2C model. That intermediary-distribution structure is a real, proven template for legitimizing an event-contract product — but it converts Hedgerow from an "insurer" into a *referrer/intermediary of someone else's regulated contracts*, which is a different business than parametric coverage.

**Single most useful next step:** Email/contact CDNA (Crypto.com Derivatives North America) partnerships to ask the one question that decides everything: *"Can a third party become an introducing intermediary that surfaces CFTC-regulated event contracts (incl. self-certified weather/commodity/econ contracts) to its own SMB customers, the way DraftKings Predictions does?"* Ask Kalshi the identical question in parallel — Kalshi has the API and the same DCM status, so if either says yes, Kalshi is the better counterparty.

---

## CRITICAL FACT FIRST: "Nadex" is effectively retired

- **Nadex.com trading was fully disabled on December 20, 2025.** It stopped new accounts immediately, suspended deposits Dec 6, and forced all open positions closed by Dec 20, 2025.
- Products migrated into the **Crypto.com app**, operated by **CDNA — Crypto.com | Derivatives North America**, the CFTC-registered entity that was *already* the regulated venue behind Nadex's contracts.
- Crypto.com acquired Nadex (and the Small Exchange) from IG Group, closing in 2022. So "Nadex" today = a brand/legacy product set absorbed into Crypto.com's regulated derivatives stack.
- **Any evaluation of "Nadex as a partner" is really an evaluation of CDNA / Crypto.com.** Don't architect against nadex.com — it's gone.

---

## 1. Catalog, mechanics, expiries, fees, minimums (legacy Nadex / now CDNA)

**Underlyings / markets:**
- **Forex:** ~11 major pairs (EUR/USD, GBP/USD, USD/JPY, USD/CHF, etc.).
- **Stock indices:** US 500 (S&P), Wall Street (Dow), US Tech 100 (Nasdaq), FTSE 100, DAX, China 50, Japan 225.
- **Commodities:** Crude Oil, Natural Gas, Gold, Silver (based on the underlying futures). **Yes — crude and nat gas are covered.**
- **Economic-data events:** Fed Funds rate, ECB rate, Nonfarm Payrolls, Unemployment Rate, weekly Initial Jobless Claims, and similar releases. (Historically *blocked* from listing US *election* contracts by a 2012 CFTC order; that's a separate, older fight.)
- **Weather:** **Yes** — legacy Nadex listed weather event contracts (codes seen: RAIN, TEMP, daily-high by city e.g. HIGHNY/HIGHCHI/HIGHMIA, TORNADO, HURCAT, TROPSTORM). So Nadex *did* do weather — contrary to our prior assumption. **BUT** these were thin and it is unclear how many survived the Dec-2025 migration; under CDNA the public emphasis is sports + crypto + econ.
- **Sports:** **Yes, and growing fast** — under Crypto.com/CDNA this is now the marquee category (NFL Super Bowl, playoffs, college bowls, March Madness; the "OG" sports-forward product launched Feb 2026 with winners/spreads/totals/props/parlays; NFL/NBA/NHL/soccer). Legacy Nadex itself did *not* do major-league sports; that's a Crypto.com-era addition.

**Contract mechanics:**
- **Binary options:** 0–100 payout. Settle at $100 if the condition is true, $0 if false. You buy at the offer (cost = max loss) and your max profit = 100 − cost.
- **Call spreads:** capped-floor instruments with a defined min/max — payoff scales linearly between a floor and ceiling.
- **Knock-Outs™:** leveraged contracts with built-in floor/ceiling that auto-close ("knock out") at the boundary; micro lot sizes.

**Expiries:** Intraday (5-min and 20-min for FX/indices, 2-hour), **daily**, and **weekly**. Very short-dated — designed for day-trading, not for the multi-week horizons a small-business promo usually spans.

**Fees / minimums:** $250 minimum initial deposit. Trading fee **$1 per side per contract** for direct members (capped per order); FCM-routed members ~$0.35/side. $1 settlement fee if exercised in-the-money. $10/mo inactivity after 12 months dormant; $25 wire withdrawal.

---

## 2. Regulatory status & ownership

- **CFTC-regulated:** Yes. The operating entity, **CDNA (Crypto.com | Derivatives North America)**, is a CFTC-registered **Designated Contract Market (DCM)** and **Derivatives Clearing Organization (DCO)**. As of late 2025/2026, Crypto.com became the **first major crypto platform to hold a full stack — DCM + DCO + FCM** (the FCM being affiliate **Foris DAX Markets LLC**, NFA-registered, able to intermediate CFTC products).
- **Ownership:** Crypto.com (via Foris DAX group, Chicago). Bought Nadex from IG Group in 2022. So **yes — it is Crypto.com-owned now.**
- **What the regulated status enables a partner:** Under **CFTC Reg 40.2**, a DCM can **self-certify new event contracts** without prior Commission approval (the CFTC even upgraded its portal to bundle multiple comparable contracts in one filing). So CDNA can spin up new commodity/econ/weather contracts quickly, and — crucially — can let **intermediaries distribute** them. This is the legal machinery that makes a "regulated wrapper" plausible *at all*.

---

## 3. Programmatic / API / partner access

- **Public API: effectively NO.** Nadex offered an API years ago but **discontinued it (~2023)** and never restored it; reviews through late 2025 describe it as retail-only with no official programmatic access. The migration to the Crypto.com app did not announce a developer API for event contracts. Third-party GitHub "Nadex API" clients are unofficial scrapers — not a basis for a production hedge.
- **B2C retail by default:** The whole product is framed as "institutional-style reliability to a *wider retail audience*" via the Crypto.com app. Users trade directly.
- **B2B2C intermediary path: YES — and this is the real story.** CDNA explicitly **offers trading/clearing of event contracts "including through intermediaries such as DraftKings Predictions."** DraftKings is a *distribution partner* surfacing CFTC-regulated contracts to its own customers, with CDNA doing the exchange + clearing behind the scenes (FCM = Foris DAX). So there IS a partner channel — it's an **intermediary/distributor model, not a self-serve white-label or a hedging API.**

---

## 4. FIT as a HEDGING venue — SKIP

What could Nadex/CDNA theoretically lay off for us?
- **Fuel (RBOB/crude/nat-gas) — the product we just GATED:** CDNA lists crude & nat-gas binaries. In principle that's a market-implied probability source for energy moves.
- **Econ-event promos (Fed/jobs/CPI):** CDNA lists rate + payrolls + jobless-claims events.
- **Sports / weather:** also nominally present, but redundant with Kalshi/Polymarket (sports) and our NWS+Open-Meteo+Arbol stack (weather).

**Why it still fails as a hedge venue:**
1. **No API.** A hedge venue must be programmatically queryable and order-routable. Nadex/CDNA has no public API. We cannot auto-pull implied probabilities or auto-place lay-off orders. This alone disqualifies it as a *systematic* hedge venue and as a fuel implied-vol source. **Kalshi gives us crude/nat-gas + econ markets WITH a free, mature REST API.** There is zero hedge Nadex can do that Kalshi can't do better and scriptably.
2. **Wrong tenor.** Contracts are 5-min to weekly. SMB promos run multi-week to multi-month. Severe maturity/basis mismatch for laying off a 30-day "fuel-price refund" promo.
3. **Thin energy/weather books.** Even on Kalshi these are shallow; on Nadex/CDNA they're thinner and now de-emphasized vs sports. Can't move size.
4. **Does it fix the gated fuel product?** Marginally and not cleanly. The fuel product was gated because it's *volatility-blind* — we lack a real options-implied vol/market. A Nadex crude binary's price *does* embed a market-implied probability, which is better than our static RBOB estimate. **But the same is true of Kalshi's energy contracts, which we can actually read via API.** If we want a market-implied fuel signal, get it from **Kalshi (or CME RBOB/crude options implied vol via IBKR)**, not from an API-less Nadex.

**Verdict (hedge):** **SKIP.** Strictly dominated by Kalshi for every overlapping use (fuel, econ, sports, weather), and unusable without an API.

---

## 5. FIT as a deeper PRODUCT / regulatory wrapper — PARTIAL / WATCH

This is the only reason not to fully skip. Hedgerow's core legal problem: as designed it looks like **unlicensed Florida insurance**. A CFTC-regulated *event contract* is a recognized non-insurance instrument, and **CFTC regulation federally preempts state insurance/gaming law** for listed contracts. So routing the contingent payoff through a DCM is a legitimate de-risking path *in principle*.

**The proven template (DraftKings → CDNA) shows it's real:** a consumer brand surfaces CFTC-regulated event contracts to *its own customers*, while CDNA is the exchange/clearer and Foris DAX is the FCM. Hedgerow could theoretically be such an intermediary: the SMB's "promo coverage" becomes a position in a CDNA (or Kalshi) event contract.

**But the caveats are model-breaking, not cosmetic:**
1. **It flips Hedgerow from "house/insurer" to "intermediary/referrer."** On a DCM, the *customer* holds the contract and the *exchange* is the counterparty (CCP-cleared). Hedgerow can't be the "house" pricing an edge — that's the exchange's order book. We'd earn intermediary/routing economics, not underwriting spread. That guts the current revenue model.
2. **Insurable-interest mismatch.** Our 4-test framework requires the *buyer* to have genuine financial exposure. A CFTC event contract has **no insurable-interest requirement** — anyone can trade it. That's *good* for legality (it's explicitly not insurance) but it means the SMB is *speculating/hedging on its own*, not buying a coverage product from us. The clean version is: "Hedgerow helps the SMB hedge its promo by buying a matching event contract on a DCM" — advisory/brokerage, not insurance.
3. **Contract availability gates it.** Self-certification (Reg 40.2) means CDNA *could* list bespoke contracts, but a DCM won't list a hyper-local "this town's festival" or "our diner's home team" contract — no liquidity, no economic purpose. So the wrapper only works for the *generic, liquid* perils (major sports, national econ, broad commodities/weather) — exactly the perils that DON'T need Hedgerow's local-niche edge. The events where Hedgerow is differentiated are precisely the ones no DCM will list.
4. **B2C structure / "can we even offer it?":** On the current model, **users trade directly** (retail) or via an *intermediary* (DraftKings-style). There is **no self-serve white-label**. To "offer" CDNA contracts we'd need a formal intermediary/IB arrangement (likely NFA registration or operating under Foris DAX as FCM) — material compliance cost, and it makes us a securities/derivatives intermediary, a regulated business in its own right.

**Verdict (wrapper):** **PARTIAL / WATCH.** The DCM-intermediary path is the most credible answer to our FL-insurance problem, but it (a) only legitimizes the *commoditized* perils, not our differentiated local ones, (b) converts us from underwriter to broker, and (c) carries its own NFA/FCM registration burden. **Kalshi is the better counterparty to explore for this same path** — same DCM status, plus a real API, and it's already our incumbent. Nadex/CDNA's only edge is the DraftKings precedent proving intermediary distribution is permitted.

---

## 4-Test Framework applied (to a Hedgerow-via-CDNA event contract)

| Test | Pass? | Note |
|------|-------|------|
| **1. Insurable interest** | ⚠️ N/A by design | CFTC contracts require *no* insurable interest. Good for "not insurance" legality, but means it's a hedge/speculation product, not coverage. |
| **2. Non-influenceable / no moral hazard** | ✅ | Same exogenous perils we already use (econ/commodity/weather/major sports). |
| **3. Clean, programmatic settlement** | ⚠️ | Exchange settles cleanly — but **no public API** to read/route. Settlement is clean; *access* is not programmatic. |
| **4. Hedgeable + bounded** | ⚠️ | Binary 0–100 is bounded; but tenors are 5-min–weekly (tenor mismatch) and energy/weather books are thin. Kalshi hedges the same set better. |

Net: as a hedge venue it fails test 3 (no API) and partly test 4 (tenor/liquidity). As a product wrapper it deliberately sidesteps test 1, which is the legality benefit but the business-model problem.

---

## Nadex/CDNA vs Kalshi (head to head)

| Dimension | Nadex / CDNA (Crypto.com) | Kalshi |
|---|---|---|
| Regulatory | CFTC DCM + DCO + FCM (full stack) | CFTC DCM |
| Public API | **None** (discontinued ~2023) | **Mature free REST API** |
| Fuel / commodity contracts | Crude, nat gas, gold, silver | Energy/econ present |
| Econ events | Fed, NFP, jobless claims | Broad econ |
| Weather | Historically yes (thin; post-migration unclear) | Yes (thin, ~0.2% volume) |
| Sports | Now major (Crypto.com era) | ~80% of volume |
| Tenor | 5-min to weekly (very short) | Through event horizon |
| B2B2C intermediary path | **Proven (DraftKings Predictions)** | Should ask — same DCM status |
| Hedge ergonomics | Poor (no API, short tenor, thin) | **Good (API, depth on majors)** |
| As Hedgerow counterparty | Only interesting for the wrapper precedent | Better: API + incumbent + same wrapper potential |

**Bottom line:** For **hedging**, Kalshi wins outright (Nadex = SKIP). For the **regulatory wrapper**, both are DCMs; Nadex/CDNA's *only* advantage is the live DraftKings intermediary precedent, but Kalshi is the better partner to pursue (API + existing relationship). Either way the wrapper changes Hedgerow from insurer to intermediary and only covers commoditized perils.

---

## Recommended actions

1. **Do NOT build any hedge or fuel-vol signal on Nadex/CDNA.** No API. For the gated fuel product, source market-implied vol/probability from **Kalshi energy contracts** and/or **CME RBOB/crude options implied vol via IBKR** — both readable and far more legitimate.
2. **Treat the DraftKings→CDNA model as the reference architecture** for the "is there a legal wrapper?" question — it proves a third party can distribute CFTC-regulated event contracts B2B2C.
3. **Single most useful next step:** Send the *same* one-paragraph inquiry to **CDNA partnerships** and **Kalshi partnerships**: "Can we become an introducing intermediary surfacing CFTC-regulated event contracts (incl. self-certified weather/commodity/econ) to our SMB customers, DraftKings-Predictions-style? What registration (NFA/IB/FCM) does that require?" The answer (esp. from Kalshi, which has the API) determines whether the regulated-wrapper pivot is viable — and that pivot, not Nadex hedging, is the only reason Nadex/CDNA is even on the board.

---

## Sources
- [Nadex platform retired / CDNA transition (FinanceFeeds)](https://financefeeds.com/nadex-retires-legacy-platform-as-services-transition-to-crypto-coms-cdna-infrastructure/) · [Nadex Notices (official)](https://www.nadex.com/notices/exchange/)
- [Crypto.com acquires Nadex from IG Group](https://crypto.com/en/company-news/crypto-com-agrees-to-acquire-nadex-and-the-small-exchange-from-ig-group) · [CFTC Nadex DCM filing](https://www.cftc.gov/IndustryOversight/IndustryFilings/TradingOrganizations/34536)
- [Crypto.com full stack CFTC licenses (DCM/DCO/FCM)](https://crypto.com/us/company-news/cryptocom-becomes-first-major-crypto-platform-to-obtain-a-full-stack-of-cftc-derivatives-licenses) · [Crypto.com margined derivatives licenses](https://crypto.com/us/company-news/cryptocom-obtains-cftc-margined-derivatives-licenses)
- [DraftKings expands via Crypto.com / CDNA intermediary (FX News Group)](https://fxnewsgroup.com/forex-news/retail-forex/draftkings-expands-prediction-markets-offering-via-crypto-com-including-player-specific-sports-event-contracts/) · [Crypto.com sports event trading (Help Center)](https://help.crypto.com/en/articles/10208780-sports-event-trading)
- [CFTC self-certification (Reg 40.2) bundling (CryptoBriefing)](https://cryptobriefing.com/cftc-electronic-filing-product-certifications/)
- [Nadex markets/contracts & fees review (daytrading.com)](https://www.daytrading.com/nadex) · [Nadex review 2026 (binaryoptions.net)](https://www.binaryoptions.net/nadex) · [Nadex commodities (Nadex learning)](https://net.nadex.com/learning/understanding-commodities-trading-with-binary-options/)
- [Nadex on MarketsWiki](https://marketswiki.com/wiki/North_American_Derivatives_Exchange_(Nadex)) · [Best prediction market platforms 2026 (LocalsInsider)](https://localsinsider.com/prediction-markets/best-prediction-market-apps-usa/)
