# Hedgerow: How Bookmakers Guarantee an Edge, and How to Build One Into Hedgerow

**Date:** 2026-06-02
**Purpose:** Translate the mathematics of bookmaking, casinos, and sportsbooks into concrete pricing and risk rules for Hedgerow — a product that charges a business a fee, pays a payout if a defined event occurs, and hedges the exposure on the Kalshi prediction-market exchange. Hedgerow's profit is the spread between the fee it charges and the cost of the hedge.

---

## The Core Analogy

Hedgerow is structurally a **bookmaker with a built-in hedge desk**.

- A customer pays a **fee** (premium) for a contract that pays out **$P** if event E happens.
- Hedgerow immediately **buys protection on Kalshi** — i.e., buys YES contracts on E sized so the Kalshi payout offsets the customer payout.
- If Hedgerow charges `fee = hedge_cost + margin`, then **regardless of whether E happens, Hedgerow keeps the margin** — exactly the way a balanced sportsbook keeps the vig regardless of the game result.

The entire business reduces to one question every bookmaker has answered: **how do you guarantee that `fee > hedge_cost` on average, and never let a counterparty flip that inequality against you?** The sections below answer it.

---

## 1) Overround / Vig / Juice / Hold — Building Margin Into the Price

### How bookmakers do it

Bookmakers convert every outcome into an **implied probability** and deliberately price so the implied probabilities **sum to more than 100%**. The excess over 100% is the **overround** (a.k.a. bookmaker margin, vig, juice, hold).

- A standard two-way market priced **−110 / −110** gives each side an implied probability of `110 / 210 = 52.38%`. The two sum to **104.76%**. The vig is `104.76% − 100% = 4.76%`.
- An NBA moneyline of **−170 / +150**: favorite implied `62.96%`, underdog implied `40.0%`, sum `102.96%` → **2.96% hold**.
- The mechanism: take the true/fair odds and shade them **downward** — pay out at odds *worse* than fair value. The customer pays the margin whether they win or lose.

### Typical real-world margins

| Product | Typical built-in margin (hold) |
|---|---|
| Sharp/market-maker sportsbook | ~2–5% |
| Standard US sportsbook moneyline | ~4.5–7% |
| Football (soccer) match markets | 5–12% overround |
| Casino — Blackjack (basic strategy, 3:2) | 0.36–0.5% |
| Casino — Baccarat (banker) | ~1.06% |
| Casino — Craps (pass line) | ~1.41% |
| Casino — European Roulette (single 0) | 2.70% |
| Casino — American Roulette (0 and 00) | 5.26% |
| Casino — Slots | 2–15% |

Key insight: the lower the house edge, the more **volume** is required to make money (blackjack at 0.5% only works because of table turnover); the higher the edge, the more it relies on the customer having no realistic ability to beat it (slots).

### Setting Hedgerow's margin

Hedgerow's "hold" is the markup over the Kalshi hedge cost. Set it the way a book sets vig:

```
fee = hedge_cost  +  Kalshi_round_trip_fees  +  margin  +  risk_loading

where:
  hedge_cost            = Kalshi mid price for the payout-equivalent contracts
  Kalshi_round_trip     = entry taker/maker fee + settlement/exit fee
  margin                = base profit (the "vig"), e.g. 8–20% of hedge_cost
  risk_loading          = surcharge for slippage, illiquidity, basis risk,
                          and adverse-selection uncertainty
```

- **Express margin as implied-probability overround.** If the true/Kalshi probability of E is `p`, charge a fee corresponding to an implied probability of `p × (1 + m)` where `m` is the overround. A 10–15% overround is far richer than a sportsbook's 5% — justified because Hedgerow is selling a **bespoke, illiquid, hedged-with-friction** product, not a liquid two-way line.
- **Floor the margin in absolute dollars**, not just percent, so small contracts still clear fixed costs (Kalshi's own fee curve `0.07 × P × (1−P)`, max 1.75¢/contract at P=0.50, mirrors this — they keep fees from vanishing).
- **Margin should rise with uncertainty**: thin Kalshi liquidity, wide bid/ask, long time-to-resolution, and bespoke (non-exchange-listed) events all warrant a higher loading.

---

## 2) The Market-Maker Model — Locking the Edge by Pricing Off a True Probability

A sportsbook is, mathematically, **a market maker that never wants to be a market taker**. It posts a price on each side, and if action is balanced it **collects the vig and does not care who wins**. "Edge" is defined precisely:

```
buy edge  = quantity × (true_probability − fill_price)
sell edge = quantity × (fill_price − true_probability)
```

Positive edge = you bought below fair value or sold above it. A book that sells both sides above fair value (overround) has locked positive edge on the *book*, independent of outcome.

### How Hedgerow locks the edge

This is Hedgerow's single biggest structural advantage over a classic bookmaker: **it does not have to wait for balanced two-sided action to neutralize risk. It hedges directly on Kalshi at market.**

1. Customer wants payout `$P` if E occurs. Kalshi YES for E trades at price `k` (per $1 contract).
2. Hedgerow needs `N = P` dollars of Kalshi payout, i.e. buy `P` contracts at cost `≈ k × P` plus fees.
3. Hedgerow charges the customer `fee = k×P + fees + margin`.
4. **Outcome E happens:** Hedgerow pays customer `$P`; Kalshi pays Hedgerow `$P`. Net = `+margin`.
5. **Outcome E does not happen:** Hedgerow pays customer `$0`; Kalshi contracts expire worthless (cost already sunk in the fee). Net = `+margin`.

Either way Hedgerow keeps the margin — this is the bookmaker's "earn the vig regardless of outcome," achieved through an explicit hedge rather than through offsetting customer bets. The Kalshi market *is* Hedgerow's "true probability" oracle and its liquidity counterparty simultaneously.

**Two conditions must hold for this to be real, not theoretical:**

- **The hedge must actually be executed at or near the assumed price.** Quote off a *live, executable* Kalshi price, not a stale mid. Slippage on entry directly eats margin.
- **The hedge size must match the payout.** Basis risk (the Kalshi contract not paying exactly when/what the customer contract pays) reintroduces directional risk and must be priced in or eliminated by tight contract-definition matching.

---

## 3) Adverse Selection / Sharp Money — The Existential Risk

### The problem

Adverse selection is the existential threat to any book: counterparties who **know more than the market** (insiders) or who can **influence the priced outcome**. Even brief access to non-public information becomes a tradable edge when prices adjust in milliseconds. In information-asymmetric markets, the informed party profits while everyone else "effectively provides liquidity." This is the **winner's curse**: the trades you most easily win are disproportionately the ones a better-informed counterparty chose to make against you.

### How bookmakers defend

- **Never let the bettor set the price.** The book always quotes; the customer is a price-*taker*. Letting a customer name their own odds is suicidal — an informed customer will always pick a price that is profitable *to them* and therefore loss-making to the book.
- **Move the line** in response to sharp action (price discovery) — re-price toward the new information immediately.
- **Limit and ban sharps.** Lower limits on newly posted lines; reduce or cut off customers who consistently **beat the closing line** (the tell that they hold an edge, not just luck). ESPN/Washington Post reporting confirms books openly limit five-figure sharp action and cut bettors with "a better model or more information."
- **Maximum bet limits.** Hard caps per customer per market bound the damage any single informed counterparty can do.
- **Market-makers tolerate sharps only because sharp flow improves their prices** — and even they limit first-day/thin markets.

### Critical implication for Hedgerow

> **Hedgerow must NEVER let the customer set their own odds, choose their own payout-to-fee ratio, or define their own settlement terms.** Hedgerow quotes the fee; the customer accepts or declines.

Because Hedgerow's counterparties are **businesses buying protection on events that affect their own operations**, the adverse-selection risk is *acute and specific*: a business may know more about its own event than the market does, or — worse — may be able to **influence whether the event happens** (moral hazard). Examples:

- A business buys a Hedgerow payout on "our product launch slips past date X," then has every incentive to *let it slip* and collect.
- A business with private information ("we already know the regulator will rule against us next week") buys protection priced off a Kalshi market that hasn't seen that information yet.

Defenses Hedgerow must adopt:
- **Only write contracts on events the customer cannot materially influence** (exogenous, third-party-determined events — weather, official macro data, public game results, regulatory dockets with public timelines).
- **Quote only off live, liquid Kalshi prices**; refuse to write where no deep hedge exists.
- **Per-customer and per-event max limits.** Cap notional per counterparty.
- **Surveillance for sharp behavior** — customers who repeatedly buy just-before-resolution or just-before-news are flagged and re-priced or cut, exactly as books limit closing-line beaters.
- **Require the hedge to exist before binding the contract.** If Hedgerow cannot hedge, it does not write the contract. This makes the customer a price-taker of the *market*, structurally.

---

## 4) Law of Large Numbers / Portfolio Risk — Winning on Volume Without Going Broke

### The casino principle

Casinos do not need to win any single hand; they need a **fixed edge applied over enough independent trials** that the Law of Large Numbers drives realized results to the expected value. Blackjack's 0.5% edge is worthless on one hand and a money-printer over millions of hands. **Volume + fixed edge + independence = reliable profit.**

### The two ways this breaks

1. **Correlation.** The LLN assumes independent trials. If many Hedgerow contracts pay out on the *same underlying event* (e.g., dozens of businesses all hedging "Hurricane hits Gulf Coast in September"), the payouts are **perfectly correlated** — one event drains the whole book at once. This is the sportsbook equivalent of every customer parlaying the same game, or a casino with one giant correlated bet rather than millions of small ones.
2. **Over-betting / risk of ruin.** Even with a positive edge, sizing too large means a normal losing streak wipes out the bankroll before the LLN can work. Full **Kelly** maximizes long-run log-growth but is "mathematically optimal, practically dangerous" — estimation error and variance create real risk of ruin. Concurrent correlated bets compound this: full Kelly on 5 correlated positions ≈ 5× Kelly total exposure ≈ near-certain ruin.

### Risk controls for Hedgerow

- **Diversify across uncorrelated events.** Treat the book as a portfolio; the edge only compounds safely if exposures are independent.
- **Per-event exposure cap:** total net (unhedged-residual) payout tied to any single event ≤ a small % of reserves. Even fully hedged, hold a cap because hedges can fail (basis, settlement divergence, Kalshi counterparty/operational risk).
- **Per-customer cap** (adverse-selection bound, §3).
- **Portfolio cap on correlated clusters:** group contracts by underlying driver (a single storm, a single Fed decision, a single election) and cap the *cluster*, not just the individual contract — the analogue of "max total exposure 25% of bankroll across all concurrent bets."
- **Reserve / bankroll requirement (risk of ruin).** Maintain capital that covers the worst-case simultaneous payout of the largest correlated cluster *plus* hedge-failure scenarios. Size new business with **fractional Kelly** (¼–½ Kelly is the practical standard) and the "never risk >5% on one bet" rule of thumb. Hedgerow's residual (post-hedge) risk per contract should be a small fraction of reserves, and total residual across the portfolio bounded well under full Kelly.
- **The hedge reduces but does not eliminate the need for reserves** — slippage, fees, basis risk, and settlement disputes all create residual exposure that capital must absorb.

---

## 5) Settlement Integrity / Source of Truth — The Oracle Problem

### Why it is non-negotiable

Bookmakers settle on **official, verifiable, neutral outcomes** (the league's final score, the official result). Without an authoritative source of truth, every settlement becomes a dispute and the product is uninvestable. The entire contract is only as good as the answer to "**who decides whether E happened, and on what data?**"

### How Kalshi handles it (Hedgerow's hedge venue)

- Every Kalshi market names **"Source Agencies"** in its contract terms — official league statistics, government releases (e.g., NWS/NOAA, BLS), or other named authorities — filed with the CFTC via self-certification.
- Settlement occurs (typically within hours) once the named source publishes the finalized result; Kalshi may **wait** if data is delayed or revised.
- Disputes go to Kalshi's internal markets team with an **Outcome Review Committee** backstop. Ambiguous cases can be settled under rules like Kalshi's **Rule 6.3(c)** (settle at last traded price) — as happened in the Cardi B Super Bowl halftime market, where Kalshi called it ambiguous while Polymarket resolved YES at $1.

### The settlement-divergence risk for Hedgerow

This is a subtle but serious basis risk: **Hedgerow's customer contract and the Kalshi hedge must settle on the *same* source of truth, the *same* definition, and the *same* timing.** If they diverge, Hedgerow can owe the customer while its hedge pays nothing (or vice-versa). The Cardi B / Kalshi-vs-Polymarket divergence is the canonical warning.

### Settlement rules for Hedgerow

- **Define every contract by the exact same source agency, definition, and resolution timestamp that the hedging Kalshi market uses.** Inherit Kalshi's oracle verbatim so the two cannot diverge.
- **Only write contracts that map 1:1 to a settle-able Kalshi market.** No bespoke definitions that Kalshi won't mirror.
- **Publish the source of truth to the customer up front** (named agency, exact metric, cutoff time) — this kills disputes the way official league results do for books.
- **Encode an ambiguity/void rule** (mirror Kalshi's 6.3-style fallback) so an ambiguous outcome doesn't leave Hedgerow exposed on a contract whose hedge voided.
- **Treat the oracle/source as a single point of failure** and refuse events that lack a neutral, authoritative, automatable resolver.

---

## 6) Pricing & Risk Rules Hedgerow Should Adopt to "Always Have an Edge"

**Pricing**
1. **Always quote; never let the customer set odds, payout ratio, or settlement terms.** The customer is a price-taker. (The single rule that protects the edge.)
2. `fee = live_Kalshi_hedge_cost + round-trip Kalshi fees + margin (overround) + risk_loading.` Never below cost.
3. **Charge a real overround** (target ~10–20% of hedge cost; richer than a sportsbook's ~5% because Hedgerow sells a bespoke, illiquid, friction-laden hedge). Add a **dollar floor** so small contracts clear fixed costs.
4. **Quote off a live, executable Kalshi price**, not a stale mid. Re-quote when the market moves (move the line, like a book).
5. **Loading scales with uncertainty:** thinner liquidity, wider spread, longer horizon, weaker oracle → higher margin.

**Hedging & edge-locking**
6. **No hedge, no contract.** Bind the customer contract only after (or simultaneous with) executing the Kalshi hedge. This makes profit outcome-independent and the customer a price-taker of the market.
7. **Match payout size, definition, source, and timing 1:1 to the Kalshi hedge.** Eliminate basis and settlement-divergence risk by inheriting Kalshi's source agency verbatim.

**Counterparty / adverse selection**
8. **Only write exogenous events the customer cannot influence** (no moral hazard). Reject anything where the customer holds private information or operational control over E.
9. **Per-customer max limit; surveil for sharp behavior** (last-minute buys, pre-news buys, closing-line beaters) and re-price or cut them — exactly as books limit sharps.

**Portfolio / solvency**
10. **Cap exposure at three levels:** per-event, per-customer, and per-correlated-cluster (group by shared underlying driver).
11. **Hold reserves covering the worst-case simultaneous payout of the largest correlated cluster plus hedge-failure scenarios.** Size growth with **fractional Kelly (¼–½)**; keep residual per-contract risk a small % of reserves.
12. **Diversify across uncorrelated events** so the Law of Large Numbers actually works in Hedgerow's favor — many small independent edges, not a few big correlated ones.

**Settlement**
13. **Publish a named, neutral, authoritative oracle for every contract**; void/fallback rule for ambiguity that mirrors the hedge venue. No oracle, no product.

---

## Sources

- [Mathematics of bookmaking — Wikipedia](https://en.wikipedia.org/wiki/Mathematics_of_bookmaking)
- [Vigorish (Vig) Explained — BettingUSA](https://www.bettingusa.com/sports/vig/)
- [Bookmaking Economics: Vigorish & Overround — Medium](https://medium.com/analytics-vidhya/bookmaking-economics-vigorish-overround-8710d25a42a5)
- [What is Overround in betting? — Pinnacle Odds Dropper](https://www.pinnacleoddsdropper.com/blog/overround)
- [House Edge of Casino Games Compared — Wizard of Odds](https://wizardofodds.com/gambling/house-edge/)
- [Prediction Markets vs. Sportsbooks: Two Pricing Engines — Effortless Math](https://www.effortlessmath.com/blog/prediction-markets-vs-sportsbooks-pricing/)
- [Do Sportsbooks Ban Winners and Sharp Bettors? — BettingUSA](https://www.bettingusa.com/sportsbooks-ban-smart-customers/)
- [Sportsbooks defend limiting sharp customers — ESPN](https://www.espn.com/sports-betting/story/_/id/41231266/espn-sports-betting-news-sportsbooks-defend-practice-limiting-sharp-customers)
- [Sportsbooks use limits to restrict sharp bettors — Washington Post](https://www.washingtonpost.com/sports/2022/11/17/betting-limits-draft-kings-betmgm-caesars-circa/)
- [Milliseconds Matter: Inside Information is Sports Betting's Biggest Vulnerability — CasinoBeats](https://casinobeats.com/2025/12/17/inside-information-sports-betting-biggest-vulnerability/)
- [Inside Information, Outside Bets — Debevoise & Plimpton](https://www.debevoise.com/insights/publications/2026/02/inside-information-outside-bets)
- [Kelly Criterion — Wikipedia](https://en.wikipedia.org/wiki/Kelly_criterion)
- [What is the Kelly Criterion and How Does it Apply to Sports Betting — betstamp](https://betstamp.com/education/kelly-criterion)
- [Risk of Ruin: The Kelly Criterion's Solution — FasterCapital](https://fastercapital.com/content/Risk-of-Ruin--Avoiding-Disaster--The-Kelly-Criterion-s-Solution-to-Risk-of-Ruin.html)
- [How Kalshi and Polymarket Settle Markets (and Disputes) — DeFi Rate](https://defirate.com/prediction-markets/how-contracts-settle/)
- [Request to Settle Market — Kalshi Help Center](https://help.kalshi.com/markets/markets-101/request-to-settle-market)
- [Kalshi Fee Schedule](https://kalshi.com/fee-schedule)
- [Maker/Taker Math on Kalshi — Andrew Courtney](https://whirligigbear.substack.com/p/makertaker-math-on-kalshi)
