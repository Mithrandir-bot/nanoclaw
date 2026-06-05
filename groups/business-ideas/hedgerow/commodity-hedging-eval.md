# Evaluation — "Sell supplier/commodity default risk, hedge via IBKR futures"

The idea bundles **two very different risks**. Splitting them is the whole evaluation.

## Risk A — Commodity PRICE risk (e.g., aluminum spikes) → VIABLE adjacency
"If aluminum is above $X by date D, we pay you up to $Y" (so you can absorb a higher input cost).
- **Objective oracle:** LME/COMEX settlement price. Clean, no disputes. ✅
- **Real hedge:** buy aluminum (or RBOB, etc.) **futures on IBKR** — if price spikes, the futures gain funds the payout. This is selling a **price cap (call-option economics)** and hedging it. Fits Hedgerow's "price off a market, lay it off" model. ✅
- **Customer:** B2B input-cost-exposed SMBs — metal fabricators, builders, food/bev with commodity inputs, fleets (fuel). Different from bars/retail.
- **Cons:** niche demand (most SMBs don't think in hedges), bigger/complex tickets, **futures carry basis risk + margin/capital requirements**, and it's **still regulated insurance**. Also: the IBKR account on file is a **paper** account (DU…) — real hedging needs a funded futures account.
- **Verdict:** a legitimate **post-MVP adjacency** (objective + genuinely hedgeable via IBKR), best as "parametric input-cost protection." Closest live analog: the **fuel-price promo** in the catalog (RBOB futures hedge) — start there if pursuing commodities.

## Risk B — Supplier DEFAULT / failure-to-deliver → AVOID
"Pay you if your aluminum supplier fails to deliver."
- **Futures do NOT hedge this.** Commodity futures hedge *price*, not whether a *specific counterparty* delivers. The premise ("sell default risk, hedge via futures") is mismatched — the futures leave the actual default exposure naked.
- **No objective oracle.** "Failure to deliver" is litigable — partial delivery, late delivery, force majeure, quality disputes. Nothing public/neutral settles it. ✅-killer.
- **Moral hazard:** the buyer (and possibly the supplier) can influence or manufacture a "failure." Uninsurable by our exogenous-events rule.
- **Adverse selection:** only businesses with shaky suppliers buy it.
- **Correlation/systemic:** a commodity shock makes *many* suppliers fail at once — and the futures market moves against you simultaneously. Worst-case stacks.
- **It's trade-credit / surety insurance** — heavily regulated, requires credit-underwriting each supplier; a different (and harder) business than parametric event coverage.
- **Verdict:** **Do not build.** Wrong oracle, wrong hedge, moral hazard, correlated, and a regulated credit-insurance line.

## Bottom line
- **Yes** to **parametric commodity *price* protection** (objective LME/COMEX/EIA settlement, hedged on IBKR futures) — but as a later B2B adjacency; lead with the **fuel-price promo** which is the cleanest version.
- **No** to **supplier default / non-delivery** — that's trade-credit insurance, unhedgeable by futures, no oracle, moral-hazard heavy.
- The general rule this reinforces: **only write events that are (1) settled by a neutral public source and (2) actually hedgeable or diversifiable.** Price risk passes; counterparty-default risk fails both.
