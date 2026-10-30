# W4 read routes: the hand list for T-092a/b (11 Oct 2026)

**Why this file exists.** The W2 review (R3, contracts/SDK/gates) listed "spec-drift read routes for W4" and deferred them (W2-FIX-LIST, last line; DECISIONS 10 Oct evening). That list was never saved to a file.

On 11 Oct the docs lane rebuilt it by comparing three sources:
- the GET routes that core-api actually mounts;
- `packages/contracts/generated/openapi/public.json`;
- `docs/plan/screens/*.md` and `docs/plan/flows/*.md`.

This file is the **independent hand list** that T-092a/b gates count against. Corrections are allowed only as dated additions. The rebuild is a reconstruction, not the lost original (UNVERIFIED as identical).

## Declared in contracts but not served (owner T-040, W3.0, not T-092)

`modules/index.ts` lists `evidence, findings, inbox, runs, traces, internal`, but the directories do not exist, and `loadRouters` skips a missing directory silently. The 7 routes affected:
- `GET /v1/findings`
- `GET /v1/inbox`
- `GET /v1/snapshots/{id}`
- `POST /v1/snapshots` (member mint, R40 C4)
- `GET /v1/runs?finding=`
- `GET /v1/runs/{id}`
- `GET /v1/traces/{run}`

T-040 also adds the `GET /v1/runs` list (back-office G-OFF-1).

## Missing everywhere (T-092a: rows 1–10 · T-092b: rows 11–26)

| # | Route | Needed by | Module |
|---|---|---|---|
| 1 | `GET /v1/orders?outlet=&status=&table_ref=&shift=&business_date=&cursor=` | pos.md P5 tables, P6 refund lookup; manager-staff-ops.md M4 | orders |
| 2 | `GET /v1/shifts?outlet=&device=&status=&from=&to=&cursor=` (`GET /v1/shifts/{id}` exists, 51092b5) | M4 "No open shift on this device"; pos.md P7; D8 | orders |
| 3 | `GET /v1/finance/settlement-lines?channel=&from=&to=&cursor=` (+ `/v1/finance/settlements`) | D8; onboarding-import.md I4; flows import step 7; story 3 steps 6–8 | finance |
| 4 | `GET /v1/finance/bank-lines?from=&to=` | import step 7 / I4 (bank import); story 3 | finance |
| 5 | `GET /v1/finance/disputes` (+ `/{id}`) | story 3 step 10 | finance |
| 6 | `GET /v1/finance/period-closes` | story 3 step 12; the close checklist | finance |
| 7 | `GET /v1/inventory/ingredients?outlet=&q=` | M1 count list; M2 waste picker | inventory |
| 8 | `GET /v1/inventory/waste?outlet=&business_date=&cursor=` | M2 today's list; D8 | inventory |
| 9 | `GET /v1/inventory/counts` (+ `/{id}` with its adjust lines) | M1 result screen | inventory |
| 10 | `GET /v1/inventory/transfers?outlet=&status=` | the receiving side of `transfers/{id}:receive`; dashboards §3 | inventory |
| 11 | `GET /v1/people/rosters?outlet=&week=` (staff see only their own shifts) | M3 roster grid and the staff view | people |
| 12 | `GET /v1/people/attendance?outlet=&from=&to=` | D8; T-069; dashboards §5 | people |
| 13 | `GET /v1/people/advances?outlet=&staff=&status=` | D8; dashboards §5 | people |
| 14 | `GET /v1/people/payroll-drafts?outlet=&month=` | payroll status actions; the story 3 checklist | people |
| 15 | `GET /v1/catalogue/items?include_inactive=` | onboarding-import.md §C settings/menu | catalogue |
| 16 | `GET /v1/catalogue/recipes?item=` | §C recipes; story 2 "Add recipe" | catalogue |
| 17 | `GET /v1/catalogue/prices?item=&outlet=&channel_kind=` (future-dated included) | §C prices; story 2 step 8 | catalogue |
| 18 | `GET /v1/catalogue/deals` | §C deals | catalogue |
| 19 | `GET /v1/catalogue/coupons` | §C coupons | catalogue |
| 20 | `GET /v1/outlets/{id}/calendar` | §C outlets: hours and holidays | tenancy |
| 21 | `GET /v1/pickup-windows?outlet=&date=` (member) | §C pickup capacity | storefront/tenancy |
| 22 | `GET /v1/customers/{id}` | the T-075 customer record | customers |
| 23 | `GET /v1/runs` (list) | back-office.md B1 run picker. **Moved to T-040**; listed so the count is complete. | runs |
| 24 | `GET /v1/wiki/pages` (+ `/{id}`, `/{id}/versions`) | console-home-inbox-ask.md C4 (needs T-057) | wiki |
| 25 | `GET /v1/conversations?outlet=` (+ `/{id}/messages`) | manager-staff-ops.md M7 handover. Ingested text is untrusted and rendered as plain text. | conversations |
| 26 | `GET /platform/v1/budgets/{tenant}/spend` | platform-admin.md A5 | platform |

## Filter gaps on existing routes (T-092a)

| Route | Gap |
|---|---|
| `GET /v1/imports/runs` | no cursor, limit, kind or status filter (hard `LIMIT 100`, `modules/imports/index.ts:226`); D8 |
| `GET /v1/inventory/movements` | no `kind` or `ref` filter (M1 count adjustments, M2 waste) |
| `GET /v1/drafts` | no `source` filter (the specialist desk and the dashboard agent panel want `source = intel:<pack>`) |
| `GET /v1/findings` | no `pack` filter (the specialist desk) |

**Totals:** 26 missing routes (row 23 is owned by T-040), 4 filter gaps, and 7 declared-but-unmounted routes (T-040).

Aggregates are excluded here because R26 serves them through snapshot templates (M-C1a–d) and the member mint. They cover the today strip, stock on hand, count variance, shift tenders, P&L, GST, close status, dashboard tiles and the track record.
