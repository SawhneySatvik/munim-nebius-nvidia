UNWIND $rows AS r CREATE (:recipe {id: r.id, name: r.name, item_id: r.item_id, variant_id: r.variant_id})
