"""The context assembler (ADR-014 §6.1, §6.2, §6.4; ledger R45 F9): what each model call of a run sees, in block order,
within its per-call cap.

  system instruction   ADK's identity line (agent name `munim` / `munim_branch`, §6.1 shared-prefix rule), then
                       1 core rules (core.md) · 2 output contract · 3 skill instructions (≤ 2 skills).
                       Tenant-invariant by construction: built from the run kind and the loaded skills only.
  tools                4 declarations — ADK builds them from the PackToolset (skills/loader.py); tenant-invariant too.
  contents             one leading user part: 5 run frame · 6 investigation excerpt · 6b thread excerpt · 7 open
                       findings (a branch: block 5 only, §6.3); then the member's question or the branch brief (9)
                       and ADK's own tool-call history (8, the evidence).

Deviation (reported): ADK's function-calling history must follow the question it answers, so block 9 precedes block 8.
Everything tenant-specific sits in contents, after the stable prefix (system + tools), so implicit caching can reuse it.

Wiring, for the builder (T-082b): `LlmAgent(name=AGENT_NAME[kind], instruction=a.instruction, tools=[toolset],
before_model_callback=a.before_model)`. `instruction` is a callable, which also keeps ADK's `{state}` injection off the
handle examples in block 1. `before_model` rewrites a per-step copy of the request ADK built (never the session's
events), compacts at 70 % of the cap (§6.2, deterministic: no model summarises), and at the cap answers the step with
"cannot verify" instead of calling the model (rule 11: degrade, never error).

Tokens are chars ÷ 3.5 (§6.1: conservative when no provider tokenizer is at hand).
"""

from __future__ import annotations

import json
import math
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Literal

from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

from munim_intel.context.expand import CANNOT_VERIFY, expand
from munim_intel.contracts_gen.models import InternalRunFrameResponse, ThreadsBlock
from munim_intel.runtime.state import RunState
from munim_intel.skills import SkillSpec
from munim_intel.skills.loader import LoadSkillTool, PackToolset
from munim_intel.tools.answer import SubmitAnswerTool, outlet_marks
from munim_intel.tools.generated import read_index
from munim_intel.tools.handles import HandleTable

RunKind = Literal["orchestrator", "branch"]

#: ADR-014 §6.1 per-call input caps (tokens) of the calls assembled here. DM (≤ 2k) and narrate (≤ 8k) calls have no
#: tools and build their own prompts (decide/, narrate/); blocks 1–4 alone are above the DM cap.
CALL_CAPS: dict[RunKind, int] = {"orchestrator": 24_000, "branch": 16_000}
#: §6.1 shared-prefix rule: constant names; the pack rides in the trace actor label, never here.
AGENT_NAME: dict[RunKind, str] = {"orchestrator": "munim", "branch": "munim_branch"}
#: §6.1 block budgets (tokens) for the blocks built here.
BLOCK_CAPS = {"5": 600, "6": 1_500, "7": 1_000}
#: §6.2: compaction starts at 70 % of the per-call cap.
COMPACT_AT = 0.7
#: §6.1 block 6: the last 2 untainted step summaries; block 7: ≤ 10 findings.
STEP_SUMMARIES, HINTS = 2, 10
#: Tool results at most this long stay whole when compacting (load_skill's, an error, a small graph result).
SMALL_RESULT_CHARS = 400

CORE_RULES = (Path(__file__).resolve().parent / "core.md").read_text("utf8").strip()


def tokens(text: str) -> int:
    return math.ceil(len(text) / 3.5)


# -- inputs (core-owned reads; the builder fetches them) -----------------------------------------------------------


@dataclass(frozen=True)
class ChecklistItem:
    label: str
    status: str
    refs: tuple[str, ...] = ()


@dataclass(frozen=True)
class StepSummary:
    """One investigation step's validated narration. `tainted`: untrusted text was in that step's run (§6.4 rule 4)."""

    step_no: int
    text: str
    refs: tuple[str, ...]
    tainted: bool


@dataclass(frozen=True)
class Investigation:
    """`intel_ro.investigation_current` (ADR-014 §7.2): playbook, checklist with statuses and refs, step summaries."""

    playbook: str
    checklist: tuple[ChecklistItem, ...]
    steps: tuple[StepSummary, ...]


@dataclass(frozen=True)
class FindingHint:
    """An open finding in scope (`intel_ro.finding_recent`): labels and an impact ref only, no prose."""

    finding_id: str
    type: str
    severity: str
    impact_ref: str | None
    age_days: int | None


# -- blocks --------------------------------------------------------------------------------------------------------


def _fit(head: str, lines: Sequence[str], cap: int, *, keep: Literal["first", "last"]) -> str:
    """`head` plus as many of `lines` as fit in `cap` tokens; drops from the far end of `keep`."""
    kept = list(lines)
    while kept and tokens("\n".join([head, *kept])) > cap:
        kept.pop(-1 if keep == "first" else 0)
    return "\n".join([head, *kept]) if kept else ""


def output_contract(kind: RunKind, skills: Sequence[SkillSpec], folded: SubmitAnswerTool | None = None) -> str:
    """Block 2: how the run ends, and the reason codes it may abstain with. `folded`: the bound submit_answer, which
    takes the abstention itself (T-082b); its codes are read from its own enum (the loaded skills' plus ALWAYS), so the
    text names exactly what the tool accepts. Otherwise: the loaded skills' codes plus the validator's."""
    finish = "report" if kind == "branch" else "submit_answer"
    if folded is not None:
        folded_codes = [c for c in folded.schema()["properties"]["abstain"]["enum"] if c is not None]
        return (
            "Output contract:\n"
            f"- Finish by calling {finish} once with short segments; every number in a segment is a cell handle in braces.\n"
            # A2, measured on Nemotron: typed dates, percentages, "two batches", unit words after a handle, a sum of cells, and a
            # made-up handle for an empty read each sent a first submission back. Fix cycle 1 (review): a claim about an empty
            # read, moved into a segment citing another outlet's cell, stood with no ledger row behind it; and two cells of
            # different channels, read for every outlet, were told as one cause at one named outlet.
            "- Outside the braces a segment has no digit, no percent sign and no number word, not even in a period or a count:\n"
            "  write the coming days or last week, not three days; each batch, not two batches. No typed date, percentage or\n"
            "  outlet handle.\n"
            "- A handle renders with its own unit (money, a quantity or a percentage): never write minor, minor units, milli,\n"
            "  basis points or bp after it. Never add up or subtract cells yourself; cite each one.\n"
            "- A figure belongs to what its row, or the arguments of the read that returned it, tie it to. Name an outlet,\n"
            "  channel, supplier or item with a figure only when that row or those arguments are that one, and never say one\n"
            "  figure explains or caused another unless both are in the same row.\n"
            "- What a read without rows shows is not stated at all: leave it out, and never invent a handle. The answer speaks\n"
            "  only of what its cited cells show.\n"
            f"- To abstain, call {finish} with no segments and abstain set to one reason code: {', '.join(folded_codes)}."
        )
    codes = ["missing_ref"]
    for s in skills:
        codes += [c for c in s.refusal_codes if c not in codes]
    return (
        "Output contract:\n"
        f"- Finish by calling {finish} with short segments; every number in a segment is a cell handle in braces.\n"
        f"- To abstain, call abstain with one reason code: {', '.join(codes)}."
    )


#: Where an owner's common questions are answered (A2): the Manager's routing examples, shown with the read index. Measured on
#: Nemotron: with the index alone it still read per-item rows for a week's net sales (catalogue) or a month (finance) and
#: abstained. Every tool named here is in the index (tests/manager/test_nemotron_ask.py).
ROUTES = """Where common questions are answered (specialist: read):
- a week's sales or net sales, labour cost, labour as a share of sales: people: read_people_labour_pct (a row per ISO week)
- a month's revenue, costs or profit: finance: read_finance_pnl
- a delivery payout that was short or missing: finance: read_finance_settlement_vs_orders, read_finance_missing_payouts
- stock below its reorder level, at risk of expiry, wasted or gone missing: inventory_purchasing: read_inventory_below_reorder,
  read_inventory_expiry_risk, read_inventory_waste_week, read_inventory_shrinkage
- a supplier's price rising: inventory_purchasing: read_purchasing_price_creep
- a dish's sales, cost or margin: catalogue: read_catalogue_dish_margin
- slow or late tickets: kitchen: read_kitchen_ticket_times
- regulars lapsing, reviews: customers: read_customers_churn_segments, read_customers_review_trend
- overtime against the roster: people: read_people_overtime_drift
- licences and food-safety logs: compliance: read_compliance_licence_calendar, read_compliance_log_coverage"""


def skill_block(skills: Sequence[SkillSpec], loadable: bool = False) -> str:
    """Block 3: the loaded skills' instructions, in load order. `loadable` (the context has load_skill): the routing
    examples, and before any skill is loaded every specialist's read tools, so the Manager picks a skill by what it reads
    (generated.read_index, ROUTES; A2). The index (about two and a half thousand tokens) leaves once a skill is loaded: on
    every later call it counted against the run's input-token cap, and a long payout ask reached the cap."""
    loaded = "\n\n".join(f"Skill {s.pack}:\n{s.instructions_md}" for s in skills) if skills else "No skill is loaded yet."
    if not loadable:
        return loaded
    head = (
        "Specialists you can load with load_skill, and the read tools each brings (arguments → columns). Pick the read whose\n"
        "row is what the question asks for (a week by iso_week, a month, an outlet, an item), never rows you would add up:"
    )
    index = "" if skills else f"{head}\n{read_index()}\n\n"
    return f"{index}{ROUTES}\n\n{loaded}"


def date_windows(business_date: str) -> str:
    """The windows a question names, from one business date (core's, already in the outlet's zone): weeks run Monday to
    Sunday, as the templates' `iso_week` and `week_start` do. A2: left to compute these, Nemotron read a payout window of one
    day and a month that started on the business date."""
    d = date.fromisoformat(business_date)
    monday = d - timedelta(days=d.weekday())
    first = d.replace(day=1)
    last_month_end = first - timedelta(days=1)
    month_end = (first + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    return (
        f"Dates for tool arguments, from business date {d} (weeks run Monday to Sunday; a month argument takes the month's "
        f"first day): this week {monday} to {monday + timedelta(days=6)}; last week {monday - timedelta(days=7)} to "
        f"{monday - timedelta(days=1)}; this month {first} to {month_end}; last month {last_month_end.replace(day=1)} to {last_month_end}."
    )


def frame_block(frame: InternalRunFrameResponse, trigger: str, handles: HandleTable, question: str | None = None) -> str:
    """Block 5. Outlet names and kinds are tenant-trusted (§6.4); the AI budget is control data and never shown. Each outlet
    carries its O<n> handle (minted here, the same one on every call: an outlet argument takes it) and each business date
    its date windows. `question` (the Manager's member question): the outlets it names, by handle, worked out in code
    (fix cycle 1: told only in the core rules, Nemotron read a payout for every outlet when the question named one). Only
    handles and frame names enter the block, never the question's text."""
    head = f"Run frame: country pack {frame.pack.code} version {frame.pack.version}; currency {frame.currency}; trigger {trigger}."
    head = "\n".join([head, *(date_windows(d) for d in sorted({o.business_date for o in frame.outlets}))])
    lines = [
        f"- outlet {handles.add_outlet(o.id.root)}: {o.name} ({o.kind}), business date {o.business_date} in {o.tz}" for o in frame.outlets
    ]
    marks = outlet_marks({o.id.root: o.name for o in frame.outlets})
    named = [o for o in frame.outlets if question is not None and o.id.root in marks and marks[o.id.root].search(question)]
    if named:
        which = ", ".join(f"{handles.add_outlet(o.id.root)} ({o.name})" for o in named)
        head += f"\nThe question names outlet {which}: pass that handle as outlet_id to every read that takes one."
    return _fit(head, lines, BLOCK_CAPS["5"], keep="first") or head


def investigation_block(inv: Investigation | None, handles: HandleTable) -> str:
    """Block 6. Tainted step summaries are excluded before the last two are taken (§6.4 rule 4: no laundering)."""
    if inv is None:
        return ""
    steps = [s for s in inv.steps if not s.tainted][-STEP_SUMMARIES:]
    lines = [f"- check {c.label}: {c.status}{' · ' + ' '.join(c.refs) if c.refs else ''}" for c in inv.checklist]
    lines += [f"- step {s.step_no}: {expand(s.text, handles, refs=s.refs)}" for s in steps]
    return _fit(f"Investigation, playbook {inv.playbook}:", lines, BLOCK_CAPS["6"], keep="last")


def thread_block(thread: ThreadsBlock | None) -> str:
    """Block 6b: that this ask follows earlier turns — no turn id and no ref (R-E 3). ADR-014 §5.7: the model never
    types or reads a UUID, and an earlier turn's ref could not be cited in this run anyway (submit_answer takes handles
    minted in the run); no answer is re-read (§6.4 rule 4). The first turn of a thread has no block."""
    if thread is None or not (thread.last_turn_ids or thread.summary_refs):
        return ""
    return (
        "Thread so far: this question follows earlier turns of the conversation. Earlier answers are not shown and their "
        "evidence is not carried over: read it again with your tools to cite it."
    )


def hints_block(hints: Sequence[FindingHint], handles: HandleTable) -> str:
    """Block 7: ≤ 10 open findings, each as its F<n> handle (so a proposal can name it) with labels and an impact ref."""
    lines = []
    for h in hints[:HINTS]:
        impact = f" · impact {h.impact_ref}" if h.impact_ref else ""
        age = f" · open {h.age_days} days" if h.age_days is not None else ""
        lines.append(f"- {handles.add_finding(h.finding_id)}: {h.type} · {h.severity}{impact}{age}")
    return _fit("Open findings in scope:", lines, BLOCK_CAPS["7"], keep="first")


# -- measuring and compacting a request ----------------------------------------------------------------------------


def _part(p: types.Part) -> dict[str, Any]:
    if p.function_call is not None:
        return {"call": p.function_call.name, "args": p.function_call.args or {}}
    if p.function_response is not None:
        return {"response": p.function_response.name, "data": p.function_response.response or {}}
    return {"text": p.text or ""}


def _part_text(p: types.Part) -> str:
    return json.dumps(_part(p), ensure_ascii=False)


def request_tokens(req: LlmRequest) -> int:
    """The request as JSON (system, declarations, contents with their roles), so escaping and structure count too:
    never smaller than the text a provider is sent."""
    fds = [
        fd.model_dump(mode="json", exclude_none=True)
        for t in req.config.tools or []
        for fd in getattr(t, "function_declarations", None) or []
    ]
    contents = [{"role": c.role, "parts": [_part(p) for p in c.parts or []]} for c in req.contents]
    return tokens(
        json.dumps({"system": req.config.system_instruction, "tools": fds, "contents": contents}, ensure_ascii=False, default=str)
    )


def _digest_line(data: dict[str, Any]) -> str:
    """§6.2: `S3 = finance.settlement_vs_orders · 212 rows · cols …`. Handles stay resolvable in the run table."""
    if {"handle", "template_id", "row_count", "columns"} <= data.keys():
        cols = ", ".join(str(c) for c in data["columns"])
        return f"{data['handle']} = {data['template_id']} · {data['row_count']} rows · cols {cols} · compacted; read it again to see rows"
    return "result compacted; call the tool again to see it"


def _compacted(content: types.Content) -> types.Content:
    parts = []
    for p in content.parts or []:
        fr = p.function_response
        if fr is not None and len(_part_text(p)) > SMALL_RESULT_CHARS:
            line = _digest_line(fr.response or {})
            p = types.Part(function_response=types.FunctionResponse(id=fr.id, name=fr.name, response={"digest": line}))
        parts.append(p)
    return types.Content(role=content.role, parts=parts)


def compact(req: LlmRequest, keep_model_turns: int) -> None:
    """Replace tool results older than the last `keep_model_turns` model turns by digest lines (new objects: the
    session's events are never touched)."""
    model_at = [i for i, c in enumerate(req.contents) if c.role == "model"]
    cutoff = len(req.contents) if keep_model_turns == 0 else (model_at[-keep_model_turns] if len(model_at) >= keep_model_turns else 0)
    req.contents = [_compacted(c) if i < cutoff else c for i, c in enumerate(req.contents)]


# -- the assembler -------------------------------------------------------------------------------------------------


@dataclass
class Assembler:
    """One per context (the Manager's, or one branch's), over that context's RunState and the run's shared HandleTable."""

    kind: RunKind
    state: RunState
    handles: HandleTable
    toolset: PackToolset
    frame: InternalRunFrameResponse
    trigger: str
    investigation: Investigation | None = None
    hints: Sequence[FindingHint] = ()
    thread: ThreadsBlock | None = None
    #: The member's question (the Manager's context only): the outlets it names reach block 5 as handles (frame_block).
    question: str | None = None
    #: Calls answered "cannot verify" at the cap, for the builder's trace.
    capped: int = field(default=0)

    def __post_init__(self) -> None:
        # A thread whose recent turns read untrusted text starts the run tainted (§6.4 rule 3, B1).
        if self.thread is not None and self.thread.tainted:
            self.state.tainted = True

    @property
    def cap(self) -> int:
        return CALL_CAPS[self.kind]

    def system(self) -> str:
        """Blocks 1–3: the run kind, the loaded skills and the bound finish tool, nothing of the tenant."""
        folded = next((t for t in self.toolset.tools if isinstance(t, SubmitAnswerTool)), None)
        loadable = any(isinstance(t, LoadSkillTool) for t in self.toolset.tools)
        blocks = [CORE_RULES, output_contract(self.kind, self.toolset.skills, folded), skill_block(self.toolset.skills, loadable)]
        return "\n\n".join(blocks)

    def instruction(self, _: ReadonlyContext) -> str:
        return self.system()

    def run_blocks(self) -> str:
        """Blocks 5, 6, 6b, 7 (empty blocks are left out). A branch gets block 5 only: its brief is the question, and
        no orchestrator material — investigation, thread, findings — enters a branch (§6.3)."""
        if self.kind == "branch":
            return frame_block(self.frame, self.trigger, self.handles)
        blocks = [
            frame_block(self.frame, self.trigger, self.handles, self.question),
            investigation_block(self.investigation, self.handles),
            thread_block(self.thread),
            hints_block(self.hints, self.handles),
        ]
        return "\n\n".join(b for b in blocks if b)

    def assemble(self, req: LlmRequest) -> bool:
        """Put the run blocks before the question and fit the request into the cap. False: it cannot fit."""
        lead = types.Part(text=self.run_blocks())
        first = req.contents[0] if req.contents else None
        if first is not None and first.role == "user" and not any(p.function_response for p in first.parts or []):
            req.contents = [types.Content(role="user", parts=[lead, *(first.parts or [])]), *req.contents[1:]]
        else:
            req.contents = [types.Content(role="user", parts=[lead]), *req.contents]
        if request_tokens(req) > COMPACT_AT * self.cap:
            compact(req, keep_model_turns=2)
        if request_tokens(req) > self.cap:
            compact(req, keep_model_turns=0)
        return request_tokens(req) <= self.cap

    async def before_model(self, callback_context: CallbackContext, llm_request: LlmRequest) -> LlmResponse | None:
        if self.assemble(llm_request):
            return None
        self.capped += 1
        return LlmResponse(content=types.Content(role="model", parts=[types.Part(text=CANNOT_VERIFY)]))
