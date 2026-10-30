# Platform admin — `/admin` (Munim operator, not the merchant)

**Ticket:** T-068 (UI), T-031 (platform API), T-006 (`/platform/v1/tenants:provision`). **i18n prefix:** `admin.*`.
**Who:** an operator (`platform.operator`, operator token). Members never reach `/admin`: a member token →
`S-404` (do not reveal the surface). Desktop-first; targets ≥ 40 px acceptable here (not a tablet surface),
inputs ≥ 16 px. **Every config change is a `platform.config_draft`** shown with full patch + diff, approved by a
named operator (an operator's own command is its approval, R27; a second operator may review); every
change is in `platform.platform_audit` (hash-chained). **Merchants never see providers or models (R36).**
Routes beyond `tenants:provision`: not fixed — T-031 (gap G-ADM-1).

## Chrome

```
┌ Munim admin · operator: ops@… ▾   [Tenants] [Packs] [Plans] [Flags] [Budgets] [Models] [Drafts 2] ┐
```
"Drafts" badge = list length of pending `config_draft` rows. Global banner when any kill switch is on:
"AI is switched off for {n} tenants." (n = list length of flag rows).

## A1 · Tenants — `/admin/tenants`

Purpose: see and provision tenants. Heading: "Tenants"

Table from `platform.tenant_registry` (view over `core.tenant`): name, country, status, "Demo" tag, created.
No tenant business data is shown (operators are not tenant members). "Provision tenant" → form (name, kind,
country, owner email) → `POST /platform/v1/tenants:provision` (`tenancy.provision.v1`) → "Provisioned. An
invitation was sent to {email}." Retire → status `retired` (never deleted): "Retire {name}? Members lose
access; nothing is deleted." Country column is read-only (R30).
States: `S-off` std · `S-deny` non-operator → `S-404` · `S-abst` n/a · `S-load` · `S-empty` "No tenants yet." · `S-err` · provisioning refused (duplicate idempotency key
with a different body → 409) "This request was already used with different details."

## A2 · Country packs — `/admin/packs`

Purpose: view and version country packs. Heading: "Country packs"

List: code (IN, AU), version, effective_from, status. Detail: the pack `doc` rendered by section (currency +
minor units, tax rules, receipt rules, formats, time zones, aggregator import formats, compliance calendar,
chart of accounts, payroll scope, surcharges) with a JSON view. "Propose new version" → editor validated live
against `contracts/country-pack.schema.json` → config draft (needs a future `effective_from`). Errors inline:
"{path}: {schema message}". Copy: "A new version applies from its start date. Past receipts keep the
version they were issued under." States: `S-empty` n/a (IN, AU seeded) · `S-err` std · `S-off` std · `S-deny` as A1 · `S-abst` n/a · `S-load` · schema invalid → "Fix {n} problems before proposing."

## A3 · Plans — `/admin/plans`

Purpose: define tiers and assign them. Heading: "Plans"

Plans/tiers with included features (Core, Intelligence, Storefront) and limits; assign a plan to a tenant →
config draft. `S-empty` "No plans defined."
States: `S-load` · `S-err` std · `S-off` std · `S-deny` as A1 · `S-abst` n/a.

## A4 · Feature flags — `/admin/flags`

Purpose: switch features and the AI kill switch per tenant. Heading: "Feature flags"

Per tenant (and global default): `intel.enabled` (the kill switch, typed), storefront on/off, per-pack AI
panels. Toggle → config draft with patch preview → "Approve and apply". Kill-switch copy on confirm: "Turn
off AI for {tenant}? Their AI panels hide; POS, orders and approvals keep working." (03-arch §9).
States: `S-load` · `S-empty` n/a (flags seeded) · `S-err` std · `S-off` std · `S-deny` as A1 · `S-abst` n/a.

## A5 · Budgets — `/admin/budgets`

Purpose: set per-tenant monthly AI spend limits. Heading: "AI budgets"

Per tenant per month: limit (`row platform.llm_budget.limit_minor`), spent (`platform.llm_budget.spent_minor`
— a view over `intel.intel_spend`, i.e. an aggregate: gap G-ADM-2, operators have no snapshot mechanism;
spec'd as "spent" with an "Open spend rows" link listing `intel_spend` rows), soft cap → cheaper role, hard
cap → rules only (04 §10). Edit limit → config draft. `S-empty` "No budgets set — tenants use the plan default."
States: `S-load` · `S-err` std · `S-off` std · `S-deny` as A1 · `S-abst` n/a.

## A6 · Models — `/admin/models` (provider + model per role, R36)

Purpose: assign a provider and model to each role. Heading: "Models by role"

```
┌ Role      Provider ▾      Model id ▾                 Last probe        Status       ┐
│ router    Gemini          {model id}                 {time} ✓          active       │
│ reason    OpenRouter      {model id}                 {time} ✓          active       │
│ extract   Gemini          {model id}                 —                 "Not probed" │
│ narrate · vision · embed …                                                          │
│ [ "Propose change" ]                                                                │
└─────────────────────────────────────────────────────────────────────────────────────┘
```
- Source: `row platform.model_role` (role, provider, model_id, probed_at). Providers offered: Gemini, OpenAI,
  OpenRouter, NVIDIA (only those with a key present; others shown disabled "No API key configured").
- Change → config draft → approve → applied (T-068 gate: pending → applied). Refusals: unknown provider →
  "Unknown provider." (T-031); any `gemini-2.5-*` model id → "This model family is not allowed (retires
  20 Oct 2026)." (CLAUDE rule 13; `reason_code TBD`); embed role with dimensionality ≠ 768 → "Embeddings must
  be 768-dimensional."
- Probe results arrive as drafts from the probe job ("Proposed by probe {time}").
States: `S-load` · `S-empty` n/a (roles seeded) · `S-err` std · `S-off` std · `S-deny` as A1 · `S-abst` n/a.

## A7 · Config drafts — `/admin/drafts`

Purpose: decide pending config changes. Heading: "Config changes"

List of `config_draft` (target, proposed_by, status). Detail: full patch + before/after diff; "Approve and
apply" / "Reject" (reason required, 1–500 chars). States: `S-load` · `S-err` std · `S-off` std (retry resends the same key) · `S-deny` as A1 · `S-abst` n/a · `D-done` "Already decided by {operator}." ·
`D-stale` if the target changed since the draft (`INFERENCE` — no `based_on` for config drafts; gap G-ADM-3).
`S-empty` "No config changes waiting."
