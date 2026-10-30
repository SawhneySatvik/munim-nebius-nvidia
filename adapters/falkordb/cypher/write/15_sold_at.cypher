UNWIND $rows AS r MATCH (a:item {id: r.src}), (b:outlet {id: r.dst}) CREATE (a)-[:sold_at {ref: r.ref, available: r.available}]->(b)
