UNWIND $rows AS r MATCH (a:supplier {id: r.src}), (b:ingredient {id: r.dst}) CREATE (a)-[:supplies {ref: r.ref}]->(b)
