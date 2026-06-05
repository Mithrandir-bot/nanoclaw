# Hedgerow Content Engine

> Customer-facing content system. Two parts: (1) an auto-generated newsletter that
> reinforces running more promotions indirectly, and (2) a set of viral X.com posts.
>
> COMPLIANCE GUARDRAIL (applies to every word that reaches a customer or the public):
> NEVER use insurance, coverage, premium, policy, guarantee, claim, hedge, bet, wager,
> or gamble. Hedgerow is a **marketing tool** that runs **event-based promotions** with
> a **flat fee** and an **automatic payout** settled by **neutral public sources**
> (NWS, EPA AirNow, official scorekeepers). No fabricated customers, names, counts, or
> testimonials at this pre-regulatory stage. Real climatology and seasonal facts only.
> No em or en dashes anywhere. No decorative emojis in the newsletter body.

---

## PART 1 - AUTO-GENERATED NEWSLETTER

### 1.1 Positioning

The newsletter is **not** a product pitch. It is a useful seasonal read for small-business
owners about turning weather and public events into foot traffic. Hedgerow is the quiet
host. Every issue leaves the reader thinking "I could run something like that next month"
without ever being told to buy. The product is the natural answer to a need the content
creates, not the subject of the content.

Editorial promise to the reader: every issue gives you one local weather fact you can act
on, one promo idea shaped to your kind of business, and one example of how a different kind
of business turns the same weather into traffic. Nothing to read that you cannot use.

### 1.2 Name ideas

Primary recommendation: **The Forecast** (a Hedgerow newsletter). Short, on-theme,
weather-native, owns the "what is coming" frame that drives planning behavior.

Alternates:
- **Rain Check** - playful, weather-native, double meaning (a rain check is a promise to
  make good later, which is exactly the product feeling). Strong second choice.
- **The Front** - weather-front pun, feels like insider briefing.
- **Saturday Weather** - leans into the single most revenue-critical question an SMB asks.
- **Open Air** - broad, works beyond rain (heat, frost, snow verticals).

Use **The Forecast** as the masthead and **Rain Check** as the recurring promo-ideas
section header inside it.

### 1.3 Cadence

**Monthly, region-keyed, with one seasonal-transition bonus issue.**

- Monthly is the right base rhythm. It matches how owners plan promotions and respects the
  Hostinger Reach free-tier ceiling (about 100 subscribers / 200 emails per month). One
  monthly send to a 100-person list uses 100 of the 200 email allotment, leaving headroom
  for a welcome email and a single mid-month seasonal alert if a notable pattern shows up.
- Send on the **last Tuesday of the month**, framed as "planning next month." Owners read
  it when they are deciding what to run, which is when a promo idea lands.
- Seasonal bonus issues (4 per year) fire at the shoulder of each season (first cold snap
  watch, first heat-index ramp, start of wedding/outdoor season, start of snow season).
  These are the highest-engagement sends because the weather is suddenly top of mind.

Free-tier budget note: at ~100 subscribers, hold to 1 monthly + occasional 1 seasonal =
about 100 to 200 emails/month, inside the free cap. When the list crosses ~90 subscribers,
plan the paid Reach upgrade before adding a second monthly touch.

### 1.4 Section structure

Each issue is assembled from these blocks. Order is fixed so the reader learns the rhythm.

1. **Masthead + one-line season framing.**
   Example: "The Forecast - April. Spring rain is back. Here is how to make it work for you."

2. **Your Local Weather Read (data nugget).**
   One clean climatology fact for the reader's city, pulled from `/api/odds` and historical
   NWS normals. Always framed as a fact, never a prediction of a specific future day.
   Example: "In Tampa, about 4 in 10 Saturdays in June see measurable rain by mid-afternoon.
   That is the kind of regular pattern you can plan a promotion around."
   This block is the hook. It is genuinely useful and it is the seed of the promo idea.

3. **Rain Check: Promo Ideas For Businesses Like Yours (vertical-personalized).**
   2 to 3 promotion ideas matched to the reader's `business_type` from `/api/lead`.
   Each idea is one line of copy plus the public source that would settle it. Drawn from the
   vetted use-case catalog so triggers are real and priceable.
   Example for a car wash: "Rains this Saturday? Free wash next week. Settled by the nearest
   NWS station, paid automatically within 24 hours."

4. **How Another Kind Of Business Does It (educational, no real customers).**
   A short illustrative scenario about a *different* vertical, clearly framed as an example,
   never as a named or real customer. This is the cross-pollination block: it shows breadth,
   sparks "oh I could do that too" thinking, and quietly widens the reader's sense of what is
   possible. Always hypothetical and labeled as such.
   Example: "Picture a golf course in a rainy stretch. They run a simple line: free round if
   it rains this weekend. Most weekends it does not, the tee sheet fills with people who came
   for the fun of the odds, and on the rare wet weekend the payout is automatic. The promo
   did its job either way."

5. **Seasonal Calendar / What Is Coming (forward planning, indirect nudge).**
   The next 30 to 60 days of relevant weather and event windows for the region, framed as a
   planning aid. This is where the indirect reinforcement lives: it lists *occasions*, not a
   buy button. Example: "Coming up: Memorial Day weekend, the start of afternoon
   thunderstorm season, and the first 90-degree stretch. Three natural moments to run
   something."

6. **One Useful Thing (utility footer).**
   A genuinely helpful non-promo nugget (a link to the free odds calculator, a one-line tip
   on writing promo copy that converts). Builds the habit of opening the email for value.

7. **Soft sign-off.**
   No hard CTA. A single low-pressure line: "Curious what one of these would look like for
   your shop? The odds calculator is free to play with." Link to the calculator, not a
   checkout.

### 1.5 The auto-generation mechanism

#### Data inputs

| Input | Source | Use in the draft |
|---|---|---|
| Verticals catalog | `use-cases-expansion.md` (Tier A/B/C) | Maps `business_type` to real triggers + settle sources + promo lines |
| Lead profile | `/api/lead` (`business_type`, `city`, event interest) | Segments the issue; picks the vertical block and the city for odds |
| Live + historical odds | `/api/odds` | The "Your Local Weather Read" fact and the seasonal calendar bands |
| Climatology / normals | NWS station normals for the lead's city | Backs every weather fact with a real historical number, not invention |
| Season / calendar | System date + a static seasonal-events table per region | Frames the issue and the "what is coming" block |
| Anonymous calculator activity | `/api/track` | Only used in aggregate to pick which vertical ideas are trending; never names a user |

Segmentation key: **(region bucket) x (business_type)**. With a ~100-person list this is a
handful of segments. Generate one draft per active segment, or a single draft with the
vertical block swapped per segment if volume is low.

#### LLM prompt template (drafts one issue, personalized)

```
SYSTEM:
You are the editor of "The Forecast," Hedgerow's monthly small-business newsletter.
Hedgerow is a MARKETING TOOL: a business runs an event-based promotion, pays one flat
fee, and a payout is sent automatically within 24 hours if a public event happens,
settled by neutral sources (NWS weather, EPA AirNow, official scorekeepers).

HARD RULES:
- NEVER use these words: insurance, coverage, premium, policy, guarantee, claim, hedge,
  bet, wager, gamble. If you are about to, rewrite the sentence.
- NEVER invent a customer, business name, person, statistic, count, result, or quote.
- Use ONLY the climatology numbers and seasonal facts provided in DATA below. If a number
  is not in DATA, do not state a number.
- Frame every promo idea with its real settle source from DATA (e.g., "settled by the
  nearest NWS station").
- No em or en dashes. No decorative emojis. Plain, warm, operator-to-operator voice.
- Do NOT tell the reader to buy or run more promos. Lead with usefulness. Any nudge is
  indirect: ideas, seasonal occasions, and a single soft link to the free odds calculator.

DATA (all values are real, supplied by the pipeline):
- region: {{region_name}}
- city: {{city}}
- month: {{month_name}} {{year}}
- climatology_fact: {{odds_api_fact}}        // e.g. "about 4 in 10 June Saturdays in Tampa see measurable rain by mid-afternoon"
- reader_business_type: {{business_type}}
- matched_promo_ideas: {{three_ideas_from_use_case_catalog_with_settle_sources}}
- cross_vertical_example: {{one_different_vertical_with_real_trigger}}
- upcoming_windows: {{seasonal_events_and_weather_bands_next_60_days}}
- calculator_link: {{url}}

TASK:
Write one issue of "The Forecast" using the fixed section order:
1) Masthead + one-line season framing
2) Your Local Weather Read (use climatology_fact verbatim in meaning)
3) Rain Check: 2-3 promo ideas for {{business_type}}, each one line + its settle source
4) How Another Kind Of Business Does It (use cross_vertical_example, label it as an example)
5) Seasonal Calendar / What Is Coming (from upcoming_windows)
6) One Useful Thing (a real tip or the calculator link)
7) Soft sign-off (one low-pressure line + calculator_link)

Also produce a subject line under 55 characters that names the city or season and promises
one useful thing. No banned words in the subject.

OUTPUT FORMAT:
{ "subject": "...", "body_markdown": "..." }
```

#### Compliance and non-fabrication safeguards

- **Numbers are injected, never generated.** The model is told to use only numbers present
  in DATA. The DATA block is built from `/api/odds` and NWS normals by the pipeline, so any
  statistic is real and traceable.
- **No customer objects exist in DATA.** The prompt cannot reference a real customer because
  none are passed in. The only "story" allowed is the explicitly labeled hypothetical in
  section 4.
- **Banned-word linter runs after generation** (see pipeline step 4) and rejects the draft
  if any banned term appears, before a human ever sees it.
- **Human review is mandatory** at this pre-regulatory stage. No auto-send.

#### Pipeline

```
[cron: last Tuesday of month, plus seasonal-shoulder triggers]
        |
        v
[1. GATHER]  pull active segments from /api/lead (business_type, city)
             pull /api/odds + NWS normals for each city  -> climatology_fact
             pull use-case catalog -> matched_promo_ideas + cross_vertical_example
             pull /api/track aggregates -> which verticals are trending (ordering only)
             compute season + upcoming_windows from calendar table
        |
        v
[2. ASSEMBLE DATA BLOCK]  one DATA object per (region x business_type) segment
        |
        v
[3. LLM DRAFT]  run the prompt template per segment -> {subject, body_markdown}
        |
        v
[4. LINT]  reject if any banned word present; reject if any number not traceable to DATA;
           reject em/en dashes and decorative emojis (auto-fail, regenerate once)
        |
        v
[5. HUMAN REVIEW]  founder approves / edits each segment draft (required pre-regulatory)
        |
        v
[6. SEND]  push approved issues to Hostinger Reach, one campaign per segment,
           respecting the ~200 emails/month free-tier cap
        |
        v
[7. LOG]  record subject, segment, send count, opens to a local file for next-issue tuning
```

#### Stub generator (Node sketch, illustrative, not required to run)

```js
// content-engine/generate-issue.js  (sketch)
import fs from "node:fs";

const BANNED = [
  "insurance","coverage","premium","policy","guarantee",
  "claim","hedge","bet","wager","gamble"
];

async function gather(segment) {
  const odds = await fetch(`/api/odds?city=${segment.city}&month=${segment.month}`).then(r => r.json());
  const climatology_fact = odds.climatologyFact; // pre-phrased real fact, e.g. "about 4 in 10 June Saturdays..."
  const catalog = loadUseCaseCatalog();          // from use-cases-expansion.md
  const matched_promo_ideas = catalog.ideasFor(segment.business_type).slice(0, 3);
  const cross_vertical_example = catalog.differentVerticalFrom(segment.business_type);
  const upcoming_windows = seasonalWindows(segment.region, segment.month);
  return {
    region_name: segment.region, city: segment.city,
    month_name: segment.monthName, year: segment.year,
    climatology_fact, business_type: segment.business_type,
    matched_promo_ideas, cross_vertical_example, upcoming_windows,
    calculator_link: "https://hedgerow.app/odds"
  };
}

function lint(draft) {
  const text = (draft.subject + " " + draft.body_markdown).toLowerCase();
  const hit = BANNED.find(w => text.includes(w));
  if (hit) throw new Error(`banned word: ${hit}`);
  if (/[–—]/.test(draft.body_markdown)) throw new Error("em/en dash present");
  return draft;
}

async function generateIssue(segment) {
  const data = await gather(segment);
  const draft = await llm(PROMPT_TEMPLATE, data); // returns {subject, body_markdown}
  return lint(draft);                              // human review happens after this
}

// orchestration (cron-invoked):
//   const segments = await activeSegments(); // (region x business_type) from /api/lead
//   const drafts = [];
//   for (const s of segments) drafts.push(await generateIssue(s));
//   fs.writeFileSync("drafts.json", JSON.stringify(drafts, null, 2));
//   // -> founder reviews drafts.json, approves -> push to Hostinger Reach
```

### 1.6 Indirect-reinforcement strategy

The newsletter never says "run more promotions." It manufactures the *desire* to, through
three mechanisms, every issue:

1. **The seasonal calendar block** lists upcoming occasions (holiday weekends, the first
   heat stretch, wedding season, the first snow window). Each named occasion is a silent
   "you could run something here." The reader does the math themselves.
2. **The cross-vertical example** shows a different kind of business getting traffic from
   the same weather the reader has. This triggers "if it works for them it works for me"
   without any ask.
3. **The vertical promo-ideas block** hands the reader ready-to-run lines. Lowering the
   effort to near zero is itself the nudge: the idea is already written, it just needs a yes.

The only explicit link is to the free odds calculator, which is a value tool, not a
checkout. Reinforcement compounds because each issue normalizes promotions as a routine
part of running the business, season after season.

### 1.7 Full sample issue (wedding venue, rainy season)

```
SUBJECT: Your June Saturdays in Asheville, and one idea

THE FORECAST - June
Outdoor season is here, and so is the afternoon rain. Here is how to make it work for you.

YOUR LOCAL WEATHER READ
In Asheville, roughly 5 in 10 June afternoons see measurable rain, most of it in short
afternoon storms rather than all-day washouts. For an outdoor venue, that is not a problem
to fear. It is a pattern you can plan around, and even turn into a reason a couple books
with you instead of the place down the road.

RAIN CHECK: IDEAS FOR VENUES LIKE YOURS
- "Rain on your date? Your couples get a free welcome-drink hour." Settled by the nearest
  NWS station for your address, paid automatically within 24 hours of the event.
- "Book the garden ceremony with peace of mind: if it rains during your ceremony window,
  the rehearsal-dinner space is on us." Same neutral NWS settlement, automatic payout.
- "A rainy-season promise" as a line on your booking page: a small, fixed up-front fee from
  you turns into a real automatic payout to the couple if the weather turns. The couple
  feels covered. You look generous and modern.

HOW ANOTHER KIND OF BUSINESS DOES IT
Picture a golf course heading into a wet stretch. They run a simple line: a free round if
it rains this weekend. Most weekends it does not rain, the tee sheet fills with players who
came partly for the fun of the odds, and on the rare wet weekend the payout goes out
automatically. The promotion did its job either way. The same shape works for a venue: the
promise itself is the marketing, and the rare payout is handled for you. (This is an
illustrative example, not a specific business.)

WHAT IS COMING
The next 60 days in your area: peak afternoon-storm season through July, the busiest
booking-inquiry window of the year, and a string of holiday weekends. Three natural moments
to put a friendly weather promise in front of couples who are comparing venues.

ONE USEFUL THING
A tip that converts: put the promise on the booking page, not just in the email. Couples
decide on the page. One clear line ("rain on your date is on us") does more there than a
paragraph anywhere else.

Curious what one of these would look like for your venue and your zip code? The odds
calculator is free to play with: https://hedgerow.app/odds

The Forecast, from Hedgerow
```

---

## PART 2 - VIRAL X.COM POSTS

> Voice: punchy, authentic, founder-in-public. Frame Hedgerow as a marketing tool, never
> insurance or betting. No banned words. A single tasteful emoji is acceptable per post.
> NOTE: the founder referenced an "initial post that started it all" but did not provide it.
> These are written in the style of a strong origin post and can be tuned to match a
> specific prior post if that text is shared.

**1. Origin / build-in-public (the aha)**
```
Built a thing this month.

A small business runs a promo like "free wash if it rains Saturday."
Pays one small flat fee.
If it actually rains, every customer gets paid automatically within 24 hours.
No checks, no chasing, settled by the weather service.

Turns out "what if it rains" can be the reason people show up. 🌧️
```

**2. Counterintuitive hook**
```
Small businesses spend all year praying it does not rain on the big day.

We flipped it.

Now rain is the promo. "Free round if it rains this weekend."
Most weekends it does not, your tee sheet is full of people who came for the odds.
The one weekend it does, the payout is automatic.

The weather works for you either way.
```

**3. "This is what happens when it rains" scenario clip idea**
```
Clip idea (describing the scene, not a real customer yet):

A car wash posts "rains Saturday = free wash next week."
Cut to the radar lighting up Saturday afternoon.
Cut to Monday: every customer who showed gets the free-wash notice, automatically.
Owner did nothing. The rain did the marketing.

That is the whole product in 8 seconds.
```

**4. Timely / seasonal (tie to a forecast)**
```
Rain in the forecast this weekend across the Southeast.

If you run an outdoor business, that is usually bad news.

It does not have to be. "Free [thing] if it rains Saturday" turns the forecast into foot
traffic, and the payout runs itself if it hits.

The weekend you dread can be the one that fills the place.
```

**5. Thread-starter**
```
I keep meeting small business owners who lose a whole weekend to weather and just eat it.

So I built a tool that turns the weather into a promo instead.

Here is how a "free wash if it rains" promo actually works, and why the business wins
whether or not it rains. 🧵
```

**6. Build-in-public, numbers-light, honest**
```
Pre-launch, no customers to brag about yet, so no fake stories here.

What I can tell you: the math is simple. A long-odds promo ("free if it snows in Miami on
Christmas") costs the business very little, because it rarely happens, and the buzz happens
every time.

Building it in the open. Follow along.
```

**7. Reframe / category-defining**
```
This is not insurance and it is not a bet.

It is a marketing promotion with an automatic payout, settled by the National Weather
Service. The business pays one flat fee up front. Customers get paid automatically if the
public event happens.

A promo that pays out by itself. That is the whole idea.
```

**8. Relatable owner pain**
```
Every car wash owner knows the feeling: rain Saturday, dead week.

What if the rainy Saturday filled next week instead?

"Rains Saturday? Free wash, on us." People come back to redeem it, automatically settled by
the weather service. The rain that hurt you now brings them back.
```

**9. Short, punchy, shareable**
```
Make the weather pay you back. 🌦️

"Free if it rains Saturday." One flat fee. Automatic payout if it hits. Settled by the
weather service, not by you.

The promo your customers actually want to root for.
```

**10. Founder POV / mission**
```
The big chains can afford to absorb a rained-out weekend. The corner car wash and the
neighborhood golf course cannot.

So I built the tool that lets the small guy run the bold promo too, with a known, small
cost and an automatic payout.

Small business should get to be the fun one.
```

---

## SUMMARY (for relay)

**Newsletter concept**
- **Name:** The Forecast (recurring promo section: Rain Check). Alternate masthead: Rain Check.
- **Cadence:** Monthly, last Tuesday ("planning next month"), plus 4 seasonal-shoulder bonus
  issues. Stays inside Hostinger Reach free tier (~100 subs / 200 emails/month).
- **Sections:** Masthead + season framing; Your Local Weather Read (real `/api/odds` +
  NWS climatology); Rain Check promo ideas by `business_type`; How Another Kind Of Business
  Does It (labeled hypothetical, no real customers); Seasonal Calendar / What Is Coming
  (the indirect nudge); One Useful Thing; soft sign-off to the free odds calculator.
- **Generation pipeline:** cron -> gather (`/api/lead` segments, `/api/odds` + NWS normals,
  use-case catalog, `/api/track` aggregates, calendar) -> assemble DATA block per
  (region x business_type) -> LLM draft from a locked template -> banned-word + traceable-
  number lint -> mandatory human review -> Hostinger Reach send -> log.
- **Non-fabrication:** all numbers injected from real APIs, no customer objects in the
  prompt, banned-word linter, human approval before any send.
- **Indirect reinforcement:** seasonal-occasion calendar, cross-vertical examples, and
  ready-to-run promo lines create the desire to run more, with the only explicit link being
  the free odds calculator (a tool, not a checkout).

**3 strongest X posts**
1. Origin / build-in-public: "Built a thing this month. A small business runs a promo like
   'free wash if it rains Saturday.' Pays one small flat fee. If it actually rains, every
   customer gets paid automatically within 24 hours... Turns out 'what if it rains' can be
   the reason people show up."
2. Counterintuitive hook: "Small businesses spend all year praying it does not rain on the
   big day. We flipped it. Now rain is the promo... The weather works for you either way."
3. Category-defining reframe: "This is not insurance and it is not a bet. It is a marketing
   promotion with an automatic payout, settled by the National Weather Service... A promo
   that pays out by itself."
