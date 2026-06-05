# Hedgerow, Affiliate / Referral Program Design

> Language updated for compliance (no insurance/gambling terms); see gtm-paid-ads.md for the current compliant ad creative.

**Date:** 2026-06-02
**Product context:** Hedgerow is an *event-based promo product for small businesses*. A business pays a flat fee and gets an automatic payout if a defined real-world event happens (rain/snow via NWS, sports outcomes laid off internally on Polymarket/Kalshi, fuel/commodity moves via futures; these venues are internal-only and must never appear in customer copy). It is **positioned as a marketing tool, not insurance.** Beachhead is Florida sports bars and casual restaurants running long-odds game-day promos; secondary segments are car dealerships, outdoor/tour operators, and event venues. (See `gtm-plan.md`, `competitor-analysis.md`.)

This document covers: (1) what makes top affiliate programs perform, (2) the best affiliate types for Hedgerow specifically, (3) a concrete program design, and (4) compliance.

---

## 1) What Makes Top Affiliate Programs Perform

Pulled from fintech, SaaS, insurtech, and SMB-marketing benchmarks. Key reference programs and what they teach us:

| Program | Model | Payout size | Cookie / attribution | Tiers | Lesson |
|---------|-------|-------------|----------------------|-------|--------|
| **HubSpot** | 30% **recurring** | 30% of MRR, up to 1 year | **180-day** cookie | Tiered (volume, higher %) | Long cookie + recurring % wins for considered B2B purchases with long sales cycles. |
| **Shopify** | **Flat bounty** | ~$150 per qualifying merchant | ~30-day | Performance-gated approval | Flat bounty = simple, predictable, scales with broad reach; but doesn't reward customer *quality/retention*. |
| **ClickFunnels** | **Recurring %, tiered** | 20%, 30% (after $1k/mo), 40% (40+ active customers) | Sticky cookie | Explicit ladder | Tiered recurring is the strongest retention/loyalty mechanic, top affiliates chase the next tier. |
| **Lemonade (insurtech)** | Flat bounty per signup | ~$10-25 per new account; customer refer-a-friend = $10 | 30-day; capped at 10 referrals/12mo | Caps to limit fraud | Insurtech keeps payouts modest + capped because of fraud and thin per-deal margin. Relevant: Hedgerow has similar thin-margin-per-deal economics. |
| **Square** | Flat bounty | $5-$200 by product | 30-day | n/a | Wide payout range matched to product value; POS/payments use bounties, not %. |
| **Toast (referral)** | Flat bounty | $500 (general); $1,000 (existing-customer employee referrer) | Portal-tracked, W-9 + ACH required | n/a | High-ticket SMB hardware/SaaS justifies large flat bounties; formal tax/banking onboarding is a fraud control. |
| **Stripe** | Partner ecosystem (no public affiliate %) | Referral incentives via partners | Server-side / partner-attributed | Partner tiers | Mature fintech moves to a *partner program* (resellers/integrators) rather than open affiliate links, higher trust, lower fraud. |
| **Vendasta / GoHighLevel / SuiteDash** (SMB-marketing reseller) | **Wholesale margin** or 20-40% rev-share | Reseller keeps margin (e.g., $34 wholesale, $97 retail) | Account-level, server-side | Tiered plans | Agencies prefer to *resell and own the client* (wholesale margin) over a referral cut. This is the highest-LTV channel for SMB tools. |

### Benchmark numbers (2025 SaaS affiliate data)
- **Average SaaS commission:** 15-30% of sale; AI SaaS ~24.5%, B2B SaaS 10-20%.
- **Cookie window:** 30-90 days standard; **B2B should run 90-180 days** (longer sales cycle).
- **Program scale:** top 6% of programs ($1M+ rev) average ~57k referred leads / ~9k conversions; mid-tier ($100k-$500k) ~5k leads / ~1k conversions. Volume is dominated by a small number of high-fit affiliates.

### What actually drives volume (synthesis)
1. **Recurring % beats one-time bounty for retained, repeat-purchase products.** A 30% recurring cut on a repeat buyer out-earns a one-time bounty within ~12 months, and it *aligns the affiliate with customer quality*, they stop sending tire-kickers. Hedgerow's sports-bar beachhead buys *weekly* in-season, so recurring economics are exactly the right fit.
2. **Tiered ladders retain top performers.** The "next tier" (e.g., 20%, 30%, 40%) is the single most cited mechanic for keeping the few affiliates who drive most volume.
3. **Long, well-instrumented attribution windows** matter for considered B2B purchases. 90-180 days plus server-side capture prevents under-crediting (which kills affiliate trust faster than anything).
4. **Relationship-driven affiliates outperform broad reach in B2B.** Consultants, agencies, and trade networks convert far better than mass publishers, fewer affiliates, outsized revenue.
5. **Creative/asset support lowers activation friction.** Top programs ship ready-to-use copy, calculators, co-branded one-pagers, and a partner portal so the affiliate sells on day one.
6. **Approval + fraud controls protect thin margins.** Insurtech (Lemonade) caps referrals; Toast requires W-9/ACH; everyone reviews commissions before payout. For a product where Hedgerow's own margin is a slice of a laid-off flat fee, fraud control is existential.

---

## 2) Best Affiliate Types for Hedgerow (Ranked by Reach × Fit)

Ranking criteria: (a) **fit**, do they already sit between Hedgerow and the exact target merchant? (b) **reach**, how many qualified merchants can one partner touch? (c) **trust transfer**, does the merchant believe them on a novel, money-touching product? (d) **recurring potential.**

| Rank | Affiliate type | Reach | Fit | Trust | Why |
|------|----------------|-------|-----|-------|-----|
| **1** | **Local marketing / promo agencies (restaurant & hospitality-focused)** | ★★★★☆ | ★★★★★ | ★★★★★ | They *already run promos* for bars/restaurants and own the client relationship. Hedgerow is a new product they can sell into every client. Highest LTV, they'll re-sell weekly campaigns. Best treated as **resellers** (margin), not just referrers. |
| **2** | **POS / restaurant-tech resellers & ISOs (Toast, Square, Clover dealers)** | ★★★★★ | ★★★★★ | ★★★★☆ | Largest qualified reach into the exact beachhead (sports bars/restaurants). They sit at the point of sale, have existing merchant trust, and are motivated by add-on revenue. Note Toast/Square *employees* of resellers may be barred from those vendors' own referral programs, Hedgerow's independent program sidesteps that. |
| **3** | **Industry / local "operator" influencers** (bar-owner YouTubers, restaurant TikTok/IG creators, sports-bar community figures) | ★★★★★ | ★★★★☆ | ★★★★☆ | Huge reach + the promo *is inherently content* ("free wings if the Bucs score 5 TDs"). Great for top-of-funnel and waitlist. Use **flat bounty + ref link**, FTC disclosure mandatory. |
| **4** | **Business consultants / fractional CMOs / hospitality consultants** | ★★★☆☆ | ★★★★★ | ★★★★★ | Relationship-driven, high-trust, convert well (B2B affiliate sweet spot). Lower raw reach but high close rate; ideal for higher-deal-size segments (dealerships, venues). |
| **5** | **Chambers of commerce & restaurant/lodging associations (FRLA)** | ★★★★☆ | ★★★★☆ | ★★★★★ | **Affinity / endorsed-vendor** model: association endorses Hedgerow to members for non-dues revenue (rev-share). Massive credibility halo for a novel category, plus member lists. Slower to land; treat as a credibility + lead-list partner, not a transactional affiliate. |
| **6** | **Payment ISOs / merchant-services reps (non-POS)** | ★★★☆☆ | ★★★☆☆ | ★★★☆☆ | Adjacent reach into SMBs but weaker fit (not promo-focused). Opportunistic. |
| **7** | **General SaaS/affiliate publishers, deal sites, coupon affiliates** | ★★☆☆☆ | ★☆☆☆☆ | ★★☆☆☆ | Avoid early. Low fit, high fraud risk, attracts tire-kickers on a trust-heavy financial-adjacent product. |

**Bottom line on affiliate types:** Hedgerow should run a **two-track program**, a high-touch **Partner/Reseller track** (ranks 1, 2, 4, 5: agencies, POS resellers, consultants, associations) earning recurring margin, and a lighter **Affiliate/Referral track** (rank 3: influencers/creators) earning flat bounties via ref links. The reseller track is where durable, compounding revenue lives.

---

## 3) Hedgerow Affiliate Program Design

### 3.1 Commission model (recommended)

**Core model: % of flat fees originated, recurring, tiered, with a flat first-deal bonus to drive activation.**

Hedgerow earns a margin on each flat fee (flat fee minus the laydown cost on Kalshi/Polymarket/futures, all internal-only venues never named in customer copy). Pay affiliates a share of the **flat fees they originate**, not a share of Hedgerow's net margin (simpler, more transparent, easier to audit).

**Partner / Reseller track (agencies, POS resellers, consultants, associations):**

| Tier | Lifetime flat fees originated | Commission (recurring, on every flat fee that merchant pays) |
|------|-----------------------------|-------------------------------------------------------------|
| **Tier 1 (Starter)** | $0-$10k | **15%** of flat fees |
| **Tier 2 (Growth)** | $10k-$50k | **20%** of flat fees |
| **Tier 3 (Elite)** | $50k+ | **25%** of flat fees |
| **First-deal bonus** | n/a | **$100 flat** on a partner's first activated merchant (activation incentive) |

- **Recurring, not one-time:** the affiliate earns on *every* promo that merchant runs (sports bars buy weekly in-season). This aligns the affiliate with sending merchants who actually use the product repeatedly, the single most important lever for a repeat-purchase product.
- **% of flat fees, capped at the merchant level:** because the flat fee scales with exposure, cap commission per merchant per month (e.g., first $5k of monthly flat fees per merchant is commissionable) to bound payout on whale accounts and limit collusion incentives.
- **Reseller (white-label) option for top agencies:** let elite agencies buy at a **wholesale flat fee** and set their own retail markup, they keep 100% of margin above wholesale and own the client. This mirrors Vendasta/SuiteDash and is what high-LTV agencies actually want. Offer only after vetting.

**Affiliate / Referral track (influencers, creators, individual referrers):**

- **Flat bounty: $150 per *activated* merchant** (merchant pays first real flat fee), echoing Shopify's proven flat-bounty simplicity and sized to Hedgerow's deal value.
- Optional **$25 micro-bounty** for a qualified booked demo (lead-gen), to keep creators engaged before close.
- No recurring on this track (keeps it simple, fraud-bounded, and appropriate for one-touch promoters).

**Why this structure drives volume:** recurring % + a real tier ladder is the proven retention mechanic for the few high-fit partners who'll drive most revenue (HubSpot/ClickFunnels pattern), while the flat-bounty referral track captures the high-reach creator audience cheaply (Shopify/Square pattern). Caps and activation-gating borrow insurtech's (Lemonade) discipline on thin per-deal margin.

### 3.2 Attribution

Multi-layer, server-side-confirmed (industry best practice for fraud-resistance):

1. **Ref link / code:** unique `hedgerow.co/?ref=PARTNERID` plus a human-readable promo code the partner can give merchants verbally (walk-in/sales-call friendly, critical since this is founder-/agency-led, not click-driven).
2. **Cookie + localStorage:** first-party cookie **180-day window** (B2B-appropriate; long sales cycle from demo to first paid promo) backed by localStorage to survive cookie clearing.
3. **Server-side capture (source of truth):** on merchant signup, persist `ref_partner_id`, `ref_code`, click timestamp, IP, user-agent, and device fingerprint to the merchant record server-side. The **server-side record, not the cookie, is authoritative** for payout, cookies are only a hint.
4. **Attribution rule:** **last-touch within the 180-day window**, with **code override** (an explicitly entered partner code always wins over a stale cookie). Manual override available for founder-/agency-sourced deals where no click occurred.
5. **Self-referral block:** a merchant can't use its own partner code; partner can't be the merchant of record.

### 3.3 Payout cadence

- **Hold / clawback period:** commission accrues when the merchant pays a flat fee but is **payable 35 days after the event resolves** (so any payout, refund, or chargeback is settled first). This protects against refund/cancellation fraud, analogous to standard affiliate "locking" periods.
- **Payout schedule:** **monthly (NET-30)**, minimum payout threshold **$50** (rolls over if below), via ACH or USDC (matching Hedgerow's existing payout rails).
- **Statements:** each payout itemized by merchant + flat fee + tier rate in the partner dashboard.

### 3.4 Fraud controls

Sized to the reality that Hedgerow's own margin is thin and the product touches money:

1. **Onboarding KYC:** W-9 + ACH/wallet on file before any payout (Toast model). Business name, EIN for resellers. Manual approval for the reseller track; lighter self-serve approval for the referral track.
2. **Commission review before payout:** all accrued commissions reviewed (rule-based + spot manual) before they go payable. Anomaly flags: clusters of merchants from one partner on the same IP/device, abnormally high flat-fee-per-merchant, merchants that cancel right after the hold period, repeated near-identical promos.
3. **Caps:** per-merchant monthly commissionable flat-fee cap; per-partner monthly payout cap pending review for new partners (lifts with tenure/tier).
4. **Banking-change freeze:** any change to payout ACH/wallet triggers a 48h freeze + two-step verification (prevents account-takeover monetization).
5. **Collusion / wash-promo detection:** flag where a partner is economically linked to the merchant (same owner) running implausibly long-odds promos designed to extract commission rather than market, escalate to manual review and withhold.
6. **Holding period + clawback clause** in the partner agreement: commission reversed if the originating flat fee is refunded, disputed, or found fraudulent.

### 3.5 Tracking & dashboards needed

**Partner-facing dashboard:**
- Personal ref link + code, downloadable creative assets.
- Funnel: clicks/code-uses, demos booked, merchants activated, flat fees originated.
- Current tier, $ to next tier, lifetime flat fees originated.
- Commission ledger: accrued / locked / paid, per merchant, with payout statements.

**Internal/admin dashboard:**
- Per-partner LTV, activation rate, fraud flags, payout queue with manual-approve gate.
- Attribution audit trail (cookie vs server-side vs manual override) per merchant.
- Cohort retention: do partner-sourced merchants run repeat promos? (the real quality signal).

**Tooling:** Use an off-the-shelf affiliate platform that supports server-side postbacks, recurring commissions, tiers, and a hold period, e.g., **Rewardful or Tolt** (Stripe-native, recurring-friendly, fast to launch) for the referral track; build a thin internal layer for the reseller/wholesale track and founder-sourced manual attribution. **Add to the NanoClaw Services dashboard** (per Master's standing rule that any new integration/timer is tracked there).

### 3.6 Add this to the Ventures + Services dashboards
Per project conventions, register the affiliate-tracking platform (Rewardful/Tolt) and the monthly payout job in the dashboard Services view, and reflect partner-sourced flat fees in Hedgerow's venture revenue tracking.

---

## 4) Compliance & Disclosure

**A) Keep the "marketing tool, not insurance" framing, propagate it to affiliates.**
- The single biggest compliance risk is an affiliate using regulated-sounding language for Hedgerow (the prohibited-terms list below). That language can trigger state insurance-regulator scrutiny (see `florida-regulation.md`).
- **Partner agreement must include a controlled-vocabulary clause:** affiliates may describe Hedgerow as a *promotional / marketing product* where the business "runs a promotion and pays a flat fee; customers get an automatic reward if a defined public event occurs." **Prohibited terms (do not use):** insurance, policy, premium, claim, indemnify, underwrite, peril, deductible, coverage, guarantee.
- Provide **approved creative/copy only** for regulated-sounding contexts; require pre-approval for an affiliate's own materials that go beyond supplied assets.
- Affiliates must not make payout-probability or "you'll win" promises to merchants or end customers.

**B) FTC affiliate-disclosure requirements (US).**
- The FTC Endorsement Guides (revised June 2023) require any **material connection** (i.e., the affiliate is paid/commissioned) to be disclosed **clearly and conspicuously**, in the same place and at the same time as the endorsement.
- **Required of influencer/creator affiliates:** a visible disclosure on every post/video/story that promotes Hedgerow (e.g., "#ad" or "Hedgerow partner, I earn a commission"), placed near the recommendation, not buried in a bio or end-card.
- **Required of agencies/consultants** recommending Hedgerow to clients: disclose the commercial relationship to the merchant.
- **No fake reviews/testimonials**, the FTC's August 2024 Final Rule prohibits buying or selling fake consumer reviews; affiliates may not fabricate testimonials about payouts.
- **Hedgerow's obligation:** brands are liable for affiliates' undisclosed connections and false statements, so the program must (1) contractually require disclosure + approved language, (2) supply disclosure templates, and (3) **monitor** affiliate content (spot-checks, takedown right, suspension for violations).

**C) Other operational compliance.**
- **1099 reporting:** issue 1099-NEC to US affiliates paid ≥ $600/yr (W-9 collected at onboarding handles this).
- **Gaming-adjacency caution:** because triggers include sports outcomes, affiliates must frame promos as the *merchant's marketing promotion*, and must never describe them using gambling, betting, or wagering language or imply consumers are placing a stake. Approved-copy guardrails cover this.
- **State variation:** as in Lemonade's program, exclude affiliate activity in any state where the underlying product isn't offered; keep an allowlist aligned to Hedgerow's operating states (FL first).

---

## TL;DR Recommendation

Run a **two-track program**: a high-touch **Partner/Reseller track** (local promo agencies, POS/restaurant-tech resellers, consultants, associations) paid a **tiered recurring % of flat fees originated, 15%, 20%, 25%** with a **$100 first-deal activation bonus** and a wholesale/white-label option for top agencies; plus a lighter **Affiliate/Referral track** (operator influencers/creators) paid a **$150 flat bounty per activated merchant** ($25 per qualified demo). Attribution is **ref-link + code + 180-day cookie/localStorage, confirmed server-side (authoritative), last-touch with code override**. Payouts **monthly NET-30 after a 35-day post-event hold**, KYC + commission-review + per-merchant caps + banking-change freeze for fraud control, tracked in **Rewardful/Tolt** plus an internal reseller layer (registered in the Services + Ventures dashboards). Stay **"marketing tool, not insurance"**, contractually ban the prohibited vocabulary, supply approved copy, and enforce **FTC clear-and-conspicuous disclosure** on all affiliate content.

---

## Sources
- [Dodo Payments, 15 Best SaaS Affiliate Programs 2026](https://dodopayments.com/blogs/saas-affiliate-program)
- [Rewardful, SaaS Affiliate Program Benchmarks (2025)](https://www.rewardful.com/articles/saas-affiliate-program-benchmarks)
- [HostAdvice, 67 Best SaaS Affiliate Programs 2026](https://hostadvice.com/blog/monetization/affiliate-marketing/best-saas-affiliate-programs/)
- [Lemonade, Referral Program Terms & Conditions](https://www.lemonade.com/terms-and-conditions-referral-program)
- [CommissionDex, Lemonade Affiliate Program Details](https://commissiondex.com/program/lemonade-insurance/)
- [Toast, Referral Program Terms & Conditions](https://refer.toasttab.com/ts-and-cs/)
- [Toast, Local Partner Program Terms](https://localpartners.toasttab.com/ts-and-cs/)
- [Creator Hero, Square Affiliate Program Review](https://www.creator-hero.com/blog/square-affiliate-program-in-depth-review-pros-and-cons)
- [Stripe.partners, Rewardful (Stripe partner ecosystem)](https://stripe.partners/directory/rewardful)
- [Olavivo, Top B2B Affiliate Programs 2026](https://olavivo.com/b2b-affiliate-programs/)
- [Tolt, Does Affiliate Marketing Work for B2B?](https://tolt.com/blog/b2b-affiliate-marketing)
- [LiveChat Partners, 50 Best SaaS Reseller Programs for Agencies 2026](https://partners.livechat.com/blog/best-reseller-programs/)
- [SuiteDash, Best White-Label SaaS Reseller Programs](https://suitedash.com/best-white-label-saas-reseller-programs/)
- [Vendasta, Best White-Label Reseller Programs](https://www.vendasta.com/blog/best-white-label-reseller-programs/)
- [Trackier, Fraud-Proof Your Affiliate Program Checklist](https://trackier.com/fraud-proof-your-affiliate-program-checklist/)
- [impact.com, Preventing Affiliate Fraud](https://impact.com/affiliate/preventing-affiliate-fraud/)
- [24metrics, Affiliate Fraud Detection 2026](https://www.24metrics.com/learn/affiliate-fraud-detection-guide-2026/)
- [FTC, Endorsement Guides: What People Are Asking](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking)
- [FTC, Endorsements, Influencers, and Reviews](https://www.ftc.gov/business-guidance/advertising-marketing/endorsements-influencers-reviews)
- [Gordon Law, New FTC Endorsement Guidelines](https://gordonlaw.com/learn/ftc-endorsement-guidelines/)
- [ReferralCandy, FTC Affiliate Disclosure 2026 Checklist](https://www.referralcandy.com/blog/ftc-affiliate-disclosure)
- [U.S. Chamber of Commerce, Non-Dues Revenue / Affinity Programs](https://www.uschamber.com/chambers-of-commerce/non-dues-revenue-a-strategic-necessity-for-trade-associations-and-chambers)
- [Frank J. Kenny, Chamber Affinity Programs](https://frankjkenny.com/affinity-programs/)
