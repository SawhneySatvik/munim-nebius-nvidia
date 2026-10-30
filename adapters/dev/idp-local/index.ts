// Moved to core-api (T-122): the Cup export carries no adapters/dev, and every gate and the dev sign-in use this IdP.
// Kept as a re-export for the `make seed` minter beside it and any caller not yet repointed.
export * from "../../../services/core-api/src/auth/local-idp.ts";
