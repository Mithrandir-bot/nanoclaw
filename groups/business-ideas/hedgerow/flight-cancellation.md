# Hedgerow — Parametric Flight-Cancellation / Delay Payout

**Evaluated:** 2026-06-02
**Idea:** Traveler (or travel business) pays a small flat fee; if their specific flight is cancelled (or delayed beyond X hours), they get an automatic, instant payout. No claims, no paperwork. Settlement and pricing driven by reliable flight-status databases.

**Verdict (short):** **Viable-with-structure — but only as a B2B2C white-label, not as a standalone D2C product.** The data/oracle layer is excellent; the regulatory and tail-correlation problems are the killers, and they are exactly what sank or constrained every predecessor. This is a *worse* standalone business than the SMB event-promo wedge for an unlicensed bootstrapper, and a *better* one only if you can secure carrier capacity and reinsurance.

---

## 1) DATA / ORACLE

This is the strongest part of the thesis. Flight status is one of the most objective, auditable parametric triggers that exists — far cleaner than weather, far cleaner than crop yield. "Was flight UA328 on 2026-06-02 cancelled?" is a near-binary, publicly attestable fact.

### Settlement-grade data sources (the oracle)

| Source | What it is | Cost / API | Settlement fit |
|---|---|---|---|
| **FlightAware AeroAPI v3** | Real-time status, cancellations, diversions, alerts | Free for personal/academic; **$100/mo** business tier (status, alerts on departures/arrivals/cancellations/diversions); **$1,000/mo** premium (predicted gate/landing times). Usage-metered per query, billed per page of ~15 records. | Strong. Industry standard, alert-driven, good for automated triggers. |
| **Cirium (FlightStats / Flex / Sky API)** | Flight status, schedules, delay index, ratings, historical | Enterprise contract (quote-based, not self-serve). Recently unified into "Cirium Sky API." | **Best-in-class for insurance settlement** — Cirium is the data layer that most regulated parametric flight products actually settle on. Audit trail and SLA-grade. |
| **OAG** | Schedules, live status, historical | Enterprise contract | Strong; more schedule-centric. Often used alongside Cirium. |
| **FlightStats** | Now part of Cirium | See Cirium | Legacy brand; same lineage. |
| **aviationstack (apilayer)** | Real-time + historical status | Free 100 calls/mo; **$49.99/mo** (10k calls); **$499.99/mo** (250k). 30–60s latency. | Cheap, fine for an MVP / demo. **Not** authoritative enough to settle real money against without dispute risk. |
| **AviationEdge** | Real-time + static aviation data | Tiered, mid-market | Similar tier to aviationstack — MVP-grade, not settlement-grade. |
| **FAA (ASPM / ASQP feeds)** | Operational data, airport-level ops | Public | Useful corroboration; not a per-passenger settlement feed. |

**Pricing base-rate source (the actuarial table):** **US DOT Bureau of Transportation Statistics (BTS) TranStats / Airline Service Quality Performance (ASQP / "On-Time Performance")**. This is the gold mine and it is **free**. It provides, by carrier × route × airport × month, the count of: scheduled ops, cancellations broken out by cause (Carrier / Weather / NAS / Security), delays, and delay minutes. A DOT OIG report (Oct 2024) found BTS verifies the accuracy of this data — so it is auditable and credible as a pricing basis. This is the direct analog to the weather-climatology model: you can build empirical cancellation/delay probabilities per (carrier, origin, dest, season, day-of-week) from decades of history. Caveat: ASQP publishes ~60 days in arrears, so it's a *base-rate* tool, not a real-time signal.

**Conclusion on oracle:** Objective and auditable — yes. The clean split is: **Cirium (or AeroAPI) for settlement**, **BTS for pricing base rates**. This layer is not the problem. A dual-source design (settle on Cirium, cross-check FlightAware) further hardens against disputes.

---

## 2) PRECEDENTS — what actually happened

This product has been tried repeatedly. The pattern is highly instructive: **the technology always works; the economics and distribution usually don't, except in B2B2C.**

- **AXA "Fizzy" (2017–2020, France).** Ethereum smart-contract flight-delay product. Auto-paid if a flight was delayed ≥2 hours, no claim needed. **Outcome: killed.** In its first year it sold ~11,000 contracts and paid out only ~100 customers. AXA cited "low market appetite and inadequate distribution." The tech was a success ("test and learn," learned blockchain ops); the **standalone D2C demand and distribution were a failure.** This is the single most important precedent: a global insurer with brand and capital could not make standalone parametric flight cover sell.

- **Etherisc FlightDelay (2017–present, on-chain).** Decentralized flight-delay cover, Chainlink oracles, Gnosis Chain, USDC payouts, ≥45-min trigger. Sold ~100+ policies at blockchain conferences early; still alive as a crypto-native demonstrator. **Outcome: persists as a proof-of-concept / niche, never reached meaningful scale.** Validates the oracle/automation model; does not validate a mass market.

- **Blink Parametric (Ireland; CPP Group; Lloyd's Lab alum).** **The success case — and it is pure B2B2C white-label.** Blink explicitly does **not** sell to consumers under its own brand; it powers insurers, OTAs, banks and card programs (e.g., Cover-More Europe, DOA Underwriting). Integrates airline/airport/baggage feeds, auto-notifies the traveler, offers lounge access *or* cash payout, average resolution <4 minutes. **Outcome: live, expanding, signing partnerships through 2026.** The lesson: the winning shape is a SaaS/embedded layer attached to an existing policy and an existing distribution channel.

- **Koala (France, 2018–).** Modular travel-insurance products embedded at booking by travel agencies/OTAs; parametric flight disruption + "cancel for any reason" (Koala Flex). Revenue as broker/MGA commission plus design fees. Raised ~$4M total. **Outcome: acquired by CarTrawler (Aug 2025)** — i.e., absorbed into a travel-distribution platform, again confirming embedded-at-booking B2B2C is where this lives.

**Synthesis of precedents:**
- **What works:** parametric automation, instant payout, the oracle, embedded distribution, B2B2C white-label, bundling delay benefit *into* an existing trip policy.
- **What fails:** standalone consumer brand selling a single-peril flight-cancellation policy cold. Demand is low, CAC is high, and the premium is tiny. AXA proved a giant can't force it; the survivors all chose embedding over going direct.

---

## 3) PRICING & RISK

### Can it be priced like the weather-climatology model?
**Yes — the base rate is even cleaner than weather.** BTS ASQP gives empirical cancellation probabilities per carrier/route/airport/season. You can set a fair premium = (expected payout × P[cancellation]) + load + expense + risk margin. Flight cancellation is more attractive than delay because: cancellation is binary (no delay-threshold basis-risk arguments), the data is government-audited, and moral hazard is essentially **zero** (the traveler cannot cause a cancellation). So far, so good.

The problem is **not the mean. It's the variance and the selection.**

### (a) CORRELATION / catastrophe — the dominant risk
Flight cancellations are **massively correlated**, not independent. A single nor'easter, hurricane, ATC system outage, or operational meltdown cancels *thousands of flights simultaneously*, all of which would trigger payouts on the same day. Hard evidence from the last year:
- **Jan 2026 winter storm** disrupted thousands of US flights at once.
- **Nov 2025 FAA government-shutdown order** mandated up to 10% (~4,400/day) flight reductions across 40 airports; >2,200 cancellations and >7,200 delays in a single weekend, sustained for over a week.

For a parametric book, this is the cat tail: your loss is not Poisson-smooth, it spikes to the entire book paying out in a 48-hour window. This is *the* reason naive pricing off the mean base rate bankrupts you. You must price and capitalize for the 1-in-X storm/meltdown that hits a concentrated slice of your portfolio (e.g., everyone flying through ORD/EWR in winter).

**Diversification / capping levers:**
- **Geographic & temporal diversification** of the book (don't be all-Northeast-winter).
- **Per-event aggregate caps / sub-limits** ("we pay up to $N in aggregate per named storm/declared event") — standard parametric design.
- **Exclude or separately price known systemic perils** (declared ground stops, government shutdowns) if they're correlated and game-able.

### Is there a hedge market, or is it pure self-insure?
There is **no liquid traded hedge for "flights cancelled"** the way there is for weather (weather derivatives / CME) or for nat-cat (ILS, cat bonds, ILWs). So you cannot cleanly delta-hedge the tail in a financial market. Your realistic options are:
1. **Reinsurance / fronting-carrier structure** (see §4) — a reinsurer takes the correlated tail above an attachment point. This is the standard parametric-MGA playbook (e.g., MGA + fronting carrier + reinsurer, as Sola/Spinnaker/Beazley did for tornado). Reinsurers *do* understand correlated weather-driven tails and will price them.
2. **Indirect weather hedge** — since a large share of cancellations are weather-caused (BTS even buckets "Weather" vs "NAS" vs "Carrier"), the *weather-attributable* portion could be partially offset with weather derivatives. But basis risk is high (ATC/carrier meltdowns aren't weather), so this is a partial mitigant, not a clean hedge.
3. **Self-insure the tail** — only viable with a large, well-capitalized, diversified balance sheet. Not a startup posture.

**Bottom line:** the tail is reinsurable but not market-hedgeable. That forces you into a carrier/reinsurer structure, which forces you into being a regulated insurance entity (or an MGA for one). That single fact reshapes the whole business.

### (b) ADVERSE SELECTION — serious and structural
This is the second killer and it interacts with (a). Travelers (and OTAs acting for them) will rationally **buy cover precisely when disruption is already forecast** — the nor'easter is named, the shutdown is announced, the airline has pre-emptively waived change fees. Indemnity travel insurance handles this with the "known event" exclusion: once a peril is publicly foreseeable, new policies don't cover it. A parametric product that pays *automatically* on a public trigger is **maximally exposed to this** unless you build equivalent guardrails:
- **Sell-cutoff windows** (no purchase within e.g. 72h of departure, or freeze sales for a route once a disruption is forecast/declared).
- **Dynamic pricing** tied to live forecast/ops risk (raises premium as risk rises — but this erodes the "small flat fee" simplicity that is the product's whole pitch).
- **Embed at booking only** (B2B2C), so cover is purchased weeks ahead at the time of ticketing, structurally before most disruptions are known. *This is another reason the B2B2C/embedded model wins* — it neutralizes anti-selection that destroys the D2C model.

### (c) MORAL HAZARD — minimal, correctly assessed
The traveler genuinely cannot cause a cancellation. The only residual is *fraud/identity* (buying cover on a flight you were never on, or claiming a different flight) — solved by binding the policy to a verified PNR/ticket and settling against the oracle for *that specific* flight number/date. Low concern.

---

## 4) REGULATION — this is consumer insurance, full stop

**When a traveler buys cover for their own trip and receives a cash payout contingent on an event, that is insurance.** It is a risk-transfer contract with an indemnity-like payout. The "it's just a marketing tool / sales promotion" framing — which can work for an *SMB giving away* a promo to *its own customers* (a no-cost contingent prize, arguably a sweepstakes/promotion) — **does not survive** when the end consumer *pays a premium to cover their own loss*. That is textbook regulated insurance.

Implications in the US:
- **It's a regulated travel-insurance line.** You need either an **admitted** carrier filing the product/rates with each state DOI, or placement via **surplus lines** (non-admitted carrier through a licensed surplus-lines broker; insured's home state regulates/taxes per the 2010 NRRA). Parametric products *have* been approved in all 50 states + DC, but DOIs remain skeptical of parametric and filings are state-by-state and slow.
- **Producer licensing:** selling travel insurance generally requires a **limited-lines travel insurance license** (and the entity needs the right producer/MGA licensing).
- **You are almost certainly not going to be the risk-bearer yourself initially.** The realistic path is **MGA + fronting carrier + reinsurer**: you build the tech/oracle/pricing and distribution; a licensed (often admitted) **fronting carrier** issues the policies; a **reinsurer** takes the correlated tail. This is the standard insurtech structure and it directly solves the §3 tail problem too.

**B2C vs B2B regulatory difference:**
- **B2C (you sell directly to travelers):** maximum regulatory load — you face DOI filings, consumer-protection scrutiny, licensing in every state you operate, plus the worst anti-selection and the highest CAC. This is the AXA-Fizzy trap.
- **B2B / white-label to OTAs, travel agencies, corporate travel:** **materially better.** You are a SaaS/MGA layer; your *partner* (or the underlying carrier) often already holds travel-insurance distribution rights and consumer relationships. Cover is embedded at booking (kills anti-selection), distribution is solved (kills the Fizzy failure mode), and your regulatory surface is the MGA/SaaS layer, not 51 consumer DOI relationships. Every survivor (Blink, Koala) chose this. **The regulation does not disappear — it sits with the carrier/partner — but your exposure and burden are far lighter.**

---

## 5) FIT vs the SMB event-promo wedge

These are **fundamentally different businesses** and should not be conflated.

| Dimension | SMB event-promo product | Hedgerow flight-cancellation |
|---|---|---|
| **Customer** | Small business (B2B), buying a *marketing giveaway* for its own customers | Either a traveler (B2C) or a travel distributor (B2B2C) |
| **Is it insurance?** | Arguably **no** — a business pre-funding a contingent customer promo / sweepstakes-style refund can often be structured as a marketing/promotion, not regulated insurance | **Yes** — regulated travel insurance the moment the traveler pays to cover their own trip |
| **Regulatory load** | Light if framed as promotion; the "marketing tool" framing genuinely can survive | Heavy; the "marketing tool" framing collapses |
| **Anti-selection** | Lower — the SMB buys the promo program ahead of time, not event-by-event | High in D2C; only solved by embedding at booking |
| **Correlation tail** | Depends on peril; can be designed around | Severe, structural (storms/ATC) — needs reinsurance |
| **Distribution** | Sell to SMBs directly; clear GTM, you own the relationship | D2C distribution is the proven graveyard (Fizzy); must partner with OTAs/carriers |
| **Capital structure** | Can potentially run without a fronting carrier if it's a promo, not insurance | Needs MGA + fronting carrier + reinsurer |

**Assessment:** For an unlicensed, bootstrapped operator, the **SMB event-promo wedge is the better standalone business**: lighter regulation (the promo framing actually holds), self-owned distribution, and a tail you can design around. Hedgerow is a *bigger* market but a *heavier* business — it demands insurance licensing/partnerships, carrier capacity, and reinsurance from day one. They share almost no GTM. Hedgerow is not a natural "expansion" of the SMB-promo product; it's a separate company with a separate risk and compliance stack.

---

## 6) VERDICT

**Viable-with-structure.** The idea is real, the oracle is excellent, the base-rate data is free and audited, and there is a *proven* winning shape in the market (Blink, Koala). But the standalone-D2C version is a well-documented failure (AXA Fizzy), and the two structural risks — **catastrophic correlation** and **adverse selection** — are not edge cases; they are the core of the product.

- **Single biggest risk: CORRELATED CATASTROPHE / TAIL.** One storm, ATC outage, or shutdown triggers the entire book at once, and there is **no liquid hedge market** to lay it off — only reinsurance. Mis-capitalizing this tail is how you go bankrupt in a single bad week (cf. Jan 2026 storm, Nov 2025 FAA shutdown). Everything else (oracle, base-rate pricing, moral hazard) is solved; this is not.

- **Cleanest path to execute if pursued:**
  1. **Build as a B2B2C white-label MGA/SaaS, never D2C.** Sell the engine to OTAs, travel agencies, corporate-travel platforms, and card programs. This kills the Fizzy distribution failure and structurally defeats anti-selection by embedding cover at time of booking.
  2. **Stand up the standard insurtech stack: MGA + fronting carrier + reinsurer.** You own tech/oracle/pricing/distribution; a fronting carrier issues policies (admitted or surplus lines); a reinsurer absorbs the correlated tail above an attachment point. This solves both the regulatory and the catastrophe problem in one move.
  3. **Settle on Cirium (cross-checked by FlightAware AeroAPI); price off BTS ASQP.** Dual-source settlement to defuse disputes.
  4. **Design correlation defenses in from day one:** per-event aggregate caps/sub-limits, route/season diversification targets, sales cutoffs near departure, and exclusions/dynamic pricing for declared systemic perils.
  5. **Scope to cancellation (binary) over delay (threshold)** for v1 — cleaner trigger, no basis-risk debate, zero moral hazard.

For the operator's current portfolio: **if forced to choose one, build the SMB event-promo wedge first** (lighter regulation, owned distribution, designable tail). Treat Hedgerow as a separate, later, capital- and partnership-intensive venture — pursue it only with a carrier/reinsurer relationship in hand, and only as embedded B2B2C.

---

## Sources

- [AXA withdraws blockchain flight delay compensation experiment — Ledger Insights](https://www.ledgerinsights.com/axa-blockchain-flight-delay-compensation/)
- [AXA Scraps Fizzy Insurance Smart Contract — Artificial Lawyer](https://www.artificiallawyer.com/2020/10/08/axa-scraps-fizzy-insurance-smart-contract-but-still-interested-in-the-tech/)
- [Blockchain: Axa stops Fizzy — Atlas Magazine](https://www.atlas-mag.net/en/article/blockchain-axa-stops-fizzy)
- [Etherisc Launches Decentralized Flight Insurance Using Chainlink — Medium](https://medium.com/@etherisc/etherisc-launches-decentralized-flight-insurance-product-using-chainlink-data-feeds-a5e9ac5e0476)
- [Etherisc's FlightDelay Transforms Flight Insurance With Chainlink Oracles — Chainlink Today](https://chainlinktoday.com/etheriscs-flightdelay-transforms-flight-insurance-with-chainlink-oracles/)
- [Blink Parametric — Lloyd's Lab](https://www.lloyds.com/news-and-insights/lloyds-lab/insurtech/lloyds-lab-accelerator/alumni/blink-parametric)
- [Blink Flight Disruption — Blink Parametric](https://blinkparametric.com/blink-parametric-platform/blink-flight-disruption/)
- [Cover-More Europe Launches First Parametric Flight Delay Benefit, Powered by Blink — Blink Parametric](https://blinkparametric.com/cover-more-europe-launches-first-parametric-flight-delay-benefit-powered-by-blink-parametric/)
- [DOA Underwriting and Blink Parametric Team Up on Flight Delay Cover — Insurance Edge](https://insurance-edge.net/2026/02/10/doa-underwriting-and-blink-parametric-team-up-on-flight-delay-cover/)
- [Travel Insurtech Koala Raises US$2.1 Million — Insurtech Insights](https://www.insurtechinsights.com/travel-insurtech-koala-raises-us2-1-million-in-latest-funding-round/)
- [Koala — Crunchbase Profile & Funding](https://www.crunchbase.com/organization/leo-341b)
- [AeroAPI v3 Pricing — FlightAware](https://www.flightaware.com/commercial/aeroapi/v3/pricing.rvt)
- [AeroAPI — Flight status & tracking data API — FlightAware](https://www.flightaware.com/commercial/aeroapi)
- [Cirium vs OAG vs FlightAPI — flightapi.io](https://www.flightapi.io/blog/cirium-vs-oag-vs-flightapi/)
- [FlightStats APIs — Flight status — Cirium Developer](https://developer.cirium.com/apis/flightstats-apis/flight-status)
- [aviationstack Pricing](https://aviationstack.com/pricing)
- [Affordable Flight API — Top 10 Options — AeroDataBox](https://aerodatabox.com/flight-api-2024/)
- [Airline On-Time Statistics — BTS TranStats](https://www.transtats.bts.gov/ontime/)
- [Airline Service Quality Performance 234 (On-Time data) — BTS](https://www.bts.gov/browse-statistical-products-and-data/bts-publications/airline-service-quality-performance-234-time)
- [DOT OIG: BTS Verifies Accuracy of Flight Delay and Cancellation Data](https://www.oig.dot.gov/library-item/46490)
- [What You Should Know About Parametric Insurance — Perr&Knight](https://www.perrknight.com/parametric-insurance/)
- [Limited Lines Travel Insurance Agent License — California DOI](https://www.insurance.ca.gov/0200-industry/0050-renew-license/0200-requirements/Ltd-Lines-TA-Ins-Agt.cfm)
- [6 Variations On Producer Licensing For Travel Lines — AgentSync](https://agentsync.io/blog/compliance/6-variations-on-producer-licensing-for-travel-lines)
- [Surplus Lines Insurance — What Is Its Purpose — FORC](https://forc.org/Public/Public/Journals/2023/Articles/Fall/Vol34Ed3Article3.aspx)
- [Expectiles as basis risk-optimal payment schemes in parametric insurance — arXiv](https://arxiv.org/pdf/2505.02607)
- [Parametric Insurance in Travel: Game Changer or Passing Fad? — AltexSoft](https://www.altexsoft.com/blog/parametric-insurance-travel/)
- [FAA's order to cut flights due to government shutdown — NPR](https://www.npr.org/2025/11/07/nx-s1-5601586/flight-cuts-government-shutdown)
- [FAA ends emergency order mandating flight reductions — CNN](https://www.cnn.com/2025/11/16/us/faa-ends-shutdown-flight-cuts)
- [As FAA order triggers flight cancellations, what to know about credit card travel insurance — CNBC](https://www.cnbc.com/2025/11/07/faa-flight-cancellations-credit-card-travel-insurance.html)
- [Will travel insurance cover my flights during a storm? — CNBC Select](https://www.cnbc.com/select/will-travel-insurance-cover-flights-during-storm/)
- [Consolidation in the parametric insurance market — InsTech](https://www.instech.co/knowledge-centre/consolidation-in-the-parametric-insurance-market-the-parametric-post-issue-56/)
- [North America MGA Market Fronting Carrier Counterparties — Gallagher Re](https://www.ajg.com/gallagherre/-/media/files/gallagher/gallagherre/2024/north-america-mga-market-fronting-carrier-counterparties-2023.pdf)
