MATCH p = (s {id: $entity_id})-[*1..3]-(n)
WHERE length(p) <= $depth AND n.id <> $entity_id
  AND all(x IN nodes(p) WHERE (NOT x:outlet OR $outlets IS NULL OR x.id IN $outlets)
                          AND (NOT (x:finding OR x:draft) OR $outlets IS NULL OR any(o IN x.outlet_ids WHERE o IN $outlets)))
RETURN n.id AS node_id, labels(n)[0] AS kind, n.name AS name, min(length(p)) AS depth
ORDER BY depth, name, node_id
LIMIT 50
