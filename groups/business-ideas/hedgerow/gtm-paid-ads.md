# Hedgerow - Paid-Ads Go-To-Market Plan

**Date:** 2026-06-02
**Author:** Mithrandir (research agent)
**Stage gate:** PRE-REGULATORY. This is a demand-validation plan only. Every dollar of ad spend drives to the WAITLIST (or the PARTNER page), never to a checkout that sells coverage. See the Regulatory Guardrail section before launching anything.

## What this builds on (do not duplicate)

This plan is the paid-acquisition layer that sits on top of the existing Hedgerow docs. Read those for the parts not repeated here:

- `gtm-plan.md` - segment ranking, founder-led + partnership engine, beachhead logic. NOTE: that doc predates the compliant-language rule and still uses "premium / insurance / Kalshi-hedged / bet." This paid-ads plan supersedes its creative and uses ONLY compliant copy.
- `conversion-best-practices.md` - landing-page CRO, calculator-first flow, waitlist mechanics, button microcopy. The ads in this doc point at those page sections.
- `affiliate-program.md` - the 2-track partner/affiliate economics (15/20/25% recurring + $150 bounty). This doc covers how to RECRUIT those partners with ads; it does not redefine the program.
- `competitor-analysis.md` - positioning against prize-indemnity / weather-promo incumbents.
- `use-cases-expansion.md` - the vetted business-type x trigger matrix used for ad creative and audience splits.

## Core strategic frame for paid ads

1. **The objective is a signal, not a sale.** Success = waitlist signups + calculator interactions + partner applications. We are buying proof that SMB owners want "rain on your event day, we pay you" before a single line of regulated checkout ships.
2. **The rain/weather hook is the wedge.** Weather (rain) is the most universal, most felt, most price-able peril (see `use-cases-expansion.md` Tier A). Lead every cold audience with rain. Sports/fuel are secondary expansions, not the test.
3. **Two campaign tracks, run in parallel:** (A) SMB Acquisition to the waitlist, (B) Affiliate/Partner Recruitment to the partner page. They have different channels, different copy, different KPIs.
4. **SMB owners are not on one platform.** They are scattered: scrolling Facebook/Instagram as consumers, Googling problems, in local FB Groups and Nextdoor, and reachable through the people who already serve them (agencies, POS resellers). Paid ads carry the consumer-surface channels; the affiliate track carries the "reach them through their vendors" channel.

---

## 1) CHANNEL STRATEGY

Benchmarks below are current (2026) US figures, sourced at the end. Treat them as the band; a brand-new category with no proof points will run at the high end of CPL until creative and social proof mature. CPL here = cost per WAITLIST signup (a lead), not cost per paying customer.

### 1.1 Meta (Facebook + Instagram) - PRIORITY: HIGH (primary channel)

(a) **Worth it for SMB owners? Yes, the single best paid channel for this test.** SMB owners are heavy Facebook/Instagram users as consumers, Meta has the deepest owner-targeting toolkit, and 2026 lead-gen CPLs ($19-40) are roughly half of Google search CPLs. Instant-form lead ads collect a waitlist email without the visitor leaving the app, which is ideal for a one-field email waitlist.

(b) **Targeting approach (reach owners of bars, venues, car washes, golf courses, photographers, ice cream shops, etc.):**
   - **Detailed targeting (layer 2-3 together, AND logic):**
     - Behaviors/demographics: "Small business owners," "Business page admins," "Facebook Page admins (food & restaurant / sports / retail)."
     - Job titles: Owner, Founder, Co-founder, Managing Director, General Manager, Operator, Proprietor.
     - Interests by vertical: "Restaurant management," "Bar," "Toast POS," "Square," "Clover," "National Restaurant Association," "Wedding venue," "Event planning," "Golf course," "Car wash," "Brewery," "Farmers market," "Photography business."
   - **Combine industry x owner:** layer a vertical interest (e.g. Bar / Brewery) AND an owner behavior. This is the standard 2026 pattern for reaching restaurant/bar owners specifically.
   - **Geo:** start Florida (Tampa Bay first per `gtm-plan.md`), then broaden to weather-exposed metros (Phoenix heat, Denver snow, Pacific NW rain) as the calculator proves multi-peril.
   - **Advantage+ audience with a seed:** feed Meta any seed list (FRLA members, prior demo contacts) to build lookalikes; let Advantage+ expand. Best scaling lever once a winning creative exists.
   - **Retargeting:** anyone who hit the landing page or started the calculator but did not join the waitlist (custom audience off the `/api/track` calculator events + pixel). Highest-ROI Meta spend.

(c) **Cost band (2026):** CPM $7-12 (lead-gen objective in US runs $25-40 CPM); CPC $1.30-3.35 (Reels cheapest at ~$1.28, FB feed ~$1.72); **CPL $19-40** for cold lead-gen, target **$15-30** with retargeting and a strong rain hook.

(d) **Format + compliant angle:**
   - **Instant lead form (waitlist)** + **short video/Reel** showing a rainy event day flipping to "we paid the business." 9:16 vertical, first 2 seconds = the rain visual.
   - Hook: *"Rain on your big event day? Get paid for it. One flat fee, all the upside if the sun shows up."* CTA: Join the waitlist.

(e) **Priority: HIGH.** ~50% of the test budget.

### 1.2 Google (Search + Performance Max/Display + YouTube) - PRIORITY: MED (Search only for the test)

(a) **Worth it? Partially.** Nobody yet searches "promo that pays me if it rains" - the category has near-zero search volume, so broad Search is not a demand engine pre-awareness. BUT a tight high-intent Search campaign captures the few owners actively looking for "rain promotion," "weather refund promotion," "rain guarantee for my business," plus competitor terms (Odds On Promotions, weather promotion insurance). PMax/Display/YouTube are awareness plays better deferred until there is a proven creative and a real budget; running PMax on $1k wastes the learning.

(b) **Targeting approach:**
   - **Search:** exact/phrase match on a tight list: `rain promotion for business`, `weather refund promotion`, `rain guarantee marketing`, `money back if it rains promo`, `prize indemnity small business`, `weather promotion insurance` (bid but redirect copy to compliant framing), brand terms `Hedgerow promotion`. Location: FL first.
   - **Defer** PMax and Display until post-clearance scale; if tested, geo-fence FL and exclude low-quality placements.
   - **YouTube:** defer. Good for category education later, not a $1k-test lead channel.

(c) **Cost band (2026):** Search cross-industry CPC ~$3-5 (B2B/finance higher); avg Search CPL ~$66 cross-industry but local/long-tail intent terms much lower. Expect **CPL $40-90** on cold search, lower on brand terms. PMax ecommerce CPCs ~$0.40 but irrelevant to lead-gen here.

(d) **Format + compliant angle:** Responsive Search Ads. Headline: *"Run a Rain-Day Promotion - One Flat Fee."* Description: *"If it rains on your event, your customers get paid back automatically. Join the early-access list."* CTA: Join the waitlist.

(e) **Priority: MED.** ~15-20% of the test (capture intent, do not over-invest pre-awareness).

### 1.3 Twitter / X - PRIORITY: LOW for SMB acquisition, MED for affiliate

(a) **Worth it? Weak for reaching local SMB owners** (car wash and ice cream shop owners are not on X for business). **Decent for the affiliate/operator-influencer track** - marketing operators, agency folks, "build in public" founders, and fintech/insurtech-curious crowds live on X, and CPMs are cheap (~$5.80, the cheapest of any platform here).

(b) **Targeting:** keyword/follower targeting around marketing, restaurant-operator, and agency accounts; interest = small business, marketing, hospitality. Better for amplifying content than for cold owner lead-gen.

(c) **Cost band (2026):** CPC ~$0.50-2.00 (avg ~$0.75), CPM ~$5.80. Cheap clicks, lower intent.

(d) **Format + angle:** promoted single-image/video tweet linking to the partner page (affiliate track) or a thought-leadership thread on "event-based promotions." Owner angle deprioritized.

(e) **Priority: LOW (SMB) / MED (affiliate amplification).** Not in the core $1k test; small affiliate test only if budget allows.

### 1.4 Reddit - PRIORITY: MED-HIGH for affiliate, LOW-MED for SMB

(a) **Worth it? Yes for the affiliate track, situationally for SMB.** Reddit delivers CPCs 40-80% below LinkedIn while reaching the same professional audiences in subreddits. The affiliate amplifiers (agencies, marketing freelancers, POS/restaurant-tech resellers) congregate in r/marketing, r/agency, r/PPC, r/Entrepreneur, r/smallbusiness, r/restaurateur, r/bartenders/r/bartender (owners), r/golf (course operators), r/photography (working pros). For SMB owners directly, subreddit context (r/smallbusiness, r/restaurateur) gives surprisingly good fit at low cost.

(b) **Targeting:** subreddit targeting (most precise lever on Reddit) + interest categories. For SMB: r/smallbusiness, r/restaurateur, r/Entrepreneur. For affiliates: r/marketing, r/agency, r/PPC, r/DigitalMarketing, r/msp (resellers), r/SaaS.

(c) **Cost band (2026):** CPC $0.20-4.00 (B2B/finance $1-3), CPM $0.50-15. CPL $15-40 broad, $40-100+ competitive B2B. A real B2B example hit $1.80 CPC / $127 cost per qualified lead, 63% below LinkedIn.

(d) **Format + angle:** Conversation-placement or feed ads that read native (Reddit punishes corporate tone). SMB angle: *"We're testing a promotion that pays your customers back if it rains on your event - looking for early businesses."* Affiliate angle: *"Recurring commission for marketing agencies + POS resellers - add a rain-day promotion to your client menu."*

(e) **Priority: MED-HIGH (affiliate) / LOW-MED (SMB).** Best home for the affiliate test dollars.

### 1.5 LinkedIn - PRIORITY: MED for affiliate, LOW for SMB

(a) **Worth it? Yes, but only for the affiliate/partner track.** LinkedIn is the precision tool for reaching marketing agencies, fractional CMOs, POS/ISO resellers, and consultants by exact job title and company. It is too expensive and too wrong-audience for local SMB owners (a car wash owner is not on LinkedIn for leads). Use it surgically for partner recruitment where the high CPC buys exact targeting.

(b) **Targeting:** Job title (Owner/Partner at marketing agency, Founder, Fractional CMO, Marketing Consultant, Channel/Reseller Manager), Member skills (digital marketing, restaurant marketing, channel sales), Company (Toast/Square/Clover partner ecosystems, marketing agencies <50 employees), Groups (restaurant marketing, agency owners).

(c) **Cost band (2026):** CPC $4.50-12 ($8-10 typical B2B), CPM $25-55, **CPL $60-175.** Expensive; use document/lead-gen-form ads and tight ICP to stay near the low end.

(d) **Format + angle:** Single-image or document ad, native lead-gen form. *"Add a new recurring-revenue product to your agency: event-based promotions for local businesses. Partner commissions on every promotion your clients run."*

(e) **Priority: MED (affiliate only).** A small, tightly-targeted slice if the affiliate test expands.

### 1.6 Nextdoor - PRIORITY: MED (local SMB, niche)

(a) **Worth it? Niche-yes.** Nextdoor reaches hyper-local audiences including local-business owners and the "Business Posts" surface targets neighborhood businesses. Strong fit for the genuinely local verticals (car washes, ice cream shops, golf courses, farmers markets) in a specific launch metro. Limited scale and targeting depth keep it a complement, not a core channel.

(b) **Targeting:** geo radius around the launch metro; Nextdoor Business audiences; neighborhood sponsorships in target zips.

(c) **Cost band (2026):** CPM ~$20, CPC $2.50-3.50, local deals from ~$200 flat, neighborhood sponsorship ~$400-1,500/mo. Pricier per impression but very local.

(d) **Format + angle:** local-business sponsored post. *"Local business owner? Run a rain-day promotion your neighbors will love - join the early list."*

(e) **Priority: MED.** Worth a small geo-fenced test in the beachhead metro alongside Meta.

### 1.7 TikTok - PRIORITY: LOW (SMB acquisition), MED (organic/influencer, not paid)

(a) **Worth it? Low for paid SMB lead-gen, but high for organic/operator-influencer content.** The rain-day promo is inherently viral content ("watch this bar pay everyone back because it rained"). Paid TikTok CPLs for B2B lead forms ($15-60) are okay but the audience skews younger/consumer. Better as an ORGANIC + affiliate-influencer surface (operator creators in `affiliate-program.md` rank 3) than a paid line item.

(b) **Targeting:** interest (small business, restaurant, entrepreneurship), Spark Ads boosting operator-creator content.

(c) **Cost band (2026):** CPC $0.17-1.50, CPM $4-12, lead-form CPL $15-60.

(d) **Format + angle:** Spark Ad on a creator's "it rained and the bar paid everyone back" clip -> waitlist. Compliant: frame as a marketing promotion the business runs.

(e) **Priority: LOW (paid) / handle via affiliate-influencer track organically.**

### 1.8 Industry newsletters / podcasts / trade associations - PRIORITY: MED-HIGH (efficient, trust-rich)

(a) **Worth it? Yes - high-trust, low-waste.** Niche restaurant/hospitality/golf/event-industry newsletters and podcasts reach exactly the owner persona with built-in credibility, and sponsorships are flat-fee (no auction inflation). Trade associations (FRLA, state restaurant/golf/car-wash associations) offer endorsed-vendor placements that double as the affiliate "association partner" channel in `affiliate-program.md`.

(b) **Targeting:** publication-level (the newsletter's list IS the targeting). Restaurant operator newsletters, hospitality podcasts, golf-operator media, event-planner newsletters, regional chamber/association bulletins.

(c) **Cost band:** flat sponsorships typically $250-2,000 per send/episode for niche SMB lists; association placements vary (often rev-share or low flat fee). CPL effectively unknown until tested but waste is low because the list is pre-qualified.

(d) **Format + angle:** dedicated or sponsored-section copy: *"New: run a promotion that pays your customers back if it rains on your event day - one flat fee. Join the early-access list."*

(e) **Priority: MED-HIGH.** One or two cheap newsletter sponsorships are a strong complement to Meta in the test; this is also a natural affiliate/association on-ramp.

### Channel priority ranking (summary)

| Rank | Channel | Track | Priority |
|------|---------|-------|----------|
| 1 | Meta (FB/IG) | SMB acquisition | HIGH |
| 2 | Niche newsletters/podcasts/associations | SMB + affiliate | MED-HIGH |
| 3 | Reddit | Affiliate (+ some SMB) | MED-HIGH |
| 4 | Google Search (tight intent) | SMB acquisition | MED |
| 5 | Nextdoor (geo-fenced) | SMB acquisition (local) | MED |
| 6 | LinkedIn | Affiliate only | MED |
| 7 | X / Twitter | Affiliate amplification | LOW-MED |
| 8 | TikTok | Affiliate-influencer (organic) | LOW (paid) |
| - | Google PMax / Display / YouTube | Awareness | DEFER to post-clearance scale |

---

## 2) TWO CAMPAIGN TRACKS

### 2A) SMB ACQUISITION - drive owners to the waitlist

**Objective:** waitlist signups + calculator interactions. **Landing target:** the calculator-first hero -> email waitlist (see `conversion-best-practices.md` section order). **Primary channel:** Meta; supported by newsletters, Google Search, Nextdoor.

**Hook ladder (lead with #1 always):**
1. Rain on your event day, we pay you (the wedge).
2. All the upside, none of the downside.
3. One flat fee, no surprises.

**Compliant ad examples** (headline + primary text). All avoid: insurance, coverage, premium, policy, guarantee, claim, hedge, bet, odds, wager, payout-if-you-win. Approved vocabulary: promotion, flat fee, pay your customers back, weather-backed promotion, rain-day promotion, early-access list.

1. **Headline:** Rain on your event day? Get paid for it.
   **Primary:** Run a rain-day promotion for one flat fee. If it rains on your event, your customers get paid back automatically and you keep all the upside if the sun shows up. Join the early-access list.

2. **Headline:** All the upside. None of the rainy-day downside.
   **Primary:** Offer your customers a "good weather or money back" promotion. You pay one flat fee up front. If the rain hits, we handle paying your customers - automatically, within 24 hours. Be first in line.

3. **Headline:** Turn a rainy forecast into a marketing win.
   **Primary:** A washed-out Saturday shouldn't wash out your revenue. Run a promotion that pays your customers back if it rains - one flat fee, no percentages, no surprises. Join the waitlist.

4. **Headline:** One flat fee. Your customers covered if it rains.
   **Primary:** Bars, venues, car washes, golf courses, photographers: run a rain-day promotion your customers will love. Flat fee in, automatic payback out if the weather turns. See your flat fee with the free calculator. Join the early-access list.

5. **Headline:** "Free wash next week if it rains this Saturday."
   **Primary:** That's the kind of promotion that fills your calendar - and now you can run it without eating the cost yourself. One flat fee covers the payback. Try the calculator and join the waitlist.

6. **Headline:** Make the weather work for your business.
   **Primary:** Pick your event, pick the rain trigger, get one flat fee. If it rains, your customers get paid back automatically. If it doesn't, you keep every booking. Join the early-access list.

7. **Headline:** Wedding, festival, patio weekend - rain-proof the promotion.
   **Primary:** Give customers a reason to book even when the forecast is iffy: pay them back automatically if it rains. You pay one flat fee, we handle the rest. Reserve your spot on the waitlist.

8. **Headline:** Your fans love a bold promotion. Now run one risk-free.
   **Primary:** "Money back if it rains on game day." One flat fee, automatic payback to your customers, all the upside if it stays dry. Be first to run it - join the early-access list.

**Secondary expansion creative (run only after rain proves out):** sports ("Team makes the playoffs? 20% off - run it for a flat fee"), heat ("Free extra scoop if it hits 90"), snow ("Free boot fit if we get a foot of snow"). Keep all on the waitlist CTA.

### 2B) AFFILIATE RECRUITMENT - recruit amplifiers

**Objective:** partner applications. **Landing target:** the partner page (the "Become a partner" path in `conversion-best-practices.md`), describing the 15/20/25% recurring + $150 bounty program from `affiliate-program.md`. **Primary channels:** Reddit, LinkedIn, niche marketing newsletters; X for amplification.

**Who to recruit (from `affiliate-program.md` ranking):** local marketing/promo agencies, POS/restaurant-tech resellers (Toast/Square/Clover consultants & ISOs), hospitality consultants/fractional CMOs, operator influencers/creators, chambers & associations.

**Targeting by channel:**
- **Reddit:** r/marketing, r/agency, r/PPC, r/DigitalMarketing, r/msp, r/SaaS, r/restaurateur (operator-adjacent consultants).
- **LinkedIn:** job titles Agency Owner/Partner, Fractional CMO, Marketing Consultant, Channel/Reseller Manager; Toast/Square partner-ecosystem companies; restaurant-marketing groups.
- **X:** marketing-operator and "build in public" follower targeting; agency-owner keywords.
- **Newsletters:** agency/marketing-operator newsletters; restaurant-tech reseller communities.

**Compliant ad examples** (partner-recruitment; same vocabulary guardrails):

1. **Headline:** Add a recurring-revenue product to your agency.
   **Primary:** Help your local-business clients run rain-day promotions and earn recurring commission on every promotion they run. New category, ready-made assets, partner portal. Apply to the Hedgerow partner program.

2. **Headline:** POS & restaurant-tech resellers: a new add-on your merchants will actually use.
   **Primary:** Your bars, restaurants, and venues want bolder promotions. Offer them a rain-day promotion and earn recurring commission. Tiered 15-25%, plus a bonus on your first activated merchant. Become a partner.

3. **Headline:** Marketing consultants: own a product nobody else offers yet.
   **Primary:** Event-based promotions are a fresh, high-interest product for local businesses. Refer clients, earn recurring commission, get the assets to sell on day one. Join the partner program.

4. **Headline:** Recurring commission for agencies and resellers - new category, first-mover edge.
   **Primary:** Hedgerow lets local businesses run promotions that pay customers back when it rains. Partners earn 15-25% recurring plus a per-merchant activation bonus. Apply to partner.

5. **Headline:** Operators and creators: this promotion is built-in content.
   **Primary:** "It rained and the bar paid everyone back." That's a viral clip and a commission. Refer local businesses, earn a bounty on every one that activates. Become a Hedgerow partner. (Partner relationship must be disclosed per FTC - see affiliate-program.md.)

6. **Headline:** Chambers & associations: non-dues revenue your members will thank you for.
   **Primary:** Endorse a new promotion product that helps local members win rainy-day business, and share in the revenue. Let's set up an endorsed-partner placement. Get in touch.

---

## 3) BUDGET - $1,000 initial test

**Goal of the test:** prove SMB demand (waitlist + calculator interactions) and get an early read on affiliate appetite, on the two-to-three best channels, before any regulated build.

### Allocation

| Channel | Spend | Track | Purpose |
|---------|-------|-------|---------|
| **Meta (FB/IG) lead-gen + retargeting** | **$550** | SMB acquisition | Primary demand test. 2 ad sets: cold owner-targeting (rain hook) + retargeting of calculator/landing visitors. $40-45/day for ~2 weeks. |
| **Reddit (affiliate + SMB subreddits)** | **$200** | Affiliate (+ some SMB) | Cheapest qualified B2B reach. Subreddit-targeted to agencies/resellers (partner page) + r/smallbusiness/r/restaurateur (waitlist). ~$50/day for ~4 days or $15/day spread. |
| **Google Search (tight intent)** | **$150** | SMB acquisition | Capture the few high-intent searchers + brand/competitor terms. Exact/phrase only, low daily cap (~$10-12/day). |
| **One niche newsletter sponsorship** | **$100** | SMB + affiliate | One cheap restaurant/hospitality or marketing-operator newsletter send. Flat fee, pre-qualified list, near-zero waste. |

(Nextdoor and LinkedIn held in reserve; fold in only if a channel underperforms and budget reallocates. Founder-led walk-ins from `gtm-plan.md` run in parallel at ~$0 ad cost.)

### Expected results and success thresholds

Using 2026 bands and discounting for an unproven category:

| Channel | Spend | Assumed CPL | Expected signups | Notes |
|---------|-------|-------------|------------------|-------|
| Meta | $550 | $20-35 blended | ~16-27 waitlist | Retargeting pulls blended CPL down |
| Reddit | $200 | $25-50 (mixed SMB+affiliate) | ~4-8 signups/apps | Skews to affiliate applications |
| Google Search | $150 | $40-90 | ~2-4 high-intent | Low volume, high intent |
| Newsletter | $100 | flat | ~3-10 (list-dependent) | Quality > quantity |

**Blended test expectation: ~25-50 waitlist signups + 3-8 affiliate applications + meaningful calculator-interaction volume**, at a blended CPL target of **<= $35**.

**Decision gates (go/scale signal):**
- **GO** if: blended CPL <= $35, >= 40 total waitlist signups in the window, calculator start rate >= 25% of landing visitors, and >= 3 affiliate applications. This proves both demand and amplifier appetite.
- **PARTIAL / iterate** if: 20-40 signups OR CPL $35-60 - keep the winning channel, rebuild creative on the laggards, re-test 2 weeks.
- **KILL / pivot** if: < 20 signups or CPL > $60 across all channels after creative iteration - the hook or segment is wrong; re-test sports/heat hooks or a different vertical before spending more.

### Scale plan (if the test hits the GO gate)

1. **Phase 2 ($3-5k/mo):** pour ~70% into the winning Meta audience+creative; add Advantage+ with a lookalike off the now-real waitlist; expand geo to 2-3 weather-exposed metros. Keep Google Search; add the best newsletter as a recurring monthly sponsor.
2. **Phase 2 affiliate ($1-1.5k/mo):** scale Reddit + add tightly-targeted LinkedIn for agencies/resellers; recruit operator-influencers via the affiliate-influencer track.
3. **Phase 3 (post-regulatory clearance only):** turn on conversion campaigns (sell the actual promotion), introduce Google PMax/Display retargeting and YouTube for category education, and shift from CPL to CPA/ROAS optimization. **Not before clearance.**

---

## 4) MEASUREMENT

### UTM scheme

`utm_source` = platform (`meta` | `google` | `reddit` | `linkedin` | `x` | `nextdoor` | `newsletter_{name}` | `tiktok`)
`utm_medium` = `cpc` | `paid_social` | `sponsorship` | `lead_form`
`utm_campaign` = `{track}_{theme}_{geo}` e.g. `smb_rain_fl`, `affiliate_agency_us`
`utm_content` = creative/ad id e.g. `rain_reel_v2`, `agency_doc_v1`
`utm_term` = keyword (Google) or audience/subreddit (Reddit/Meta) e.g. `r_smallbusiness`, `rain_promotion_exact`

Example: `?utm_source=meta&utm_medium=paid_social&utm_campaign=smb_rain_fl&utm_content=rain_reel_v2&utm_term=bar_owners_tampa`

### What to track (uses the app's existing endpoints)

- **`/api/track`** - anonymous calculator interactions: calculator start, category selected, event/trigger selected, flat-fee revealed. This is the strongest intent signal short of an email and the key mid-funnel metric. Tag each with the inbound UTMs (persist UTMs to session/localStorage on landing).
- **`/api/waitlist`** - waitlist signups (the primary conversion). Capture UTM params + business category on the post-email step.
- **`/api/lead`** - richer leads (e.g. demo request / partner application). Use for affiliate-track conversions and any hand-raiser who wants contact.
- **Pixels/tags:** Meta pixel + CAPI (server-side off `/api/waitlist` for iOS-resilient attribution), Google tag, Reddit pixel, LinkedIn Insight Tag. Fire a standard "Lead" event on waitlist submit.

### KPIs

| KPI | Definition | Test target |
|-----|------------|-------------|
| **CPL (primary)** | ad spend / waitlist signups | <= $35 blended |
| **Waitlist signups** | `/api/waitlist` count | >= 40 in test window |
| **Calculator start rate** | calculator starts / landing visitors | >= 25% |
| **Calculator completion (fee revealed)** | fee-reveal events / starts | >= 50% |
| **Cost per qualified SMB** | spend / (signups in target verticals + geo) | track; refine in Phase 2 |
| **Affiliate applications** | partner-page `/api/lead` (track=affiliate) | >= 3 in test |
| **Cost per affiliate application** | affiliate spend / affiliate apps | <= $60 |

### Weekly readout (simple, one screen)

Post to #business-ideas every Monday for the venture:
```
Hedgerow paid-ads - week of {date}
Spend: $X (Meta $a / Reddit $b / Google $c / Newsletter $d)
Waitlist signups: N (blended CPL $X) | vs target $35
Calculator: starts S, fee-reveals R (start rate Y%, completion Z%)
Affiliate apps: M (cost/app $X)
Best creative: {utm_content} at $X CPL | Worst: {utm_content} - cut/iterate
Action: scale / iterate / cut {channel}; next-week change: {one thing}
```
Pull figures from `/api/track` + `/api/waitlist` + `/api/lead` joined on UTMs.

---

## 5) CREATIVE / LANDING NOTES

**Where each campaign points:**
- **SMB Acquisition ads -> calculator-first hero + email waitlist.** Land on the hero with the calculator as primary action (per `conversion-best-practices.md` 1.3): visitor sees the rain hook, runs the calculator (fires `/api/track`), then the email-only waitlist (`/api/waitlist`). Use-case-card deep links can pre-fill the calculator per vertical (car wash, golf, brewery).
- **Affiliate ads -> the partner page** ("Become a partner"), summarizing the 15/20/25% recurring + $150 activation bounty from `affiliate-program.md`, with a short application form to `/api/lead` (track=affiliate).
- Match the ad's vertical/hook to the landing variant (a golf ad lands on a golf-pre-filled calculator) - message match lifts conversion.

**Compliant creative guardrails (apply to every asset, every channel):**
- **Banned vocabulary:** insurance, coverage, premium, policy, guarantee, claim, hedge, indemnify, underwrite, peril, deductible; and gambling words: bet, betting, odds, wager, stake, payout-if-you-win.
- **Approved vocabulary:** promotion, rain-day promotion, weather-backed promotion, one flat fee, pay your customers back, automatic payback, early-access list, waitlist.
- **Frame as the business's marketing**, never as a consumer wager or as protection-against-loss the buyer "claims."
- **No probability/"you'll win" claims**; no fabricated testimonials or payout stats (FTC + Master's zero-hallucination rule). Any social proof must be real (use the live waitlist counter once real).
- **No fake urgency** (real batch-onboarding/queue position only, per `conversion-best-practices.md` 4.3).
- **Settlement is neutral/official** - if referenced, say "settled by official weather data (e.g. NWS)," never imply Hedgerow decides.
- **CTA is always waitlist or partner application** - never "buy," "get coverage," "purchase a policy."
- Functional status emojis are fine in internal CLI/agent output, but **no emojis in the ad creative or landing copy** (Master's UI/code rule).

---

## 6) REGULATORY GUARDRAIL

**This is the binding constraint on the entire plan. Hedgerow is pre-regulatory (regulated-insurance risk in FL per `florida-regulation.md`). Until counsel signs off:**

1. **Ads are demand validation only.** Every campaign drives to the WAITLIST or the PARTNER application. We are measuring intent, not transacting coverage.
2. **Do NOT run conversion/"buy" ads.** No "get coverage," "buy your promotion," "purchase," or any checkout-driving creative until regulatory clearance. Phase 3 (conversion campaigns, PMax, ROAS optimization) is gated on counsel approval.
3. **Compliant copy is mandatory** on every ad, every channel, every affiliate asset (see banned/approved vocabulary in section 5). Affiliates are contractually bound to the same controlled vocabulary and FTC disclosure (`affiliate-program.md` section 4).
4. **No insurance/gambling framing, no guarantees, no probability claims, no fabricated proof.** Settlement always attributed to neutral official sources.
5. **Geo-gate to operating states.** Do not run ads (or affiliate activity) implying availability in states where the product is not offered; keep an allowlist (FL first).
6. **If any platform's review or policy forces "insurance"/"financial product" classification, stop and reframe** rather than accepting the label - misclassification on the ad platform can itself create regulatory exposure.

Treat this plan as the validation engine that produces the demand evidence (and the waitlist) which justifies the legal/regulatory spend - not as a revenue switch. Flip to selling only after counsel clears it.

---

## TL;DR

- **Channel priority:** 1) Meta (HIGH), 2) niche newsletters/podcasts/associations, 3) Reddit (affiliate), 4) Google Search (tight intent), 5) Nextdoor (local), 6) LinkedIn (affiliate only), 7) X (amplify), 8) TikTok (organic/influencer). Defer Google PMax/Display/YouTube to post-clearance scale.
- **$1k test:** Meta $550 / Reddit $200 / Google Search $150 / one newsletter $100. Expect ~25-50 waitlist signups + 3-8 affiliate apps. GO gate: blended CPL <= $35 and >= 40 signups and >= 3 affiliate apps.
- **Best SMB hook:** *"Rain on your event day? Get paid for it. One flat fee, all the upside if the sun shows up."* (waitlist).
- **Best affiliate hook:** *"Add a recurring-revenue product to your agency: event-based promotions for local businesses - earn recurring commission on every promotion your clients run."* (partner page).
- **Top KPI to watch:** blended **CPL (cost per waitlist signup), target <= $35**, with calculator-start rate (>= 25%) as the leading indicator.

---

## Sources (2026 ad benchmarks + targeting)

- [DigitalApplied - Facebook Ads Benchmarks 2026 (CPC/CPM/CTR by industry)](https://www.digitalapplied.com/blog/facebook-ads-benchmarks-2026-cpc-cpm-ctr-industry)
- [OwlClaw - Meta Ads Benchmarks 2026 (CTR/CPC/CPL/ROAS)](https://owlclaw.com/benchmarks/meta-ads-benchmarks/)
- [AdAmigo - Meta Ads Benchmarks 2026 by Objective & Placement](https://www.adamigo.ai/blog/meta-ads-benchmarks-2026-by-objective-and-placement)
- [WebFX - Meta Marketing Benchmarks 2026](https://www.webfx.com/blog/social-media/meta-benchmarks/)
- [WordStream - Google Ads Benchmarks 2026](https://www.wordstream.com/blog/2026-google-ads-benchmarks)
- [ALM Corp - Google Ads Benchmarks 2026 (23 industries)](https://almcorp.com/blog/google-ads-benchmarks-2026/)
- [LocalIQ - Search Advertising Benchmarks 2026](https://localiq.com/blog/search-advertising-benchmarks/)
- [Benly - Reddit Ads Cost Benchmarks 2026 (CPC/CPM/CPA)](https://benly.ai/learn/reddit-ads/reddit-ads-cost-benchmarks)
- [Stackmatix - Reddit Ads CPC/CPM Benchmarks vs other platforms](https://www.stackmatix.com/blog/reddit-ads-cpc-cpm-benchmarks)
- [Stackmatix - LinkedIn Ads Cost 2026](https://www.stackmatix.com/blog/linkedin-ads-cost)
- [Postiv - LinkedIn Advertising Costs 2026 (CPC/CPM/CPL by industry)](https://postiv.ai/blog/linkedin-advertising-costs)
- [Stackmatix - TikTok Ads Cost 2026](https://www.stackmatix.com/blog/tiktok-ads-cost-budget-guide-2026)
- [Improvado - Twitter/X Ads Guide 2026 (costs/targeting)](https://improvado.io/blog/twitter-ads-guide)
- [WebFX - How Much Does It Cost to Advertise on X in 2026](https://www.webfx.com/social-media/pricing/how-much-does-it-cost-to-advertise-on-twitter/)
- [Power Digital - Nextdoor Advertising Cost](https://powerdigitalmarketing.com/blog/nextdoor-advertising-cost/)
- [Nextdoor Advertising Agency - Average CPC on Nextdoor](https://www.nextdooradvertisingagency.com/resources/understanding-the-average-cost-per-click-on-nextdoor-ads-what-you-can-expect-for-your-campaigns)
- [SkylineSocial - How To Target Business Owners on Facebook Ads 2026](https://www.skylinesocial.com/target-business-owners-facebook-ads/)
- [LeadEnforce - Target US Small Business Owners with Facebook Ads](https://leadenforce.com/blog/how-to-target-us-small-business-owners-using-facebook-ads)
- [TripleBlossom - Targeting Job Titles & Employers on Facebook Ads](https://tripleblossom.com/facebook-ads-job-titles-employers-targeting/)
