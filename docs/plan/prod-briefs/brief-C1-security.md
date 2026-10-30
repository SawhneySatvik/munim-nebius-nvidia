# C1 — security review of the Cup export (plan 07, R62) — read-only

Read `CLAUDE.md` (the One Guarantee; rules 1–20; gotchas 16, 20–23, 33), `docs/plan/03-architecture.md` (trust boundaries,
book guard, run tokens), `docs/plan/04-agent-framework.md` (cite-or-abstain, quarantine), `scripts/export-cup/rules.py`
(what the Cup export carries: review **only those paths**), `infra/gcp/README.md` + `scripts/deploy-gcp.sh`.

**Read-only.** Do not edit any file. Never open `.env`. A concurrent lane is editing intel's Gemini request builder, core's
Ask timeout and spend/trace grace, apps/web's tracker and a "Request quotes" control, and the Cobnut seed — note any finding
in those areas as "re-check after the go-live fix lands". Heavy commands through `scripts/dev/heavy.sh`.

## Review (with evidence: file:line, a reproducible request or SQL, and why it matters)
1. **Dependencies:** `pnpm audit --prod` (and dev) over the workspace; Python: `uvx pip-audit` against `services/intel` and
   `services/suppliers-sim` lockfiles (no install into the project venv). Triage each advisory: reachable or not.
2. **Secrets and history:** the exported tree and its history (`make export-cup` output if present under
   `projects_26/food-ops-cup`; else the repo paths the export keeps) for keys, tokens, `.env*`, private URLs.
3. **AuthN/AuthZ on every core-api route** (`/v1`, `/platform/v1`, `/internal/intel/v1`, `/internal/cron/v1`, stream):
   member auth + tenant header, role and outlet scope, storefront key (404 not 403, timing-safe, gotcha 16), service secret,
   run tokens (Ed25519 verify + `intel.run` row; scope only from the run), cron bearer. Look for a route that trusts a
   client-sent tenant, outlet, total or identity.
4. **Tenant isolation and DB privileges:** RLS forced everywhere, `SET LOCAL` only, no `auth.uid()`, SECURITY DEFINER
   functions and their EXECUTE grants (gotcha 21), the app role never owning tables, `munim_svc` with no book grants,
   intel's read-only role. Spot-check with the db test harness (`db/tests`), don't rewrite it.
5. **The One Guarantee — both clauses**: any path that changes a book without a named person's command or approved decision;
   any number shown that is not a snapshot cell; model text reaching an error, trace, NOTIFY/SSE or raw-HTML path.
6. **AI layer:** prompt injection through ingested documents and supplier replies (quarantine: the extractor has no tools;
   untrusted text never in traces), cite-or-abstain validator bypasses (free digits, forged refs, cross-tenant refs), the
   live + recorded fallback (T-125/T-127: AI off never serves AI answers).
7. **apps/web:** XSS (any `dangerouslySetInnerHTML`, markdown rendering), the demo sign-in route (only the four keys, no
   token in logs, rate of abuse), the `/api` rewrite (SSRF/open proxy?), CSP and security headers, the mock routes off in
   production, cookies/localStorage holding tokens.
8. **infra/gcp:** IAM least privilege per service, which services are public, Secret Manager use, Cloud SQL connection and
   SSL, budget alert, the core-worker's ingress.
9. **Input handling:** imports (CSV/file uploads: size limits, content-addressing, path traversal), idempotency keys, rate
   limits where the platform has none.

## Report
`/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad/c1/security-review.md`
(or return it as text if the Write tool refuses): a ranked list — severity (1 critical … 4 founder question), area,
file:line, evidence, impact, the concrete fix, and whether it is in the Cup export. A separate **guarantee scan** section
with both clauses stated even if clean. What you could not check. Final message ≤ 30 lines.
