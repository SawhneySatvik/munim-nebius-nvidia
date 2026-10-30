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
