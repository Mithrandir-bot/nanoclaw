# Hedgerow — 100-Case Backtest Study (seeded, reproducible)

Pricing engine: fee = hedge cost + exchange fee + 15% overround + (self-insured) 20% risk load; $25 floor; full-payout reserve when unhedged; $10k auto-quote cap.
Settlement: simulated by each event's true probability. Portfolio Monte Carlo = 20,000 simulated "books" of all 100 promos.

## Aggregate (100 promos)
- Total flat fees collected: **$104,215**  | total exposure underwritten: **$434,615**
- Hedgeable (sports): **35** promos → **$4,318 guaranteed margin** (outcome-independent)
- Self-insured (weather/local): **65** promos → variance-bearing
- Expected total margin (EV): **$22,375**  (~21.5% of fees)
- Promos with fee > 50% of exposure (near-coin-flip, uncompelling): **7** → confirms the long-odds wedge

## Portfolio Monte Carlo (20,000 books)
- Mean net P&L: **$20,825**
- Median: **$24,043**
- 5th percentile (bad year): **$-20,569**
- 95th percentile: **$50,958**
- Worst simulated book: **$-98,720**
- P(net loss on the whole book): **17.50%**
- Largest single-promo exposure (tail risk): **$31,429** (self-insured)

## By industry
| Industry | promos | total fee | EV margin | avg fee % of exposure |
|---|--:|--:|--:|--:|
| Car dealership | 5 | $15,600 | $4,043 | 13% |
| Roofing / storm restoration | 5 | $10,130 | $2,629 | 11% |
| Ski rental (out of state) | 5 | $9,440 | $2,451 | 40% |
| Wedding / event venue | 5 | $8,650 | $2,246 | 39% |
| Sports bar | 15 | $12,770 | $1,598 | 34% |
| Landscaping co. | 5 | $6,075 | $1,573 | 28% |
| Hotel near stadium | 5 | $9,560 | $1,190 | 27% |
| Golf course | 5 | $4,175 | $1,087 | 35% |
| Outdoor walking tour | 5 | $3,075 | $796 | 36% |
| Mini-golf attraction | 5 | $2,995 | $774 | 39% |
| Brewery / taproom | 5 | $5,195 | $644 | 35% |
| Gym | 5 | $2,320 | $601 | 23% |
| Pop-up retail | 5 | $2,280 | $591 | 41% |
| Ice cream shop | 5 | $2,015 | $527 | 36% |
| Bar (UFC/boxing night) | 5 | $3,915 | $489 | 42% |
| Pizza shop | 5 | $3,160 | $396 | 48% |
| Food truck | 5 | $1,485 | $382 | 39% |
| Farmers market | 5 | $1,375 | $357 | 39% |

## Findings
1. **Hedged sports promos are the safe core** — 35 promos lock $4,318 of margin regardless of outcomes (true market-maker spread). Zero variance.
2. **Self-insured weather is positive-EV but carries the tail** — the whole-book risk of loss is 17.50%, driven by large single weather exposures (car dealership snow, roofing storms). Caps + diversification keep ruin negligible.
3. **The $10k auto-quote cap matters** — big-exposure promos (dealerships, roofing) exceed it → manual underwriting / carrier backstop, not auto-bound.
4. **Long-odds wins** — only 7/100 priced above 50% of exposure; the model is naturally compelling for low-probability promos.
5. **Diversification across uncorrelated events** is what makes the self-insured book safe — correlated clusters (many promos on one game/storm) would break this and need cluster caps.
