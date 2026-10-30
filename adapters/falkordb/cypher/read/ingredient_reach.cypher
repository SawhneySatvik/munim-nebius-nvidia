MATCH (i:ingredient {id: $ingredient_id})-[:used_in|makes|stocked_as*1..2]->(m:item)
OPTIONAL MATCH (i)-[:used_in]->(r:recipe)-[:makes]->(m)
OPTIONAL MATCH (m)-[s:sold_at]->(o:outlet)
WHERE $outlets IS NULL OR o.id IN $outlets
RETURN DISTINCT m.id AS item_id, m.name AS item_name, r.id AS recipe_id,
       o.id AS outlet_id, o.name AS outlet_name, s.available AS available
ORDER BY item_name, item_id, outlet_name, outlet_id
LIMIT 200
