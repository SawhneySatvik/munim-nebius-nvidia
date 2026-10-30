UNWIND $rows AS r CREATE (:draft {id: r.id, name: r.command_type, command_type: r.command_type, outlet_ids: r.outlet_ids})
