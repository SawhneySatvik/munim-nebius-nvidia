MATCH (i:ingredient)-[:used_in|makes|stocked_as*1..2]->(m:item {id: $item_id})
OPTIONAL MATCH (i)<-[:supplies]-(s:supplier)
RETURN DISTINCT i.id AS ingredient_id, i.name AS ingredient_name, 1 AS depth, s.id AS supplier_id, s.name AS supplier_name
ORDER BY depth, ingredient_name, ingredient_id, supplier_name, supplier_id
LIMIT 50
