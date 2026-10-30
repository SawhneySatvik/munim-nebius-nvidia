UNWIND $rows AS r CREATE (:item {id: r.id, name: r.name, kind: r.kind, category: r.category})
