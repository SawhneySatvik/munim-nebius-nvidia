# Deployment profile and dependency footprint

This is a deployment plan, not a record that a new Nebius-specific production deployment has already been provisioned. The project owner will create/operate the deployment. Keep the Token Factory API key and database credentials in server-only environment variables; never put them in `NEXT_PUBLIC_*` variables or client bundles.

## Services to deploy

| Workload | Suggested host | Required runtime |
|---|---|---|
| Public website, storefront and staff UI | Vercel | Node.js 22+, Next.js build |
| Core API | Vercel Node/serverless only if its runtime limits, long-lived Postgres connections and route behavior are validated; otherwise a persistent Node host | Node.js 22+, Hono app, PostgreSQL connectivity |
| Core worker | Persistent worker host/container, not a static Next.js deployment | Node.js 22+, worker entrypoint, Postgres connectivity |
| Intelligence | Python-capable persistent host/container | Python 3.12, service dependencies, outbound HTTPS to Nebius Token Factory and internal Core API |
| PostgreSQL/Auth/Storage | Supabase project | PostgreSQL migrations, Auth configuration, optional Storage buckets and server-side credentials |
| Supplier simulator | Same private network as Core/Intelligence or a demo-only process | Python runtime and A2A server |

No additional npm dependency is needed for the rendered README page or Nebius marketing page. Direct dependency counts from the checked-in manifests are:

| Workload | Direct production dependencies in its manifest | Runtime note |
|---|---:|---|
| `apps/site` marketing site | 3 external (`next`, `react`, `react-dom`) | Includes the new `/readme` page. |
| `apps/web` product app | 4 external plus the internal `@munim/sdk` workspace package | Customer and staff application. |
| Core API | 3 external plus 3 internal workspace packages | Node/Hono and PostgreSQL client. |
| Core worker | 1 external plus 1 internal workspace package | Node worker and PostgreSQL client. |
| Intelligence | 8 Python packages | Python 3.12, ADK, provider client, API/runtime and cryptography. |
| Supplier simulator | 2 Python packages | A2A server and Uvicorn. |

The site alone therefore needs **3 production npm packages** and **5 direct development packages**. `apps/web` adds its own packages if you deploy the product UI as a second Vercel project. Workspace installation also resolves shared packages and transitive dependencies from `pnpm-lock.yaml`; direct counts are not the total installed tree. Neither count includes PostgreSQL, Supabase services, Vercel, the Token Factory key, or operating costs.

## Environment categories

- **Site:** public origin, API origin and demo links. Only intentionally public values use `NEXT_PUBLIC_*`.
- **Core API/worker:** database URL and role credentials, signing key material for run tokens, identity-provider config, internal service secret, origins, storage configuration, and worker/scheduler settings.
- **Intelligence:** internal Core URL and service auth, run-token verification public key, `MUNIM_MODEL_MODE=live`, `NEBIUS_API_KEY`, provider/model role configuration and prices. Model role IDs are in `scripts/dev/nemotron-roles.ts`; pricing must use a current provider rate card.
- **Supabase:** dedicated project URL/keys, migration/admin credentials held only by deployment tooling, Auth issuer/JWKS and Storage configuration as applicable.

Do not commit `.env` files, private keys, database service-role secrets or Token Factory keys. Do not run Token Factory-backed production roles with placeholder/zero pricing: the role activation script rejects missing real price configuration except for an explicitly local smoke profile.

## Provisioning sequence

1. Create separate Supabase project/database and configure Auth/Storage needs.
2. Apply the ordered SQL migrations from `db/migrations/` using the migration role; seed country packs, demo tenant and platform model roles.
3. Provision Core API, worker, Intelligence and the supplier simulator with private service-to-service networking/auth.
4. Configure model roles with provider `nebius`, the selected Nemotron IDs, and current per-role rates; set the Nebius key only in Intelligence's secret store.
5. Configure Vercel origins and server-only API credentials. Confirm serverless behavior is appropriate before co-locating Core API with the site.
6. Verify health checks, migration version, demo sign-in, model-role provider/model IDs and a live scoped inference path. Verify a draft remains pending until an authorized human approves it.
7. Capture the final deployment URL and video only after the environment is live and public access has been reviewed.

## Vercel decision point

Vercel is a natural fit for the Next.js website. The site package itself has a small dependency footprint. The whole system is not a single Next.js app: the Python Intelligence service, worker, PostgreSQL and A2A supplier simulator require separate runtimes or managed equivalents. Before selecting Vercel for Core API, check the actual API/worker entrypoints for runtime compatibility, streaming/long-lived connection requirements and background processing. Deploying only `apps/site` will not make AI inference or business API operations work by itself.
