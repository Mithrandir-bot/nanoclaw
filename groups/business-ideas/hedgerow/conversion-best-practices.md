# Hedgerow Landing Page — Conversion Best-Practices Playbook

Researched from top consumer fintech / retail-financial sites (Chime, Cash App, Revolut, SoFi,
Affirm, Klarna, Robinhood, Public, Lemonade, Root, Ethos, Stripe, PayPal, Coinbase) and CRO
research. Every finding is mapped to a concrete Hedgerow element (hero, calculator, waitlist,
checkout, chat, partner form) and prioritized by impact.

**Compliance guardrail applies throughout:** never use "insurance / coverage / premium / policy /
guarantee." Approved framing: *promotion, protection promise, payout, refund-to-customers, flat
fee, business protection, peace-of-mind promo, weather-backed promotion.* Avoid prediction-market /
gambling words (bet, odds, wager, stake, payout-if-you-win). Frame as a **marketing/promotion tool
for the business**, not a wager.

---

## TOP 10 ACTIONABLE CHANGES (prioritized)

| # | Change | Element | Impact |
|---|--------|---------|--------|
| 1 | Lead with an **outcome headline**, not a feature ("Run a promo that pays your customers back if it rains — for one flat fee"). | Hero | HIGH |
| 2 | Make the **interactive calculator the hero's primary action** — quote *before* email. Show the flat fee instantly with zero signup. | Hero + Calculator | HIGH |
| 3 | **Sticky mobile bottom CTA bar** ("Get my flat fee") that follows scroll; one dominant CTA per screen. | All pages, mobile | HIGH |
| 4 | **Email-only waitlist** (1 field). Defer everything else (business name, category) to a post-capture step. | Waitlist | HIGH |
| 5 | Add an **above-the-fold trust strip**: "X businesses on the waitlist," a security badge, and a transparent-pricing line. | Hero | HIGH |
| 6 | **"How it works in 3 steps"** section with a familiar analogy ("Like a rain-check, but you set it up in 60 seconds"). | Use-case area | HIGH |
| 7 | **Radically transparent pricing** copy: "One flat fee. No percentage cuts, no surprises." Show the fee breakdown before checkout. | Calculator + Checkout | HIGH |
| 8 | **Shrink checkout to the minimum**; show fee + what-the-customer-gets summary persistently; reassure on each payment method. | Checkout | MED |
| 9 | **Real, specific social proof** near every CTA — named small-business testimonials with city + business type, not generic stars. | Throughout | MED |
| 10 | **Compliance-safe microcopy** beside buttons ("Takes 60 seconds • No card to get a quote • Cancel anytime"). | Hero, Calculator, Waitlist | MED |

---

## 1. CONVERSION MECHANICS

### 1.1 Single dominant CTA beats many — HIGH
Pages with a single CTA convert ~13.5% vs ~10.5% for pages with five+ CTAs (a 32% lift). Fintech
pages built around one acquisition goal convert 2.4–2.8x multi-purpose pages.
- **Hedgerow:** Each screen gets ONE primary action. Hero = "Get my flat fee" (drives into the
  calculator). The partner form, AI promo designer, and chat are *secondary* — style them as
  smaller/ghost buttons so they never compete with the main path. Do not put waitlist + calculator +
  partner CTAs at equal weight above the fold.

### 1.2 Above-the-fold clarity — HIGH
Visitors scan before they read. Headline + CTA + one trust signal must be visible with no scroll.
Switching a feature headline to an outcome headline produced a 78% lift in one fintech test.
- **Hedgerow hero copy (outcome-led):** *"Win more customers with a promo that pays them back if
  the weather doesn't cooperate."* Sub-head names the mechanism plainly: *"Pick your event, get one
  flat fee, and we handle the payout to your customers automatically."* This frames it as a
  **marketing promo**, sidesteps prohibited terms, and is instantly graspable.

### 1.3 Interactive calculator as the engagement hook — HIGH
Quote/calculator tools are the strongest engagement device in this category. Lemonade turned its
90-second flow into the marketing hook itself (and lifted conversion ~60% by streamlining
onboarding). Coinbase shows prices/charts pre-login — "prove utility before asking for identity."
- **Hedgerow:** The calculator is Hedgerow's Lemonade-quote and its biggest asset. Put it **in or
  immediately below the hero**, not buried mid-page. Flow: category → event → date → **instant flat
  fee, no email required.** The fee reveal is the dopamine hit; only *after* showing it do you offer
  "Reserve this rate / Join the waitlist." This is the instant-quote-before-signup pattern that
  drives neobank and insurtech conversion.

### 1.4 Sticky / floating CTA (user-requested) — HIGH
Sticky bottom-bar CTAs lift mobile conversion 12–27%; floating checkout buttons have lifted checkout
starts ~37%. CTA buttons outperform text links by 200% on mobile.
- **Hedgerow:** Persistent **sticky bottom bar on mobile** and a floating/sticky CTA on desktop. The
  label changes with scroll context: "Get my flat fee" early on → "Reserve my rate" after the
  calculator → "Complete checkout" in the flow. Always exactly one sticky action visible.

### 1.5 Progressive disclosure — MED
Reveal detail in digestible layers; break long flows into steps with a progress bar. Coinbase gives
every CTA an "escape route" — optimize for yes, accept no.
- **Hedgerow:** FAQ and compliance/legal detail stay collapsed until requested. The checkout
  (card/ACH/stablecoin) should be a stepped flow with a progress indicator: (1) confirm promo
  details, (2) pay the flat fee, (3) get confirmation. Don't show all payment fields at once.

---

## 2. TRUST & SOCIAL PROOF

### 2.1 Build trust before the ask — HIGH
Insurtech winners show regulatory/safety signals, customer counts, and partner logos *before*
requesting personal data. Moving an FCA trust badge from footer to hero lifted a broker page from
2.1% → 3.4%.
- **Hedgerow:** Above-the-fold trust strip: **"Trusted by [N] small businesses"** (use waitlist
  count pre-launch — see 2.3), a **security/encryption badge**, **payment-partner logos** (Visa/
  Mastercard/ACH/your stablecoin rail), and a one-line transparency promise. Repeat a security badge
  *beside the checkout pay button*, where anxiety peaks.

### 2.2 Specific, named social proof beats generic — MED
Named testimonials with title + company outperform star ratings; company-specific metrics beat
generic praise. Place at least one named testimonial directly above the conversion form.
- **Hedgerow:** Use small-business-flavored proof: *"We ran a 'rain-free weekend' promo for our
  patio — booked 40% more tables. — Maria, Owner, Lakeside Grill, Austin TX."* Put one such quote
  directly above the waitlist field and one above checkout. Avoid finance-bro language; keep it
  Main-Street.

### 2.3 Real numbers / "X businesses joined" — HIGH (pre-launch lever)
"More than 75M US consumers use a neobank" is category proof; Chime (22M), Cash App (50M+) lead with
member counts. Waitlist research: dynamic counters and queue position ("You're #154 in line") create
transparency + urgency simultaneously and lift conversion.
- **Hedgerow:** Show a **live waitlist counter** ("Join 1,200+ businesses on the waitlist") and a
  **queue position** after signup ("You're #312 — we onboard in batches"). This is the single most
  effective pre-launch social-proof lever and doubles as tasteful scarcity (see 4.3).

### 2.4 Money-movement & pricing reassurance — HIGH
Affirm built trust on transparent, upfront pricing with no hidden fees (merchants report ~85% AOV
lift). Transparent fee language consistently outperforms hidden pricing in fintech tests.
- **Hedgerow:** Hedgerow's flat-fee model is its trust weapon — lean in hard. State plainly: *"One
  flat fee. We tell you the exact amount before you pay anything. No percentage of your revenue, no
  hidden charges."* On checkout, show a persistent summary: the flat fee, what triggers a customer
  payout, and who gets paid. Clarify money flow ("Your customers are refunded automatically if the
  condition is met — you never touch the payout").

---

## 3. FRICTION REDUCTION

### 3.1 Email-first, minimum fields — HIGH
Cutting a crypto signup from 11 fields to email+password lifted completion 18% → 54%. Email-only
waitlist forms convert best. Defer KYC/details to post-registration.
- **Hedgerow waitlist:** **One field — email.** Capture business category/name on the *confirmation*
  step or via the calculator (which already collects category/event/date as engagement, not as a
  gate). Never front-load the partner form's longer fields onto general visitors.

### 3.2 Show value before signup — HIGH
Best practice: educate / demonstrate first, then ask. Coinbase shows prices pre-login; click-through
pages educate before sending users onward.
- **Hedgerow:** The calculator's instant flat-fee reveal IS the "value before signup." Sequence:
  quote → "Reserve this rate (just your email)" → later steps. The AI promo designer can also run
  *before* signup as a value teaser ("See what your promo could look like — free").

### 3.3 Magic links / passwordless — MED
Reduce login friction; passwordless/magic-link is the neobank-era default and removes a drop-off
point.
- **Hedgerow:** Use **magic-link email auth** for waitlist confirmation and returning users; avoid
  forcing password creation at the waitlist stage. Reserve full account creation for checkout.

### 3.4 Minimize steps to value & reassure microcopy — MED
"Takes 2 minutes" microcopy measurably lifts completion; 1s mobile delay cuts conversions up to 20%.
- **Hedgerow:** Add timing/comfort microcopy under primary buttons: *"60 seconds • No card needed
  for a quote."* Beside the email field: *"We'll only email you about your reserved rate."* Optimize
  calculator and page load speed for mobile.

---

## 4. COPY & PSYCHOLOGY

### 4.1 Specificity & verifiability — HIGH
Vague claims lose; "regulated by X, 99.9% uptime, used by 5,000+ businesses" wins. Copy changes
alone drive 50–80% lifts in fintech tests.
- **Hedgerow:** Replace abstractions with concretes: not "protect your event" but *"If it rains more
  than 0.5 inch on your event day, every customer who bought gets their money back — automatically."*
  Specific perils, thresholds, and dollar mechanics make a novel product feel real and trustworthy.

### 4.2 Loss aversion & Before-After-Bridge — HIGH
Novel-product framing: current frustration → improved future → product as bridge.
- **Hedgerow BAB:** *Before:* "A washed-out event day means refund chaos and customers who don't come
  back." *After:* "Imagine offering a 'good weather or your money back' promise that fills seats." 
  *Bridge:* "Hedgerow makes it one flat fee and one click." Frame the *flat fee as the certain small
  cost that removes a larger uncertain loss* — that's compliant loss-aversion (it's a marketing
  spend, not a wager).

### 4.3 Tasteful urgency / scarcity — MED
Authentic constraints beat fake timers. Real launch dates, batch onboarding, and queue position work;
resetting countdowns destroy trust.
- **Hedgerow:** Use **real** scarcity: "Founding-business pricing for the first 500 sign-ups,"
  batch-onboarding queue position, and genuine event-date deadlines ("Rates lock 14 days before your
  event"). No fake countdown timers.

### 4.4 Button microcopy — MED
"Get Early Access" / "Reserve Your Spot" / "Get Started" beat "Submit" / "Sign Up." Action + outcome
language raises commitment.
- **Hedgerow button labels:** Hero/calculator → **"Get my flat fee."** Post-quote → **"Reserve my
  rate."** Waitlist → **"Join the waitlist."** Checkout → **"Confirm & pay flat fee."** Partner →
  **"Become a partner."** Never "Submit."

### 4.5 Make the novel feel familiar — HIGH
Anchor an unfamiliar product to a known mental model.
- **Hedgerow analogies (compliant):** "Like a rain-check your customers can count on." "A
  satisfaction-guarantee promo, backed for you." "BNPL made checkout normal by feeling familiar —
  do the same: present Hedgerow as a *promotion you run*, priced like a flat marketing fee."

---

## 5. MOBILE-FIRST & VISUAL HIERARCHY

- Mobile = 62%+ of traffic, ~49% of banking/finance traffic; mobile-optimized sites convert 30–45%
  higher. Design forms and CTAs small-screen first. — HIGH
- **Hedgerow:** Single-column mobile layout; calculator inputs as large tappable selectors (category/
  event as chips, date as a native picker). Sticky bottom CTA bar always present (see 1.4). Buttons,
  not text links. Keep hero text short enough that headline + CTA + trust strip fit one mobile
  viewport. Robinhood's lesson: show *one* clear object and *one* button — resist cramming the
  calculator, promo designer, and chat onto the first mobile screen.

---

## 6. SELLING A NOVEL / UNFAMILIAR PRODUCT

### 6.1 "How it works in 3 steps" — HIGH
Step-by-step explainers are essential for unfamiliar products; Robinhood/Lemonade win by radical
simplicity.
- **Hedgerow 3-step block:**
  1. **Pick your promo** — choose category, event, and date (the calculator).
  2. **Get one flat fee** — see your exact cost instantly, no surprises.
  3. **We handle the rest** — if the condition hits, your customers are paid back automatically.
  Use plain icons + one sentence each. This is the spine of the page for a novel product.

### 6.2 Education layer & AI tools as teachers — MED
- **Hedgerow:** The **AI chat widget** and **AI promo designer** are powerful education tools for a
  novel concept — position them as "Not sure how this works? Ask anything" and "See a sample promo
  for *your* business." Let them run pre-signup. Keep the chat unobtrusive (corner bubble) so it
  aids, not distracts from, the dominant CTA.

### 6.3 Use-case cards as concretizers — MED
- **Hedgerow:** Make use-case cards hyper-specific by business type — "Outdoor wedding venue,"
  "Brewery patio weekend," "Farmers market vendor," "Festival organizer" — each with a one-line
  scenario and the promo it would run. Specificity converts abstract → "that's me." Each card should
  deep-link into the calculator pre-filled for that category.

---

## SECTION ORDER (recommended page flow)

1. **Hero** — outcome headline + sub-head + primary CTA (into calculator) + trust strip.
2. **Interactive calculator** — instant flat-fee quote, no signup. Soft email-capture after reveal.
3. **How it works (3 steps)** — plain-language explainer.
4. **Use-case cards** — business-type specific, deep-link to pre-filled calculator.
5. **Social proof** — named small-business testimonials + waitlist counter.
6. **Transparency / pricing** — flat-fee, no-hidden-fees promise + money-flow reassurance.
7. **FAQ** — progressive disclosure; address compliance, payouts, eligibility.
8. **Final CTA** — waitlist (email-only) / checkout.
9. **Partner form** — separate, secondary, below or on its own page.
10. **AI chat widget** — persistent corner bubble; **sticky CTA bar** persistent on mobile throughout.

(Per fintech-structure research: hero → trust bar → product explanation → benefits → how it works →
social proof → conversion → compliance. Reordering breaks the psychological flow.)

---

## SOURCES

- WSA Design — High-Converting Landing Pages for Fintech: https://wsa.design/news/high-converting-landing-pages-for-fintech-websites-structure-copy-and-data-insights
- Group107 — CRO Best Practices 2025: https://group107.com/blog/conversion-rate-optimization-best-practices/
- Ballistic Design Studio — Fintech Landing Page Optimization: https://www.ballisticdesignstudio.com/post/fintech-landing-page-optimization
- Medium / ProductSins — UX Review of Lemonade Insurance: https://medium.com/productsins/ux-review-of-lemonade-insurance-c5648593e7f9
- Lemonade — Under the Hood of Lemonade Car's Landing Page: https://www.lemonade.com/car/explained/under-the-hood-of-lemonade-cars-landing-page/
- Web Anatomy — Best InsurTech Website Examples: https://www.webanatomy.ai/best-landing-pages/insurtech
- Affirm — Why BNPL Increases Website Conversions: https://www.affirm.com/business/blog/affirm-bnpl-increase-ecommerce-conversion
- Chargeflow — Klarna vs Affirm: https://www.chargeflow.io/blog/klarna-vs-affirm-payments
- eMarketer — Neobank turf war (Chime/Cash App/SoFi/Robinhood): https://www.emarketer.com/content/neobank-giants-getting-more-alike-their-fight-customers
- Sacra — Chime neobank research: https://sacra.com/research/chime-neobank-super-app/
- Medium / PLG Insider — Coinbase Activation Funnel: https://medium.com/the-plg-insider/cryptos-user-activation-crisis-a-product-case-study-on-coinbase-s-activation-funnel-e2a21b6eef48
- StartDesigns — 45 Best Landing Page Examples (Robinhood teardown): https://www.startdesigns.com/blog/best-landing-page-examples/
- Lollypop — Progressive Disclosure in SaaS UX: https://lollypop.design/blog/2025/may/progressive-disclosure/
- Waitlister — Waitlist Landing Page Optimization Guide: https://waitlister.me/growth-hub/guides/waitlist-landing-page-optimization-guide
- Viral Loops — How to Build a Waitlist: https://viral-loops.com/blog/how-to-build-a-waitlist/
- Unbounce — Best Landing Page Examples 2026: https://unbounce.com/landing-page-examples/best-landing-page-examples/
- FreeWaitlists — Waitlist Landing Page Best Practices: https://freewaitlists.com/blog/waitlist-landing-page-best-practices
