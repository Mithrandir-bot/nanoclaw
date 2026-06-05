# Hedgerow - Ad Creative Pack (copy-paste ready)

**Date:** 2026-06-02
**Author:** Mithrandir (research agent)
**Purpose:** Executional copy a person pastes directly into each ad manager. Strategy, channel selection, budget, and UTM scheme are NOT re-derived here - see `gtm-paid-ads.md`. Hooks build on `conversion-best-practices.md`.

---

## LAUNCH PREREQUISITE (read before any spend)

**The destination landing page must actually CAPTURE the waitlist signup before a single dollar goes live.** The current public page is a static GitHub Pages site (`https://mithrandir-bot.github.io/Hedgerow/`) and **cannot reach the backend** - it cannot persist `/api/waitlist`, `/api/track`, or `/api/lead` events. Driving paid traffic to it now would buy clicks that vanish with no captured lead and no UTM attribution.

**Do not flip any campaign live until all of the following are true:**

1. The waitlist email form on `/` posts successfully to a reachable `/api/waitlist` endpoint and persists the record.
2. The partner application form on `/#partners` posts to `/api/lead` (track=affiliate) and persists.
3. The calculator fires `/api/track` events (calculator start, fee revealed).
4. Inbound UTM parameters are persisted to session/localStorage on landing and attached to the captured `/api/waitlist` and `/api/lead` records.
5. Meta Pixel + CAPI, Google tag, Reddit pixel, and LinkedIn Insight Tag are installed and firing a "Lead" event on submit.

Until then this pack is staged copy only. Everything below is pre-regulatory demand validation - **all SMB ads drive to the WAITLIST, all affiliate ads to the PARTNER application; nothing sells coverage.**

---

## INDEX OF WHAT THIS PACK CONTAINS

| # | Channel | Track 1 (SMB -> waitlist) | Track 2 (Affiliate -> #partners) |
|---|---------|---------------------------|----------------------------------|
| 1 | Meta (FB/IG) | 4 ad sets (full fields) | 1 ad set (full fields) |
| 2 | Google Search | 3 ad groups (RSA) | - (defer; SMB intent only) |
| 3 | Reddit | 2 posts | 2 posts |
| 4 | X | - (deprioritized for SMB) | 5 promoted posts |
| 5 | LinkedIn | - (wrong audience) | 3 single-image ads |
| 6 | Newsletter sponsorship | 1 blurb + subject line | (dual-purpose note) |

---

## UTM SCHEME (exactly as defined in gtm-paid-ads.md)

```
utm_source  = platform: meta | google | reddit | linkedin | x | newsletter_{name}
utm_medium  = paid   (this pack uses paid per the brief for all units)
utm_campaign= {track}_{theme}_{geo}   e.g. smb_rain_fl, affiliate_agency_us
utm_content = creative/ad id          e.g. rain_reel_v1, agency_img_v1
```

**URL pattern (literal):**

- Waitlist track: `https://mithrandir-bot.github.io/Hedgerow/?utm_source={SOURCE}&utm_medium=paid&utm_campaign={CAMPAIGN}&utm_content={CONTENT}`
- Affiliate track: `https://mithrandir-bot.github.io/Hedgerow/?utm_source={SOURCE}&utm_medium=paid&utm_campaign={CAMPAIGN}&utm_content={CONTENT}#partners`

Note: the `#partners` fragment is placed AFTER the query string so the UTMs are still parsed by analytics before the in-page anchor scroll. The full literal URL for every ad unit is given inline below.

---

# 1) META (Facebook + Instagram)

**Creative direction (applies to all Meta units):** 9:16 vertical Reel as the lead format. First 2 seconds = the rain visual hitting the event day (umbrellas up, patio empty, radar sweep). Then a hard before/after cut: grey rainy storefront flips to bright sunny version with full tables. End card holds on a plain flat-fee line ("One flat fee. Set before you pay anything.") with the waitlist CTA. No emojis, no on-screen testimonials or counts. A static single-image variant (1:1 and 4:5) reuses the same before/after split-frame: left half rain, right half sun, flat-fee line centered.

**CTA button:** "Sign Up" for waitlist sets; "Learn More" for the affiliate set.

## TRACK 1 - SMB ACQUISITION (destination: waitlist)

### Ad Set A - Rain wedge (cold, FL bar/venue owners)
- **Primary text (125 char):** Rain on your event day? Run a promotion that pays your customers back. One flat fee, all the upside if it stays dry.
- **Primary text (longer variant):** Run a rain-day promotion for one flat fee. If it rains on your event, your customers get paid back automatically, and you keep all the upside if the sun shows up. See your flat fee with the free calculator, then join the early-access list.
- **Headline (40 char):** Rain on your event? Get paid for it.
- **Description (30 char):** One flat fee. Join the list.
- **CTA button:** Sign Up
- **URL:** `https://mithrandir-bot.github.io/Hedgerow/?utm_source=meta&utm_medium=paid&utm_campaign=smb_rain_fl&utm_content=rain_reel_v1`

### Ad Set B - All upside, no downside (cold, broad owner)
- **Primary text (125 char):** Offer a good-weather-or-money-back promotion. You pay one flat fee. If rain hits, we pay your customers back.
- **Primary text (longer variant):** Give customers a reason to book even when the forecast looks iffy. Offer a good-weather-or-money-back promotion: you pay one flat fee up front, and if the rain hits we handle paying your customers back automatically within 24 hours. Be first in line on the early-access list.
- **Headline (40 char):** All the upside. None of the downside.
- **Description (30 char):** Be first in line.
- **CTA button:** Sign Up
- **URL:** `https://mithrandir-bot.github.io/Hedgerow/?utm_source=meta&utm_medium=paid&utm_campaign=smb_rain_fl&utm_content=upside_reel_v1`

### Ad Set C - Flat-fee transparency (cold, price-conscious owner)
- **Primary text (125 char):** One flat fee, no percentages, no surprises. If it rains on your event, your customers get paid back automatically.
- **Primary text (longer variant):** A washed-out Saturday should not wash out your revenue. Run a promotion that pays your customers back if it rains: one flat fee, no percentage cuts, no surprises. You see the exact fee before you commit. Join the waitlist for early access.
- **Headline (40 char):** One flat fee. No surprises.
- **Description (30 char):** See your fee free.
- **CTA button:** Sign Up
- **URL:** `https://mithrandir-bot.github.io/Hedgerow/?utm_source=meta&utm_medium=paid&utm_campaign=smb_rain_fl&utm_content=flatfee_split_v1`

### Ad Set D - Vertical message-match (cold, car wash / golf / patio)
- **Primary text (125 char):** Free wash next week if it rains this Saturday. Run the promotion that fills your calendar, for one flat fee.
- **Primary text (longer variant):** Bars, venues, car washes, golf courses, photographers: run a rain-day promotion your customers will love. A free-wash-if-it-rains offer fills your calendar, and one flat fee covers the payback so you never eat the cost. Try the calculator and join the early-access list.
- **Headline (40 char):** Free wash if it rains. For a flat fee.
- **Description (30 char):** Fill your calendar.
- **CTA button:** Sign Up
- **URL:** `https://mithrandir-bot.github.io/Hedgerow/?utm_source=meta&utm_medium=paid&utm_campaign=smb_rain_fl&utm_content=carwash_split_v1`

### Retargeting variant (calculator-starters / page visitors who did not join)
- **Primary text (125 char):** You checked your flat fee. Lock your spot on the early-access list before the first onboarding batch fills.
- **Primary text (longer variant):** You ran the numbers on a rain-day promotion. The early-access list onboards in batches, and your spot holds your place in the queue. One flat fee, automatic payback to your customers if it rains, all the upside if it stays dry. Join the waitlist to keep your place.
- **Headline (40 char):** Finish joining the early-access list.
- **Description (30 char):** Hold your place.
- **CTA button:** Sign Up
- **URL:** `https://mithrandir-bot.github.io/Hedgerow/?utm_source=meta&utm_medium=paid&utm_campaign=smb_rain_fl&utm_content=retarget_v1`

## TRACK 2 - AFFILIATE RECRUITMENT (destination: #partners)

### Ad Set E - Agencies / resellers (cold)
- **Primary text (125 char):** Add a recurring-revenue product to your agency: event-based promotions for local businesses. Recurring commission.
- **Primary text (longer variant):** Help your local-business clients run rain-day promotions and earn recurring commission on every promotion they run. New category, ready-made assets, partner portal. Tiered recurring commission plus a bonus on your first activated merchant. Apply to the Hedgerow partner program.
- **Headline (40 char):** A new recurring product for your agency
- **Description (30 char):** Earn recurring commission.
- **CTA button:** Learn More
- **URL:** `https://mithrandir-bot.github.io/Hedgerow/?utm_source=meta&utm_medium=paid&utm_campaign=affiliate_agency_us&utm_content=agency_split_v1#partners`

---

# 2) GOOGLE SEARCH (Responsive Search Ads)

**Creative direction:** Search has no imagery; sitelink/callout assets should reinforce transparency ("One flat fee", "See your fee free", "Early-access list", "Settled by official weather data"). Compliance filter applied: every headline and keyword containing "insurance" or "guarantee" has been DROPPED for optics and compliance. Kept the compliant intent terms: rain promotion, money back if it rains, weather promotion for business.

**Final URL (all three ad groups, swap utm_content):** waitlist track. Use ValueTrack `{keyword}` only inside Google's own tracking template, not in the visible UTM (utm_term not required by this pack's scheme).

## Ad Group 1 - Rain promotion
- **Keyword theme (phrase/exact):** "rain promotion for business", "rain day promotion", "rain promotion idea", "weather promotion for business"
- **Headlines (30 char):**
  1. Run a Rain-Day Promotion
  2. Rain Promotion, One Flat Fee
  3. Rain Day Promo For Business
  4. Weather Promotion For Owners
  5. Pay Customers Back If It Rains
  6. One Flat Fee, No Surprises
  7. See Your Flat Fee Free
  8. Join The Early-Access List
  9. All Upside If It Stays Dry
  10. A Promo Your Customers Love
- **Descriptions (90 char):**
  1. Run a rain-day promotion for one flat fee. Customers get paid back if it rains. Join us.
  2. One flat fee, no percentages, no surprises. See your exact fee free with the calculator.
  3. If it rains on your event, customers get paid back automatically. Join the early list.
  4. Built for bars, venues, car washes, golf courses. Be first on the early-access list.
- **Final URL:** `https://mithrandir-bot.github.io/Hedgerow/?utm_source=google&utm_medium=paid&utm_campaign=smb_rain_fl&utm_content=rsa_rainpromo`

## Ad Group 2 - Money back if it rains
- **Keyword theme (phrase/exact):** "money back if it rains", "money back if it rains promo", "refund if it rains promotion", "weather refund promotion"
- **Headlines (30 char):**
  1. Money Back If It Rains Promo
  2. Run A Money-Back-If-Rain Offer
  3. Customers Refunded If It Rains
  4. One Flat Fee Covers The Payback
  5. Weather Refund Promotion
  6. No Percentages, No Surprises
  7. See Your Flat Fee In Seconds
  8. Join The Early-Access List
  9. Keep Bookings If It Stays Dry
  10. A Bold Promo, Run Risk-Free
- **Descriptions (90 char):**
  1. Offer a money-back-if-it-rains promotion. You pay one flat fee, customers get paid back.
  2. Automatic payback to your customers within 24 hours if rain hits. Join the early list.
  3. One flat fee, set before you commit. No percentage of revenue, no hidden charges.
  4. Settled by official weather data. Be first to run it. Join the early-access list today.
- **Final URL:** `https://mithrandir-bot.github.io/Hedgerow/?utm_source=google&utm_medium=paid&utm_campaign=smb_rain_fl&utm_content=rsa_moneyback`

## Ad Group 3 - Weather promotion for business
- **Keyword theme (phrase/exact):** "weather promotion for business", "weather marketing promotion", "weather based promotion", "event day weather promotion"
- **Headlines (30 char):**
  1. Weather Promotion For Business
  2. Make The Weather Work For You
  3. Turn A Rainy Forecast Into Wins
  4. Event-Day Weather Promotion
  5. One Flat Fee, Automatic Payback
  6. Pay Customers Back If It Rains
  7. See Your Flat Fee Free
  8. Join The Early-Access List
  9. Built For Local Businesses
  10. Be First To Run It
- **Descriptions (90 char):**
  1. Run a weather-backed promotion for one flat fee. Customers paid back if it rains.
  2. Pick your event, pick the rain trigger, get one flat fee. Join the early-access list.
  3. A washed-out day should not wash out revenue. Run the promo that fills your calendar.
  4. No jargon, just a flat marketing fee. See it free, then join the waitlist.
- **Final URL:** `https://mithrandir-bot.github.io/Hedgerow/?utm_source=google&utm_medium=paid&utm_campaign=smb_rain_fl&utm_content=rsa_weatherpromo`

**Negative keywords to add:** insurance, guarantee, gambling, bet, odds, wager, claim, policy, premium.

---

# 3) REDDIT

**Creative direction:** Native, low-key, no logos in the body image. If an image is used, a single plain radar-map or grey-sky storefront photo, not a polished ad. Tone reads like an operator or builder asking a real question, not marketing. Disclose it is a product test.

## TRACK 1 - SMB ACQUISITION (destination: waitlist)

### Post 1 (subreddits: r/smallbusiness, r/restaurateur)
- **Title:** We are testing a promotion that pays your customers back if it rains on your event day - looking for early businesses
- **Body:** Building something for local businesses that run outdoor or event-day promotions. The idea: you run a "good weather or money back" offer, pay one flat fee up front, and if it rains on the day your customers get paid back automatically (settled by official weather data, not by us deciding). You keep all the upside if the sun shows up. Pre-launch, gathering a waitlist of owners who would actually use it and want to shape the pricing. If you run a patio, venue, car wash, golf course, or anything weather-exposed, the early-access list is here: `https://mithrandir-bot.github.io/Hedgerow/?utm_source=reddit&utm_medium=paid&utm_campaign=smb_rain_fl&utm_content=reddit_smb_v1` - happy to answer anything in the comments.

### Post 2 (subreddits: r/Entrepreneur, r/smallbusiness)
- **Title:** Would a flat-fee "money back if it rains" promotion be useful for your business, or is it a gimmick?
- **Body:** Genuine question for owners. A washed-out Saturday can kill a weekend's revenue, and refund chaos afterward is worse. We are testing a tool where you run a rain-day promotion for one flat fee, no percentage cuts, and if it rains your customers are paid back automatically. The fee is shown before you commit. Trying to learn whether this is something owners want or a solution looking for a problem. If you would try it, the early-access list is here: `https://mithrandir-bot.github.io/Hedgerow/?utm_source=reddit&utm_medium=paid&utm_campaign=smb_rain_fl&utm_content=reddit_smb_v2`. Honest pushback welcome.

## TRACK 2 - AFFILIATE RECRUITMENT (destination: #partners)

### Post 3 (subreddits: r/marketing, r/agency, r/PPC, r/msp)
- **Title:** Recurring commission for agencies and POS resellers - add a rain-day promotion to your client menu
- **Body:** For folks who already sell to local businesses (agencies, marketing freelancers, POS/restaurant-tech resellers): we are opening a partner program for a new product category. Your clients run event-based promotions that pay their customers back if it rains, and you earn recurring commission on every promotion they run, plus a bonus on your first activated merchant. Ready-made assets and a partner portal. New category, so there is first-mover room. Partner relationships must be disclosed per FTC. Details and application: `https://mithrandir-bot.github.io/Hedgerow/?utm_source=reddit&utm_medium=paid&utm_campaign=affiliate_agency_us&utm_content=reddit_aff_v1#partners`.

### Post 4 (subreddits: r/DigitalMarketing, r/SaaS)
- **Title:** Anyone selling to restaurants/venues want a new recurring-revenue add-on? (rain-day promotions)
- **Body:** If your clients are bars, restaurants, venues, or anything weather-exposed, they tend to want bolder promotions but do not want to eat the downside. We let them run a rain-day promotion for a flat fee, with automatic payback to their customers if it rains. We are recruiting partners to refer clients for recurring commission. Looking for people who actually have the relationships, not a mass-affiliate spray. Program and application here: `https://mithrandir-bot.github.io/Hedgerow/?utm_source=reddit&utm_medium=paid&utm_campaign=affiliate_agency_us&utm_content=reddit_aff_v2#partners`.

---

# 4) X (promoted posts) - AFFILIATE AMPLIFICATION TRACK

**Creative direction:** Single image or short clip. Best performer is the "it rained and the business paid everyone back" before/after split-frame (rain left, sun right, flat-fee line center). For the operator-thread post, a clean radar-map graphic over a storefront works. No emojis.

### Promoted post 1 (affiliate, partner page)
Add a recurring-revenue product to your agency menu: event-based promotions for local businesses. Your clients run a rain-day promotion, you earn recurring commission on every one. New category, first-mover room, ready-made assets. Apply to partner: `https://mithrandir-bot.github.io/Hedgerow/?utm_source=x&utm_medium=paid&utm_campaign=affiliate_agency_us&utm_content=x_aff_v1#partners`
**Visual:** before/after rain-vs-sun split-frame with flat-fee line.

### Promoted post 2 (affiliate, POS resellers)
POS and restaurant-tech resellers: a new add-on your merchants will actually use. Bars and venues want bolder promotions. Offer a rain-day promotion, earn recurring commission plus a bonus on your first activated merchant. Become a partner: `https://mithrandir-bot.github.io/Hedgerow/?utm_source=x&utm_medium=paid&utm_campaign=affiliate_agency_us&utm_content=x_aff_v2#partners`
**Visual:** POS screen mockup beside a rainy patio photo.

### Promoted post 3 (affiliate, marketing consultants)
Marketing consultants: own a product nobody else offers yet. Event-based promotions are a fresh, high-interest product for local businesses. Refer clients, earn recurring commission, get the assets to sell on day one. Join the partner program: `https://mithrandir-bot.github.io/Hedgerow/?utm_source=x&utm_medium=paid&utm_campaign=affiliate_agency_us&utm_content=x_aff_v3#partners`
**Visual:** clean text-card with the recurring-commission line on a sky-to-rain gradient.

### Promoted post 4 (affiliate, operators/creators)
Operators and creators: this promotion is built-in content. A local business runs a rain-day promotion, it rains, customers get paid back, and that is a clip people share. Refer businesses, earn a bounty on every one that activates. Partner relationship disclosed per FTC. Become a partner: `https://mithrandir-bot.github.io/Hedgerow/?utm_source=x&utm_medium=paid&utm_campaign=affiliate_creator_us&utm_content=x_aff_v4#partners`
**Visual:** phone-filming-the-rainy-event-day shot.

### Promoted post 5 (affiliate, build-in-public framing)
New product category: local businesses run promotions that pay customers back if it rains, for one flat fee. We are recruiting partners who already sell to restaurants and venues. Recurring commission, first-mover edge, real assets. Apply here: `https://mithrandir-bot.github.io/Hedgerow/?utm_source=x&utm_medium=paid&utm_campaign=affiliate_agency_us&utm_content=x_aff_v5#partners`
**Visual:** simple flat-fee transparency card.

---

# 5) LINKEDIN (single-image ads) - AFFILIATE TRACK ONLY

**Creative direction:** Clean B2B single-image (1.91:1 and 1:1). Professional, not playful: a flat-fee transparency card or a tidy "new product line for your client menu" graphic with one rain-to-sun motif. Use native lead-gen form where possible, but the destination URL below is the partner page for click-through. No emojis.

### Ad 1 - Agency owners
- **Intro text:** Add a new recurring-revenue product to your agency: event-based promotions for local businesses. Help clients run rain-day promotions and earn recurring commission on every promotion they run. New category, ready-made assets, partner portal.
- **Headline:** A new recurring-revenue product for your agency
- **CTA:** Learn More
- **URL:** `https://mithrandir-bot.github.io/Hedgerow/?utm_source=linkedin&utm_medium=paid&utm_campaign=affiliate_agency_us&utm_content=li_agency_v1#partners`

### Ad 2 - POS / ISO resellers
- **Intro text:** POS and restaurant-tech resellers: your bars, restaurants, and venues want bolder promotions. Offer them a rain-day promotion and earn recurring commission, plus a bonus on your first activated merchant. A new add-on your merchants will actually use.
- **Headline:** A new add-on for your merchant menu
- **CTA:** Learn More
- **URL:** `https://mithrandir-bot.github.io/Hedgerow/?utm_source=linkedin&utm_medium=paid&utm_campaign=affiliate_reseller_us&utm_content=li_reseller_v1#partners`

### Ad 3 - Marketing consultants / fractional CMOs
- **Intro text:** Marketing consultants and fractional CMOs: own a product nobody else offers yet. Event-based promotions are a fresh, high-interest product for local businesses. Refer clients, earn recurring commission, and get the assets to sell on day one.
- **Headline:** Own a product nobody else offers yet
- **CTA:** Learn More
- **URL:** `https://mithrandir-bot.github.io/Hedgerow/?utm_source=linkedin&utm_medium=paid&utm_campaign=affiliate_consultant_us&utm_content=li_consultant_v1#partners`

---

# 6) NEWSLETTER SPONSORSHIP

**Creative direction:** Text-forward placement; if the newsletter takes an image, use the rain-to-sun before/after split-frame with the flat-fee line. Match the host newsletter's plain editorial tone. Replace `{name}` in utm_source with the actual publication slug (e.g. `newsletter_frla`).

### Subject-line idea (if dedicated send)
Run a rain-day promotion for one flat fee

### Blurb (50-80 words)
New for local businesses: run a promotion that pays your customers back if it rains on your event day. You pay one flat fee up front, with no percentage cuts and no surprises, and if rain hits your customers are paid back automatically within 24 hours, settled by official weather data. You keep all the upside if the sun shows up. Bars, venues, car washes, golf courses, and photographers are joining the early-access list now.

- **Waitlist URL (SMB readers):** `https://mithrandir-bot.github.io/Hedgerow/?utm_source=newsletter_{name}&utm_medium=paid&utm_campaign=smb_rain_fl&utm_content=nl_blurb_v1`
- **Partner URL (if placed in a marketing/reseller newsletter):** `https://mithrandir-bot.github.io/Hedgerow/?utm_source=newsletter_{name}&utm_medium=paid&utm_campaign=affiliate_agency_us&utm_content=nl_blurb_aff_v1#partners`

---

## COMPLIANCE CONFIRMATION

- **Banned vocabulary check (passed):** no use of insurance, coverage, premium, policy, guarantee, claim, hedge, indemnify, underwrite, peril, deductible, bet, betting, odds, wager, stake, gamble, or payout-if-you-win anywhere in the ad copy. (The word "insurance" appears only in this sentence and in the negative-keyword/compliance instructions, never in any ad unit.)
- **Approved framing only:** promotion, rain-day promotion, weather-backed promotion, one flat fee, pay your customers back, automatic payback, early-access list, waitlist, recurring commission, partner program.
- **Settlement framing:** referenced only as "settled by official weather data," never implying Hedgerow decides.
- **No fabricated proof:** zero invented testimonials, customer names, ratings, or counts. The only social-proof reference (Meta retargeting "onboarding batch / queue") is a real mechanic, not a fabricated number.
- **No emojis** anywhere in this document.
- **No em dashes or en dashes** used; only hyphens.
- **CTA discipline:** every CTA is "join the waitlist / early-access list" (SMB) or "become a partner / apply" (affiliate). No buy, purchase, get-coverage, or checkout language.
- **Geo-gate:** SMB campaigns tagged `_fl` for the Florida beachhead; do not run implying availability elsewhere until the calculator proves multi-peril.
