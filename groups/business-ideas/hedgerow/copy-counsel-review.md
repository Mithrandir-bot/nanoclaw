# Hedgerow — Copy Review for FL Insurance Counsel

Prepared 2026-06-04. Purpose: get an attorney's read on whether the site's framing avoids
being an unauthorized-insurer solicitation under FL Stat §624.02, BEFORE we tighten copy or
drive any traffic. Site is currently gated (demand-validation only, Stripe sandbox, no fees bound).

## The honest framing (read this first)

Word swaps are lipstick. The **substance** of the offer is: a business pays Hedgerow a fixed sum,
and Hedgerow pays the business money if a future contingent event occurs. That is the economic
shape of indemnity/insurance regardless of vocabulary. So the real questions for counsel are
structural, not lexical:

1. Does the "marketing tool / we provide the prize capital" framing meaningfully change the legal
   character, or is it indemnification in substance (and thus unauthorized-insurer activity until we
   sit behind an admitted/E&S carrier or MGA+fronting structure)?
2. In pure **demand-validation** mode (no money bound, sandbox), does merely *displaying* these
   promises + collecting a waitlist constitute solicitation of an unlicensed product? Or is the
   "join the waitlist for a product in development" posture safe?
3. If copy alone can't cure it, what is the minimum structure required before ANY public display of
   the payout promise (not just before binding)?

## Current SHIPPED phrases that read as indemnification

(Grepped from `/root/hedgerow/public/index.html`, 2026-06-04. "payoff" is the term used, ~14+ refs.)

| # | Current live copy | Why it's a flag | Proposed safer phrasing (pending your OK) |
|---|---|---|---|
| 1 | "we pay your business the payoff to cover it within 24 hours" | Pays the insured a sum upon a contingent event = indemnity; "to cover" = coverage | "we release the promotion's prize funds within 24 hours of the official result" |
| 2 | "we fund the payoff for one flat fee" | "fund the payoff" on a contingency = policy promise | "you pay one fixed price for the promotion; we supply the prize capital" |
| 3 | "we fund it so it costs you nothing" / "we pay you to cover what you offered" | "cover what you offered" = indemnifying the merchant's loss | "we provide the prize money for the deal you advertised" |
| 4 | "within 24 hours" (×14, always attached to payoff) | Timed payout promise reinforces the policy reading | keep only attached to "prize funds release," not "payoff/cover" |
| 5 | (my NEW campaign drafts) "risk-free", "we fund the payout" | "risk-free" implies removing financial loss = the definition of insurance | "fixed-cost promotion" / "cap your promo budget" — DO NOT ship these drafts as written |

NOTE: the live site already scrubbed "insurance/premium/policy/coverage" from headline copy and the
demo banner explicitly says "not an offer of insurance or coverage." The residual exposure is the
**payoff/cover mechanic language** above, not the obvious banned nouns.

## Waitlist / disclaimer hardening (proposed)

- Current: "Join the waitlist for early access." + footer "Not an offer of insurance or coverage."
- Add (Gemini-recommended, pending counsel): "Hedgerow is in development. Joining the waitlist is
  not a binding contract and is not a guarantee of future availability of any service."
- Rationale: makes the public posture "a product that does not yet exist," which is harder to
  characterize as solicitation than a described, priced, ready-to-buy product behind a thin disclaimer.

## What we will NOT do until you clear it

- No real fee collected (Stripe stays sandbox).
- No public domain / no paid ads (kept on the gated tunnel).
- No rewrite pushed live — the safer phrasings above are staged for your review, not shipped.
- The World Cup country-page campaign stays as internal mockups only.

## Specific asks

1. Approve / redline the phrasing table above.
2. Tell us whether demand-validation display of the payout promise is itself a problem.
3. Confirm the structural path (MGA + fronting carrier + reinsurer, per prior analysis) is the gate
   before any binding, and whether it's also the gate before public display.
4. **The conditional-rebate / Sponsor-of-record structure (the furniture-store model).** Retailers
   (Gardner White, Jordan's, Ashley, Bob Mills) run "your purchase is free/rebated if {team} wins"
   promos for decades using a **conditional rebate** styled explicitly as "not a sweepstakes, contest,
   or game of chance — no prize," with the prize-indemnity backstop kept entirely off the
   consumer-facing copy. We have drafted a reusable, banned-word-clean rebate Terms block on that
   model (`rebate-terms-template.md`) where the **merchant is the Sponsor of record** and Hedgerow
   sits behind it as the backend rebate-funder (the prize-indemnity-insurer position). Questions:
   - (a) Does positioning the merchant as Sponsor-of-record, with Hedgerow as the **backend
     facilitator/rebate-funder**, let the consumer-facing conditional-rebate framing carry through —
     or does Hedgerow funding the merchant's contingent payout for a fixed fee still constitute
     unauthorized-insurer activity regardless of how the consumer layer is styled?
   - (b) If the rebate framing protects only the merchant→consumer layer (as we suspect), is the
     **MGA + fronting carrier + reinsurer** structure (Ask 3) the prerequisite before Hedgerow funds
     ANY rebate — i.e., is "be the prize-indemnity carrier behind the merchant's rebate" lawful only
     through an admitted/E&S prize-indemnity carrier?
   - (c) Redline `rebate-terms-template.md` itself: is the "conditional rebate offer only… not a
     sweepstakes/contest/game of chance; no prize" disclaimer, plus the exclusions/eligibility/
     claim/payout asterisks, sufficient for the consumer-facing merchant promo across all promo
     types (sports, weather, seasonal, custom)?
