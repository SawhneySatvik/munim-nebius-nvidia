UNWIND $rows AS r CREATE (:ingredient {id: r.id, name: r.name, unit: r.unit})
