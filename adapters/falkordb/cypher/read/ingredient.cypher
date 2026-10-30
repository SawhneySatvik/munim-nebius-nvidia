MATCH (i:ingredient {id: $ingredient_id}) RETURN i.id AS id, i.name AS name, i.unit AS unit
