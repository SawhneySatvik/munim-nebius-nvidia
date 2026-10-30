MATCH (p:projection) RETURN p.source_sha256 AS source_sha256, p.as_of AS as_of, p.projected_at AS projected_at, p.model AS model
