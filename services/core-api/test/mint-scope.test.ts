import { describe, expect, it } from "vitest";
import { mintMemberSnapshot } from "../src/modules/approvals/snapshots.ts";

describe("mintMemberSnapshot", () => {
  it("refuses a scope label the member does not cover (NB-3 review)", async () => {
    const m = { tenant_id: "t", member_id: "m", role: "manager", outlet_ids: ["o1"] } as never;
    const c = { query: async () => { throw new Error("no query expected"); } } as never;
    await expect(mintMemberSnapshot(c, m, ["*"], "x", 1, {}, [])).rejects.toThrow(/does not cover/);
    await expect(mintMemberSnapshot(c, m, ["o1", "o2"], "x", 1, {}, [])).rejects.toThrow(/does not cover/);
  });
});
