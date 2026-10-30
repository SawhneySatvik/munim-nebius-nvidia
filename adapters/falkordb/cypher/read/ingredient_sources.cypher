MATCH (i:ingredient {id: $ingredient_id})<-[e:supplies|quoted]-(s:supplier)
RETURN s.id AS supplier_id, s.name AS supplier_name, s.simulated AS simulated, type(e) AS relation, e.ref AS ref
ORDER BY relation DESC, supplier_name, supplier_id
LIMIT 50
