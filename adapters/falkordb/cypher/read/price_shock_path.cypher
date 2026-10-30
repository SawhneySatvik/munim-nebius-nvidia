MATCH (i:ingredient {id: $ingredient_id})-[:used_in|makes|stocked_as|sold_at*1..3]->(n)
WHERE n:item OR (n:outlet AND $depth >= 2 AND ($outlets IS NULL OR n.id IN $outlets))
RETURN DISTINCT n.id AS node_id, labels(n)[0] AS kind, n.name AS name, CASE WHEN n:item THEN 1 ELSE 2 END AS depth
ORDER BY depth, name, node_id
LIMIT 50
