UNWIND $rows AS r CREATE (:outlet {id: r.id, name: r.name, kind: r.kind})
