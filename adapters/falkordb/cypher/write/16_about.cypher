UNWIND $rows AS r MATCH (a:finding {id: r.src}), (b {id: r.dst}) WHERE b:ingredient OR b:item OR b:supplier OR b:outlet CREATE (a)-[:about {ref: r.ref}]->(b)
