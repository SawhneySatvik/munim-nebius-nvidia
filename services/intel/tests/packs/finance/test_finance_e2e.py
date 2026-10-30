"""T-047 end to end: the five finance detectors through T-043's watcher pipeline against the real core-api internal API
on embedded Postgres, the four worldgen worlds seeded through the API at the gate profile (100 days, as of 2026-10-10;
tools/worldgen/test/profile.ts). Fails — never skips — without node. Tests run in file order on one seeded stack.

Templates: four detectors read migration 0023's version-2 templates (settlement_vs_orders, missing_payouts,
tender_vs_bank, gst_check); core mints the latest version, so the gates read exactly the migrator's SQL.

Expected values are independent of the code under test: plant ids, places, payout refs and ₹ from the hand-kept answer
keys (`impact_minor`, `where`, RG-F5's weekly sums and RG-MF1's bridge rows typed in its `what` / `bridge`) and
detector-map.json; severities from the pack ladder L worked by hand below; draft fields from packs/finance.md §6.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import shutil
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "watch"))
from stack import Bridge  # T-043's in-process transport; it needs only the stack's `call`  # noqa: E402

from conftest import REPO
from munim_intel.config import Config, load_config
from munim_intel.detect import REGISTRY
from munim_intel.runtime.context import RunContext, load_public_key, verify_run_token
from munim_intel.runtime.internal_client import InternalClient
from munim_intel.skills.finance import skill
from munim_intel.watch.frame import Frame, frame_from_pack
from munim_intel.watch.pipeline import Report, WatchRun, detectors_for

PACK = "finance"
WORLDS = ["restaurant_group", "cloud_kitchen", "au_outlet", "store"]
WORLD_OF = {"RG": "restaurant_group", "CK": "cloud_kitchen", "ST": "store", "AU": "au_outlet"}
DAYS = 100
HERE = Path(__file__).resolve().parent
# db/README.md 0023 (M-C1e), by hand: each finance v2 and the columns it appends after v1's.
V2 = {
    "finance.settlement_vs_orders": ["settlement_id", "channel_id"],
    "finance.missing_payouts": ["channel_id"],
    "finance.tender_vs_bank": ["week_start", "gap_days"],
    "finance.gst_check": [],
}
# db/README.md 0024 (R-A F5), by hand: settlement_vs_orders v3 is core-api reconcileSettlement's rule with v2's columns.
LATEST = {"finance.settlement_vs_orders": 3}
detectors_for(None)  # registers every detector (munim_intel.watch.detectors); the gates run the finance ones

FINDINGS = """SELECT f.tenant_id::text, f.id::text, f.pack, f.type, f.severity, f.dedupe_key, f.envelope, f.impact_column,
                     f.impact_snapshot_id::text AS snapshot_id, f.impact_row, (s.rows -> f.impact_row ->> f.impact_column)::bigint AS impact
                FROM intel.finding f JOIN evidence.snapshot s ON s.tenant_id = f.tenant_id AND s.id = f.impact_snapshot_id
               WHERE f.pack = $1 ORDER BY f.dedupe_key"""
DRAFTS = """SELECT d.id::text, d.tenant_id::text, d.source, d.command_type, d.status, d.finding_id::text, d.command_payload
              FROM core.draft d WHERE d.source LIKE 'intel:%' ORDER BY d.id"""
CELL = "SELECT (rows -> $2::int ->> $3::text) AS v FROM evidence.snapshot WHERE id = $1::uuid"

# Sweep plants by hand, from the answer keys: (key id, detector, dedupe parts after the detector id, severity).
#   Dedupe parts are answer-key aliases (outlet:N, aggregator:X), settlement refs (payout_refs), or literals.
#   Severities, ladder L (IN ₹50,000 / ₹10,000 / ₹2,000; AU A$1,000 / A$200 / A$40 of monthly impact):
#   RG-F1 55,000 low, never opted in → high.  RG-F2 320,000 medium.  CK-F1 40,000 → high.  CK-F2 220,000 medium.
#   AU-F1 17,500 cents medium → high.  RG-F3 60,000 low.  CK-F3 57,600 low.  AU-F3 3,000 cents low (< A$40).
#   RG-F4 + RG-F7 898,800 medium (one finding: the template's Σ covers both while ZM-C-H1 is held, the key's own note),
#   keyed on its set of unsettled orders (R-B S1-C): RG-F4's six bills by their external refs + ZM-C-H1's order lines.
#   RG-F5 three ISO weeks of South's UPI, each medium, never critical (no shift history: the key says so).
EXPECTED: list[tuple[list[str], str, list[str], str]] = [
    (["RG-F1"], "finance.unapproved_ad_fee", ["outlet:1", "aggregator:swiggy", "2026-10"], "high"),
    (["RG-F2"], "finance.unapproved_ad_fee", ["outlet:2", "aggregator:zomato", "2026-10"], "medium"),
    (["RG-F3"], "finance.short_payout", ["outlet:2", "settlement:ZM-C-SHORT"], "low"),
    (["RG-F4", "RG-F7"], "finance.missing_payout", ["outlet:2", "aggregator:zomato", "orders:RG-F4+RG-F7"], "medium"),
    (["RG-F5:w37"], "finance.tender_gap", ["outlet:3", "upi", "2026-w37"], "medium"),
    (["RG-F5:w38"], "finance.tender_gap", ["outlet:3", "upi", "2026-w38"], "medium"),
    (["RG-F5:w39"], "finance.tender_gap", ["outlet:3", "upi", "2026-w39"], "medium"),
    (["CK-F1"], "finance.unapproved_ad_fee", ["outlet:1", "aggregator:zomato", "2026-10"], "high"),
    (["CK-F2"], "finance.unapproved_ad_fee", ["outlet:1", "aggregator:swiggy", "2026-10"], "medium"),
    (["CK-F3"], "finance.short_payout", ["outlet:1", "settlement:SW-K-SHORT"], "low"),
    (["AU-F1"], "finance.unapproved_ad_fee", ["outlet:1", "aggregator:ubereats", "2026-10"], "high"),
    (["AU-F3"], "finance.short_payout", ["outlet:1", "settlement:DD-SHORT"], "low"),
]
# RG-F5's weekly sums, typed from its `what` ("7, 9, 11 Sep: 246,000; 14, 16, 18 Sep: 419,400; 21, 23, 25 Sep: 273,600").
F5_WEEKS = {"RG-F5:w37": 246_000, "RG-F5:w38": 419_400, "RG-F5:w39": 273_600}
# R-B S1-C, typed from each key's `what` (never the code): a short payout's dispute claims one line per short order —
# (lines, paise or cents each). RG-F3 "20 orders of 500 rupees: 20 x 50,000 x 600/10,000" = 20 × 3,000; CK-F3 "12 orders
# of 600 rupees: 12 x 60,000 x 800/10,000" = 12 × 4,800; AU-F3 "15 orders of A$40: 15 x 4,000 x 500/10,000" = 15 × 200.
SHORT_LINES = {"RG-F3": (20, 3_000), "CK-F3": (12, 4_800), "AU-F3": (15, 200)}
# RG-F7's `what`: "Zomato's cycle ZM-C-H1 at Central (20 to 26 Sep, 11 orders)".
F7_ORDERS = 11
# Pack §6 dispute per draft-bearing detector: (basis, the Σ / row column total_claimed_minor cites).
DISPUTE = {
    "finance.unapproved_ad_fee": ("unapproved_ad_fee", "unapproved_minor"),
    "finance.short_payout": ("short_payout", "short_minor"),
    "finance.missing_payout": ("missing_payout", "expected_net_minor"),
}


def answer_key(plant: str) -> dict[str, Any]:
    key = json.loads((REPO / "tools" / "worldgen" / "answer-key" / f"{WORLD_OF[plant[:2]]}.json").read_text("utf8"))
    entry: dict[str, Any] = next(p for p in key["problems"] if p["id"] == plant)
    return entry


def orders_hash(ids: list[str]) -> str:
    """The missing-payout key's order-set part, by hand (R-B S1-C): sha256 over the sorted ids joined by newlines, 32 hex."""
    return hashlib.sha256("\n".join(sorted(ids)).encode()).hexdigest()[:32]


def want_impact(plants: list[str]) -> int:
    return sum(F5_WEEKS[p] if p in F5_WEEKS else int(answer_key(p)["impact_minor"]) for p in plants)


class FinanceStack:
    """tests/packs/finance/finance_stack.mts as a subprocess (the protocol of T-043's tests/watch/stack.py)."""

    def __init__(self, days: int, worlds: list[str]) -> None:
        node = shutil.which("node")
        assert node, "node is required: the finance gates run core-api's real internal API"
        self.proc = subprocess.Popen(  # noqa: S603 — fixed argv of our own fixture
            [node, str(HERE / "finance_stack.mts"), str(days), *worlds],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
        self.ready = self._read("ready")
        self.tenants: dict[str, str] = self.ready["tenants"]

    def _read(self, key: str) -> Any:
        assert self.proc.stdout is not None
        for line in self.proc.stdout:
            if line.startswith("{"):
                msg = json.loads(line)
                if key in msg:
                    return msg[key] if key != "ready" else msg
        raise AssertionError(f"finance_stack.mts exited ({self.proc.wait()}) before answering")

    def call(self, op: str, **args: Any) -> Any:
        assert self.proc.stdin is not None
        self.proc.stdin.write(json.dumps({"op": op, **args}) + "\n")
        self.proc.stdin.flush()
        return self._read("ok")

    def sql(self, q: str, *params: Any) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = self.call("sql", q=q, params=list(params))
        return rows

    def frame(self, world: str) -> Frame:
        f = self.call("frame", world=world, narration="template")
        return frame_from_pack(f["pack"], f["outlets"], f["narration"])

    def stop(self) -> None:
        if self.proc.poll() is None:
            assert self.proc.stdin is not None
            self.proc.stdin.write(json.dumps({"op": "stop"}) + "\n")
            self.proc.stdin.flush()
            self.proc.wait(timeout=60)
        assert self.proc.returncode == 0, f"finance_stack.mts exited {self.proc.returncode}"


@pytest.fixture(scope="module")
def stack() -> Iterator[FinanceStack]:
    s = FinanceStack(DAYS, WORLDS)
    yield s
    s.stop()


class Harness:
    def __init__(self, stack: FinanceStack, run_dir: Path) -> None:
        self.stack = stack
        (run_dir / "keys").mkdir(parents=True, exist_ok=True)
        (run_dir / "keys" / "run-token-ed25519.pub.pem").write_text(stack.ready["public_key_pem"])
        (run_dir / "service-secret").write_text(stack.ready["secret"] + "\n")
        self.cfg: Config = load_config(env={"MUNIM_RUN_DIR": str(run_dir)})

    def ctx(self, world: str) -> RunContext:
        t = self.stack.call("token", world=world, trigger="watch_sweep", scope=["*"])
        return verify_run_token(t["token"], load_public_key(self.cfg.run_token_public_key_pem()))

    def sweep(self, world: str) -> Report:
        ctx = self.ctx(world)

        async def go() -> Report:
            client = InternalClient(ctx, base_url=self.cfg.core_url, service_secret=self.cfg.service_secret(), transport=Bridge(self.stack))  # type: ignore[arg-type]  # same `call` protocol
            try:
                return await WatchRun(ctx, client, self.stack.frame(world), self.cfg).run({PACK: REGISTRY[PACK]})
            finally:
                await client.aclose()

        return asyncio.run(go())

    def mint(self, world: str, template: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        t = self.stack.call("token", world=world, trigger="watch_sweep", scope=["*"])
        r = self.stack.call(
            "http",
            method="POST",
            path="/internal/intel/v1/snapshots",
            headers={
                "authorization": f"Bearer {t['token']}",
                "x-munim-service-secret": self.stack.ready["secret"],
                "content-type": "application/json",
            },
            body=json.dumps({"template_id": template, "params": params}),
        )
        assert r["status"] == 201, r["body"]
        rows: list[dict[str, Any]] = json.loads(r["body"])["rows"]
        return rows

    def id(self, world: str, part: str) -> str:
        tenant = self.stack.tenants[world]
        if part.startswith("aggregator:"):
            (row,) = self.stack.sql("SELECT id::text FROM core.channel WHERE tenant_id = $1 AND kind = $2", tenant, part)
            return str(row["id"])
        if part.startswith("settlement:"):
            (row,) = self.stack.sql("SELECT id::text FROM core.settlement WHERE tenant_id = $1 AND external_ref = $2", tenant, part[11:])
            return str(row["id"])
        if part.startswith("outlet:"):
            return str(self.stack.call("id", world=world, key=part))
        if part.startswith("orders:"):
            return orders_hash([o for plant in part[7:].split("+") for o in self.plant_orders(world, plant)])
        return part

    def plant_orders(self, world: str, plant: str) -> list[str]:
        """The orders a missing-payout plant names, from the key and the world's own files — never from the template: RG-F4
        by its bills' external refs; RG-F7 by the order lines of its held statement (ZM-C-H1), as the import staged them."""
        tenant, where = self.stack.tenants[world], answer_key(plant)["where"]
        if "external_refs" in where:
            rows = self.stack.sql(
                'SELECT id::text FROM core."order" WHERE tenant_id = $1 AND external_ref = ANY($2)', tenant, where["external_refs"]
            )
            assert len(rows) == len(where["external_refs"]), plant
        else:
            rows = self.stack.sql(
                """SELECT DISTINCT o.id::text FROM core.import_staging s
                     JOIN core."order" o ON o.tenant_id = s.tenant_id AND o.external_ref = s.data ->> 'order_ref'
                                        AND o.channel_id = (s.data ->> 'channel_id')::uuid
                    WHERE s.tenant_id = $1 AND s.data ->> 'payout_ref' = $2 AND s.data ->> 'line_kind' = 'order'""",
                tenant,
                where["payout_ref"],
            )
            assert len(rows) == F7_ORDERS, (plant, len(rows))
        return [str(r["id"]) for r in rows]

    def findings(self, world: str | None = None) -> list[dict[str, Any]]:
        rows = self.stack.sql(FINDINGS, PACK)
        return rows if world is None else [f for f in rows if f["tenant_id"] == self.stack.tenants[world]]

    def expected_keys(self) -> dict[tuple[str, str], tuple[list[str], str, str]]:
        out = {}
        for plants, detector, parts, severity in EXPECTED:
            world = WORLD_OF[plants[0][:2]]
            key = ":".join([detector, *(self.id(world, p) for p in parts)])
            out[(self.stack.tenants[world], key)] = (plants, detector, severity)
        return out


@pytest.fixture(scope="module")
def h(stack: FinanceStack, tmp_path_factory: pytest.TempPathFactory) -> Harness:
    return Harness(stack, tmp_path_factory.mktemp("run"))


def test_every_finance_plant_in_the_detector_map_is_expected_here() -> None:
    """detector-map.json (hand-kept) names the finance detector per key id: each must be in EXPECTED (or be the trap)."""
    problems = json.loads((REPO / "tools" / "worldgen" / "answer-key" / "detector-map.json").read_text("utf8"))["problems"]
    mapped = {k for k, v in problems.items() if str(v.get("detector") or "").startswith("finance.") and v.get("expect") != "no_finding"}
    listed = {p.split(":")[0] for plants, *_ in EXPECTED for p in plants}
    assert mapped == listed and "RG-F8" not in listed
    assert sum(F5_WEEKS.values()) == answer_key("RG-F5")["impact_minor"]


def test_sweeps_find_every_finance_plant_with_impact_equal_to_the_key_and_no_false_alarm(h: Harness) -> None:
    reports = {w: h.sweep(w).as_json() for w in WORLDS}
    print("reports:", json.dumps(reports, sort_keys=True))
    assert all(r["errors"] == 0 for r in reports.values()), "no mint, finding or draft error"
    want = h.expected_keys()
    got = {(f["tenant_id"], f["dedupe_key"]): f for f in h.findings()}
    rows = []
    for k, (plants, _, severity) in want.items():
        f = got.get(k)
        rows.append((plants, None if f is None else (int(f["impact"]), f["severity"]), (want_impact(plants), severity)))
    for r in rows:
        print("plant", *r)
    assert [r for r in rows if r[1] != r[2]] == [], "plant not found, or impact / severity off the key"
    false_alarms = sorted(set(got) - set(want))
    print("false alarms:", false_alarms)
    assert false_alarms == []
    assert all(
        f["impact_column"] == next(s for s in REGISTRY[PACK] if f["dedupe_key"].startswith(s.id + ":")).impact_column for f in got.values()
    )


def test_rg_f8_ad_fee_within_the_opted_in_cap_and_a_refund_lower_net_raise_nothing(h: Harness) -> None:
    """The trap's precondition first (else 'no finding' would pass on an empty month): Central's August Zomato row
    carries the key's 30,000 ad fee, allowed in full under the opted-in cap, and its August payouts carry refunds."""
    world, outlet, zomato = "restaurant_group", h.id("restaurant_group", "outlet:2"), h.id("restaurant_group", "aggregator:zomato")
    key = answer_key("RG-F8")
    (ad,) = [r for r in h.mint(world, "finance.unapproved_deductions", {"channel_id": zomato, "month": "2026-08-01", "outlet_id": outlet})]
    august = {"channel_id": zomato, "from": "2026-08-01", "to": "2026-08-31", "outlet_id": outlet}
    rows = h.mint(world, "finance.settlement_vs_orders", august)
    sigma = [r for r in rows if r["settlement_line_id"] is None]
    lines = [r for r in rows if r["settlement_line_id"] is not None]
    print("August ad row:", ad, "\nAugust settlement Σ rows (refund, short):", [(r["refund_minor"], r["short_minor"]) for r in sigma])
    assert (ad["ads_opted_in"], ad["ad_fee_minor"], ad["unapproved_minor"]) == (True, 30_000, key["impact_minor"])
    # v2 Σ rows sum only the lines that count as short (0023 F1), so the refunds are read from the line rows.
    assert sum(r["refund_minor"] for r in lines) > 0, "a refund we recorded is in August's payouts"
    keys = {f["dedupe_key"] for f in h.findings(world)}
    trap = f"finance.unapproved_ad_fee:{outlet}:{zomato}:2026-08"
    short_aug = {f"finance.short_payout:{outlet}:{r['settlement_id']}" for r in sigma}
    print("August keys present:", sorted(k for k in keys if k == trap or k in short_aug))
    assert trap not in keys and not short_aug & keys and len(short_aug) > 0


def test_each_draft_bearing_plant_yields_one_dispute_citing_the_pack_6_cell(h: Harness) -> None:
    findings = {f["id"]: f for f in h.findings()}
    drafts = h.stack.sql(DRAFTS)
    want = h.expected_keys()
    bearing = {(t, k): v for (t, k), v in want.items() if v[1] in DISPUTE}
    by_finding = {d["finding_id"]: d for d in drafts}
    wrong = []
    for (tenant, key), (plants, detector, _) in bearing.items():
        f = next(x for x in findings.values() if x["tenant_id"] == tenant and x["dedupe_key"] == key)
        d = by_finding.get(f["id"])
        basis, column = DISPUTE[detector]
        world = WORLD_OF[plants[0][:2]]
        channel = h.id(world, answer_key(plants[0])["where"]["channel"]) if "channel" in answer_key(plants[0])["where"] else None
        if d is None:
            wrong.append((plants, "no draft"))
            continue
        p = d["command_payload"]
        ref = p["total_claimed_minor"]
        sid, row, col = ref[len("⟨snap:") : -1].split("·")
        (cell,) = h.stack.sql(CELL, sid, int(row), col)
        lines = lines_ok(h, world, plants, p, int(cell["v"]))
        ok = (
            d["command_type"] == "finance.dispute.draft.v1"
            and d["status"] == "proposed"
            and d["source"] == "intel:finance"
            and p["basis"] == basis
            and lines
            and (channel is None or p["channel_id"] == channel)
            and (sid, int(row), col) == (f["snapshot_id"], f["impact_row"], column)
            and int(cell["v"]) > 0
        )
        print(plants, basis, "claims", col, "=", cell["v"], "lines", len(p["lines"]), "ok" if ok else "WRONG")
        if not ok:
            wrong.append((plants, p))
    # Pack §6 count, by hand: 5 ad-fee plants + 3 short payouts + 1 missing-payout finding = 9 disputes.
    assert (len(bearing), wrong) == (9, [])
    assert len(drafts) == 9 and {d["source"] for d in drafts} == {"intel:finance"}


def cell_value(h: Harness, ref: str) -> int:
    sid, row, col = ref[len("⟨snap:") : -1].split("·")
    (cell,) = h.stack.sql(CELL, sid, int(row), col)
    return int(cell["v"])


def lines_ok(h: Harness, world: str, plants: list[str], p: dict[str, Any], total: int) -> bool:
    """R-B S1-C against the keys: an ad fee claims no line; a short payout one line per short order of the key's own
    statement, each the key's per-order shortfall; a missing payout one line per unsettled order the plants name. Every
    claimed cell resolves, and the claims add up to the total."""
    lines = p["lines"]
    if p["basis"] == "unapproved_ad_fee":
        return bool(lines == [])
    claims = [cell_value(h, x["claimed_minor"]) for x in lines]
    if p["basis"] == "short_payout":
        n, each = SHORT_LINES[plants[0]]
        (ref,) = answer_key(plants[0])["where"]["payout_refs"]
        owned = h.stack.sql(
            """SELECT sl.id::text FROM core.settlement_line sl
                 JOIN core.settlement st ON st.tenant_id = sl.tenant_id AND st.id = sl.settlement_id
                WHERE st.tenant_id = $1 AND st.external_ref = $2""",
            h.stack.tenants[world],
            ref,
        )
        ids = {x["settlement_line_id"] for x in lines}
        return (len(lines), set(claims), sum(claims)) == (n, {each}, total) and ids <= {r["id"] for r in owned} and None not in ids
    want = {o for plant in plants for o in h.plant_orders(world, plant)}
    return {x["order_id"] for x in lines} == want and len(lines) == len(want) and sum(claims) == total and min(claims) > 0


def test_every_finding_draft_and_trace_carries_the_finance_specialist(h: Harness) -> None:
    findings, drafts = h.findings(), h.stack.sql(DRAFTS)
    actors = h.stack.sql(
        """SELECT t.actor, count(*)::int AS n FROM intel.trace_event t JOIN intel.run r ON r.tenant_id = t.tenant_id AND r.id = t.run_id
            WHERE r.trigger = 'watch_sweep' GROUP BY t.actor"""
    )
    print("findings:", len(findings), "drafts:", len(drafts), "trace actors:", actors)
    assert len(findings) == len(EXPECTED) and {f["pack"] for f in findings} == {"finance"}
    assert {d["source"] for d in drafts} == {"intel:finance"}
    assert [a["actor"] for a in actors] == ["watcher:finance"] and actors[0]["n"] > 0


def test_pack_7_refusals_on_the_seeded_worlds_each_with_its_accept(h: Harness) -> None:
    """settlements_missing: September's P&L while ZM-C-H1 is held (pack F7); its accept is after the approval (next test).
    bank_lines_missing: the cloud kitchen has no bank statement; accept: South's UPI, which a statement credits."""
    rg, ck = "restaurant_group", "cloud_kitchen"
    close = h.mint(rg, "finance.close_status", {"period_month": "2026-09-01", "outlet_id": None})
    ck_upi = h.mint(
        ck, "finance.tender_vs_bank", {"outlet_id": h.id(ck, "outlet:1"), "method": "upi", "from": "2026-09-01", "to": "2026-09-30"}
    )
    rg_upi = h.mint(
        rg, "finance.tender_vs_bank", {"outlet_id": h.id(rg, "outlet:3"), "method": "upi", "from": "2026-09-01", "to": "2026-09-30"}
    )
    got = [
        skill.refusal("finance.close_status", close),
        skill.refusal("finance.tender_vs_bank", ck_upi),
        skill.refusal("finance.tender_vs_bank", rg_upi),
    ]
    print("refusals:", got, "settlements_imported:", [r for r in close if r["item_code"] == "settlements_imported"])
    assert got == ["settlements_missing", "bank_lines_missing", None]


def missing_key(h: Harness, plants: str) -> str:
    world = "restaurant_group"
    return ":".join(["finance.missing_payout", *(h.id(world, p) for p in ("outlet:2", "aggregator:zomato", f"orders:{plants}"))])


def test_approving_the_held_cycle_raises_rg_f4_alone_and_no_order_is_claimed_twice(h: Harness) -> None:
    """RG-F7's key: 898,800 until ZM-C-H1 is approved, 176,400 (RG-F4) after; close_status settlements_imported flips.
    Keyed on its order set (R-B S1-C), the backlog after the approval is a new finding over RG-F4's six orders.
    Paired with core's open-dispute refusal (f-core): the owner first approves the 17-order dispute (accept: one
    core.dispute holding those 17 orders); the re-sweep's 6-order draft then goes stale on approval (409 stale_draft),
    because its orders already sit in an open dispute — the weekly re-claim R-B found cannot happen."""
    rg, tenant = "restaurant_group", h.stack.tenants["restaurant_group"]
    key17, key6 = missing_key(h, "RG-F4+RG-F7"), missing_key(h, "RG-F4")
    before = {f["dedupe_key"]: f for f in h.findings(rg)}
    held = """SELECT count(*)::int AS n FROM core.dispute_line l JOIN core.dispute d ON d.tenant_id = l.tenant_id AND d.id = l.dispute_id
               WHERE d.tenant_id = $1 AND d.basis = 'missing_payout' AND l.order_id IS NOT NULL"""
    (d17,) = [d for d in h.stack.sql(DRAFTS) if d["finding_id"] == before[key17]["id"]]
    accept = h.stack.call("approve_draft", world=rg, draft_id=d17["id"], command_type=d17["command_type"])
    after_accept = h.stack.sql(held, tenant)[0]["n"]
    assert h.stack.call("approve_held", world=rg, filename="ZM-C-held.csv")["status"] in (200, 201)
    report = h.sweep(rg).as_json()
    after = {f["dedupe_key"]: f for f in h.findings(rg)}
    print("re-sweep:", report, "\nmissing payout before/after:", int(before[key17]["impact"]), int(after[key6]["impact"]))
    assert accept["status"] in (200, 201) and after_accept == 6 + F7_ORDERS, (accept, after_accept)
    assert key6 not in before and set(after) == set(before) | {key6} and after[key17]["id"] == before[key17]["id"]
    assert int(after[key6]["impact"]) == answer_key("RG-F4")["impact_minor"]
    assert int(before[key17]["impact"]) - int(after[key6]["impact"]) == answer_key("RG-F7")["impact_minor"]
    (d6,) = [d for d in h.stack.sql(DRAFTS) if d["finding_id"] == after[key6]["id"]]
    refused = h.stack.call("approve_draft", world=rg, draft_id=d6["id"], command_type=d6["command_type"])
    (status,) = h.stack.sql("SELECT status FROM core.draft WHERE id = $1::uuid", d6["id"])
    print("6-order draft:", refused, status)
    assert (refused["status"], refused["body"]["error"]["reason_code"], status["status"]) == (409, "stale_draft", "stale")
    assert h.stack.sql(held, tenant)[0]["n"] == 6 + F7_ORDERS, "no order claimed twice"
    close = h.mint(rg, "finance.close_status", {"period_month": "2026-09-01", "outlet_id": None})
    assert skill.refusal("finance.close_status", close) is None


@pytest.mark.parametrize("state", ["after"])
def test_margin_bridge_rows_equal_rg_mf1_and_no_finance_detector_fires_on_its_plants(h: Harness, state: str) -> None:
    """RG-MF1's `bridge.<state>` rows ([prior, current, share_bp] per component, typed in the key) against
    finance.margin_bridge (September vs August). The previous test approved ZM-C-H1, so this is the key's `after`.
    The bridge's planted drivers (RG-C1, RG-C2, RG-C3, RG-G7, RG-K7, RG-CAL) raise no finance finding: the finance
    findings are exactly EXPECTED's (checked in the sweep gate and re-checked here after the re-sweep)."""
    rows = h.mint("restaurant_group", "finance.margin_bridge", {"period_month": "2026-09-01", "compare_month": "2026-08-01"})
    got = {r["component"]: [r["prior_minor"], r["current_minor"], r["share_bp"]] for r in rows}
    want = answer_key("RG-MF1")["bridge"][state]
    diff = {k: (got.get(k), v) for k, v in want.items() if got.get(k) != v}
    print("bridge rows off the key:", diff)
    assert diff == {} and set(got) == set(want)
    rg6 = (h.stack.tenants["restaurant_group"], missing_key(h, "RG-F4"))  # the post-approval backlog (previous test)
    assert {(f["tenant_id"], f["dedupe_key"]) for f in h.findings()} == set(h.expected_keys()) | {rg6}


def test_the_finance_templates_the_detectors_read_are_the_migrators_v2(h: Harness) -> None:
    """The detectors read v2 shapes (Σ rows by their NULL id column, gst_check's outlet_id): the latest installed version
    of each is 2 (settlement_vs_orders 3, hand list LATEST), and its columns are v1's plus the appended ones db/README.md
    names (hand list V2)."""
    rows = h.stack.sql(
        """SELECT t.id, t.version,
                  (SELECT array_agg(c ->> 'name' ORDER BY k) FROM jsonb_array_elements(t.columns) WITH ORDINALITY e(c, k)) AS cols,
                  (SELECT array_agg(c ->> 'name' ORDER BY k) FROM jsonb_array_elements(v1.columns) WITH ORDINALITY e(c, k)) AS v1_cols
             FROM evidence.snapshot_template t JOIN evidence.snapshot_template v1 ON v1.id = t.id AND v1.version = 1
            WHERE t.id = ANY($1::text[]) AND t.version = (SELECT max(version) FROM evidence.snapshot_template x WHERE x.id = t.id)""",
        list(V2),
    )
    got = {r["id"]: (r["version"], r["cols"]) for r in rows}
    print("finance templates:", got)
    assert got == {r["id"]: (LATEST.get(r["id"], 2), [*r["v1_cols"], *V2[r["id"]]]) for r in rows} and set(got) == set(V2)
    assert {s.template for s in REGISTRY[PACK] if s.id != "finance.unapproved_ad_fee"} == set(V2)
