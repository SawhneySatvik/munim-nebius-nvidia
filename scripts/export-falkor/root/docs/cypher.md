# The Cypher queries Munim depends on

Every query the product runs against FalkorDB is below, exactly as it is stored in
[`adapters/falkordb/cypher/`](../adapters/falkordb/cypher/): one file per query, loaded by
[`src/cypher.ts`](../adapters/falkordb/src/cypher.ts). The text is fixed; data only ever fills `$parameters`.

How they run ([`src/client.ts`](../adapters/falkordb/src/client.ts)):

- **Reads** are `GRAPH.RO_QUERY` with `TIMEOUT 1000` (milliseconds). The engine refuses any write sent that way, so a read
  can never change the graph (`adapters/falkordb/test/guard.test.ts`: a `CREATE` planted in a read is refused and the graph keeps its nodes).
- **Writes** are `GRAPH.QUERY`, and only the projector sends them, to a fresh staging graph (see
  [`graph-model.md`](./graph-model.md#how-the-graph-is-built)).
- **The graph** is `munim:<tenant id>`, one per business. Core builds the key from the tenant it verified (a member's sign-in
  or an agent's run token); no query names a tenant.
- **`$outlets`** is added to every read by the adapter ([`src/index.ts`](../adapters/falkordb/src/index.ts)): `null` for
  someone who sees the whole business, or the list of outlet ids they may see. It comes from the caller's membership or run
  token, never from the request. Queries that do not mention it ignore it.
- **No number to show** comes back. Columns are ids, names, codes, booleans, a hop count (`depth`, never displayed) and the
  parts of a snapshot cell's address (`impact_snapshot_id`, `impact_row`, `impact_column`).
- **Failures** become one of three labels (`unreachable`, `timeout`, `error`), and core answers `503 graph_unavailable`. The
  server's own error text, which can quote parameters, is never passed on or logged.

Where each read is used:

| Query | Used by | Parameters |
|---|---|---|
| `ingredient` | `GET /v1/graph/ingredients/{id}` (404 when the graph has no such ingredient) | `$ingredient_id` |
| `ingredient_sources` | `GET /v1/graph/ingredients/{id}`: `sources` | `$ingredient_id` |
| `ingredient_reach` | `GET /v1/graph/ingredients/{id}`: `dishes`, `outlets` | `$ingredient_id`, `$outlets` |
| `supplier` | `GET /v1/graph/suppliers/{id}` (404 when the graph has no such supplier) | `$supplier_id` |
| `supplier_reach` | `GET /v1/graph/suppliers/{id}`: `ingredients` | `$supplier_id`, `$outlets` |
| `sole_sources` | `GET /v1/graph/sole-sources` | `$outlets` |
| `findings_about` | both routes above: `findings` | `$node_ids`, `$outlets` |
| `drafts_about` | both routes above: `drafts` | `$node_ids`, `$outlets` |
| `price_shock_path` | the agent's tool `graph_price_shock_path` (Stock & Purchasing) | `$ingredient_id`, `$depth`, `$outlets` |
| `dish_margin_drivers` | the agent's tool `graph_dish_margin_drivers` (Menu & Pricing) | `$item_id` |
| `supplier_dependency` | the agent's tool `graph_supplier_dependency` (Stock & Purchasing) | `$supplier_id` |
| `neighbourhood` | the agent's tool `graph_neighbourhood` (Menu & Pricing) | `$entity_id`, `$depth`, `$outlets` |
| `projection_state` | the projector, before every read: is the graph up to date with the books? | none |

The routes are in [`services/core-api/src/modules/graph/index.ts`](../services/core-api/src/modules/graph/index.ts). The
agent's tools (`services/intel/munim_intel/graph/tools.py`) reach FalkorDB only through core's
`POST /internal/intel/v1/graph:query`, which checks the arguments (one id and, for a walk, `depth` 1 to 3, default 3),
takes the tenant and outlet scope from the run token, and refuses anything else, a `tenant_id` above all, with
`422 invalid_payload` ([`services/core-api/src/internal/graph/index.ts`](../services/core-api/src/internal/graph/index.ts)).
The fifth agent template, `claim_support`, is not served by this backend (claims stay out of the graph) and is refused the
same way.

## What a price rise of one ingredient touches

### `ingredient_reach`

Every dish the ingredient goes into, and every outlet that sells the dish, one row per (dish, outlet). A dish is reached
through its current recipe (`used_in` then `makes`), or directly for a shop item stocked as the ingredient (`stocked_as`).
`recipe_id` is the recipe version the dish's margin row is costed from, so the screen can check that a margin it shows
belongs to the same recipe the graph walked; `available = false` means the dish is paused at that outlet.

```cypher
MATCH (i:ingredient {id: $ingredient_id})-[:used_in|makes|stocked_as*1..2]->(m:item)
OPTIONAL MATCH (i)-[:used_in]->(r:recipe)-[:makes]->(m)
OPTIONAL MATCH (m)-[s:sold_at]->(o:outlet)
WHERE $outlets IS NULL OR o.id IN $outlets
RETURN DISTINCT m.id AS item_id, m.name AS item_name, r.id AS recipe_id,
       o.id AS outlet_id, o.name AS outlet_name, s.available AS available
ORDER BY item_name, item_id, outlet_name, outlet_id
LIMIT 200
```

`adapters/falkordb/test/queries.test.ts`: butter reaches its seven dishes at both outlets, the paused Pistachio Danish is `available = false`;
scoped to Gomti Nagar, the seven dishes there only; the truffle tin reaches its shop item with no recipe.

### `ingredient_sources`

Who supplies the ingredient (`supplies`: a price list or a purchase order on the books) and which simulated suppliers have
only quoted for it (`quoted`). `ref` names the book row the edge came from.

```cypher
MATCH (i:ingredient {id: $ingredient_id})<-[e:supplies|quoted]-(s:supplier)
RETURN s.id AS supplier_id, s.name AS supplier_name, s.simulated AS simulated, type(e) AS relation, e.ref AS ref
ORDER BY relation DESC, supplier_name, supplier_id
LIMIT 50
```

### `ingredient`

The ingredient itself, for the route's 404.

```cypher
MATCH (i:ingredient {id: $ingredient_id}) RETURN i.id AS id, i.name AS name, i.unit AS unit
```

### `price_shock_path` (the agent's tool)

The same question for Ask Munim: dishes at depth 1 and outlets at depth 2. A recipe node is walked through, never
returned. `$depth` 1 returns the dishes only.

```cypher
MATCH (i:ingredient {id: $ingredient_id})-[:used_in|makes|stocked_as|sold_at*1..3]->(n)
WHERE n:item OR (n:outlet AND $depth >= 2 AND ($outlets IS NULL OR n.id IN $outlets))
RETURN DISTINCT n.id AS node_id, labels(n)[0] AS kind, n.name AS name, CASE WHEN n:item THEN 1 ELSE 2 END AS depth
ORDER BY depth, name, node_id
LIMIT 50
```

## The supplier dependency view

### `supplier_reach`

One row per ingredient this supplier supplies, per dish, per outlet. `other_sources` lists the other suppliers of the
ingredient (empty means this supplier is its only source); `quoted_by` lists simulated suppliers that have quoted for it
but do not supply it yet. Core folds the rows per ingredient and sets `only_source` to whether `other_sources` is empty; it
counts nothing.

```cypher
MATCH (s:supplier {id: $supplier_id})-[:supplies]->(i:ingredient)
OPTIONAL MATCH (i)<-[:supplies]-(alt:supplier) WHERE alt.id <> s.id
WITH s, i, [x IN collect(DISTINCT alt) | {id: x.id, name: x.name, simulated: x.simulated}] AS other_sources
OPTIONAL MATCH (i)<-[:quoted]-(q:supplier) WHERE q.id <> s.id
WITH s, i, other_sources, [x IN collect(DISTINCT q) | {id: x.id, name: x.name, simulated: x.simulated}] AS quoted_by
OPTIONAL MATCH (i)-[:used_in|makes|stocked_as*1..2]->(m:item)
OPTIONAL MATCH (m)-[so:sold_at]->(o:outlet) WHERE $outlets IS NULL OR o.id IN $outlets
RETURN i.id AS ingredient_id, i.name AS ingredient_name, other_sources, quoted_by,
       m.id AS item_id, m.name AS item_name, o.id AS outlet_id, o.name AS outlet_name, so.available AS available
ORDER BY ingredient_name, ingredient_id, item_name, item_id, outlet_name, outlet_id
LIMIT 200
```

`adapters/falkordb/test/queries.test.ts`: Riverbank Dairy supplies butter only, with no other source and a quote from Steady Wholesale;
Lalbagh, for someone who sees only Hazratganj, supplies hazelnuts for six dishes there.

### `sole_sources`

Ingredients that are on the menu somewhere in the caller's scope and have one supplier on record, or none. `size()` is a
filter inside the query; no count is returned. A quote does not count as a source.

```cypher
MATCH (i:ingredient)-[:used_in|makes|stocked_as*1..2]->(:item)-[:sold_at]->(o:outlet)
WHERE $outlets IS NULL OR o.id IN $outlets
WITH DISTINCT i
OPTIONAL MATCH (i)<-[:supplies]-(s:supplier)
WITH i, collect(DISTINCT s) AS sources
WHERE size(sources) <= 1
RETURN i.id AS ingredient_id, i.name AS ingredient_name,
       [x IN sources | {id: x.id, name: x.name, simulated: x.simulated}] AS sources
ORDER BY ingredient_name, ingredient_id
LIMIT 50
```

### `supplier`

The supplier itself, for the route's 404.

```cypher
MATCH (s:supplier {id: $supplier_id}) RETURN s.id AS supplier_id, s.name AS name, s.simulated AS simulated
```

### `supplier_dependency` (the agent's tool)

What this supplier supplies, and the other supplier of each ingredient if there is one (`null`: this supplier is the only
source).

```cypher
MATCH (s:supplier {id: $supplier_id})-[:supplies]->(i:ingredient)
OPTIONAL MATCH (i)<-[:supplies]-(o:supplier) WHERE o.id <> s.id
RETURN DISTINCT i.id AS ingredient_id, i.name AS ingredient_name, o.id AS other_supplier_id, o.name AS other_supplier_name
ORDER BY ingredient_name, ingredient_id, other_supplier_name, other_supplier_id
LIMIT 50
```

## Findings and drafts on those things

### `findings_about`

Open findings about any of the given nodes, in the caller's outlet scope (a finding whose outlets do not overlap the scope
is not returned). Its impact comes back as a cell address, which core turns into a `⟨snap:…⟩` reference that the screen
opens for the figure.

```cypher
MATCH (f:finding)-[:about]->(n)
WHERE n.id IN $node_ids AND ($outlets IS NULL OR any(x IN f.outlet_ids WHERE x IN $outlets))
RETURN f.id AS finding_id, f.type AS type, f.severity AS severity,
       f.impact_snapshot_id AS impact_snapshot_id, f.impact_row AS impact_row, f.impact_column AS impact_column,
       collect(DISTINCT n.id) AS about_ids
ORDER BY type, finding_id
LIMIT 50
```

### `drafts_about`

Proposed drafts that target the given nodes directly (`targets`) or answer a finding about them (`answers`, then `about`),
in the caller's outlet scope.

```cypher
MATCH (d:draft)-[:targets|answers|about*1..2]->(n)
WHERE n.id IN $node_ids AND ($outlets IS NULL OR any(x IN d.outlet_ids WHERE x IN $outlets))
RETURN d.id AS draft_id, d.command_type AS command_type, collect(DISTINCT n.id) AS about_ids
ORDER BY command_type, draft_id
LIMIT 50
```

`adapters/falkordb/test/queries.test.ts`: butter finds the waste finding at Hazratganj with its impact cell's parts; Riverbank and butter find
the purchase-order draft; scoped to Gomti Nagar, neither.

## The agent's other templates

### `dish_margin_drivers`

What a dish is made of and who supplies each ingredient (`null`: no supplier on record).

```cypher
MATCH (i:ingredient)-[:used_in|makes|stocked_as*1..2]->(m:item {id: $item_id})
OPTIONAL MATCH (i)<-[:supplies]-(s:supplier)
RETURN DISTINCT i.id AS ingredient_id, i.name AS ingredient_name, 1 AS depth, s.id AS supplier_id, s.name AS supplier_name
ORDER BY depth, ingredient_name, ingredient_id, supplier_name, supplier_id
LIMIT 50
```

### `neighbourhood`

Every node within `$depth` hops of a node, in either direction. The path never passes through an outlet, finding or
draft outside the caller's scope.

```cypher
MATCH p = (s {id: $entity_id})-[*1..3]-(n)
WHERE length(p) <= $depth AND n.id <> $entity_id
  AND all(x IN nodes(p) WHERE (NOT x:outlet OR $outlets IS NULL OR x.id IN $outlets)
                          AND (NOT (x:finding OR x:draft) OR $outlets IS NULL OR any(o IN x.outlet_ids WHERE o IN $outlets)))
RETURN n.id AS node_id, labels(n)[0] AS kind, n.name AS name, min(length(p)) AS depth
ORDER BY depth, name, node_id
LIMIT 50
```

`adapters/falkordb/test/queries.test.ts`: butter at depth 1 is its seven recipes, Riverbank, Steady (quoted), the finding and the draft; scoped
to Gomti Nagar, Hazratganj's finding and draft are hidden.

## Building the graph (the projector only)

### `projection_state`

The live graph's record of the books it was built from. If its `source_sha256` equals the checksum of the books now,
nothing is rebuilt.

```cypher
MATCH (p:projection) RETURN p.source_sha256 AS source_sha256, p.as_of AS as_of, p.projected_at AS projected_at, p.model AS model
```

### Indexes

One per label, created on the staging graph before anything is written. The file holds one statement per line and each
line runs on its own.

```cypher
CREATE INDEX FOR (n:outlet) ON (n.id)
CREATE INDEX FOR (n:supplier) ON (n.id)
CREATE INDEX FOR (n:ingredient) ON (n.id)
CREATE INDEX FOR (n:recipe) ON (n.id)
CREATE INDEX FOR (n:item) ON (n.id)
CREATE INDEX FOR (n:finding) ON (n.id)
CREATE INDEX FOR (n:draft) ON (n.id)
```

### Nodes

`$rows` is a list of maps, one per node, from the projection statement. The label is in the text, never in the data.

```cypher
UNWIND $rows AS r CREATE (:outlet {id: r.id, name: r.name, kind: r.kind})
```

```cypher
UNWIND $rows AS r CREATE (:supplier {id: r.id, name: r.name, simulated: r.simulated})
```

```cypher
UNWIND $rows AS r CREATE (:ingredient {id: r.id, name: r.name, unit: r.unit})
```

```cypher
UNWIND $rows AS r CREATE (:recipe {id: r.id, name: r.name, item_id: r.item_id, variant_id: r.variant_id})
```

```cypher
UNWIND $rows AS r CREATE (:item {id: r.id, name: r.name, kind: r.kind, category: r.category})
```

```cypher
UNWIND $rows AS r CREATE (:finding {id: r.id, name: r.type, type: r.type, severity: r.severity, outlet_ids: r.outlet_ids, impact_snapshot_id: r.impact_snapshot_id, impact_row: r.impact_row, impact_column: r.impact_column})
```

```cypher
UNWIND $rows AS r CREATE (:draft {id: r.id, name: r.command_type, command_type: r.command_type, outlet_ids: r.outlet_ids})
```

### Edges

Endpoints are matched by indexed id. After each write the projector compares FalkorDB's "Nodes created" or "Relationships
created" with the number of rows it sent; a shortfall means an edge lost an endpoint, the staging graph is deleted, and the
live graph stays as it was (`adapters/falkordb/test/projection.test.ts`).

```cypher
UNWIND $rows AS r MATCH (a:supplier {id: r.src}), (b:ingredient {id: r.dst}) CREATE (a)-[:supplies {ref: r.ref}]->(b)
```

```cypher
UNWIND $rows AS r MATCH (a:supplier {id: r.src}), (b:ingredient {id: r.dst}) CREATE (a)-[:quoted {ref: r.ref}]->(b)
```

```cypher
UNWIND $rows AS r MATCH (a:ingredient {id: r.src}), (b:recipe {id: r.dst}) CREATE (a)-[:used_in {ref: r.ref}]->(b)
```

```cypher
UNWIND $rows AS r MATCH (a:recipe {id: r.src}), (b:item {id: r.dst}) CREATE (a)-[:makes {ref: r.ref}]->(b)
```

```cypher
UNWIND $rows AS r MATCH (a:ingredient {id: r.src}), (b:item {id: r.dst}) CREATE (a)-[:stocked_as {ref: r.ref}]->(b)
```

```cypher
UNWIND $rows AS r MATCH (a:item {id: r.src}), (b:outlet {id: r.dst}) CREATE (a)-[:sold_at {ref: r.ref, available: r.available}]->(b)
```

```cypher
UNWIND $rows AS r MATCH (a:finding {id: r.src}), (b {id: r.dst}) WHERE b:ingredient OR b:item OR b:supplier OR b:outlet CREATE (a)-[:about {ref: r.ref}]->(b)
```

```cypher
UNWIND $rows AS r MATCH (a:draft {id: r.src}), (b:finding {id: r.dst}) CREATE (a)-[:answers {ref: r.ref}]->(b)
```

```cypher
UNWIND $rows AS r MATCH (a:draft {id: r.src}), (b {id: r.dst}) WHERE b:ingredient OR b:item OR b:supplier OR b:outlet CREATE (a)-[:targets {ref: r.ref}]->(b)
```

### The projection record

Written last, then the staging graph replaces the live one with `RENAME munim:<tenant>:next:<ms>:<uuid> munim:<tenant>`.

```cypher
CREATE (:projection {source_sha256: $source_sha256, as_of: $as_of, projected_at: $projected_at, model: $model})
```
