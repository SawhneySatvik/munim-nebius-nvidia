MATCH (f:finding)-[:about]->(n)
WHERE n.id IN $node_ids AND ($outlets IS NULL OR any(x IN f.outlet_ids WHERE x IN $outlets))
RETURN f.id AS finding_id, f.type AS type, f.severity AS severity,
       f.impact_snapshot_id AS impact_snapshot_id, f.impact_row AS impact_row, f.impact_column AS impact_column,
       collect(DISTINCT n.id) AS about_ids
ORDER BY type, finding_id
LIMIT 50
