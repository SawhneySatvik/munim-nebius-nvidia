MATCH (s:supplier {id: $supplier_id}) RETURN s.id AS supplier_id, s.name AS name, s.simulated AS simulated
