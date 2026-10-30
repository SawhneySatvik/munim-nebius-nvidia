UNWIND $rows AS r MATCH (a:recipe {id: r.src}), (b:item {id: r.dst}) CREATE (a)-[:makes {ref: r.ref}]->(b)
