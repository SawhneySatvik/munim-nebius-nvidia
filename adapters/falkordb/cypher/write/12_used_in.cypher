UNWIND $rows AS r MATCH (a:ingredient {id: r.src}), (b:recipe {id: r.dst}) CREATE (a)-[:used_in {ref: r.ref}]->(b)
