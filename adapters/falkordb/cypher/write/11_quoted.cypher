UNWIND $rows AS r MATCH (a:supplier {id: r.src}), (b:ingredient {id: r.dst}) CREATE (a)-[:quoted {ref: r.ref}]->(b)
