UNWIND $rows AS r CREATE (:supplier {id: r.id, name: r.name, simulated: r.simulated})
