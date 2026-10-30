MATCH (d:draft)-[:targets|answers|about*1..2]->(n)
WHERE n.id IN $node_ids AND ($outlets IS NULL OR any(x IN d.outlet_ids WHERE x IN $outlets))
RETURN d.id AS draft_id, d.command_type AS command_type, collect(DISTINCT n.id) AS about_ids
ORDER BY command_type, draft_id
LIMIT 50
