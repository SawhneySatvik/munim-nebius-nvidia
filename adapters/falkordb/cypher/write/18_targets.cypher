UNWIND $rows AS r MATCH (a:draft {id: r.src}), (b {id: r.dst}) WHERE b:ingredient OR b:item OR b:supplier OR b:outlet CREATE (a)-[:targets {ref: r.ref}]->(b)
