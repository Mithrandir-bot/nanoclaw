# Hedgerow — What makes an event usable? (and: weather scope, court/property ideas)

## Weather scope: BROAD, not a whitelist
We do NOT need to pin weather to a hand-picked city list. Both layers are US-wide/global and keyless:
- **Settlement:** NWS `api.weather.gov` resolves any US lat/lon → the official observation station (e.g., Denver → KBKF).
- **Pricing:** Open-Meteo climatology + geocoding works for any city globally.
The system now geocodes any city name → coordinates → (official station for settlement, 12-yr climatology for pricing). The only thing "pinned" is the **official settlement station**, auto-resolved, so settlement is unambiguous. Caveat: pitch at **city/metro granularity** — for a tiny rural spot the nearest station may be miles away (basis risk), and "rain at my exact address" has basis risk. City-level = clean.

## The real test: a verifiable oracle is NECESSARY but NOT SUFFICIENT
For an event to be a sound product (not gambling, not a money-loser), it must pass ALL four:
1. **Insurable interest** — the buyer has genuine financial exposure to the event (not a pure wager).
2. **Non-influenceable / no moral hazard** — the buyer can't cause or sway the outcome.
3. **Clean, timely, programmatic settlement** — unambiguous, fast, API-accessible, tamper-proof.
4. **Hedgeable or diversifiable + bounded** — a market to lay it off, or diversifiable base-rate risk without a correlated, unbounded tail.

Events that pass: weather (NWS), sports (official result + Polymarket/Kalshi), economic indices (EIA/BTS/Case-Shiller), flight status (DOT/Cirium). 

## Court case outcomes — VERDICT: AVOID
- **Oracle:** messy. PACER/CourtListener are federal; county clerk records are mostly per-portal scraping (no uniform API), and outcomes are delayed/appealable/sealable → ambiguous. Fails "clean/timely/programmatic."
- **Insurable interest / moral hazard:** a *party* to the case has interest but **controls the litigation** (moral hazard) and triggers champerty/litigation-funding rules; a *non-party* has **no insurable interest → it's pure gambling on someone's lawsuit** (illegal gaming in most contexts). Fails both.
- **Hedgeable:** no market, idiosyncratic, not soundly diversifiable.
- **Legal reality:** the only lawful adjacent thing is **third-party litigation funding** (a $13B but regulated/party-involved business) — not a parametric "promo." 
- **Bottom line:** it's gambling on litigation or regulated litigation finance — not insurable parametric risk, and the worst oracle we've evaluated.

## Property-value (per property-appraiser) — VERDICT: marginal; only the INDEX version is viable
- **Oracle problem:** county property-appraiser **assessed** values are public but **annual, lagging, and ≠ market value**, on heterogeneous per-county portals. Wrong instrument + fails "timely/clean." Real-time market value isn't officially published.
- **Direction:** "hedge if price went UP" is backwards — upside isn't a loss to insure. The legitimate product is **downside protection** (home value falling), where owners have real insurable interest. (This is the old "home equity insurance" idea — academically real, but historically plagued by **adverse selection**: owners know their local market better than the insurer.)
- **Hedgeable:** only the **S&P/Case-Shiller home-price INDEX** is tradable (CME futures, thin) — and that's **regional, not per-property**, so individual homes carry large basis risk. Per-property is unhedgeable.
- **Bottom line:** a real concept, but it's an **index-based financial/insurance product** (Case-Shiller), not a clerk-of-courts/appraiser promo. Different (regulated) business; the appraiser data is the wrong oracle.

## Takeaway
Keep choosing events that are **exogenous, non-influenceable, base-rate/market-priceable, and cleanly+programmatically settleable.** Public records are great oracles *only* when the underlying risk also passes the insurable-interest, moral-hazard, and hedgeability tests. Court outcomes and per-property values don't.
