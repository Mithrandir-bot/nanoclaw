# Hedgerow — Model Review & Pivot (2026-06-02)

Inputs: 100-case backtest (`backtest-100-cases.md`), pricing engine (`/api/underwrite`), hedging-venue research (`hedging-venues.md`), FL regulation (`florida-regulation.md`), and a brutal Gemini critique (google/gemini-3-flash-preview).

## Verdict
As a **balance-sheet self-insurer, the model is structurally broken** — but pivotable. The backtest gives a **17.5% probability of a losing year** (insurers need <1–2%), worst-case −$98.7k on $104k of fees, while the hedged-sports book locks only **$4,318 total (~$123/deal)** — uneconomic after CAC + ops.

## The holes (backtest + Gemini)
1. **Ruin risk.** 17.5% PoR is insolvency-grade. "Reserve the full payout" is accounting, not protection against a losing streak. Needs **aggregate stop-loss reinsurance** + **VaR-based pricing**, not a flat 20% load.
2. **Correlation kills the independence assumption.** A heatwave hits NYC+DC+Philly together; 5 Tampa bars all hedge the same Bucs game → one giant correlated liability, not many independent small ones. Needs **per-climate-zone / per-bracket exposure caps**.
3. **Adverse selection.** The SMBs who buy "95°F refund" are the ones staring at a heatwave in the 10-day forecast; we'd price off lagging NWS normals. Counterparties have boots-on-the-ground edge.
4. **Hedged margin → zero.** Prediction markets are efficient; the market-maker spread on small sports deals doesn't cover Stripe + KYC + sales time. Manual $500-premium deals lose money.
5. **Demand-side natural hedge (the killer for the bar beachhead).** A bar that offers "free wings if the Bucs win" is *busy and flush* when they win — free wings are just COGS they can absorb. They have a natural hedge and little reason to pay a 25–40% fee. **This contradicts the earlier GTM beachhead (Tampa sports bars).**
6. **Regulatory.** "Marketing fee" relabeling doesn't change that indemnifying a fortuitous event = insurance. Unauthorized insurer = FL felony.

## The pivot (3 changes that save it)
1. **Stop being the House — become an MGA / tech layer.** Provide the pricing engine + oracle settlement + distribution; an **E&S fronting carrier + reinsurer bears the risk**; Hedgerow earns commission. This *also* resolves the regulatory felony risk (the carrier/MGA path FL research already prescribed). Lose the risk upside, keep the business (and stay out of prison).
2. **Re-target: high-ticket, low-margin businesses, not bars.** "Refund if it snows on your $5,000 sofa" (furniture, car dealers, jewelry, HVAC, travel) — buyers who genuinely *cannot* self-absorb the payout and have no natural hedge. Drop/deprioritize bars and pure sports (efficient markets, natural hedge, tiny tickets).
3. **Parametric-weather focus + reinsurer offload.** Use proprietary/granular weather pricing (better than coarse CME futures), bundle the book, and lay it off to a **parametric reinsurer (CelsiusPro / Descartes / Arbol)**. De-emphasize sports.

## Distribution / unit economics
Manual small-deal brokering is a sub-minimum-wage lifestyle business. Viable path = **API / white-label** into POS (Toast, Square) and marketing agencies; and **season-long bundles** instead of one-off promos to grow ticket size and smooth variance.

## Net
The engineering (pricing engine, oracle, settlement loop) is sound and reusable — but it should power an **MGA/technology business fronted by a licensed carrier**, targeting **high-ticket low-margin merchants** with **parametric weather** risk laid off to a reinsurer. Not a balance-sheet bet on bar promos.
