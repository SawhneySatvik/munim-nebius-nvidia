# NB-6b report: done

The inbox draft page (`/staff/inbox/{id}`) now shows an invoice draft's page-span figures as the page text plus "Read on the page", as the suppliers screen does. An unresolvable span (other document, no chunk holds it, text unreadable) still shows "Cannot verify".

**Change.** `PageRead` moved from `suppliers/invoices.tsx` into `source.tsx` (shared, exported). `DraftField` takes an optional `read` prop. `draft-detail.tsx` fetches `GET /v1/imports/documents/{id}/text` for an invoice draft and resolves each span with NB-6's `spanText`. Page text renders as React text, never raw HTML (gotcha 15).

**Red/green.** `tests/draft-span.test.ts`: with the `read` branch disabled (today's behaviour) the resolvable case fails (`expected … to contain '1560.00'`); restored, 2 passed. The unresolvable cases stay "Cannot verify" in both.

**Gates.** web vitest `Test Files 17 passed (17)`, `Tests 191 passed (191)`; `tsc --noEmit` clean.

**Screenshot.** `apps/web/.screenshots/NB-6b/inbox-invoice-390.png` (draft `01a17dbd-8e3e-7fa6-b4ae-07aae34f2d20`): 3 "Read on the page", 0 "Cannot verify", no overflow.

**Guarantee scan.** Books: no write path touched; approval gate unchanged (still needs typed values). Numbers: page-read values are labelled as the model's reading, not ledger figures.

**Files**
```
apps/web/components/staff/source.tsx
apps/web/components/staff/draft-field.tsx
apps/web/components/staff/pages/draft-detail.tsx
apps/web/components/staff/suppliers/invoices.tsx
apps/web/tests/draft-span.test.ts
apps/web/.screenshots/NB-6b/inbox-invoice-390.png
docs/plan/lanes/NB-6b.report.md
```
Not mine: `apps/web/AGENTS.md`. Left alone: label "Tax minor per kg" (existing `fieldLabel`).
