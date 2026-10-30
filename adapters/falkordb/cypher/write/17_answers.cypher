UNWIND $rows AS r MATCH (a:draft {id: r.src}), (b:finding {id: r.dst}) CREATE (a)-[:answers {ref: r.ref}]->(b)
