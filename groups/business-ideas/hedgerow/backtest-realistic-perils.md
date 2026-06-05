# Hedgerow — Realistic-Peril Backtest (rain & snow promos; flood/hurricane EXCLUDED)

100 promos: 64 rain (outdoor) + 36 snow (high-ticket retail, per pivot), across 17 cities / regions, 12 date-buckets.
Pricing: fee = hedge cost + 15% overround + 20% self-insure load. Settlement: NWS daily data (rain/snow are bounded, verifiable, diversifiable).
**Catastrophes (flood, hurricane) are deliberately NOT in the self-insure book** — they are correlated and unbounded; carrier/reinsurer only.

## Aggregate
- Fees $194,700 on $673,971 exposure | EV margin $50,487 (25.9% of fees)
- Avg fee % of exposure: 34%  (low because rain/snow promos are low-probability)

## Portfolio Monte Carlo (20,000 books), with a one-factor storm-correlation model
| Scenario | result |
|---|---|
| **Independent** (rho=0, naive) | mean $46,855 | p5 $-20,882 | p1 $-46,940 | worst $-111,739 | P(loss) 13.02% |
| **Realistic correlation** (rho=0.55 within region+week — storms hit clusters) | mean $47,859 | p5 $-26,020 | p1 $-61,053 | worst $-127,263 | P(loss) 13.89% |
| **+ Reinsurance stop-loss** (cap book loss at 50% of fees) | mean $47,799 | p5 $-26,079 | p1 $-61,053 | worst $-97,350 | P(loss) 13.88% |

## Read
- Diversifying across **7 regions and 12 dates** cuts the tail vs the earlier single-peril heat book, but **correlation still bites**: P(losing year) rises from 13.0% (naive) to 13.9% (realistic), worst-case $-127,263.
- A simple **aggregate stop-loss reinsurance** layer caps the worst case to $-97,350 and cuts P(loss) to 13.88% — i.e., the book is only sound when the tail is laid off.
- **Excluding flood/hurricane is essential** — those are correlated catastrophes that no diversification fixes; they must be carrier-backed.

## The de-risking lever: per-promo retention cap (cede the rest to a carrier)
Capping the exposure Hedgerow *self-retains* per promo (excess ceded to a fronting carrier/reinsurer; Hedgerow keeps commission on the ceded layer):

| Self-retained per promo | P(losing year) | Worst case |
|---|--:|--:|
| Uncapped | 13.9% | -$127k |
| <= $10k | 1.7% | -$43k |
| **<= $5k** | **0.0%** | +$5.9k |
| <= $2.5k | 0.0% | +$30k |

At ~$5k self-retention, the book did **not lose in 20,000 simulated years**, and mean P&L *rises* (variance collapses; commission earned on the ceded layer). This is the single biggest lever.

## Takeaway
Realistic rain/snow promos across diverse geographies are far more insurable than continental heat — but a thin-capital, fully self-insured book still loses ~14% of years under storm correlation. The fix is structural and decisive: (a) regional/date diversification, (b) **exclude catastrophes** (flood/hurricane — correlated & unbounded), and (c) **cap self-retention at ~$5k and cede the rest to a fronting carrier/reinsurer.** That drives ruin probability to ~0 while keeping healthy margin — exactly the **MGA + reinsurer model**, now quantitatively justified.
