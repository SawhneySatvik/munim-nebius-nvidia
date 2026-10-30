# Glossary

Terms are in alphabetical order. Each points to where it lives in the code.

| Term | Meaning |
|---|---|
| **Abstention** | An answer or finding that says "I cannot support this" with a reason code instead of prose. Stored by core, shown as "Cannot verify". |
| **Audit log** | `core.audit_log`: a per-tenant, gapless, hash-chained record of every command and approved draft, with the actor and the decision. |
| **Auto** | The third investigation mode. After a person approves a plan as Auto, core-worker re-runs read-only steps when new data lands. It makes no drafts. |
| **Book** | A core table tagged `munim:book`: a record the One Guarantee protects. |
| **Book guard** | The trigger `core.guard_book_write()` that refuses a book write unless a person's own command, an approved decision or an allow-listed derivation is in force. |
| **Brand, channel** | A brand is a trading name under a tenant. A channel is where orders arrive (counter, own site, an aggregator) and carries its own prices and terms. |
| **Business date** | The trading day of an outlet, which may end after midnight. Computed in one tz module from the outlet's zone and cutoff. |
| **Cannot verify** | The fixed text shown when a number or claim cannot be traced to a snapshot cell or a source. |
| **Cell** | One value in one row of a snapshot, named by row and column. |
| **Command** | A typed request to change something: `{command_id, idempotency_key, type, payload}` with type `<module>.<verb>.v<N>`. |
| **Command authority** | `core.command_authority`: for each command type, the roles allowed, the scope and the tables it may write. |
| **Country pack** | A versioned JSON document that holds everything country-specific: currency, tax, zones, rules and detectors. |
| **Decision** | `core.decision`: a person's verdict (approved, edited or rejected) on a draft. |
| **Detector** | A deterministic rule in intel that reads a snapshot, applies a pack threshold and writes a finding. |
| **Draft** | A proposed command waiting for a person: `core.draft`, with evidence and the snapshots it is based on. |
| **Event** | A CloudEvents envelope written to `core.outbox` in the command's transaction and published after commit. |
| **Finding** | A detector's result: a short cited statement with an impact cell and a severity. |
| **Forecast** | A deterministic demand forecast per outlet and item. No model is involved. |
| **Handle** | The short name a model uses for a cell (`S1.r0.net_minor`). Code expands it to a ref. |
| **Idempotency key** | A client-chosen string on a command. The same key with the same request returns the stored result. |
| **Imports** | Uploaded files (payouts, bank lines, POS exports). They are drafts: preview, approval, then commit under the approver. |
| **Investigation** | A checklist (a playbook) that core evaluates step by step. Modes: Step, Plan, Auto. |
| **Kill switch** | The typed flag that turns AI off for a business. AI surfaces then fall back to template text or hide. |
| **Manager** | The AI entry point: routes a question to a path and to specialists. |
| **Minor unit** | The smallest currency unit (paise, cents). All money is an integer in minor units plus a currency. |
| **Munim Cares** | Surplus food listed for community recipients. Recipients are simulated; impact is measured on synthetic data. |
| **Operational table** | A core table tagged `munim:operational`: workflow state rather than a protected record, such as the command log, drafts, decisions, the outbox, kitchen tickets, import runs and investigations. The service role may write some of them. |
| **Outbox** | `core.outbox`: events written with the command that produced them. |
| **Outlet** | One location of a business. Staff are scoped to some or all outlets. |
| **Posting rule** | A named derivation that writes ledger rows from an approved source row, for example a sale into a journal entry. |
| **Reason code** | A stable machine key for a refusal or abstention, such as `stale_draft` or `missing_ref`. |
| **Recorded mode** | `MUNIM_MODEL_MODE=recorded`: model calls are served from committed fixtures. Every test runs this way. |
| **Ref** | A pointer in prose: `⟨snap:<id>·<row>·<column>⟩` for a value, `⟨cite:<kind>:<id>⟩` for a source. |
| **Run, run token** | One execution of intel for a tenant. A run token is the Ed25519-signed credential core mints for it. |
| **Simulated supplier** | A supplier agent that is a program, labelled as such everywhere. No real supplier exists in the system. |
| **Snapshot** | `evidence.snapshot`: the rows a named SQL template returned for a tenant, stored with a hash. Numbers shown to people trace to its cells. |
| **Snapshot template** | A reviewed, versioned SQL statement in `evidence.snapshot_template`. Only migrations create them. |
| **Specialist** | One of eight AI desks with its own skill, read tools and draftable commands. |
| **Taint** | A flag on a run that has read untrusted text. A tainted run cannot propose a draft. |
| **Tenant** | One business and all its outlets. Every tenant table is isolated by row-level security. |
| **Trace** | The ordered, label-only event record of a run, replayable on the staff screens. |
