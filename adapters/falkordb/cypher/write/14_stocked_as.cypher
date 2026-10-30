UNWIND $rows AS r MATCH (a:ingredient {id: r.src}), (b:item {id: r.dst}) CREATE (a)-[:stocked_as {ref: r.ref}]->(b)
