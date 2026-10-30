-- The whole graph of one tenant, as one JSON document and its sha256 (design §3.1). Core runs it as munim_svc under
-- `SET LOCAL app.tenant_id = <the verified tenant>` and `app.outlet_ids = '{*}'`; :tenant_id is bound to the same tenant, so isolation
-- holds twice: every leg's predicate, and RLS (test/projection.test.ts proves each alone). Nothing it reads is returned to a caller:
-- only the checksum comparison and the graph write use it. Every list is ordered by id, so the same rows give the same bytes.
-- No number to show, no personal data and no model text: ids, names a member entered, codes, booleans and a cell's address (D8).
-- Changes from the design text: uuid-shaped values are matched with a full uuid pattern, and cast only inside a CASE on that match
-- (Postgres does not promise to test the pattern before the cast).
WITH cur_recipe AS (
  SELECT r.id, r.item_id, r.variant_id FROM core.recipe_version r
   WHERE r.tenant_id = :tenant_id AND r.valid_from <= :as_of::date AND (r.valid_to IS NULL OR r.valid_to > :as_of::date)),
cur_price AS (
  SELECT DISTINCT ON (p.item_id, p.outlet_id) p.id, p.item_id, p.outlet_id FROM core.price p
   WHERE p.tenant_id = :tenant_id AND p.valid_from <= :as_of::date AND (p.valid_to IS NULL OR p.valid_to > :as_of::date)
   ORDER BY p.item_id, p.outlet_id, p.channel_kind = 'counter' DESC, p.id),
avail AS (
  SELECT DISTINCT ON (a.item_id, a.outlet_id) a.item_id, a.outlet_id, a.available FROM core.item_availability a
   WHERE a.tenant_id = :tenant_id AND a.variant_id IS NULL ORDER BY a.item_id, a.outlet_id, a.updated_at DESC, a.id),
node_ids AS (
  SELECT id FROM core.outlet WHERE tenant_id = :tenant_id
  UNION ALL SELECT id FROM core.supplier WHERE tenant_id = :tenant_id AND active
  UNION ALL SELECT id FROM core.ingredient WHERE tenant_id = :tenant_id AND active
  UNION ALL SELECT id FROM core.item WHERE tenant_id = :tenant_id AND active),
supplies AS (
  SELECT DISTINCT ON (x.supplier_id, x.ingredient_id) x.supplier_id AS src, x.ingredient_id AS dst, x.ref
    FROM (SELECT sp.supplier_id, sp.ingredient_id, sp.observed_at AS at, 'core.supplier_price:' || sp.id AS ref
            FROM core.supplier_price sp WHERE sp.tenant_id = :tenant_id
          UNION ALL
          SELECT po.supplier_id, pl.ingredient_id, po.created_at, 'core.po_line:' || pl.id
            FROM core.purchase_order po JOIN core.po_line pl ON pl.tenant_id = po.tenant_id AND pl.po_id = po.id
           WHERE po.tenant_id = :tenant_id AND po.status <> 'cancelled') x
   WHERE x.supplier_id IN (SELECT id FROM node_ids) AND x.ingredient_id IN (SELECT id FROM node_ids)
   ORDER BY x.supplier_id, x.ingredient_id, x.at DESC, x.ref),
quoted AS (
  SELECT DISTINCT ON (q.supplier_id, q.ingredient_id) q.supplier_id AS src, q.ingredient_id AS dst,
         'intel.supplier_quote:' || q.id AS ref
    FROM intel.supplier_quote q
   WHERE q.tenant_id = :tenant_id AND q.created_at::date > :as_of::date - 90
     AND q.supplier_id IN (SELECT id FROM node_ids) AND q.ingredient_id IN (SELECT id FROM node_ids)
   ORDER BY q.supplier_id, q.ingredient_id, q.created_at DESC, q.id),
open_finding AS (SELECT f.* FROM intel.finding f WHERE f.tenant_id = :tenant_id AND f.status = 'open'),
open_draft AS (SELECT d.* FROM core.draft d WHERE d.tenant_id = :tenant_id AND d.status = 'proposed'),
about AS (
  -- From core-held values only: the impact row's id columns and the row refs core resolved. Never the prose.
  SELECT DISTINCT f.id AS src, v.id AS dst, 'evidence.snapshot:' || f.impact_snapshot_id AS ref
    FROM open_finding f
    JOIN evidence.snapshot s ON s.tenant_id = f.tenant_id AND s.id = f.impact_snapshot_id
    CROSS JOIN LATERAL jsonb_each_text(s.rows -> f.impact_row) e
    CROSS JOIN LATERAL (SELECT CASE WHEN e.value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN e.value::uuid END AS id) v
   WHERE e.key IN ('item_id', 'ingredient_id', 'supplier_id', 'outlet_id') AND v.id IN (SELECT id FROM node_ids)
  UNION
  SELECT DISTINCT f.id, v.id, 'intel.finding:' || f.id
    FROM open_finding f
    CROSS JOIN LATERAL jsonb_array_elements(f.envelope -> 'segments') seg
    CROSS JOIN LATERAL jsonb_array_elements_text(seg -> 'refs') r(ref)
    CROSS JOIN LATERAL (SELECT CASE WHEN r.ref ~ '^row:core\.(item|ingredient|supplier|outlet):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                    THEN split_part(r.ref, ':', 3)::uuid END AS id) v
   WHERE jsonb_typeof(f.envelope -> 'segments') = 'array' AND jsonb_typeof(seg -> 'refs') = 'array' AND v.id IN (SELECT id FROM node_ids)),
targets AS (
  SELECT DISTINCT d.id AS src, v.id AS dst, 'core.draft:' || d.id AS ref
    FROM open_draft d
    CROSS JOIN LATERAL (
      SELECT jsonb_path_query(d.command_payload, 'lax $.**.item_id') #>> '{}' UNION ALL
      SELECT jsonb_path_query(d.command_payload, 'lax $.**.ingredient_id') #>> '{}' UNION ALL
      SELECT jsonb_path_query(d.command_payload, 'lax $.**.supplier_id') #>> '{}' UNION ALL
      SELECT jsonb_path_query(d.command_payload, 'lax $.**.outlet_id') #>> '{}' UNION ALL
      SELECT jsonb_path_query(d.command_payload, 'lax $.**.outlet_ids[*]') #>> '{}') t(id)
    CROSS JOIN LATERAL (SELECT CASE WHEN t.id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN t.id::uuid END AS id) v
   WHERE v.id IN (SELECT id FROM node_ids)),
live_item AS (SELECT i.* FROM core.item i WHERE i.tenant_id = :tenant_id AND i.active),
doc AS (
  SELECT json_build_object(
    'as_of', :as_of::date,
    'outlet', (SELECT coalesce(json_agg(json_build_object('id', o.id, 'name', o.name, 'kind', o.kind) ORDER BY o.id), '[]')
                 FROM core.outlet o WHERE o.tenant_id = :tenant_id),
    'supplier', (SELECT coalesce(json_agg(json_build_object('id', s.id, 'name', s.name, 'simulated', s.kind = 'simulated') ORDER BY s.id), '[]')
                   FROM core.supplier s WHERE s.tenant_id = :tenant_id AND s.active),
    'ingredient', (SELECT coalesce(json_agg(json_build_object('id', g.id, 'name', g.name, 'unit', g.base_unit) ORDER BY g.id), '[]')
                     FROM core.ingredient g WHERE g.tenant_id = :tenant_id AND g.active),
    'item', (SELECT coalesce(json_agg(json_build_object('id', i.id, 'name', coalesce(i.display_name, i.name_key), 'kind', i.kind, 'category', i.category) ORDER BY i.id), '[]')
               FROM live_item i),
    'recipe', (SELECT coalesce(json_agg(json_build_object('id', r.id, 'name', coalesce(i.display_name, i.name_key) || ' recipe', 'item_id', r.item_id, 'variant_id', r.variant_id) ORDER BY r.id), '[]')
                 FROM cur_recipe r JOIN live_item i ON i.id = r.item_id),
    'used_in', (SELECT coalesce(json_agg(json_build_object('src', l.ingredient_id, 'dst', l.recipe_version_id, 'ref', 'core.recipe_line:' || l.id) ORDER BY l.id), '[]')
                  FROM core.recipe_line l JOIN cur_recipe r ON r.id = l.recipe_version_id JOIN live_item i ON i.id = r.item_id
                 WHERE l.tenant_id = :tenant_id AND l.ingredient_id IN (SELECT id FROM node_ids)),
    'makes', (SELECT coalesce(json_agg(json_build_object('src', r.id, 'dst', r.item_id, 'ref', 'core.recipe_version:' || r.id) ORDER BY r.id), '[]')
                FROM cur_recipe r JOIN live_item i ON i.id = r.item_id),
    'stocked_as', (SELECT coalesce(json_agg(json_build_object('src', i.stock_ingredient_id, 'dst', i.id, 'ref', 'core.item:' || i.id) ORDER BY i.id), '[]')
                     FROM live_item i WHERE i.kind = 'sku' AND i.stock_ingredient_id IN (SELECT id FROM node_ids)),
    'sold_at', (SELECT coalesce(json_agg(json_build_object('src', p.item_id, 'dst', p.outlet_id, 'ref', 'core.price:' || p.id, 'available', coalesce(a.available, true)) ORDER BY p.item_id, p.outlet_id), '[]')
                  FROM cur_price p JOIN live_item i ON i.id = p.item_id
                  LEFT JOIN avail a ON a.item_id = p.item_id AND a.outlet_id = p.outlet_id),
    'supplies', (SELECT coalesce(json_agg(x ORDER BY x.src, x.dst), '[]') FROM supplies x),
    'quoted', (SELECT coalesce(json_agg(x ORDER BY x.src, x.dst), '[]') FROM quoted x),
    'finding', (SELECT coalesce(json_agg(json_build_object('id', f.id, 'type', f.type, 'severity', f.severity, 'outlet_ids', f.outlet_ids,
                  'impact_snapshot_id', f.impact_snapshot_id, 'impact_row', f.impact_row, 'impact_column', f.impact_column) ORDER BY f.id), '[]') FROM open_finding f),
    'draft', (SELECT coalesce(json_agg(json_build_object('id', d.id, 'command_type', d.command_type, 'outlet_ids', d.outlet_ids) ORDER BY d.id), '[]') FROM open_draft d),
    'about', (SELECT coalesce(json_agg(x ORDER BY x.src, x.dst, x.ref), '[]') FROM about x),
    'answers', (SELECT coalesce(json_agg(json_build_object('src', d.id, 'dst', d.finding_id, 'ref', 'core.draft:' || d.id) ORDER BY d.id), '[]')
                  FROM open_draft d JOIN open_finding f ON f.id = d.finding_id),
    'targets', (SELECT coalesce(json_agg(x ORDER BY x.src, x.dst), '[]') FROM targets x)) AS doc)
SELECT doc, encode(sha256(convert_to(doc::text, 'UTF8')), 'hex') AS sha256 FROM doc
