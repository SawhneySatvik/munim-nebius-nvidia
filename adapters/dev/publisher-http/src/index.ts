// Moved to core-api (T-122): every deployment publishes through it, and the Cup export carries no adapters/dev.
// Kept as a re-export until this package can be deleted (that needs a lockfile change).
export * from "../../../../services/core-api/src/commit/publisher-http.ts";
