# R2 — India market: restaurant and small-retail operating software

Researched 8 Oct 2026. `FACT` means read on the linked page; *secondary* marks a trade or legal site. `INFERENCE` means our reasoning. Every number carries its year. Gaps are listed in §8.

---

## 1. Verdict in 10 lines

1. **Billing and POS are a red ocean.** Petpooja (100k+ clients, ₹102 Cr FY25 revenue) owns small restaurants and small chains. Zoho, Vyapar, myBillBook and the payments companies own small retail. A new POS wins nothing on features. `FACT` [Inc42](https://inc42.com/company/petpooja/financials/)
2. **"Ask your business anything" is already free.**
   - Petpooja's Ask Me Anything (Jul 2026) is on all plans and compares outlets.
   - Swiggy's Guru (Aug 2026) reaches 2.7 lakh restaurants in 20+ languages.
   - A chat layer is not a differentiator. `FACT` [Petpooja](https://blog.petpooja.com/operations-workflows/restaurant-ai-assistant-ask-me-anything/), [Swiggy](https://www.swiggy.com/corporate/press-release/say-hello-to-guru-swiggys-24x7-ai-business-partner-built-for-indias-restaurant-industry/)
3. **Supplier price-matching is free too.** Petpooja's "Best Match" (May 2026) compares HyperPure, DMart and local suppliers, then fills the cart. `FACT` [Petpooja blog](https://blog.petpooja.com/industry-business-guides/petpooja-purchase-manager-features-setup/)
4. **What's missing is cross-source.**
   - Each assistant sees only its own data: Guru sees Swiggy, and Petpooja's AMA sees bills.
   - Petpooja's ₹20k tier reconciles aggregator payouts and exports to Tally.
   - We found no product that also brings in supplier invoices and bank/UPI statements, explains every break with cited rows and drafts the fix. `INFERENCE`
5. **Trust in POS records is now a live issue.** Tax raids on about 100 restaurants (2025–26) allege bulk bill deletion in POS software, with over ₹5,000 Cr of sales hidden in Punjab. Petpooja disputes the "hidden feature" claim. `FACT` [Inc42](https://inc42.com/features/petpooja-restaurants-the-missing-sales-trail-under-taxmens-lens/)
6. **Owners buy on price, support and word of mouth.** We found no evidence that owners ask for "AI", but no evidence against it either. `INFERENCE`
7. **ARPU is low.** Petpooja earns roughly ₹7–10k per client per year. Vyapar spent ₹2.04 to earn ₹1 in FY25. Kiranas are the worst place to start. `INFERENCE` from [Entrackr](https://entrackr.com/fintrackr/vyapar-posts-rs-63-cr-loss-in-fy25-cash-reserve-fades-93-10819211)
8. **Replacing the POS means clearing the whole demo gate.** Offline billing, KOT printers, aggregator integration (approval-gated but open, via Zomato's POS platform or UrbanPiper), Tally, on-site install and 24/7 support all come before any AI. `INFERENCE`
9. **Wedge:** an AI back office *on top of* whatever POS is already there, for 2–5 outlet groups and multi-brand cloud kitchens. It closes the month, finds leaks (payouts, food cost, voids, supplier drift) and drafts actions for the owner to approve. `INFERENCE`
10. **Full OS later.** Own ordering, then POS, sold at the annual contract renewal once the layer has earned data and trust. `INFERENCE`

---

## 2. Incumbents

| Name | Segment | Pricing (₹, ex-GST) | AI shipped 2025–26 | Weakness |
|---|---|---|---|---|
| **Petpooja** | Independents and small chains (₹50L–5Cr revenue), cloud kitchens | Base ₹12,000, Ops ₹20–30k, Marketing ₹20–40k. Annual-only since 13 Jul 2026; per-outlet basis not stated. `FACT` [pricing](https://www.petpooja.com/pricing), [PricingSaaS](https://pricingsaas.com/companies/petpooja) | AMA (answers only), Best Match, AI invoice scan, AI Marketing Agent `FACT` [blog](https://blog.petpooja.com/procurement-cost-control/petpooja-ai-features-help-restaurants-decide-better/) | FY25 loss ₹21.4 Cr and widening; tax probe; refund/support complaints `FACT` [Trustpilot](https://www.trustpilot.com/review/petpooja.com) |
| **Restroworks (ex-Posist)** | Enterprise chains, global | Quote only `FACT` [pricing](https://www.restroworks.com/pricing/) | ML kitchen forecasting; no generative-AI launch found `FACT` [llm-info](https://www.restroworks.com/llm-info/) | Flat growth (*unverified*); too heavy for small groups |
| **UrbanPiper** | Middleware from POS to aggregators | Quote only | Orderline AI voice ordering `FACT` [site](https://urbanpiper.com/orderline) | FY25 revenue falling and loss-making (*Inc42 figures conflict*) |
| **Swiggy / Zomato tools** | All listed restaurants | Free; paid via commission | Guru acts on ads and discounts; Eternal × OpenAI partner assistants `FACT` [Storyboard18](https://www.storyboard18.com/brand-marketing/eternal-teams-up-with-openai-for-ai-rollout-across-zomato-blinkit-hyperpure-89914.htm) | Each sees one channel and has a conflict of interest `INFERENCE` |
| **Hyperpure (Eternal)** | Restaurant supplies | Supply margin | Built into Best Match | Now restaurant-only; Q2 FY26 revenue ₹1,023 Cr `FACT` [Medianama](https://www.medianama.com/2025/10/223-hyperpure-q2-revenue-drops-blinkit-inventory/) |
| **DotPe / Thrive / DineOpen** | QR, direct and low-end ordering | DineOpen ₹299/month `FACT` [site](https://www.dineopen.com/) | DotPe "AI brain" rebrand (*unverified*); DineOpen AI order agent | DotPe FY25 ₹82.8 Cr `FACT` [Inc42](https://inc42.com/company/dotpe/financials/); Thrive tiny (FY24 ₹3.85 Cr) `FACT` [Tracxn](https://tracxn.com/d/companies/thrive/__OB-_1KmUzE4rxLT_J1OVSm8gHYXD4FNR_DnCWH5hsMY) |
| **Toast / Square** | — | Not in India `FACT` [Toast](https://support.toasttab.com/en/article/Toast-Product-Availability-in-Australia-Canada-Ireland-and-the-United-Kingdom) | — | — |
| **Gofrugal / Zoho** | Retail and restaurant ERP, SMB retail | Gofrugal from ₹500–750/month; Zoho Inventory free to ₹7,499/month; Zoho POS free to ₹2,099/month `FACT` [Gofrugal](https://www.gofrugal.com/), [Zoho](https://www.zoho.com/in/inventory/pricing/) | Zia assistant; generic "ML" | Gofrugal is on-prem legacy; Zoho isn't food-specific |
| **Vyapar / myBillBook** | Micro-SMB billing | Vyapar ₹3,654–10,199/yr; myBillBook ₹3,490–3,990/yr `FACT` [Vyapar](https://vyaparapp.in/offers/discount-on-app-at-canopy), [myBillBook](https://mybillbook.in/pricing-plans) | myBillBook AI bank reconciliation | Vyapar FY25 loss ₹63 Cr on ₹69 Cr revenue, ₹6 Cr cash left |
| **Khatabook / OkCredit / Dukaan / Marg** | Kirana ledgers, D2C stores, pharma ERP | Free; Marg ₹10–25k (*unverified*) | None found | Khatabook FY24 loss ₹116 Cr; Dukaan dormant `FACT` [Tracxn](https://tracxn.com/d/companies/dukaan/__dAKjijXptU7fVLLVml9dbnU9ilNjWAN1xHCaf5hU3bM) |
| **Paytm / PhonePe / Pine Labs** | Every counter | Device rental + MDR | Paytm AI Soundbox (business Q&A) `FACT` [FoneArena](https://www.fonearena.com/blog/466319/paytm-ai-soundbox-features.html) | Payments-first; Soundbox at 1.57 Cr storefronts `FACT` [Paytm Q1 FY27](https://paytm.com/document/ir/financial-results/Paytm_Earning-Release_Q1-FY-2027.pdf) |

Not researched: Restroapp, Limetray, JioMart partner tools.

---

## 3. Table-stakes checklist (missing any one loses the demo)

| Must have | Note |
|---|---|
| Offline billing with cloud sync; KOT per kitchen station; ESC/POS printers; multiple counters | `FACT` [Petpooja billing](https://www.petpooja.com/billing). Petpooja plans include 1–2 on-site install visits. |
| GST bill: 5% without input tax credit; aggregator orders kept out of own GST liability (Sec 9(5)) | `FACT` *secondary* [CAclubindia](https://www.caclubindia.com/articles/gst-rate-on-restaurant-services-in-hotels-changes-effective-april-2025-55492.asp) |
| FSSAI 14-digit number on every bill | `FACT` [FSSAI order](https://mail.fssai.gov.in/upload/advisories/2021/10/6156936ac80bbOrder_License_Number_Print_01_10_2021.pdf) |
| Swiggy/Zomato orders flowing into the POS | Approval-gated. Zomato opened a POS developer platform in 2024 `FACT` [BW Disrupt](https://bwdisrupt.com/article/zomato-introduces-pos-developer-platform-for-restaurants-532618). Integrators: UrbanPiper, Petpooja, Restroworks, Deliverect, Gofrugal. |
| UPI dynamic QR and soundbox; cards via Pine Labs, Razorpay or Paytm EDC | Expected at the counter. |
| Tally export; aggregator payout reconciliation; API/ERP integration | All in Petpooja's Growth tier (₹20k). `FACT` [pricing](https://www.petpooja.com/pricing) |
| Recipe inventory, central multi-outlet menu, WhatsApp loyalty/CRM | Inventory is a common complaint (*unverified snippets*). |
| B2B e-invoice | Only above ₹5 Cr turnover. |
| 24/7 local-language phone support | `INFERENCE`: matters more than any feature. |

---

## 4. Distribution reality

- **Resellers.** Petpooja pays resellers 15% of assured revenue, within 10–12 days. Anyone with Aadhaar and PAN can join, and users earn ₹500 per referral. `FACT` [reseller program](https://www.petpooja.com/reseller-program). Gofrugal keeps its channel partners under Zoho. `FACT` [CEO letter](https://www.gofrugal.com/announcements/CEO-letter-announcement.html)
- **Accountants on YouTube.** Vyapar sponsors CA and finance channels. `FACT` *secondary* [SponsorRadar](https://sponsorradar.com/brands/vyapar)
- **Bundling.**
  - Swiggy and Zomato invested in UrbanPiper (2022). `FACT` [Inc42](https://inc42.com/buzz/zomato-backed-saas-startup-urbanpiper-bags-24-mn-funding-led-by-sequoia-capital-tiger-global/)
  - Hyperpure sits inside Petpooja's Best Match.
  - PhonePe has 47M registered merchants. `FACT` *secondary* [DRHP](https://www.ap7am.com/en/121974/phonepes-merchant-network-hits-47-million-businesses-drhp-reveals-diversified-monetisation)
- **Lock-in.** Annual-only billing gives one switching window a year. `FACT` [PricingSaaS](https://pricingsaas.com/companies/petpooja)
- **Unit economics.**
  - No player publishes CAC, churn or NRR.
  - ARPU estimate: ₹102 Cr ÷ 1–1.5 lakh clients ≈ ₹7–10k per client per year. `INFERENCE`
  - Burn is the norm. Khatabook's pivot to lending stalled on "small loan ticket size, unreliable data". `FACT` [Morning Context](https://themorningcontext.com/internet/khatabook-cant-lend-enough-to-justify-its-valuation)
- **How owners decide.** The reseller's quote, what peers say, the CA's view, and whether support picks up at 11 pm on a Saturday. `INFERENCE` (we found no survey)

---

## 5. The real gap, with evidence

**Crowded:**
- billing;
- "chat with your data" (Petpooja AMA, Swiggy Guru, Zoho Zia, Paytm Soundbox, Eternal × OpenAI);
- supplier price-matching (Best Match);
- voice ordering (UrbanPiper, DineOpen, DotPe);
- single-outlet POS at ₹299/month.

**Missing (evidence → gap):**
1. **Every AI is stuck in one silo.** Guru covers Swiggy metrics, ads and payouts. `FACT` [Swiggy](https://www.swiggy.com/corporate/press-release/say-hello-to-guru-swiggys-24x7-ai-business-partner-built-for-indias-restaurant-industry/) Petpooja's AMA "sits on top of the same data your restaurant reports already hold" and only answers questions. `FACT` [Petpooja](https://blog.petpooja.com/operations-workflows/restaurant-ai-assistant-ask-me-anything/) The owner's real P&L spans POS, Swiggy, Zomato, suppliers, bank/UPI and Tally. We found no product that joins supplier invoices and bank data to the POS and aggregator data, explains each break with sources, and drafts the fix. `INFERENCE`
2. **Aggregator economics are the biggest leak, and the aggregator is the one explaining them.**
   - NRAI told the Competition Commission (CCI) in 2021 that commissions ran 25–35%, alongside forced discounts and late payouts. `FACT` [Medianama](https://www.medianama.com/2021/07/223-nrai-additional-info-cci-swiggy-zomato/)
   - The CCI investigator's 2024 report found violations. `FACT` [Inc42](https://inc42.com/buzz/swiggy-zomato-breached-competition-laws-finds-cci-probe)
   - A vendor estimates the effective take at 30–40% or more once fees, discounts and ads are counted. *Vendor source* [DineOpen](https://www.dineopen.com/blog/swiggy-zomato-commission-calculator-guide)
   - An advisor neutral to both aggregators has a reason to exist. Guru cannot be neutral. `INFERENCE`
3. **Cloud kitchens bleed.** About half in the metros ran at a loss (NRAI 2023), and 25–30% close within a year. `FACT` *secondary* [Petpooja blog](https://blog.petpooja.com/operations-workflows/why-cloud-kitchens-shutting-down/) Multi-brand kitchens need P&L per brand, per channel and per ad campaign. `INFERENCE`
4. **Trust in the books.** The probe *alleges* bulk bill deletion; 60 TB was seized from Petpooja's servers. `FACT` [Inc42](https://inc42.com/features/petpooja-restaurants-the-missing-sales-trail-under-taxmens-lens/)
   - Bluntly, a ledger that cannot delete bills is a *negative* for owners who wanted deletion.
   - The buyers who want it are group owners guarding against staff theft, franchisors, investors and lenders. `INFERENCE`
5. **Setup and inventory are a burden.** Reviews say "Inventory module is tricky" and "requires quite a bit of effort to configure" (*unverified snippets*: [Techjockey](https://www.techjockey.com/brand/petpooja), [Capterra](https://www.capterra.com/p/172163)). An agent that *maintains* recipes, par levels and rate cards from invoice photos removes work owners currently skip. `INFERENCE`

**Does anyone want an "AI brain"?** We found **no survey and no owner quote** asking for one. The evidence we have is about price, support and aggregator margins. Owners will not pay for *explanations*. They may pay for **money recovered and hours saved**: a missed payout, a supplier overcharge, or a month-end close done for them. Pitch outcomes, not an "AI brain". `INFERENCE`

---

## 6. Regulatory checklist

| Area | Rule | Source |
|---|---|---|
| GST e-invoice | B2B, turnover above ₹5 Cr (from 1 Aug 2023). Restaurants mostly sell B2C, so it bites only on catering and corporate invoices. | `FACT` [GST Council](https://gstcouncil.gov.in/node/4365) |
| E-invoice reporting window | Turnover ≥ ₹10 Cr must report within 30 days (from 1 Apr 2025). | `FACT` [GSTN via Taxmann](https://www.taxmann.com/post/blog/time-limit-of-30-days-for-reporting-e-invoice-on-irp-portal-for-taxpayers-with-aato-of-10-crores-and-above-gstn-update/) |
| B2C invoices | Dynamic QR only above ₹500 Cr turnover. B2C e-invoicing is a voluntary pilot, not mandated. | `FACT` *secondary* [CAclubindia](https://www.caclubindia.com/news/54th-gst-council-meet-approves-b2c-e-invoicing-pilot-for-retail-efficiency-23799.asp) |
| GST rates | Restaurants 5% without input tax credit, unchanged by GST 2.0 (22 Sep 2025). Composition scheme up to ₹1.5 Cr. | `FACT` *secondary* |
| DPDP Act + Rules 2025 | Rules notified Nov 2025. Consent Managers from 13 Nov 2026. Core duties from 13 May 2027: notice, security, breach report to the Board within 72 h, rights requests answered within 90 days. Penalties up to ₹250 Cr. MeitY consulted on pulling the deadline forward to 13 Nov 2026 (*unverified*). The restaurant is the Data Fiduciary and the SaaS is the Processor, so we need a DPA, breach alerts and an erasure API. | `FACT` [PIB](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190655), *secondary* [India Briefing](https://india-briefing.com/news/india-dpdp-compliance-timeline-enforcement-2026-27-44740.html), [Mondaq](https://www.mondaq.com/india/data-protection/1773554/) |
| Aggregator customer data | Zomato and NRAI are designing consent-based sharing of customer data with restaurants. | `FACT` *secondary* [Storyboard18](https://www.storyboard18.com/how-it-works/zomato-to-open-up-customer-data-for-restaurants-swiggy-could-be-next-84488.htm) |
| RBI localisation | Payment data stored only in India (2018). This binds payment operators. We use hosted gateways but should still host in India. | `FACT` [RBI](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=11244); hosting `INFERENCE` |
| Cards | Tokenisation since Oct 2022. Never store card numbers. | `FACT` *secondary* |
| UPI MDR | From 15 Oct 2026, 0.4% on merchant UPI payments above ₹2,000. Payments of ₹2,000 or less, and merchants taking ≤ ₹1 lakh/month, stay exempt. | `FACT` *secondary* [SCC Online](https://www.scconline.com/blog/post/2026/09/16/npci-released-upi-mdr-faqs-explained/) |
| FSSAI | From 1 Apr 2026: registration up to ₹1.5 Cr turnover, state licence ₹1.5–50 Cr, central licence above that. Licences no longer expire. Licence number on bills. Calories and allergens on menus for chains of 10+ outlets. | `FACT` [FSSAI order 13 Mar 2026](https://www.fssai.gov.in/upload/advisories/2026/03/69b4054bb6cd6Order%20dated%2013thMarch2026_Revised%20Turnover%20threshold.pdf), [labelling](https://mail.fssai.gov.in/upload/uploadfiles/files/Guidance_Note_Labelling_23_02_2022.pdf) |

---

## 7. Recommended wedge, plus pushback on "replace everything"

**Recommendation: "the AI back office" for 2–5 outlet groups and multi-brand cloud kitchens, on top of whatever POS they run.**
- **Inputs:** POS exports, Swiggy/Zomato payout statements, supplier invoices (photo or PDF), bank/UPI statements, Tally.
- **Outputs:**
  - (a) Month-end close: reconcile, explain each break with cited rows, then produce P&L per outlet, brand and channel.
  - (b) Leak finder: actual vs theoretical food cost, supplier price drift, voids and deleted bills, ROI on aggregator ads and discounts.
  - (c) Drafted actions behind the approval gate: an aggregator dispute, a supplier counter-offer, a price change. These map onto D-006/D-007 and demo stories 2 and 3.
- **Price, bluntly:**
  - ₹1,500–3,000 per outlet per month is ₹18–36k a year.
  - That is 1.5–3× Petpooja's *whole* ₹12k base plan, and 2–5× its per-client ARPU.
  - It only sells with a written "₹ found in month 1 or you don't pay" promise. Otherwise start near ₹500–1,000 per outlet per month. `INFERENCE`
- **Why this segment:** the gap is **cross-source, not cross-outlet**. Petpooja already compares outlets, and 2–5 outlet groups are its core market. Groups and cloud kitchens, though, run the most sources at once: several outlets or brands, both aggregators, many suppliers, and someone who closes the books. Cloud kitchens are almost all-aggregator, so payout and ads leakage is largest there. `INFERENCE`
- **Feasibility:**
  - No public analytics read API from Petpooja turned up. Third-party catalogues list only its ordering APIs `FACT` [API Evangelist](https://providers.apievangelist.com/providers/petpooja/).
  - The Growth tier does advertise "API integration" and "SAP/ERP integration" `FACT` [pricing](https://www.petpooja.com/pricing). Access terms are unverified.
  - This cuts both ways. Ingesting may be easier than exports, but Petpooja controls the tap.
  - Start with exports and statements (upload or forwarded email). That is the same work the accountant does today.
  - Restroworks runs a formal integration partner programme. `FACT` [Restroworks](https://www.restroworks.com/partners/technology-integration/)
- **Biggest risk:** Petpooja ships it. It already has payout reconciliation, AMA and Best Match. The defence:
  - neutrality across POS systems and aggregators;
  - actions, not answers;
  - a tamper-evident audit trail, which the vendor named in the probe will struggle to sell credibly. `INFERENCE`

**Ranked alternatives (what would flip the choice):**
1. **Cloud-kitchen-only "aggregator CFO".** Switch to this if pilots show groups won't share POS data but cloud kitchens will share payout files.
2. **Direct ordering plus CRM** (our QR/web suite, using consented aggregator customer data). Switch if Zomato's data-sharing goes live. Thrive's ₹3.85 Cr revenue is the warning.
3. **Not recommended:**
   - Kiranas: lowest ARPU, Khatabook and Dukaan as cautionary tales, and Paytm/PhonePe already at the counter.
   - New-POS-first for bakeries or single outlets: ₹299/month price floor, and Petpooja's reseller network.

**Pushback on "replace everything first":**
- **The demo gate is brutal.** Offline billing, ESC/POS KOT routing, FSSAI/GST bill formats, Tally, on-site install and 24/7 support. Miss one and the owner stops listening before the AI appears. Aggregator integration is clearable through Zomato's platform or UrbanPiper, but it is another approval and another cost. Petpooja took ~14 years and a reseller army to clear all of it.
- **Switching windows are annual.** Owners can't leave mid-contract, but they can add a layer tomorrow.
- **AI is only as good as its data.** A layer has data on day 1. A replacement POS has it only after migration.
- **Sequence it, don't shrink it.**
  - Phase 1: the layer (books, leaks, actions).
  - Phase 2: own direct ordering and KDS, for groups escaping commission.
  - Phase 3: full POS at renewal, offered to groups already running their back office on us.
  - The full OS stays the destination. D-005's adapters become the front door. `INFERENCE`

**For the Cup demo:** keep the native core (D-005, D-010) and keep D-012's three stories. In story 3, swap the simulated settlement file for **Swiggy/Zomato-shaped payout files plus a POS-style export**. That proves the layer story without adding a fourth story. `INFERENCE`

---

## 8. Gaps and caveats
- CAC, churn and NRR are not public. ARPU is derived.
- Evidence on complaints and on demand for AI is thin. Reddit, the Play Store, G2 and Capterra were blocked, and the search budget ran out. **Run 10 owner interviews before setting a price.**
- Unverified: Restroworks and UrbanPiper FY25 figures, DotPe/Rista, Marg pricing, outlet counts.
- Market size: food services ₹5.69 lakh Cr in FY24, 43.8% organised (NRAI IFSR 2024). `FACT` [Business Standard](https://www.business-standard.com/industry/news/indian-food-services-sector-to-grow-by-8-1-from-2024-to-2028-report-124070900997_1.html)
