# Hedgerow — Self-Insured House Rules (stay the house, odds always in your favor)

Goal: be the house, 100% self-insured (no carrier/reinsurer), with ruin made negligible and profit near-certain — through **pricing edge + bankroll-relative caps + volume**. Validated by Monte-Carlo simulation (`pricing-rules` sims, 20,000 seasons, storm-correlation copula).

## The three forces that make the house win
1. **Edge on every promo (the vig).** `fee = expected_payout × (1 + load)`, load ≈ 30% (overround). Positive expected margin on every deal, regardless of outcome.
2. **Caps so no single thing can hurt you (bound the tail).** Sized as a % of your committed bankroll B.
3. **Volume of small, diverse promos (law of large numbers).** This is what turns "positive edge" into "almost always profitable." Few big bets = high variance; many small uncorrelated bets = near-certain profit.

## The caps (all relative to bankroll B)
| Cap | Limit | Controls |
|---|---|---|
| Per-promo payout | **≤ 0.4–0.5% of B** | single-deal variance |
| Per-client total | **≤ 3% of B** | one customer's concentration |
| Per-cluster (region + week) | **≤ 6% of B** | one storm system hitting many promos at once |
| Per-peril national | **≤ 15–25% of B** | a broad cold-wave / rain regime |
| Catastrophes (flood, hurricane) | **0 — do not write** | correlated, unbounded; no cap fixes them |
Over a cap → **decline or partially cover** (coinsure up to the remaining room). Caps **scale with B**, so as profits compound you can write bigger.

## Proof (B = $250k, 20,000 simulated seasons)
| Book shape | promos | mean P&L | worst case | P(losing season) |
|---|--:|--:|--:|--:|
| Low volume, big tickets (1.5% cap) | 56 | $11k | −9.0% of B | 7.2% |
| Med volume (0.8% cap, 52 wks) | 74 | $14k | −2.4% | 1.1% |
| **High volume, small tickets (0.4% cap, 52 wks)** | 132 | $14k | **−0.7%** | **0.08%** |
Same edge, same bankroll — only the **caps + volume + diversification** differ. Small + many → ruin ≈ 0, profit ≈ certain.

## "Should bigger tickets be cheaper?" — No. The opposite.
Intuition says volume discount; the risk math says **big tickets are the house's enemy** (concentration + variance = the source of the rare losing season). So:
- **Concentration surcharge:** fee load *rises* with ticket size as covered payout approaches the per-promo cap — i.e., **bigger tickets cost MORE per dollar of payout**, which throttles concentration.
- The only thing that legitimately makes a bigger ticket *cheaper in %* is the **fixed-fee floor** ($25 min) amortizing on tiny tickets. So % fee is U-shaped: highest on tiny (floor) and on huge (surcharge); cheapest in the **mid-size sweet spot**.
- A big-ticket merchant (e.g., $40k furniture promo) is served by **coinsurance** — cover up to your per-promo cap, they self-retain the rest — or by growing B. Never by discounting the concentration.

## Operating implications
- Chase **many small promos** across many dates, regions, and both perils (rain + snow) — that's the engine of near-certain profit.
- Set B = the capital you'll actually commit; the caps auto-size from it.
- Keep the catastrophe exclusion absolute.
- Re-check cluster exposure before binding each promo (admission control against the live book), not just per-promo.
