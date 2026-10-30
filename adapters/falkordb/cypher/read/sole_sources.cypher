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
