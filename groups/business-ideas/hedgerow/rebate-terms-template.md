# Hedgerow — Conditional Rebate Terms Template (all promos)

**Status:** DRAFT for FL insurance counsel review. NOT shipped, NOT legal advice. Staged behind the
gate alongside `copy-counsel-review.md` and `worldcup-seasonal-campaign.md`. Date: 2026-06-05.

**Purpose.** One reusable, banned-word-clean Terms & Conditions block that attaches to ANY Hedgerow
promotion (sports outcome, weather, seasonal/tentpole, custom event), not just the World Cup / Mexico
taqueria page. Modeled on the conditional-rebate structure that furniture/auto retailers
(Gardner White, Jordan's, Ashley, Bob Mills) have run for 20+ years with prize-indemnity backing.

## How this template is meant to work

- **The merchant is the "Sponsor" of record.** The Sponsor advertises and offers the rebate to its
  own customers. Hedgerow is a **backend facilitator** (administration + rebate-funding), the same
  position a prize-indemnity insurer occupies behind a furniture store — and, per the furniture
  precedent, that backstop is **not named in consumer-facing copy**. This keeps the consumer layer a
  clean merchant-run rebate. (Whether the rebate framing carries through to Hedgerow's backend layer
  is the open structural question — see `copy-counsel-review.md`, Ask 4.)
- **Banned words stay banned** (insurance, coverage, policy, premium, guarantee, bet, wager, odds).
  This block uses: rebate, qualifying purchase, fixed cost/fee, official result, conditional.
- **Placeholders** `{{LIKE_THIS}}` are filled per promotion. Nothing else changes between promos, so
  one approved block covers the whole catalog.

---

## Conditional Rebate — Official Terms (consumer-facing block)

**This is a conditional rebate offer only.** It is **not** a sweepstakes, drawing, raffle, lottery,
game of chance, game of skill, or contest, and there is **no prize or prize value**. Participation
requires a qualifying purchase, described below.

**1. Sponsor.** This promotion is offered and run by **{{MERCHANT_LEGAL_NAME}}** ("Sponsor"),
{{MERCHANT_ADDRESS}}. The Sponsor is solely responsible for the offer described here.

**2. Qualifying purchase.** A "Qualifying Purchase" is a purchase of {{ELIGIBLE_ITEMS/SERVICES}} made
in person at {{MERCHANT_LOCATION(S)}} during the Promotion Period. Keep your original itemized
receipt — it is required to claim a rebate.

**3. Promotion Period.** {{START_DATE_TIME}} through {{END_DATE_TIME}} ({{TIMEZONE}}), inclusive.

**4. The triggering result.** If **{{TRIGGER, STATED AS A PLAIN YES/NO}}** occurs — as confirmed by
the official result published by **{{OFFICIAL_RESULT_SOURCE}}** — each Qualifying Purchase becomes
eligible for a Rebate as set out below.
   - **What does not count / edge cases:** {{TIE / POSTPONEMENT / CANCELLATION / FORMAT-CHANGE /
     RESCHEDULE handling — e.g. "If the {{event}} is postponed it carries to the rescheduled date;
     if cancelled outright and not rescheduled within {{N}} days, no rebate is triggered."}}
   - The trigger is met or not met based solely on the official result source above. Unofficial,
     provisional, or later-overturned results do not change a determination once made.

**5. The Rebate.** A rebate of the Qualifying Purchase amount, **excluding** sales/use tax,
gratuity/tip, delivery and handling, third-party app or marketplace orders, gift cards, alcohol
(where excluded by law), {{OTHER_EXCLUSIONS}}, and any services or service items. The rebate is a
refund of the qualifying amount actually paid; it is not cash, credit, or a prize.

**6. Capacity.** Total rebate capacity for this promotion is limited to {{CAPACITY_CAP}}. Once
capacity is reached, qualifying is closed even if the Promotion Period has not ended; eligibility is
determined in the order purchases are recorded. {{Omit this clause if uncapped.}}

**7. How to claim.** If the trigger occurs, submit your original receipt and {{CLAIM_DETAILS, e.g.
name + email}} at {{CLAIM_METHOD/URL}} by {{CLAIM_DEADLINE}}. Claims after the deadline, or without a
valid receipt, are not eligible.

**8. How the rebate is paid.** Approved rebates are paid by {{METHOD — check / ACH / store credit /
original payment method}} within {{N}} {{days/weeks}} after the Sponsor confirms eligibility.

**9. Eligibility.** Open only to legal residents of {{STATE(S)/REGION}} who are {{18}} or older at
the time of purchase. One rebate per Qualifying Purchase. Void where prohibited or restricted by law.
Employees of the Sponsor and their immediate households are not eligible.

**10. General.** The Sponsor may modify, suspend, or end this promotion if required by law, by an
event outside its control, or by fraud/abuse, subject to honoring rebates already earned. The Sponsor
is responsible for fulfilling the rebate. Personal information submitted to claim a rebate is used
only to administer this promotion ({{LINK_TO_PRIVACY}}). This offer is not an offer of insurance or
coverage; it is a conditional rebate on a purchase you already made. Not valid with {{OTHER_OFFER
EXCLUSIONS}}.

---

## Fill-in checklist (per promo)

| Placeholder | Example (Mexico taqueria / World Cup) |
|---|---|
| `{{MERCHANT_LEGAL_NAME}}` / address | "Taqueria El Sol LLC", store address |
| `{{ELIGIBLE_ITEMS/SERVICES}}` | "any dine-in or pickup food order" |
| `{{PROMOTION_PERIOD}}` | tournament group-stage window, ET |
| `{{TRIGGER}}` | "Mexico's national team reaches the 2026 World Cup semifinals" |
| `{{OFFICIAL_RESULT_SOURCE}}` | "FIFA's official published results at fifa.com" |
| edge cases | match abandoned/replayed, withdrawal, format change |
| `{{OTHER_EXCLUSIONS}}` | catering, large-party minimums |
| `{{CAPACITY_CAP}}` | "$10,000 in total rebates" (capacity-tranche FOMO) |
| `{{CLAIM_METHOD}}` / deadline | upload receipt at URL within 14 days of result |
| `{{METHOD}}` / timeline | store credit within 4 weeks |
| `{{STATE(S)}}` / age | "residents of California, 18+" |

## Notes for the build (internal)

- Keep this block identical across promos; only the table values change. One counsel approval =
  whole catalog cleared.
- The trigger MUST be a clean yes/no with a live, hedgeable market and long-odds enough that the
  Sponsor's fixed fee reads as cheap (the §2 economics rule in `worldcup-seasonal-campaign.md`).
- Do NOT name Hedgerow as the party funding the rebate in this consumer-facing block (furniture
  precedent: the prize-indemnity backstop is never advertised). Hedgerow's role is defined in the
  Sponsor↔Hedgerow agreement, not here.
- "No prize / not a sweepstakes" is the load-bearing line — it is why the sweepstakes "no purchase
  necessary" rule does not apply (the purchase is the qualifying act, by design).
