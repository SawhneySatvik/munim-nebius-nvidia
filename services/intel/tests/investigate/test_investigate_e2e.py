"""T-083 end to end: investigations in Step mode on `restaurant_group` with the T-086 plants (100 days, as of the gate
profile's day), through the real core-api on embedded Postgres; core's NarratePort bridged to intel's real
`/investigate:narrate` app in-process (investigate_stack.mts), recorded narration model. Tests run in file order on one
seeded stack. Fails — never skips — without node.

The world as seeded has no shift history, so `finance.close_status` reads pos_days_closed open for every outlet-day (the
RG-MF1 key says so) and H0 can never complete on it. T-093's shift_log_v1 history import exists for this (BOARD, T-093):
the gate world is RG plus one closed shift per trading outlet-day of August and September, imported and approved by the
owner — it posts nothing, so the bridge stays the key's. Then the only H0 gap is the held Zomato cycle ZM-C-H1 (RG-F7).

Gates (BOARD b-83): (1) bridge Σ = margin delta = key, before and after the held import; (2) supported items = the key's
list; (3) the held settlement → H0 cannot_verify, status waiting; approve + :continue → H0 supported; (4) a planted flip
of a frozen item at the final re-mint → reopened, not done; (6) narration signed item by item by the hand-listed owning
specialist, digit-free, refs resolving to the SQL cell, 0 tools, untainted; a model line with a typed digit falls back
to core's template for that item; AI off → the whole step is core's template.

Expected values never come from the code under test: the bridge rows, the margin delta and the supported list are typed
in the hand-kept answer key (RG-MF1 `bridge`, `impact_minor`, `what`); the open counts from RG-MF1 / RG-F7 `what`; the
specialists from the hand list below (derivation in packages/core-domain/investigations/playbooks.ts); cells re-read by SQL.
Fixtures: `uv run --frozen python tests/investigate/test_investigate_e2e.py --record` (seeds the world, ~1 min).
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
from collections.abc import AsyncGenerator, Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from google.adk.models import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

from munim_intel.app import create_app
from munim_intel.config import load_config
from munim_intel.llm.recorded import RecordedLlm, request_key
from munim_intel.runtime.internal_client import SERVICE_SECRET_HEADER

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
FIXTURES = HERE / "fixtures" / "narrate"
WORLD, DAYS = "restaurant_group", 100
PARAMS = {"period_month": "2026-09-01", "compare_month": "2026-08-01"}
CANONICAL = re.compile(r"⟨[^⟩]*⟩")
RECORDING = os.environ.get("T083_RECORD") == "1"
#: BOARD gate 8, by hand (ADR-014 §7.5 items → the registry owner of their evidence templates).
HAND = {
    "data_complete": "finance",
    "supplier_price": "inventory_purchasing",
    "waste": "inventory_purchasing",
    "deals": "catalogue",
    "channel_fees": "finance",
    "labour": "people",
    "volume_mix": "catalogue",
}


def key(plant: str) -> dict[str, Any]:
    doc = json.loads((REPO / "tools" / "worldgen" / "answer-key" / f"{WORLD}.json").read_text("utf8"))
    entry: dict[str, Any] = next(p for p in doc["problems"] if p["id"] == plant)
    return entry


MF1 = key("RG-MF1")

# ---- the recorded narration model -------------------------------------------------------------------------------------
_ITEM = re.compile(r"^- ([a-z_]+) \(verdict: ([a-z_]+)\); cells: (.+)$")
#: SYNTHETIC model lines. `labour` carries a typed digit, so core's template must replace that one line (cite-or-abstain).
PHRASE = {
    "supported": "The evidence supports this item",
    "refuted": "The evidence does not support this item",
    "cannot_verify": "This item cannot be checked from the books yet",
}


def scripted_reply(message: str) -> str:
    lines = []
    for raw in message.splitlines():
        m = _ITEM.match(raw)
        if not m:
            continue
        item, verdict, cells = m.groups()
        first = cells.split(" ")[0]
        if item == "labour":
            lines.append(f"{item}: Labour moved by 0 rupees {first}.")
        else:
            lines.append(f"{item}: {PHRASE[verdict]} {first}.")
    return "\n".join(lines)


class Writer(BaseLlm):
    """Authoring only: answers each request from its own message and writes the request's fixture."""

    model: str = "recorded/narrate"

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False) -> AsyncGenerator[LlmResponse, None]:
        text = "".join(p.text or "" for c in llm_request.contents for p in c.parts or [] if c.role == "user")
        step = LlmResponse(content=types.Content(role="model", parts=[types.Part(text=scripted_reply(text))]))
        k, canonical, _ = request_key(llm_request)
        body = {"request": json.loads(canonical), "responses": [step.model_dump(mode="json", exclude_none=True)]}
        FIXTURES.mkdir(parents=True, exist_ok=True)
        (FIXTURES / f"{k}.json").write_text(json.dumps(body, ensure_ascii=False, indent=1, sort_keys=True) + "\n", "utf8")
        yield step


def narrate_model() -> BaseLlm:
    return Writer() if RECORDING else RecordedLlm(model="recorded/narrate", fixtures_dir=FIXTURES)


# ---- the stack ----------------------------------------------------------------------------------------------------------
class Bridge(httpx.AsyncBaseTransport):
    """intel's InternalClient → core-api's app in the stack, over the stack's pipe."""

    def __init__(self, stack: Stack) -> None:
        self.stack = stack

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        body = (await request.aread()).decode() or None
        out = self.stack.call(
            "http", method=request.method, path=request.url.raw_path.decode(), headers=dict(request.headers.items()), body=body
        )
        return httpx.Response(out["status"], content=out["body"].encode(), headers={"content-type": "application/json"})


class Stack:
    """investigate_stack.mts as a subprocess; serves every `intel_narrate` it meets while reading (calls nest strictly)."""

    def __init__(self) -> None:
        node = shutil.which("node")
        assert node, "node is required: the T-083 end-to-end gates run core-api's real investigations"
        self.proc = subprocess.Popen(  # noqa: S603 — fixed argv of our own fixture
            [node, str(HERE / "investigate_stack.mts"), str(DAYS), WORLD],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
        self.ready = self._read("ready")
        run_dir = Path(tempfile.mkdtemp(prefix="t083-run-"))
        (run_dir / "keys").mkdir()
        (run_dir / "keys" / "run-token-ed25519.pub.pem").write_text(self.ready["public_key_pem"])
        self.secret: str = self.ready["secret"]
        cfg = load_config(env={"MUNIM_RUN_DIR": str(run_dir), "MUNIM_SERVICE_SECRET": self.secret})

        async def model_of(_: object) -> BaseLlm:
            return narrate_model()

        self.intel = create_app(cfg, core_transport=Bridge(self), narrate_llm=model_of)
        #: Every /investigate:narrate exchange: (request body, status, response body).
        self.narrations: list[tuple[dict[str, Any], int, str]] = []

    def _send(self, msg: dict[str, Any]) -> None:
        assert self.proc.stdin is not None
        self.proc.stdin.write(json.dumps(msg) + "\n")
        self.proc.stdin.flush()

    def _read(self, want: str) -> Any:
        assert self.proc.stdout is not None
        for line in self.proc.stdout:
            if not line.startswith("{"):
                continue
            msg = json.loads(line)
            if "intel_narrate" in msg:
                self._serve(msg["intel_narrate"])
            elif want in msg:
                return msg if want == "ready" else msg[want]
        raise AssertionError(f"investigate_stack.mts exited ({self.proc.wait()}) before answering")

    def _serve(self, a: dict[str, Any]) -> None:
        async def post() -> tuple[int, str]:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.intel), base_url="http://intel") as c:
                headers = {"authorization": f"Bearer {a['token']}", SERVICE_SECRET_HEADER: self.secret}
                r = await c.post("/investigate:narrate", json=a["body"], headers=headers)
                return r.status_code, r.text

        status, body = asyncio.run(post())
        self.narrations.append((a["body"], status, body))
        self._send({"op": "intel_reply", "id": a["id"], "status": status, "body": body})

    def call(self, op: str, **args: Any) -> Any:
        self._send({"op": op, **args})
        return self._read("ok")

    def sql(self, q: str, *params: Any) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = self.call("sql", q=q, params=list(params))
        return rows

    def owner(self, method: str, path: str, body: Any = None) -> tuple[int, Any]:
        out = self.call("as", persona="owner", method=method, path=path, body=body)
        return out["status"], json.loads(out["body"])

    def stop(self) -> None:
        if self.proc.poll() is None:
            self._send({"op": "stop"})
            self.proc.wait(timeout=60)
        assert self.proc.returncode == 0, f"investigate_stack.mts exited {self.proc.returncode}"


@pytest.fixture(scope="module")
def stack() -> Iterator[Stack]:
    s = Stack()
    yield s
    s.stop()


#: Investigations of the run, by name: P on the plain world; A and B on the gate world (B carries the plant).
IDS: dict[str, str] = {}
#: The view after each step: (name, step_no) → view.
VIEWS: dict[tuple[str, int], dict[str, Any]] = {}


def uuid7() -> str:
    """A uuidv7 (the contracts' id form) for a client-chosen investigation id."""
    import time

    ms = int(time.time() * 1000).to_bytes(6, "big")
    rnd = bytearray(uuid.uuid4().bytes[6:])
    rnd[0] = 0x70 | (rnd[0] & 0x0F)
    rnd[2] = 0x80 | (rnd[2] & 0x3F)
    return str(uuid.UUID(bytes=ms + bytes(rnd)))


def open_investigation(stack: Stack, name: str) -> None:
    IDS[name] = uuid7()
    status, view = stack.owner(
        "POST", "/v1/investigations", {"investigation_id": IDS[name], "playbook_id": "margin_fall", "params": PARAMS}
    )
    assert status == 201, view
    assert view["outlet_scope"] == ["*"] and view["status"] == "open"


def step(stack: Stack, name: str, n: int) -> dict[str, Any]:
    status, view = stack.owner("POST", f"/v1/investigations/{IDS[name]}:continue", {"step_no": n})
    assert status == 200, view
    out: dict[str, Any] = view
    VIEWS[(name, n)] = out
    return out


def status_of(view: dict[str, Any]) -> dict[str, str]:
    return {c["item_id"]: c["status"] for c in view["checklist"]}


def close_status(stack: Stack, month: str) -> dict[str, int]:
    status, snap = stack.owner(
        "POST", "/v1/snapshots", {"template_id": "finance.close_status", "params": {"period_month": month, "outlet_id": None}}
    )
    assert status == 201, snap
    return {r["item_code"]: r["open_count"] for r in snap["rows"]}


def bridge_rows(stack: Stack, view: dict[str, Any], n: int) -> dict[str, list[int]]:
    """The step's margin_bridge snapshot, re-read by SQL: component → [prior, current, share_bp]."""
    [upd] = [u for u in view["steps"][n - 1]["item_updates"] if u["item_id"] == "volume_mix"]
    [row] = stack.sql("SELECT template_id, rows FROM evidence.snapshot WHERE id = $1::uuid", upd["snapshot_ids"][0])
    assert row["template_id"] == "finance.margin_bridge"
    return {r["component"]: [r["prior_minor"], r["current_minor"], r["share_bp"]] for r in row["rows"]}


def test_plain_world_h0_cannot_complete_pos_days_open(stack: Stack) -> None:
    """The key's own statement (RG-MF1): September's pos_days_closed has 90 open outlet-days (no shift history) and
    settlements_imported 11 open while ZM-C-H1 is held (RG-F7). An investigation on this world waits."""
    sep = close_status(stack, "2026-09-01")
    assert (sep["pos_days_closed"], sep["settlements_imported"], sep["bank_imported"]) == (90, 11, 0)
    open_investigation(stack, "P")
    view = step(stack, "P", 1)
    assert view["status"] == "waiting" and status_of(view)["data_complete"] == "cannot_verify"


def test_shift_history_closes_every_trading_day_and_leaves_the_held_settlement(stack: Stack) -> None:
    out = stack.call("import_shifts", months=["2026-08", "2026-09"])
    # 3 outlets x (31 + 30) trading days (every day of both months trades: worldgen's 100-day history).
    assert out["status"] in (200, 201) and out["rows"] == 3 * (31 + 30) == out["rows_ok"]
    sep, aug = close_status(stack, "2026-09-01"), close_status(stack, "2026-08-01")
    assert (sep["pos_days_closed"], sep["settlements_imported"], sep["bank_imported"]) == (0, 11, 0)
    assert (aug["pos_days_closed"], aug["settlements_imported"], aug["bank_imported"]) == (0, 0, 0)


def test_gate3_held_settlement_waits_and_gate1_bridge_is_the_keys_before(stack: Stack) -> None:
    open_investigation(stack, "A")
    open_investigation(stack, "B")
    for name in ("A", "B"):
        view = step(stack, name, 1)
        s = status_of(view)
        assert view["status"] == "waiting" and s["data_complete"] == "cannot_verify", (name, s)
        # Channel fees read settlements: they wait for the data gate (pending, not judged).
        assert s["channel_fees"] == "pending"
    rows = bridge_rows(stack, VIEWS[("A", 1)], 1)
    assert rows == MF1["bridge"]["before"]
    deltas = {c: v[1] - v[0] for c, v in rows.items()}
    assert sum(d for c, d in deltas.items() if c != "margin_delta_minor") == deltas["margin_delta_minor"]


def test_gate3_approved_import_then_continue_supports_h0(stack: Stack) -> None:
    out = stack.call("approve_held", filename="ZM-C-held.csv")
    assert out["status"] in (200, 201)
    view = step(stack, "A", 2)
    assert status_of(view)["data_complete"] == "supported"


def test_gate1_bridge_sum_is_the_margin_delta_is_the_key(stack: Stack) -> None:
    rows = bridge_rows(stack, VIEWS[("A", 2)], 2)
    assert rows == MF1["bridge"]["after"]
    deltas = {c: v[1] - v[0] for c, v in rows.items()}
    total = sum(d for c, d in deltas.items() if c != "margin_delta_minor")
    print(f"bridge: sum of components {total}, margin_delta_minor {deltas['margin_delta_minor']}, key impact {MF1['impact_minor']}")
    assert total == deltas["margin_delta_minor"] == MF1["impact_minor"]


def test_gate2_supported_items_are_the_keys_list_and_the_investigation_is_done(stack: Stack) -> None:
    view = VIEWS[("A", 2)]
    s = status_of(view)
    # The key: "H1 supplier price, H2 waste and H3 deals supported once H0 is; H4 channel fees and H5 labour refuted;
    # H6 volume/mix … (refuted)".
    assert sorted(k for k, v in s.items() if v == "supported") == ["data_complete", "deals", "supplier_price", "waste"]
    assert sorted(k for k, v in s.items() if v == "refuted") == ["channel_fees", "labour", "volume_mix"]
    assert view["status"] == "done"


def test_gate4_a_planted_flip_of_a_frozen_item_at_the_final_remint_reopens_not_done(stack: Stack) -> None:
    assert status_of(VIEWS[("B", 1)])["supplier_price"] == "supported"
    # The plant: a large early-August paneer receipt at September's landed cost, so August's average cost meets
    # September's and the supplier-price effect all but vanishes. Data only (superuser, triggers off, as a plant);
    # it posts nothing, so the margin delta stays the key's; cogs_volume_mix takes the difference by construction.
    stack.call(
        "sql",
        q=f"""BEGIN; SET LOCAL session_replication_role = replica;
CREATE TEMP TABLE plant ON COMMIT DROP AS
  SELECT m.* FROM core.stock_movement m JOIN core.ingredient i ON i.tenant_id = m.tenant_id AND i.id = m.ingredient_id
   WHERE m.tenant_id = '{stack.ready["tenant"]}' AND lower(i.name) LIKE 'paneer%' AND m.kind = 'receipt'
     AND m.at >= '2026-09-01T00:00:00+05:30' AND m.at < '2026-10-01T00:00:00+05:30' ORDER BY m.at LIMIT 1;
UPDATE plant SET id = '{uuid7()}', at = '2026-08-01T09:00:00+05:30', batch_id = NULL,
  qty_milli = 10 * (SELECT sum(m.qty_milli) FROM core.stock_movement m WHERE m.tenant_id = plant.tenant_id
                     AND m.ingredient_id = plant.ingredient_id AND m.kind = 'receipt'
                     AND m.at >= '2026-08-01T00:00:00+05:30' AND m.at < '2026-09-01T00:00:00+05:30');
INSERT INTO core.stock_movement SELECT * FROM plant;
COMMIT;""",  # noqa: S608 — a fixed plant script; it interpolates only the stack's tenant id and a fresh uuid
        params=[],
    )
    view = step(stack, "B", 2)
    [upd] = [u for u in view["steps"][1]["item_updates"] if u["item_id"] == "supplier_price"]
    print("B step 2:", view["status"], status_of(view), upd)
    assert status_of(view)["data_complete"] == "supported"
    assert upd["reopened"] is True and upd["from"] == "supported" and upd["to"] == "refuted" and upd["frozen"] is False
    assert view["status"] == "open"


def test_gate6_narration_signed_digit_free_resolving_untainted_without_tools(stack: Stack) -> None:
    narrated = [(k, v) for k, v in VIEWS.items() if k[0] in ("A", "B")]
    assert len(narrated) == 4
    for (name, n), view in narrated:
        s = view["steps"][n - 1]
        nar = s["narration"]
        assert nar is not None and nar["envelope"]["abstained"] is False, (name, n)
        updates = [u for u in s["item_updates"] if u["refs"]]
        # Signed item by item by the owning specialist (the hand list), one signature per segment.
        assert [g["specialist"] for g in nar["signatures"]] == [HAND[u["item_id"]] for u in updates]
        assert len(nar["envelope"]["segments"]) == len(updates)
        resolved = {r["ref"]: r["value"] for r in view["resolved_refs"]}
        for seg, u in zip(nar["envelope"]["segments"], updates, strict=True):
            text = seg["text"]
            assert not re.search(r"\d", CANONICAL.sub("", text)), (name, n, text)
            tokens = CANONICAL.findall(text)
            assert tokens and set(tokens) <= set(u["refs"]), (name, n, text)
            for tok in tokens:
                sid, row, col = tok[len("⟨snap:") : -1].split("·")
                [cell] = stack.sql("SELECT rows -> $2::int -> $3::text AS v FROM evidence.snapshot WHERE id = $1::uuid", sid, int(row), col)
                assert cell["v"] == resolved[tok], tok
        assert s["tainted"] is False
    # Model prose stands where it passed; the labour line (a typed digit) is core's template instead.
    for body, status, out in stack.narrations[:5]:
        reply = json.loads(out)
        assert status == 200 and reply["source"] == "model" and reply["tainted"] is False
        [row] = stack.sql("SELECT envelope FROM intel.answer WHERE id = $1::uuid", reply["answer_id"])
        texts = {i["item_id"]: seg["text"] for i, seg in zip(body["items"], row["envelope"]["segments"], strict=True)}
        templates = {i["item_id"]: i["template"] for i in body["items"]}
        assert texts["labour"] == templates["labour"]
        assert all(texts[k] != templates[k] for k in texts if k != "labour")
    # The narration runs: actor = the playbook's owner (finance), no tool call, no proposal.
    runs = [r["run_id"] for r in stack.sql("SELECT run_id::text FROM core.investigation_step WHERE run_id IS NOT NULL")]
    assert len(runs) == 5  # P1, A1, B1, A2, B2
    actors = {r["actor"] for r in stack.sql("SELECT DISTINCT actor FROM intel.trace_event WHERE run_id = ANY ($1::uuid[])", runs)}
    kinds = {r["kind"] for r in stack.sql("SELECT DISTINCT kind FROM intel.trace_event WHERE run_id = ANY ($1::uuid[])", runs)}
    assert actors == {"specialist:finance"} and not kinds & {"tool_call", "tool_result", "draft"}, (actors, kinds)
    # Tool count = 0: no recorded narration request declares a tool.
    files = sorted(FIXTURES.glob("*.json"))
    assert files and all(not json.loads(f.read_text("utf8"))["request"].get("tools") for f in files)


def test_gate6_ai_off_whole_step_is_core_template_and_gate4_then_completes(stack: Stack) -> None:
    stack.call("ai", on=False)
    view = step(stack, "B", 3)
    stack.call("ai", on=True)
    body, status, out = stack.narrations[-1]
    reply = json.loads(out)
    assert status == 200 and reply["source"] == "template"
    nar = view["steps"][2]["narration"]
    assert [x["text"] for x in nar["envelope"]["segments"]] == [i["template"] for i in body["items"]]
    # Gate 4's tail: with the flip judged as a non-frozen item, the next step completes; supplier price stays refuted.
    assert view["status"] == "done" and status_of(view)["supplier_price"] == "refuted"


if __name__ == "__main__" and sys.argv[1:] == ["--record"]:
    shutil.rmtree(FIXTURES, ignore_errors=True)
    sys.exit(
        subprocess.call(
            [sys.executable, "-m", "pytest", "-q", "-s", str(Path(__file__)), "-p", "no:cacheprovider"],
            env={**os.environ, "T083_RECORD": "1"},
        )
    )  # noqa: S603
