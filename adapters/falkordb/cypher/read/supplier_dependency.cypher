MATCH (s:supplier {id: $supplier_id})-[:supplies]->(i:ingredient)
OPTIONAL MATCH (i)<-[:supplies]-(o:supplier) WHERE o.id <> s.id
RETURN DISTINCT i.id AS ingredient_id, i.name AS ingredient_name, o.id AS other_supplier_id, o.name AS other_supplier_name
ORDER BY ingredient_name, ingredient_id, other_supplier_name, other_supplier_id
LIMIT 50
