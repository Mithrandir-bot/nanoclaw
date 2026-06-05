# Hedgerow — Florida Insurance Regulation: Findings Report

> **THIS IS NOT LEGAL ADVICE.** This document is a non-attorney research memo prepared for
> internal planning. It does not establish an attorney-client relationship and must not be
> relied upon as a legal opinion. **Before any launch, marketing, or solicitation activity,
> retain a Florida-licensed insurance/regulatory attorney** (ideally one who practices before
> the Florida Office of Insurance Regulation and Department of Financial Services). The
> penalties discussed below include felonies; the cost of a few hours of qualified counsel is
> trivial against that exposure.

_Prepared: 2026-06-02_

---

## 0. The Product, Restated

Hedgerow proposes to: (a) charge a business a **premium**; (b) **pay that business a defined
amount** if a **specified real-world event** occurs (sports outcome, weather, economic metric);
and (c) **hedge its own exposure** by taking offsetting positions on Kalshi prediction markets.

The founder's working hypothesis: *"Since I take the risk directly, maybe it's not regulated."*

That hypothesis is **dangerously wrong** as stated. Taking the risk directly is precisely what
makes you an **insurer**, not what exempts you. The analysis follows.

---

## 1. Is this regulated INSURANCE in Florida? — YES, almost certainly.

### The statutory definition is dispositive

Florida defines "insurance" extremely broadly:

> **Fla. Stat. § 624.02** — *"'Insurance' is a contract whereby one undertakes to indemnify
> another or pay or allow a specified amount or a determinable benefit upon determinable
> contingencies."*

Map Hedgerow onto each element:

| Statutory element | Hedgerow |
|---|---|
| "a contract whereby one undertakes…" | Hedgerow contracts with the business |
| "…to indemnify another or **pay or allow a specified amount**…" | Pays a **defined amount** on the event |
| "…upon **determinable contingencies**." | The "specified real-world event" (sports/weather/economic) |

This is a textbook fit. Note the statute does **not** require that the customer suffer a
measurable loss tied to indemnity — "pay or allow a specified amount … upon determinable
contingencies" alone qualifies. So even a parametric / fixed-payout structure ("if it rains
> 2 inches on event day, we pay $50,000") is squarely within the definition. That parametric
character is the *same* character as prize-indemnity ("hole-in-one") coverage, which the
insurance market itself underwrites as a regulated contingency line (Beazley, Tokio Marine HCC,
CFC, etc. all sell it as **insurance** through admitted/E&S carriers).

### Why "I take the risk directly" makes it WORSE, not exempt

The founder's intuition inverts the law. The regulatory trigger is **bearing the risk of another
party's contingency in exchange for premium**. An entity that does this *is the insurer*.
"Acting as an insurer" without authorization is the violation, not the safe harbor:

> **Fla. Stat. § 624.401(1)** — *"No person shall act as an insurer … except as authorized by a
> subsisting certificate of authority issued to the insurer by the office [Office of Insurance
> Regulation]."*

### This is a felony, not a paperwork foot-fault

Transacting insurance without a certificate of authority ("unauthorized insurer") is **insurance
fraud** under § 624.401, graded by premium volume:

- Premium **< $20,000** → **third-degree felony**
- Premium **$20,000–$99,999** → **second-degree felony**
- Premium **$100,000+** → **first-degree felony**

Separately, **§ 626.901** prohibits any person from *representing or aiding* an unauthorized
insurer (this can rope in employees, marketers, and the founder's licensed-agent identity). The
Department of Financial Services investigates these aggressively; consequences include cease-and-
desist orders, restitution, civil penalties, criminal referral, and — critically for the founder —
**discipline/revocation of his existing insurance license** for transacting through an
unauthorized insurer.

### Is there a "it's a wager / Kalshi-style event contract, not insurance" escape? — No, do not rely on it.

A tempting alternative theory is that paying out on a "sports outcome" is a **wager** or a
**CFTC-regulated event contract** rather than insurance. Two problems:

1. **Federal preemption belongs to the exchange, not to Hedgerow.** Kalshi's argument that its
   binary event contracts are CFTC-regulated "swaps" under the Commodity Exchange Act (with
   "exclusive jurisdiction" preempting state law) applies to **Kalshi as a designated contract
   market**. Hedgerow is *a customer/counterparty on Kalshi*, not a CFTC-registered exchange.
   Hedgerow cannot borrow Kalshi's federal status. As of early 2026 even Kalshi's own preemption
   is being litigated state-by-state with **mixed results**.
2. **Selling protection to a *business* against *its* contingency is the insurance fact pattern,
   not the wagering one.** When the customer has an interest in the outcome and buys a payout to
   offset adverse contingency, courts and regulators read that as insurance (insurable-interest /
   indemnity framing) — which lands you back in § 624.02. Framing it as "gambling" to dodge
   insurance law would, at best, swap a felony-insurance problem for a Florida-gambling-law problem
   (Fla. Stat. ch. 849). There is no comfortable seam to slip through.

**Bottom line on Q1:** Yes, this is regulated insurance in Florida. The founder's hypothesis is
not merely incorrect — it describes the single act (bearing risk for premium without a COA) that
Florida grades as a felony.

---

## 2. What do the founder's EXISTING licenses permit? — Not this.

The founder holds: a **Florida Health/Life/Annuity producer (insurance agent) license**, **FINRA
Series 7 and Series 63**, and a **Florida Real Estate license**.

### Producer ≠ Insurer. This is the central confusion.

Florida (like every state) separates two completely different legal roles:

- **Producer / agent (licensed under ch. 626).** A person who *solicits, negotiates, or sells*
  insurance **on behalf of an insurer**, under an **appointment** from that insurer, within a
  defined **line of authority**. The agent is a conduit. **The agent never bears the risk.**
- **Insurer / risk-bearer (authorized under ch. 624).** The entity that actually **accepts the
  risk and pays claims**, holding a **certificate of authority** issued by OIR after capital,
  surplus, solvency, and filing review.

A Health/Life/Annuity **producer** license authorizes the founder to *sell* health/life/annuity
products of an *appointed, authorized insurer*. It confers **zero authority to underwrite, bear
risk, or pay claims on his own account** — in any line, let alone a property/casualty-style
contingency product. Using a producer license to run a self-funded payout book is exactly the
unauthorized-insurer violation in Q1. (The line-of-authority is also wrong: this product is a
**contingency/P&C-type** risk, not health/life/annuity.)

### Series 7 / Series 63

These are **securities** registrations (general securities representative; state agent/blue-sky).
They authorize selling securities through a broker-dealer. They are **irrelevant** to bearing
insurance risk and confer **no** insurance authority. (They could matter only if Hedgerow's
instruments were later structured as securities — a different and additional regulatory regime,
not a help here.)

### Florida Real Estate license

**Entirely irrelevant** to this product. No insurance or risk-bearing authority whatsoever.

**Bottom line on Q2:** None of the four credentials lets the founder underwrite/bear risk. The
producer license is the most dangerous to misread — it makes him *more* visible to DFS and gives
the regulator a license to **discipline** if he transacts as an unauthorized insurer.

---

## 3. Legitimate structures to do this legally

Ordered roughly from fastest/cheapest to slowest/most capital-intensive. The recurring theme:
**someone with a certificate of authority must bear the risk.** The founder's existing producer
license is genuinely useful in options A and D — as a *producer placing* the coverage, not as the
risk-bearer.

### A. Place the coverage through an admitted carrier (prize-indemnity / contingency line) — *fastest*
The product Hedgerow describes already exists as **prize-indemnity / event-contingency insurance**
and is written by admitted and specialty carriers. Hedgerow becomes a **producer/agency/program
marketer** placing risks with a carrier that holds the COA and pays claims; Hedgerow earns
**commission/fee**, not underwriting profit.
- **Pros:** Lawful immediately; uses the founder's existing producer license; minimal capital;
  no felony exposure. Carrier handles solvency/reserves.
- **Cons:** Margins are commission-level, not risk-profit; carrier dictates appetite/pricing; the
  "I keep the risk and hedge on Kalshi" upside disappears (the carrier bears the risk).
- **Timeline:** Weeks (find an appetite carrier / wholesale broker; get appointed).

### B. Excess & Surplus (E&S) lines placement — *fast, for niche/unusual risks*
For risks admitted carriers won't write, place through a **Florida-licensed surplus lines agent
(1-20)** with an **OIR-eligible surplus lines insurer**. Eligible E&S insurers must generally
show **≥ $15M policyholder surplus** and a **3-year history** (waivable in defined cases, e.g.
1 year with **$25M** combined capital & surplus); they register/are reviewed via OIR (FSLSO
handles the surplus-lines service office side).
- **Pros:** Accommodates novel/parametric contingencies; still uses a producer model.
- **Cons:** Need a surplus-lines agent relationship; surplus-lines taxes/stamping; still not
  Hedgerow bearing the risk.
- **Timeline:** Weeks to a few months.

### C. Become / charter a licensed insurer (certificate of authority) — *slowest, full risk-bearing*
The only path where **Hedgerow legally keeps the risk and the Kalshi-hedge upside**. Requires an
OIR **certificate of authority**: capital & surplus minimums, business plan, actuarial support,
biographical affidavits + fingerprints/background checks on controlling persons, audited
financials, and ongoing solvency regulation.
- **Pros:** Hedgerow owns the economics; the hedge-on-Kalshi thesis becomes a real reinsurance/
  risk-management strategy.
- **Cons:** Large capital (multi-million $ surplus typical), heavy compliance, slow. OIR strives
  for ~**60 days after a *complete* application** — but reaching "complete" (and raising capital)
  takes far longer. **This is a venture-scale undertaking, not a launch step.**
- **Timeline:** Many months to 1+ year, plus capital raise.

### D. MGA / fronting-carrier + reinsurance structure — *the "have-your-cake" middle path*
Hedgerow operates as a **Managing General Agent** (FL MGA license under ch. 626) writing under a
**fronting carrier** that holds the COA and issues policies; Hedgerow's affiliated **reinsurer**
(often offshore/captive) then **reinsures** the risk back — letting Hedgerow effectively retain
underwriting economics **while a properly authorized carrier fronts**. The Kalshi positions become
the reinsurer's hedge.
- **Pros:** Closest lawful approximation of the founder's vision; retains underwriting upside;
  uses the producer/MGA skill set. Reinsurer capital/regulatory burden often lighter than a direct
  carrier.
- **Cons:** Complex; needs a willing fronting carrier (they charge fronting fees and do diligence),
  a reinsurer entity (capital + domicile), MGA licensing, and careful structuring so the fronting
  is genuine (regulators scrutinize "fronting" that is really unauthorized risk-bearing in
  disguise). **Do not improvise this — it is exactly the structure that goes wrong without counsel.**
- **Timeline:** Months; reinsurer formation adds capital + domicile lead time.

### E. Risk Retention Group (RRG) — *probably a poor fit*
RRGs let members pooling **liability** risk self-insure across states from one domiciliary charter.
Hedgerow's customers are unrelated businesses buying contingency payouts — not a homogeneous group
pooling liability — so the RRG model likely **does not fit** and is mentioned only for
completeness. Confirm with counsel before discarding.

**Recommended sequence:** Launch lawfully under **A/B (producer/E&S placement)** to get to market
and validate demand, while counsel scopes **D (MGA + fronting + reinsurance)** as the structure
that actually captures the founder's risk-bearing thesis. Treat **C** as a long-horizon option.

---

## 4. Marketing / website language — words matter, and they create evidence

Until Hedgerow is **properly authorized or placing through an authorized carrier**, the words on
the site are not cosmetic — they are **evidence of transacting insurance** and can themselves
support an unauthorized-insurer / aiding-an-unauthorized-insurer finding (§§ 624.401, 626.901).

### High-risk words (avoid entirely pre-authorization)
- **"Insurance," "insure," "insured," "coverage," "policy," "policyholder," "premium," "claim,"
  "underwrite," "carrier."** These are insurance terms of art. Using them while bearing risk
  without a COA is close to an admission. "**Premium**" in particular is a statutory red flag —
  it is the consideration element of the § 624.02 definition.
- **"Guarantee" / "guaranteed payout."** Implies a backed promise to pay on contingency — i.e.,
  insurance — and can also trigger unfair-trade-practice scrutiny if unfunded.

### Lower-risk framings (still get counsel sign-off)
If structured as a *non-insurance* contractual product (a big "if" that **counsel must bless** —
the § 624.02 definition is broad enough that relabeling rarely cures the substance):
- Describe a **"contract,"** **"agreement,"** or **"product,"** with a **"fee"** or **"contract
  price"** (not "premium"), and a **"contractual payment"** or **"settlement amount"** (not
  "claim" or "payout").
- Avoid any suggestion of indemnifying loss or protecting against risk.

**Reality check:** Regulators look at **substance over labels**. A "fee" that functions as a
premium and a "contractual payment" that functions as a claim is **still insurance** under
§ 624.02. Renaming words does **not** legalize an unauthorized risk-bearing product; it only
reduces gratuitous self-incrimination. **The clean answer is: do not call it insurance, and do
not operate the risk-bearing version at all, until authorized or fronted.** When placed through an
authorized carrier (structures A/B/D), Hedgerow *can* lawfully use full insurance vocabulary —
because then it genuinely **is** authorized insurance.

---

## 5. Florida regulatory bodies / processes and immediate next steps

### Who regulates what
- **Florida Office of Insurance Regulation (OIR)** — authorizes **insurers** (certificates of
  authority, surplus-lines eligibility, solvency, forms/rates). Company Admissions via the
  **iApply** portal (`iapply@floir.com`). This is who you go to to *become* a carrier (Q3-C/D).
- **Florida Department of Financial Services (DFS) / Division of Agent & Agency Services
  (MyFloridaCFO)** — licenses and **disciplines producers/agents/MGAs/adjusters**, and
  **investigates unauthorized-insurer activity**. This is who can discipline the founder's
  existing license and refer felonies.
- **Florida Surplus Lines Service Office (FSLSO)** — surplus-lines registration, stamping, taxes
  (Q3-B).
- **CFTC** — regulates Kalshi/event contracts at the federal level. Relevant to the *hedge leg*
  only; does **not** authorize Hedgerow to sell insurance.
- (Watch item) **FINRA / Florida OFR** — only if any instrument is ever structured as a security.

### Immediate next steps to de-risk (do these before any launch or marketing)
1. **STOP.** Do not accept premium, sign customer contracts, publish a site using insurance
   language, or solicit, until counsel signs off. Every dollar of premium collected pre-
   authorization escalates felony grading under § 624.401.
2. **Retain a Florida insurance regulatory attorney NOW** (the single most important action).
   Brief them on the exact product, the Kalshi hedge, and all four of the founder's licenses.
3. **Protect the existing producer license.** Make clear to counsel the goal of *not* jeopardizing
   the Health/Life/Annuity license — the unauthorized-insurer path threatens it directly.
4. **Pick a lawful go-to-market with counsel:** likely **A/B** (placement through an
   admitted/E&S contingency or prize-indemnity carrier) for near-term launch, with **D**
   (MGA + fronting + reinsurer) scoped as the structure that captures the risk-bearing upside.
5. **Scrub all draft marketing** of "insurance/coverage/policy/premium/guarantee/payout" until the
   chosen structure is authorized; have counsel approve the final copy.
6. **Document the Kalshi hedge as a risk-management/reinsurance strategy of the risk-bearing
   entity** — never as a substitute for authorization. Confirm Kalshi's own Florida status is
   stable for the relevant contract types.

---

## Sources

- [Fla. Stat. § 624.02 — definition of "insurance"](https://www.flsenate.gov/Laws/Statutes/2025/624.02)
- [Fla. Stat. § 624.401 — certificate of authority required; penalties (2025 search)](https://m.flsenate.gov/Statutes/624.401)
- [Fla. Stat. § 624.401 (2025)](https://www.flsenate.gov/Laws/Statutes/2025/624.401)
- [Fla. Stat. § 624.402 — exceptions (2025)](https://www.flsenate.gov/Laws/Statutes/2025/624.402)
- [Fla. Stat. § 626.901 — representing or aiding unauthorized insurer prohibited (Justia)](https://law.justia.com/codes/florida/title-xxxvii/chapter-626/part-viii/section-626-901/)
- [Leppard Law — Transacting insurance without a COA; premium < $20,000 (3rd-degree felony)](https://leppardlaw.com/criminal-law/fraud/transacting-insurance-without-a-certificate-of-authority-premium-collected-less-than-20000/)
- [Leppard Law — Transacting insurance without a COA; $20,000–$100,000 (2nd-degree felony)](https://leppardlaw.com/criminal-law/white-collar-crimes/transacting-insurance-without-a-certificate-or-authority-premium-collected-20000-or-more-but-less-than-100000/)
- [Leppard Law — Representing an unauthorized insurer](https://leppardlaw.com/criminal-law/fraud/representing-an-unauthorized-insurer/)
- [Fla. Stat. § 626.112 — license and appointment required; agents, MGAs (Justia)](https://law.justia.com/codes/florida/title-xxxvii/chapter-626/part-i/section-626-112/)
- [MyFloridaCFO — Insurance Agent & Agency Services, licensing qualifications](https://www.myfloridacfo.com/division/agents/licensing/agents-and-adjusters/qualifications)
- [MyFloridaCFO — General Lines Agents & Customer Representatives (compliancy)](https://www.myfloridacfo.com/division/agents/compliance/general-lines-agents-customer-reps)
- [Florida OIR — Company Admissions](https://floir.gov/company-admissions)
- [Florida OIR — Surplus Lines insurer eligibility application (OIR-C1-916)](https://www.floir.com/docs-sf/default-source/Application/SurplusLines.pdf)
- [Florida Surplus Lines Service Office — Insurer Eligibility Application Process](https://www.fslso.com/licensing-registration/insurer-eligibility-application-process)
- [Surplus Lines Manual (Troutman) — Florida eligibility (surplus, history requirements)](https://www.surplusmanual.com/eligibility/florida/)
- [National Risk Retention Association — RRG comprehensive guide](https://www.riskretention.org/risk-retention-group-comprehensive-guide)
- [Mayer Brown — MGA/MGU and reinsurance/fronting structures](https://www.mayerbrown.com/en/insights/resource-centers/insurtech/mga-mgu)
- [Beazley — Prize Indemnity (contingency insurance)](https://www.beazley.com/en-US/products/contingency-usa/prize-indemnity/)
- [Wikipedia — Prize indemnity insurance](https://en.wikipedia.org/wiki/Prize_indemnity_insurance)
- [Snell & Wilmer — Event Contracts vs. Sportsbooks: the legal divide](https://www.swlaw.com/publication/event-contracts-versus-sportsbooks-charting-the-legal-divide-in-u-s-gambling-law/)
- [Epstein Becker Green — Prediction markets v. state gaming laws: the Kalshi litigation](https://www.commerciallitigationupdate.com/prediction-markets-v-state-gaming-laws-the-kalshi-litigation-gamble)
- [JURIST — Federal court allows Kalshi sports event contracts during litigation (Apr 2026)](https://www.jurist.org/news/2026/04/us-federal-court-rules-platform-kalshi-can-continue-offering-sport-event-contracts-during-litigation/)
