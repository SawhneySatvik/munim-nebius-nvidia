# Story 2 — Margin leak: the best-seller loses money once waste and a supplier price change count

**Refs:** PDR §7 S2; spec §4.1 (true margin); 04 §3–§5; D-1 `packs/catalogue.md` (`catalogue.dish_margin`,
`catalogue.menu_matrix`, `catalogue.price_vs_cost_change`, `recipe_missing`, `cost_price_missing`,
`catalogue.price.set.v1` with `amount_minor` Ref); `flows/approval.md`.
**World:** planted — paneer supplier price rose; observed paneer waste above the recipe's waste allowance;
"Paneer tikka" is the top seller at Outlet B. All data synthetic.

| # | Screen | User does | API | User sees |
|---|---|---|---|---|
| 1 | (event) | — | a `supplier_price` row / waste movements → outbox → intel `/events` → `…/events:claim` → `…/watch:claim {pack: catalogue}` → detector `catalogue.negative_margin` mints `catalogue.dish_margin` | — |
| 2 | Home C1 | sees brief line | `GET /v1/findings` | "Paneer tikka now loses ⟨snap catalogue.dish_margin⟩ on every plate at Outlet B" ▲ + "Draft ▸" |
| 3 | Catalogue dashboard `/console/d/catalogue` | opens it | dashboard snapshots (`catalogue.dish_margin`, `catalogue.menu_matrix`) | tile "Dishes losing money" ⟨snap⟩; quadrant: Paneer tikka in "Plough-horses" (popular, low margin) |
| 4 | Rows drawer | taps the margin cell | `GET /v1/snapshots/{id}` | rows: recipe version, each line's latest supplier price row (supplier shown as "{name} · Simulated supplier"), waste % (observed vs recipe), yield, price row — "Source rows · catalogue.dish_margin" |
| 5 | Ask C3 | "Why does paneer tikka lose money?" | `POST /v1/ask` | "Paneer cost rose ⟨snap⟩ since ⟨snap⟩ ⟨cite:row:core.supplier_price⟩ and kitchen waste on paneer is ⟨snap⟩ against a recipe allowance of ⟨snap⟩ ⟨cite:row:core.recipe_line⟩." |
| 6 | Inbox → draft C2 | "Review" on "Price change · Paneer tikka · Outlet B" | draft get (route not fixed — T-008) | full `catalogue.price.set.v1`: item, outlet, channel, **amount ⟨ref: dish_margin cell × target-margin cell⟩**, `valid_from` ≥ tomorrow; "RELIES ON" margin + supplier price cells |
| 7 | C2 Edit | taps "Edit", changes the amount to a rounder figure | — | "was {old} ⟨ref⟩ → now {new}" · "Typed by Meena" |
| 8 | C2 | "Approve edited" + note "Round price for the menu board" | `POST /v1/drafts/{id}:approve` `{edited_payload, reason}` | "Approved with your changes." → new `core.price` row valid from tomorrow (opens in one tap) |
| 9 | POS P1 (next day) | — | — | tile shows the new price (`row core.price.amount_minor`) |
| 10 | Back office B5 (later) | — | outcome check after the set period | Catalogue track record: "Edited and approved" + outcome "did margin move?" ⟨snap⟩ |

## Branches

| Case | User sees |
|---|---|
| A dish with sales but **no recipe** (D-1 case C5) | finding not raised; Ask → **"Cannot verify: {item} has no recipe for this period, so its true margin is unknown. Add a recipe to see it."** (`recipe_missing`) + "Add recipe" |
| An ingredient with no supplier price | "Cannot verify: no supplier price is recorded for {ingredient}, so the cost of {item} is incomplete." (`cost_price_missing`, D-1 NEW) |
| Supplier price changes again before approval | `D-stale` "This proposal is out of date: the numbers it relied on have changed." — 0 executions |
| Manager (not owner) approves | allowed only if `command_authority` lists manager for `catalogue.price.set.v1` in that outlet; else `S-deny` |
| Shop variant | an SKU priced above MRP → finding only, **never a draft** (pack rule); copy "Priced above MRP at {outlet}" |
