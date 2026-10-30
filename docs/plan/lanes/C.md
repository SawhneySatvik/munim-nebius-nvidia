# Lane C: two more businesses, each with its own UI (P4 Bengaluru cloud kitchen, then P5 The Snacky Shack)

Read `docs/plan/lanes/COMMON.md` first; its guard binds you. Report: `docs/plan/lanes/C.report.md`.

## Territory

`tools/worldgen/**` (new worlds and their tests; **do not change `cobnut.ts` or its tests**);
`adapters/dev/idp-local/mint-seed-tokens.ts` and `scripts/dev/local-operator.ts` (generalise for the new worlds,
additively); `apps/web/lib/site.ts`, `apps/web/lib/munim/page-theme.ts`, `apps/web/components/storefront-theme.tsx`,
the shop pages (`apps/web/app/(shop)/**`, `apps/web/components/pages/**`), `apps/web/app/layout.tsx`, `app/fonts.ts`,
`app/globals.css` (add tokens, don't change Cobnut's), new `apps/web/lib/businesses/**`, new art under
`apps/web/public/**`; `.screenshots/EV-P4/`, `.screenshots/EV-P5/`. **Not yours:** `apps/web/components/staff/**`,
`apps/web/app/staff/**`, `apps/web/lib/munim/**` other than `page-theme.ts` (lane B).

## One web, many businesses

Today `apps/web/lib/site.ts` hard-codes `SITE` (Cobnut) and 29 files import it, staff pages included. Make the brand per
business, chosen by `NEXT_PUBLIC_MUNIM_SITE` (`cobnut` when unset, so Cobnut is byte-for-byte unchanged): a profile per
business in `lib/businesses/` (name, short, tagline, locale, currency, categoryOrder, built-in theme, fonts, art).
**Keep the `SITE` export's shape** so lane B's files and every importer keep compiling. The storefront's live look still
comes from the owner's published page (`GET /v1/storefront/page`, `components/storefront-theme.tsx`, T-128); each new
world's seed should publish its own theme through that same mechanism. Run each business's web on its own port with
`scripts/dev/restart-svc.sh web <world> 3001` (and `3002`): it sources `.run/local/<world>/site.env` — so the new worlds'
seeds must write `site.env` / `storefront-key` / `demo-tokens.json` the way Cobnut's does (`tools/worldgen/src/cli.ts`
~line 90). Don't touch :3000.

## P4 — A synthetic Indian business: a South Indian cloud kitchen in Bengaluru

- New world (e.g. `blr_kitchen`; a fictional name of your choosing, e.g. "Kosambari Kitchens", labelled synthetic in
  the UI) built from `tools/worldgen/src/worlds/cloud_kitchen.ts` (IN pack, Asia/Kolkata): 2–3 kitchens (Indiranagar,
  HSR Layout, Whitefield), delivery-app heavy, its own people, menu (dosa, idli, vada, bisi bele bath, filter coffee…),
  simulated suppliers, history, and planted situations the agents should find: a delivery-app commission leak, an
  ingredient price creep (e.g. urad dal or coconut), a staff overtime spike. Follow how Cobnut and cloud_kitchen plant
  and verify situations (answer keys, determinism gates).
- Its own UI: brand profile + published storefront theme (colours, type, imagery placeholders — banana-leaf green,
  turmeric, steel-tumbler grey are fine; your call) so the same Munim looks like a different business.
- **Done when:** `MUNIM_SEED_OPERATOR=1 MUNIM_RUN_DIR=.run/local make seed WORLD=<new>` seeds on the local DB; its
  storefront renders in its own theme on :3001 (screenshots in `.screenshots/EV-P4/`, phone + desktop); an Ask Munim
  question on it (demo sign-in on :3001) returns cited answers from its own books — or, if AI on this tenant needs
  something lane A owns, say exactly what; `pnpm --filter worldgen test` green apart from the known R67 failure.

## P5 — The Snacky Shack (only after P4 is done)

- AU pack (`Australia/Melbourne`, AUD, GST), Geelong, built from `tools/worldgen/src/worlds/au_outlet.ts`.
- **Menu and items only**, from `/Users/satviksawhney/Downloads/projects_26/the-snacky-shack/prisma/seed.js` (and
  `schema.prisma`). Read only the menu/category/item/price/modifier parts. **Never copy customers, orders, users,
  emails, phones, addresses or anything personal**, even into a scratch file. Synthetic history is generated around the
  menu and labelled "real menu, synthetic history". Using it in public needs the owner's consent (founder's to-do), so
  nothing about it goes outside this repo.
- Its own theme: smash burgers, loud and warm.
- `platform.model_role` is platform-wide and priced in INR, so the AU seed's AI readiness will say "no AUD price" for
  every role. **Expected: report it, don't fix it** (only lane A writes `model_role`; repricing would break Cobnut's
  live AI). P5's done-when has no Ask.
- **Done when:** it seeds locally; the AU golden-receipt and DST gates pass (the verification-gate table in the
  plans/docs); a PII scan of the tenant (emails, phones, names that aren't synthetic) finds nothing; its storefront
  renders in its own theme on :3002 (`.screenshots/EV-P5/`).
