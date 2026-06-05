# Hedgerow — World Cup 2026 + "Seasonal Events" Campaign Plan

Status: PLAN + MOCKUPS for Master review. Nothing built/deployed yet.
Date: 2026-06-04. World Cup 2026 opens ~June 11 (USA/Canada/Mexico co-hosted). Final ~July 19.

## 0. Locked constraints (from Master, 2026-06-04)

1. **Demand validation ONLY.** No fees bound, Stripe stays sandbox. Public surface captures
   waitlist / "register interest" / LOIs only. Banned words stay banned
   (insurance, coverage, policy, premium, guarantee, bet, wager, odds in copy). Position as a
   "risk-free hype" marketing tool: "you pay one flat fee, we fund the payout."
2. **Everything stays gated.** The interactive calculator + any binding stay behind Cloudflare
   Access. The campaign's only public surface is a minimal waitlist capture. Country pages are
   designed now; whether they go public (as waitlist-only) is a later Master decision.
3. **This pass = plan + mockups.** Build only after approval + Gemini review.
4. **Targets:** Mexico, Brazil, Argentina, Italy, Portugal/Spain, USA.

### The core tension to resolve before any traffic
"Go viral" needs public pages; Master kept everything gated. Reconciliation in this plan:
virality lives **off-site** (TikTok/IG/X/FB content) and drives to a **single minimal public
waitlist landing** (we already expose `/api/waitlist` publicly). The rich country pages are
built/staged behind the gate; a stripped **public waitlist variant** per country can be switched
on later with one Master decision. KPI for this phase is **signups / LOIs / engagement**, not
revenue — we are building the launch list for when counsel clears.

## 1. Why a "Seasonal Events" shelf (not just another sport)

Tentpole events (World Cup, Olympics, Super Bowl, March Madness, the Masters) share traits that
make them a distinct product surface, not just rows in the Sports category:

- **Massive, time-boxed attention** → urgency/scarcity ("only during the World Cup") is itself a
  conversion lever.
- **Cross-vertical pull** — every restaurant/bar/retailer can tie in, not just sports bars.
- **Curation required** — only a subset of outcomes are cleanly priceable + hedgeable. A curated
  shelf lets us pre-vet markets (moneyline / advance-a-round / win-it-all) and exclude the
  casino-flavored ones (margins, props) that violate the clean-binary design rule.
- **Diaspora/identity energy** — national-team promos are inherently shareable in a way
  "rain on Saturday" is not. This is the viral fuel.

### Where it lives
- **Nav + homepage:** a "Seasonal" nav item and a homepage banner ("World Cup 2026 promos — the
  whole tournament, one flat fee"). Time-gated; auto-hides when no tentpole is active.
- **Calculator dropdown:** add a category **"Seasonal Events"** alongside Sports/Weather/Fuel/Custom.
  Selecting it reveals a curated event picker (World Cup 2026 → matchup/round autocomplete scoped
  to live WC markets via the existing `/api/markets`). Architecturally it reuses the Sports pricing
  path (Polymarket/Kalshi), so no new pricing engine — just curation + framing.
- **Config-driven:** one `seasons.json` (event, window, markets, copy) so Olympics 2026, Super Bowl
  LXI, March Madness 2027 drop in without code changes.

## 2. The economics gotcha (drives every promo example)

Premium scales with probability. We only pitch **long-odds** promos so the fee is small enough that
a merchant says yes, and so there is a real market to price/hedge:

| Promo type | Approx odds | Fee as % of payout | Merchant appetite |
|---|---|---|---|
| "Team wins THIS match" | ~coin flip | ~57-63% | No — too expensive |
| "Team wins the GROUP" | ~30-45% | ~40-55% | Weak |
| "Team reaches SEMIFINAL" | ~12-20% | ~18-28% | Good |
| "Team WINS the World Cup" | ~6-12% | ~9-16% | Best — cheap, dramatic |
| "Team A beats rival Team B" (specific knockout) | varies | varies | Good for rivalry hype |

Rule for all creative: **the headline outcome must be a clean yes/no with a live tradeable market,
and long-odds enough that the fee reads as cheap.** "Free pizza if Italy wins the Cup" works.
"Free pizza if Italy wins tonight" does not (and we don't show it).

## 3. Country team landing pages

Six pages, all generated from one `countries` config (flag, palette, cuisine, sample promo, host
cities with big diaspora). URL: `/worldcup/<country>` (gated now; public waitlist-only variant later).

### Page anatomy (same template, country-skinned)
1. **Hero** in national colors + flag motif. Headline: *"Turn every {Country} match into your busiest
   day — risk-free."* Subhead frames the flat-fee/we-fund-the-payout mechanic.
2. **The signature promo** (cuisine-tuned, long-odds): see mapping below. Shown as a branded promo
   card (the same artifact the merchant can generate & share).
3. **How it works, 3 steps:** Design the deal → Pick the long-odds trigger → Pay one flat fee, we
   fund the payout within 24 hours.
4. **"Why it's cheap" callout:** "{Country} to win it all is about a 1-in-N shot, so your flat fee
   starts around $X on $2,500 of free {dish}." (Numbers shown only as illustrative ranges on the
   gated page; public variant shows no number, just "get a sample quote.")
5. **Merchant CTA:** "Join the founding-business waitlist" + "See a sample promo for my {cuisine}
   spot." No binding, no checkout.
6. **Honest social proof (zero fabrication):** "Be the first {cuisine} spot in {city} to run one."
   No fake counts/testimonials.
7. **Compliance footer:** "Not an offer of insurance or coverage. A marketing tool — you set the
   deal, we fund the payout."

### Vertical → country → signature promo mapping
| Country | Palette | Beachhead verticals | Signature long-odds promo |
|---|---|---|---|
| **Mexico** | green/white/red | Taquerias, Mexican restaurants, bars (huge US diaspora + co-host) | "Free taco platter if Mexico reaches the semifinals" |
| **Brazil** | green/yellow/blue | Churrascarias, Brazilian steakhouses, juice bars | "Free picanha skewer if Brazil wins the Cup" |
| **Argentina** | sky-blue/white | Parrillas, empanada shops, Argentine grills | "Empanadas on us if Argentina wins the Cup" |
| **Italy** | green/white/red | Pizzerias, trattorias, gelato shops | "Free pizza if Italy wins the Cup" |
| **Portugal/Spain** | red-green / red-yellow | Tapas bars, Iberian restaurants, bakeries | "Free tapas round if Spain (or Portugal) wins the Cup" |
| **USA** | red/white/blue | Sports bars, wings, pizza — nationwide, cuisine-agnostic | "Free wings if the USA reaches the knockout round" |

(Mexico is the single strongest beachhead: largest US diaspora, co-host nation, dense taqueria
vertical.)

## 4. The viral marketing plan (X, TikTok, Facebook, Instagram)

### The loop (this is the whole strategy)
Fans are the megaphone; merchants are the customer. Content makes **fans** want the promo →
fans **tag** their favorite local restaurant → the restaurant gets organic inbound demand →
the restaurant **joins the waitlist**. We never have to cold-pitch if the fans do it for us.

```
 Fan content (TikTok/IG/X/FB)  ->  "tag a spot that should do this"
            ^                                     |
            |                                     v
   merchant posts their card  <-  merchant joins waitlist / makes promo card
```

### Per-channel role
- **TikTok / IG Reels (primary, fan-side):** short POV/skit format. *"POV: your taqueria says tacos
  are free if Mexico makes the semis."* Creator-led, diaspora-community energy, country hashtags +
  #WorldCup2026. The "tag a business that should do this" CTA is the reach engine. Goal: fan demand.
- **Facebook (primary, merchant-side):** this is where independent restaurant owners actually are.
  Restaurant-owner Groups, local business groups, and FB/IG interest-targeted ads ("restaurant
  owner" + cuisine). Direct B2B: "Make the World Cup your busiest month without risking your margin."
- **Instagram (visual proof):** promo-card mockups, food-influencer partnerships per diaspora
  community, story polls ("should {local spot} run this?").
- **X (operator + build-in-public):** B2B operator threads, spicy "here's the math on a risk-free
  World Cup promo" takes, and the build-in-public Hedgerow origin story. Lower volume, higher-signal.

### Viral mechanics (the shareable artifacts)
1. **"Tag a business" challenge** — consumer-side, drives organic reach and creates merchant inbound.
2. **Free promo-card generator** — merchant types their deal → gets a branded, on-palette social card
   to post. Free distribution for us; each generation is a soft demand signal/lead. (This is the
   single highest-leverage build — it's the viral seed AND a lead capture in one.)
3. **Country "want-meter" leaderboard** — "Which fan base wants this most?" Email = a vote. Captures
   the waitlist while creating rivalry-driven sharing.
4. **Micro-influencer seeding** — food + sports creators per diaspora community (Mexican-American
   food TikTokers, etc.); cheaper and higher-trust than broad ads.
5. **Reactive result content** — after each big match, a same-day card: "If {spot} had run this,
   {neighborhood} would've eaten free tonight." Keeps momentum through the knockouts.

### Compressed calendar (1 week to kickoff — aim virality at the knockouts)
- **Now → June 11 (pre-tournament):** ship public waitlist landing + country pages (gated) + promo-
  card generator; seed influencers; start "tag a business" + want-meter. Build the list.
- **June 11 → 28 (group stage):** reactive content per result; push FB merchant ads; collect LOIs.
- **Late June → mid-July (knockouts):** PEAK push — long-odds promos are most relevant and most
  dramatic here; this is where a clip can break out.
- **~July 19 (final):** climax content; convert the warmed list into "first to run one when we open."

### KPI (phase = demand validation)
Waitlist signups, LOIs, promo-cards generated, "tag"/share engagement, want-meter votes per country.
**Not** revenue. Target gate to graduate to a real launch (post-counsel): e.g. ≥X signups, ≥Y LOIs,
≥Z cards generated, CPL ≤ $35 (reuse the gtm-paid-ads GO/NO-GO bar).

## 5. Compliance guardrails (apply to every page + every post)

- No insurance / coverage / policy / premium / guarantee / bet / wager / odds in public copy.
- Use: "risk-free hype," "we fund the payout," "one flat fee," "register your interest."
- No fabricated counts, testimonials, or names (hard rule).
- "Not an offer of insurance or coverage" disclaimer on every public page + ad landing.
- "Register interest" / "join the waitlist" — never "buy," "get coverage," or "bind."
- Sports outcomes only as clean yes/no with a live market (no margins/props).

## 6. What I build on approval (scoped)

1. `seasons.json` + "Seasonal Events" calculator category + WC event templates (gated, reuses
   Sports pricing path).
2. `countries` config + one country-page template → 6 skinned pages (gated), plus a stripped
   **public waitlist variant** ready to flip on.
3. **Promo-card generator** (the viral seed + lead capture) — branded, on-palette, downloadable card.
4. Want-meter leaderboard + per-country waitlist `source` tags for attribution.
5. Ad-creative pack per channel (extends existing `ad-creative-pack.md`) with UTM'd links.

## 7. Open decisions / risks for Master

- **Domain:** no public domain purchased yet (hedgerow.com taken; hedgerowhq/usehedgerow/etc.
  available). A public viral campaign needs one shareable URL. **Decision needed.**
- **SMTP still not live** — waitlist confirmation email can't send (help@hedgerow.com is a
  placeholder, domain not owned). A campaign that captures emails but never confirms looks broken.
- **Gated vs public:** as built, the public literally can't see the country pages. To get any viral
  benefit we need at least the public waitlist landing live. Confirm we flip that on.
- **1-week runway:** realistic breakout window is the knockouts (July), not the June 11 opener. Set
  expectations accordingly.
- **Olympics note:** Winter Olympics 2026 (Milan-Cortina) was Feb 2026 (passed); next tentpole after
  the World Cup is likely Super Bowl LXI (Feb 2027) — the seasonal shelf should be built generic so
  it carries forward, but World Cup is the only live tentpole right now.

## 8. Gemini 3.1 Pro adversarial review — accepted revisions (2026-06-04)

Ran the plan past Gemini 3.1 Pro. It surfaced several things sharper than the draft. Accepted changes:

1. **Promo-card generator = naked-risk liability.** In demand-validation mode we are NOT live to take
   the other side. If a merchant posts a real "free tacos if Mexico wins" card and Mexico wins, the
   merchant eats it and blames us. FIX: the generator must NOT output a live promo. It outputs either
   (a) a watermarked "PROPOSAL / not yet live" card, or better (b) a **"Vote for us to run this"
   poll/petition graphic** the merchant uses to test their own audience. This also feeds mechanic #5.

2. **Mechanic flip — the "Hostage/Petition" funnel (replaces naive 'tag a business').** Consumers
   won't click through to a B2B fintech page. Instead: Hedgerow hosts a public petition *"Tell
   {local taqueria} to give free tacos if Mexico wins."* Fans sign (we collect local emails by
   merchant). Then Hedgerow cold-emails the owner: *"300 of your customers just asked for this — we
   can facilitate it for one flat fee. Join the waitlist to claim that demand."* Hands the merchant a
   pre-warmed buyer list = a far stronger B2B pitch. This becomes the spine of the viral plan.

3. **Promo MECHANICS = conditional rebate on a PAST purchase, not a future free-for-all.** "Free
   pizza if Italy wins" as a day-after giveaway = a line around the block, blown inventory, angry
   locals. Reframe every example as: *"Buy during the tournament, keep your receipt — if {team} wins
   we refund your order."* Drives spend NOW (the merchant's actual goal) and bounds fulfilment.

4. **Liquidity is thin for granular WC props.** Aggregated viral demand would slip Kalshi/Polymarket
   prices and break the "cheap flat fee." FIX + turn into a lever: **Capacity Tranches** — "only
   $X of payout capacity per team; join the waitlist to lock a spot." Real constraint, real FOMO.

5. **Regulatory copy is still too close to the line (substance over form).** Even our existing
   approved phrases read as indemnification: **"risk-free"** implies removing financial loss =
   insurance; **"we fund the payout within 24 hours"** reads like a policy promise. Gemini's safer
   swaps: "fixed-cost promotion" / "cap your promo budget" / "we supply the prize capital" / "we
   handle the backend." And the waitlist disclaimer should say the **product does not exist yet**:
   *"Hedgerow is in development. Joining the waitlist is not a binding contract or a guarantee of
   future service."* >>> DECISION FOR MASTER + COUNSEL: this contradicts the currently-shipped
   "risk-free hype / we fund the payout" framing; needs sign-off before I rewrite live copy.

6. **Polymarket blocks US users (CFTC exposure).** A US entity offloading US-merchant risk via
   Polymarket walks into a regulatory buzzsaw. For this campaign, lay-off discussion stays
   **Kalshi-only**, and we must verify Kalshi actually lists the specific granular WC markets
   (semifinal/winner) with real depth before promising those promos. (Internal note; never named in copy.)

7. **Merchant verification friction.** If it goes viral, fans will pose as owners to see pricing. Add
   a light gate on the merchant waitlist (link Google Business profile or business email domain).

8. **Focus the 7-day runway.** Gemini's highest-leverage call: DROP the 6-country multi-build for now.
   Pick **one country + one vertical + one city** (Mexican taquerias in LA or Texas — biggest, most
   obvious WC use-case), buy a domain today, point ~$500 of FB/IG ads at those specific owners, and
   prove you can get ~50 LOIs. If the most obvious use-case won't sign, the seasonal shelf is moot.
   The 6-country template + generic seasonal config become Phase 2 once the single-city proof works.

**Net:** the seasonal-shelf concept and country-page design survive review; the *go-to-market* gets
re-pointed (petition funnel, single-city focus, rebate mechanics, capacity tranches) and the *copy*
needs a counsel-gated tightening before anything public ships.

## 9. Master decisions, round 2 (2026-06-04) — these are now binding on the build

1. **Copy: tighten, but gate on counsel.** Safer phrasing drafted, NOT shipped. The live site's
   "we pay your business the payoff to cover it within 24 hours" reads as indemnity in substance.
   Mapping + the real legal questions are in `copy-counsel-review.md` (the deliverable for the FL
   attorney). No live rewrite until counsel signs off.
2. **Focus: Mexican taquerias, three metros (2026-06-04 update).** Drop the 6-country multi-build for
   Phase 1; one country (Mexico), one vertical (taquerias/Mexican restaurants), THREE metros.
   **Recommended trio: Los Angeles, Houston, Chicago** — the actual top US metros for Mexican-origin
   population (greater LA ~14% of all Mexican immigrants, Chicago ~6%, Houston ~5%, per MPI/Census).
   LA + Houston are also 2026 World Cup host cities. **Florida is OUT** — its Hispanic base is Cuban /
   Puerto Rican / Venezuelan, not Mexican (Miami hosts matches but the Mexico-team play underperforms
   there). Alt trio if host-city match-day buzz is the priority: LA + Houston + **Dallas** (Dallas
   hosts 9 matches incl a semifinal), dropping Chicago. Goal ~50 LOIs across the three. 6-country
   template + seasonal config remain Phase 2.
3. **Domain: don't buy yet.** Everything stays on the gated tunnel. No public landing, no paid ads
   for now → the viral/petition mechanics are designed but **parked** until a domain + counsel clear.

### Resulting critical path (blocked items first)
- [ ] FL counsel reviews `copy-counsel-review.md` (gates everything public). **BLOCKER.**
- [ ] (after counsel) confirm the three metros (rec: LA + Houston + Chicago), buy a domain, SMTP live (help@ mailbox).
- [ ] (after domain) build single hard-coded taqueria page + petition page + capacity-tranche waitlist.
- [ ] (after page) ~$500 FB/IG ads at taqueria owners; measure LOIs vs the GO bar.
- Parked until proof: 6-country template, seasonal shelf generalization, promo-card generator
  (rebuilt as a watermarked "proposal"/petition graphic, never a live promo).
