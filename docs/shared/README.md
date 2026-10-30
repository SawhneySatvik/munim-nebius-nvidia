# Shared documentation

These pages describe the parts of Munim that are the same wherever it is hosted and whichever graph or cloud adapters
are plugged in. They name no cloud product and no graph backend. Each repository that publishes Munim reuses them and
adds its own deployment, adapter and test pages.

| Page | What it covers |
|---|---|
| [overview.md](./overview.md) | What Munim is, the two parts, the One Guarantee, what it does not do |
| [architecture.md](./architecture.md) | Processes, tenancy and row-level security, the book guard, commands, events and drafts, live updates, country packs |
| [ai-layer.md](./ai-layer.md) | The Manager and the eight specialists, run tokens, tools and handles, cite-or-abstain, negotiation, traces, models |
| [security.md](./security.md) | Threat model, who can act, and where each control lives |
| [glossary.md](./glossary.md) | The terms used across the code and the docs |

Where a page names a file, the file is in the repository. Where a count is given (tables, routes), it comes from the
migration manifest in `db/tests/manifest.ts` or the generated OpenAPI documents in `packages/contracts/generated/openapi/`.
