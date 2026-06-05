# Hedgerow — Trust & Support Playbook

How the most trusted consumer fintech platforms build trust, run support, and behave in their
help chatbots — distilled into a concrete spec for Hedgerow's landing page and support bot.

**Studied:** Stripe, PayPal, Wise, Chime, Cash App, SoFi, Affirm, Klarna, Coinbase, Mercury, Ramp,
Lemonade.
**Date:** June 2026. **Author:** Mithrandir (research agent).

---

## COMPLIANCE GUARDRAIL (applies to every line below)

Hedgerow is a US small-business landing page for **event-based promotions**: a business pays a flat
fee and gets paid out if a named event occurs. Money is involved, so trust copy is mandatory — but
the language is constrained.

**NEVER use:** insurance, insurer, coverage, covered, premium, policy, policyholder, guarantee,
guaranteed, claim, claims, deductible, underwrite, hedge, bet/wager/odds/stake/payout-if-you-win.

**APPROVED framing:** promotion, weather-backed promotion, protection promise, payout, refund-to-
customers, flat fee, business protection, peace-of-mind promo, "we pay your customers back," "set it
up in 60 seconds." Frame Hedgerow as a **marketing/promotion tool for the business**, never a wager
or a financial product the business is buying for itself.

> Critical fix already needed: the live `hedgerow-backend/chat.php` system prompt currently says
> "sells event-based **risk coverage**… pay a small USD-denominated **premium**… Hedgerow **pays
> out**… It is **risk coverage**, NOT gambling." Three prohibited words in one prompt. Replace per
> §3.5 below before this bot ever talks to a real visitor.

---

## TOP 10 — PRIORITIZED, MAPPED TO A HEDGEROW ELEMENT

| # | Add / change | Hedgerow element | Why (source) |
|---|--------------|------------------|--------------|
| 1 | Add a **"Your money is handled properly"** trust block: funds held separately at a named, regulated banking/payments partner; flat fee shown before any signup; plain statement of who pays whom and when. | New trust section below calculator | Wise "Your money, properly protected… held completely separate from ours, held with major names like Barclays and JP Morgan Chase"; Mercury "Your deposits are held in your name." [Wise], [Mercury] |
| 2 | Add a real **Support / Contact section** with a named email, an honest response-time promise ("We read every message and reply within 1 business day"), and one human face/name. | Footer + dedicated `/support` | Wise "People who care, 24/7… over 5,000 humans ready to help"; Chime "real human support… 24/7." [Wise], [Chime] |
| 3 | **Rewrite the chatbot system prompt** to (a) strip prohibited words, (b) ringfence strictly to Hedgerow, (c) never invent prices, (d) escalate to email on anything it can't answer. | `hedgerow-backend/chat.php` | Current prompt uses "risk coverage/premium/payout." See §3.5 for drop-in replacement. |
| 4 | Add **escalation microcopy** to the bot: warm handoff to human + email, with reason and next step. "I want to get this exactly right — I'm flagging this to a teammate. Email us at help@… and we'll reply within 1 business day." | Chatbot popup | Escalate on capability limits, money/refund questions, frustration, or explicit request. [Cobbai] |
| 5 | Add a **radically-transparent fee line** at the fee reveal: "One flat fee. No percentage cuts. No hidden charges. You see the full cost before you pay anything." | Calculator fee reveal + checkout | Affirm "know exactly what you'll pay… no hidden fees"; positions against "junk fees." [Affirm/Klarna] |
| 6 | Add a **"How payout works" explainer** with the automatic, no-paperwork promise: "If your event happens, the payout goes out automatically — same day, no forms to fill out." (Do not call it a claim.) | How-it-works section | Lemonade's instant, paperwork-free settlement is the core trust pitch of the category. [Lemonade] |
| 7 | Add **pre-launch trust signals** that don't require customers: founder name + photo + LinkedIn, "Built on Stripe" / partner logos, waitlist count, a 60-second demo video. | Hero + About strip | "If it works with Stripe, it must be legitimate"; founder bio + partner logos + demo video = "not vaporware." [Shoutjar] |
| 8 | Add a **transparency / "how we make money" line**. "We charge one flat fee. That's it — no markups buried in the fine print." | FAQ or footer | Transparency about the business model is a top trust driver for money products. [Wise], [Affirm] |
| 9 | Add a lightweight **status indicator** ("All systems operational" dot linking to a status page) once anything is live. | Footer | Stripe/Coinbase public statuspage.io = standard fintech transparency signal. [Atlassian], [Coinbase] |
| 10 | Add **fear-answering microcopy** at every money moment: "No card needed for a quote," "Cancel anytime before your promo starts," "We'll email you a receipt and confirmation." | Calculator, checkout, confirmation | Microcopy that names and answers the user's fear at the point of friction lifts trust + conversion. [CMSWire], [Zion&Zion] |

---

## 1. TRUST SIGNALS THAT MATTER FOR A MONEY PRODUCT

What the leaders actually do, with verbatim phrasing worth borrowing.

### 1.1 "Your money is safe" — separation + named custodian
The single strongest reassurance is telling people **where the money sits and that it's separate**.
- Wise: *"Your money, properly protected"* / *"safeguarded, and held completely separate from ours"*
  / *"held with major names like Barclays and JP Morgan Chase."*
- Mercury: *"Your deposits are held in your name"* / *"Diversified by design"* / *"97%+ of deposits
  are FDIC-insured."*
- **Hedgerow translation (compliant):** *"Funds for payouts are held with our regulated payments
  partner, separate from Hedgerow's own operating money."* Name the processor (e.g. Stripe) once
  it's wired. Do **not** claim FDIC unless a partner bank actually provides it — false safety claims
  are the fastest way to lose trust and invite regulators.

### 1.2 Regulatory posture — state it plainly, even the limits
High-trust brands say what they are AND what they are not.
- Mercury: *"Mercury is a fintech company, not an FDIC-insured bank. Banking services provided
  through [partner banks], Members FDIC."*
- **Hedgerow:** A short, honest "What Hedgerow is" line beats vague bravado. Something like: *"Hedgerow
  is a promotions platform for small businesses. We're not an insurer and this isn't insurance — it's
  a marketing promotion you run for your customers."* This both builds trust and reinforces the
  compliance line.

### 1.3 Quantified scale as proof
- Wise: *"18.1 billion GBP"* held; *"4.4/5 from 187,000 reviews."*
- Mercury/SoFi/Chime: *"300K+ businesses," "12.6M members," "75% find us more trustworthy."*
- **Hedgerow (pre-launch):** You have no volume yet — use what you have: waitlist count, "businesses
  in X cities on the list," beta-user quotes. Never fabricate. Zero-hallucination rule applies hard
  here: no invented payout totals, customer counts, or testimonials.

### 1.4 Security specifics (concrete > "bank-grade")
The trusted brands name real controls, not adjectives.
- Wise: *"Two-step authentication," "Biometrics and encryption," "7 million checks… 80 checks every
  second."*
- Mercury: *"SOC 2 Type II," "HTTPS on all pages… HSTS," "bcrypt," "TOTP for 2FA," "never send
  authentication codes via insecure channels like SMS."*
- **Hedgerow (right-sized):** *"Card and bank details are processed by our PCI-compliant payments
  partner — Hedgerow never sees or stores your card number. The whole site runs over encrypted
  HTTPS."* True, concrete, and not overclaiming a SOC 2 you don't have.

### 1.5 "Guarantee" without the word
Since "guarantee" is banned, borrow the *mechanism* phrasing:
- *"If your event happens, the payout goes out automatically — same day."*
- *"You see the full flat fee before you pay anything."*
- *"Cancel anytime before your promo goes live."*
These convey reliability and "we've got you" without a single prohibited term.

---

## 2. SUPPORT / CONTACT PATTERNS

### 2.1 What high-trust brands actually expose
| Channel | Stripe | Wise | Coinbase | Chime | Mercury |
|---------|--------|------|----------|-------|---------|
| Help center | Yes | Yes | Yes | Yes | Yes |
| Email | Dashboard/ticket | Yes | support@coinbase.com | In-app | Yes |
| Live chat | Yes (in-app) | Yes 24/7 | Yes 24/7 | Yes 24/7 | Yes |
| Phone | Premium/Enterprise | — | 1-888-… | Yes | — |
| Response promise | "~24–48h" | "24/7 humans" | "within minutes" (chat) | "24/7 real humans" | FAQ-first |

Takeaways for a small product:
- **A visible email + an honest response-time promise is the minimum bar** and is enough to feel
  trustworthy. Coinbase email is *"24–72 hours"* — honesty about a real window beats a fake "instant."
- **A help center / FAQ is the first line.** Mercury fronts safety with a FAQ ("You have questions.
  We have answers.") that pre-answers skepticism (where's my money, are you regulated, etc.).
- **Name humans.** Wise: *"over 5,000 humans ready to help."* Chime: *"real human support."* The word
  "human/real person" is itself a trust signal.

### 2.2 What Hedgerow's Support section should SAY (drop-in copy)
> **We're here, and a real person reads every message.**
> Questions about a promo, a payout, or your fee? Email **help@hedgerow.[tld]** and we'll reply
> within **1 business day** — usually much faster.
> Before that, the FAQ below answers the most common questions in plain English.
> [Optional: small founder photo + "— [Name], founder"]

Rules:
- Promise only a window you will actually hit (1 business day is safe and credible for pre-launch).
- Put the email as real clickable `mailto:`, not a contact form alone — visible contact info reads
  as "real company."
- Mirror it in the footer so it's reachable from every scroll position.

### 2.3 Make reaching out feel safe
- Add reassurance microcopy beside the contact: *"No question is too small. We'd rather you ask."*
- For money-specific worry: *"Worried about a charge or a payout? Email us — we'll trace it with you."*
- This is the "competent, caring human" effect: trust comes from behaving like a helpful person, not
  from badges alone. [Idoko/Medium]

---

## 3. SUPPORT CHATBOT BEHAVIOR

### 3.1 Tone — warm + plain, never robotic, never salesy
Lemonade's Maya is the gold standard in this category: *"warm, engaging tone… one question at a
time… explains details in plain language."* The bot should sound like a friendly teammate who knows
the product cold, not a legal disclaimer generator and not a hype machine.

### 3.2 Ringfencing — stay strictly on Hedgerow
Money + a public bot = abuse and liability risk. The bot must:
- Only discuss Hedgerow's promotions, fees, payouts, eligibility, and how-it-works.
- Politely refuse off-topic, financial-advice, legal-advice, and "will my event happen?" prediction
  questions. *"I can explain how Hedgerow promos work, but I can't predict whether an event will
  happen or give financial or legal advice."*
- **Never quote a price.** Direct to the on-site calculator: *"Pop your event into the calculator
  and you'll see the exact flat fee instantly — no signup needed."*
- **Never** use any prohibited word, even if the user does. If a user says "is this insurance?",
  answer: *"Good question — it's not insurance. It's a marketing promotion you run for your
  customers: you pay one flat fee, and if your chosen event happens, your customers get paid back."*

### 3.3 Escalation rules (when the bot hands off)
Escalate to a human/email when ANY of these is true [Cobbai, BlueTweak]:
1. The user asks about a **specific charge, refund, or payout** on a real account/transaction.
2. The user is **frustrated** (repeated questions, negative sentiment) or **explicitly asks for a
   person**.
3. The question touches **money movement, disputes, or anything legal/regulatory**.
4. The bot has **failed twice** to resolve the request, or doesn't know the answer.
5. Anything emotionally sensitive (a promo that should have paid out and didn't).

### 3.4 Escalation microcopy (verbatim, drop-in)
- General: *"I want to make sure you get the right answer on this. I'm passing it to a teammate —
  email us at help@hedgerow.[tld] and we'll get back to you within 1 business day."*
- Money/payout: *"Anything to do with a real charge or payout, I'd rather a person handle so nothing
  slips. Email help@hedgerow.[tld] with your business name and we'll trace it with you."*
- Frustration: *"Sorry this is frustrating — let's get a human on it. The fastest way is
  help@hedgerow.[tld], and we read every message."*
- Don't-know: *"Honestly, I'm not certain on that one and I don't want to guess with your money.
  The team can confirm — help@hedgerow.[tld]."* (Admitting uncertainty *builds* trust; guessing
  destroys it.)

Principles: explain *why* it's escalating, name the next step + the response window, stay warm. A
good handoff *increases* trust rather than feeling like a dead end. [Cobbai]

### 3.5 Drop-in replacement for `hedgerow-backend/chat.php` system prompt
```
You are the Hedgerow assistant — warm, plain-spoken, and concise, like a helpful teammate.

WHAT HEDGEROW IS: a promotions platform for US small businesses. A business runs a promotion tied
to a real event (for example, a weather-backed promo). They pay ONE flat fee up front. If the event
happens, Hedgerow pays the business's customers back automatically — same day. It is a MARKETING
PROMOTION the business runs, not a financial product they buy for themselves.

NEVER use these words: insurance, insurer, coverage, covered, premium, policy, guarantee,
guaranteed, claim, deductible, underwrite, hedge, bet, wager, odds, stake. If a user uses them,
gently reframe in approved terms (flat fee, payout, promotion, pay customers back).

RULES:
- Only discuss Hedgerow promos, fees, payouts, eligibility, and how it works. Politely decline
  off-topic, financial-advice, legal-advice, or "will my event happen" questions.
- NEVER quote or estimate a price. Point users to the on-site calculator for the exact flat fee.
- NEVER invent figures, customer counts, testimonials, or payout amounts.
- If you don't know, say so plainly and escalate — don't guess.

ESCALATE to email (help@hedgerow.[tld], reply within 1 business day) when: the user asks about a
specific charge/refund/payout, is frustrated or asks for a person, raises a dispute or legal/
regulatory question, or you can't confidently answer. Use a warm handoff: explain why, give the
email and the response window.
```

---

## 4. HIGH-TRUST LANGUAGE BANK (compliant, ready to paste)

Reliability / "we've got you" without prohibited words:
- *"If your event happens, the payout goes out automatically — same day."*
- *"One flat fee. No percentage cuts, no hidden charges."*
- *"You see the full cost before you pay anything."* (Affirm-style "know exactly what you'll pay.")
- *"Cancel anytime before your promo goes live."*
- *"A real person reads every message."* (Wise/Chime "real human" signal.)
- *"We'll email you a receipt and confirmation right away."*

Safety / money handling:
- *"Funds for payouts are held with our regulated payments partner, separate from our own money."*
  (Wise/Mercury separation pattern.)
- *"Your card details go straight to our PCI-compliant payments partner — we never see or store
  them."*
- *"The whole site runs over encrypted HTTPS."*

Honest "what this is":
- *"Hedgerow isn't insurance — it's a marketing promotion you run for your customers."*
- *"We make money one way: a single flat fee. That's it."*

Fear-answering microcopy (place at the point of friction):
- *"No card needed for a quote."*
- *"Takes about 60 seconds."*
- *"No spam — just your quote and a confirmation."*

---

## 5. ADOPT NOW vs LATER

**Now (pre-launch / demo — zero cost, high trust ROI):**
1. Support section with real `mailto:` email + "1 business day, a real person reads every message."
2. Rewrite the chatbot system prompt (§3.5) — kills the compliance landmine immediately.
3. Bot escalation microcopy (§3.4).
4. "What Hedgerow is / isn't" honest line + transparent flat-fee statement.
5. PCI/HTTPS/"we never store your card" security line (true today via Stripe).
6. Founder name + photo + LinkedIn; "Built on Stripe" + partner logos; waitlist count; 60-sec demo.
7. Fear-answering microcopy at calculator + waitlist ("no card for a quote," "60 seconds").

**Later (as you get real volume / partners / go live):**
1. Public status page ("All systems operational") once there's live infrastructure to report on.
2. Named custodian/partner-bank disclosure with exact safeguarding mechanics (only when true).
3. Real testimonials with business name + city; quantified scale ("X businesses, $Y paid back").
4. Live chat staffed by humans (or bot→human live handoff) once support volume justifies it.
5. SOC 2 / formal security attestations — claim only after you actually hold them.
6. Trustpilot/review-rating badge once you have a genuine rating.
7. Phone support — lowest priority for a self-serve, small-ticket product; email is sufficient.

---

## SOURCES
- [Wise — Safety & Security](https://wise.com/us/safety-and-security/)
- [Wise — How Wise keeps your money safe](https://wise.com/help/articles/2949821/how-wise-keeps-your-money-safe)
- [Mercury — Safety & Security](https://mercury.com/security)
- [Mercury — Understanding FDIC insurance](https://support.mercury.com/hc/en-us/articles/28776140568212-Understanding-FDIC-insurance)
- [Stripe — Contact / Support](https://support.stripe.com/) · [Stripe Contact Us](https://stripe.com/contact)
- [Coinbase — Contact us](https://help.coinbase.com/en/contact-us) · [Coinbase expands live support](https://www.coinbase.com/blog/coinbase-expands-live-customer-support) · [Coinbase Status](https://coinbase.statuspage.io/)
- [Chime — Is Chime Safe?](https://www.chime.com/blog/is-chime-safe/)
- [SoFi](https://www.sofi.com/)
- [Affirm/Klarna transparency comparison](https://www.chargeflow.io/blog/klarna-vs-affirm-payments)
- [Lemonade — Maya conversational AI (Perspective AI case study)](https://getperspective.ai/blog/lemonade-case-study-conversational-ai-insurance) · [UXReactor on Lemonade AI](https://uxreactor.com/lemonade-ai-disrupts-insurance-industry/)
- [Cobbai — Chatbot escalation best practices](https://cobbai.com/blog/chatbot-escalation-best-practices) · [BlueTweak — AI-to-Human Handoff](https://bluetweak.com/blog/ai-to-human-handoff/)
- [Atlassian Statuspage](https://www.atlassian.com/software/statuspage)
- [Shoutjar — Social Proof Before Launch](https://shoutjar.com/guides/social-proof-before-launch)
- [CMSWire — Microcopy that converts](https://www.cmswire.com/customer-experience/best-ux-tips-for-writing-microcopy-that-converts/) · [Zion & Zion — Microcopy in UX](https://www.zionandzion.com/how-microcopy-in-the-hidden-ux-of-trust-drives-e-commerce-confidence/)
