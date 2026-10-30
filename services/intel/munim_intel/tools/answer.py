"""`submit_answer` (ADR-014 §5.1, §5.3, §5.7; R25): the one way a Manager ask ends. It folds `abstain` in (T-082a found
the F3 cap tight: inventory_purchasing with its propose tools is 19, so a draft run has room for one base tool).

  segments   short prose; every number is a cell handle in braces ({S1.r0.net_minor}). Each segment is rendered
             through the run's HandleTable, fail closed (context/expand.py): a ref delimiter the model typed itself, an
             unresolved handle, a segment citing nothing, or anything core's number grammar refuses (tools/grammar.py:
             digits, number words, a magnitude suffix after a ref, a quotation) is refused with the segment index and the
             rule (every refused segment at once) — one retry, then the answer is an abstention with the first
             refused segment's code (§5.3).
  abstain    one reason code instead: the loaded skills' refusal codes plus missing_ref and insufficient_history; the
             word "none" or "null" is read as JSON null (answering), never as a code (args.nulled).

`refs` are built here from the expanded canonical refs, never from the model's input. The first submission wins and
ends the run (ADK `skip_summarization`: no extra model step to restate it). Nothing is posted here: the ask posts the
envelope once, after the run, under core's answer id (manager/ask.py), and core's validator decides again.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Callable, Mapping, Sequence
from typing import Any

from google.adk.tools.base_tool import BaseTool
from google.adk.tools.tool_context import ToolContext
from google.genai import types

from munim_intel.context.expand import CANNOT_VERIFY, expand
from munim_intel.contracts_gen.models import AnswerEnvelope
from munim_intel.tools.args import nulled, problems
from munim_intel.tools.grammar import ANY_REF, Violation, check_grammar, reason_code, typed_bracket
from munim_intel.tools.handles import DOT, SNAP_CLOSE, SNAP_OPEN, HandleTable

#: ADR-014 §5.1: every skill may abstain with these, beside its own refusal codes.
ALWAYS = ("missing_ref", "insufficient_history")
#: ADR-014 §6.3's report bound, used for the answer too: ≤ 6 segments.
MAX_SEGMENTS = 6
#: contracts `Segment.text` max.
TEXT_CHARS = 2000
_CANONICAL = re.compile(rf"{SNAP_OPEN}[^{SNAP_CLOSE}]*{SNAP_CLOSE}")
#: What a grammar rule refused, in the model's terms: the kind, never the text (A2: told only `numeric_char`, Nemotron
#: retried with the same typed dates and percentages and the answer abstained).
TYPED = {
    "numeric_char": "a digit outside the braces (a typed date, percentage, count or outlet handle is one)",
    "number_symbol": "a percent sign",
    "number_word": "a number word",
    "magnitude_suffix": "a magnitude suffix after a handle",
    "typed_quotation": "a quotation mark",
}
#: What a read without rows shows is not stated at all (fix cycle 1: told to say it "inside a segment that cites a cell",
#: Nemotron put another outlet's empty read into a segment citing only the first outlet's cells: a claim with no ledger row).
EMPTY_READ = "Leave out what a read without rows shows; say only what cited cells show."
#: The rest of a grammar refusal: core's checks stop at the first rule a segment breaks, so the model is told them all at once
#: (A2: with the date fixed, the retry still said "two batches" and the answer abstained on the second refusal).
OUTSIDE_BRACES = (
    "outside the braces write no digit, no number word such as one or two, no percent sign and no quotation mark; "
    "every number is a cell handle in braces, never typed."
)


def _every(text: str, first: Violation) -> list[Violation]:
    """`first` and the other rules the segment breaks. Core's check stops at the first rule, so it is run again with each
    matched token blanked: discovery for the message only, the verdict stays `first`'s (A2: told of a typed date alone,
    Nemotron's retry kept "two batches" and the answer abstained on the second refusal)."""
    found: dict[tuple[str, str], Violation] = {}
    text = unicodedata.normalize("NFC", text)
    v: Violation | None = first
    while v is not None and len(found) < 6 and (v.rule, v.match) not in found:
        found[(v.rule, v.match)] = v
        text = _blank(text, v)
        v = check_grammar(text)
    return list(found.values())


def _blank(text: str, v: Violation) -> str:
    """`text` with what `v` matched blanked in its prose; the refs between are kept whole."""
    refs = ANY_REF.findall(text)
    prose = ANY_REF.split(text)
    if v.rule == "numeric_char":
        prose = ["".join(" " if unicodedata.category(c)[0] == "N" else c for c in p) for p in prose]
    else:
        prose = [p.replace(v.match, " ") for p in prose]
    return "".join(p + (refs[i] if i < len(refs) else "") for i, p in enumerate(prose))


def _typed(v: Violation) -> str:
    """A rule in the model's terms. A number word or sign is named, and only as far as it is one of the grammar's own list
    (a compound such as three-day names its number part), so naming it carries no cell value and no free text (told only
    "a number word", the retry still echoed the question's "three days")."""
    what = TYPED.get(v.rule, "a typed number")
    if v.rule == "number_symbol":
        return f"{v.rule}, {what}, {v.match!r}"
    if v.rule == "number_word":
        listed = [p for p in v.match.lower().split("-") if (w := check_grammar(p)) is not None and w.rule == "number_word"]
        return f"{v.rule}, {what}, {'-'.join(listed)!r}" if listed else f"{v.rule}, {what}"
    return f"{v.rule}, {what}"


def ref_id(token: str) -> str:
    """The bare RefId core expects in `refs[]`: ⟨snap:<id>·r·c⟩ → snap:<id>; ⟨cite:<kind>:<id>[·span]⟩ → <kind>:<id>."""
    inner = token[1:-1]
    return inner.split(DOT)[0] if inner.startswith("snap:") else inner.removeprefix("cite:").split(DOT)[0]


def outlet_marks(outlets: Mapping[str, str]) -> dict[str, re.Pattern[str]]:
    """outlet id -> a word-bounded, case-blind pattern for how prose names it: the part of its name that tells it from the
    tenant's other outlets, or that part's first word ("Cobnut Gomti Nagar" -> "gomti nagar" or "gomti"; "Koramangala
    Cloud" -> "koramangala cloud" or "koramangala"). Empty for a single-outlet scope: there every read is that outlet's."""
    words = {oid: name.lower().split() for oid, name in outlets.items()}
    if len(words) < 2:
        return {}
    shared = set.intersection(*(set(w) for w in words.values()))
    marks = {oid: [w for w in ws if w not in shared] for oid, ws in words.items()}
    return {
        oid: re.compile(rf"(?<!\w)(?:{re.escape(' '.join(m))}|{re.escape(m[0])})(?!\w)", re.IGNORECASE) for oid, m in marks.items() if m
    }


class SubmitAnswerTool(BaseTool):
    def __init__(
        self, answer_id: str, handles: HandleTable, codes: Callable[[], Sequence[str]], outlets: Mapping[str, str] | None = None
    ) -> None:
        """`outlets`: the run frame's outlets (id -> name, tenant-trusted). A segment that names one must cite a cell tied to
        it: its row's `outlet_id`, or the `outlet_id` its snapshot was read for (fix cycle 1: "no stock is at risk at Gomti
        Nagar" stood in a segment citing only Hazratganj's cells)."""
        super().__init__(
            name="submit_answer",
            description=(
                "Finish the answer: short segments, each citing at least one cell handle in braces, or abstain with one "
                "reason code and no segments. Call it once."
            ),
        )
        self._answer_id = answer_id
        self._handles = handles
        self._codes = codes
        self._outlets = dict(outlets or {})
        self._marks = outlet_marks(self._outlets)
        self._refused = 0
        #: The answer, once submitted (first call wins).
        self.envelope: AnswerEnvelope | None = None

    def schema(self) -> dict[str, Any]:
        codes = list(dict.fromkeys([*self._codes(), *ALWAYS]))
        return {
            "type": "object",
            "properties": {
                "segments": {
                    "type": "array",
                    "description": "Short sentences; each number is a cell handle in braces, e.g. {S1.r0.<column>}. Empty to abstain.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "text": {
                                "type": "string",
                                "description": (
                                    "One sentence citing cell handles in braces. Outside the braces: no digit, no number word "
                                    "such as one or two, no percent sign, no date, no handle without braces and no unit after a handle."
                                ),
                            }
                        },
                        "required": ["text"],
                        "additionalProperties": False,
                    },
                    "maxItems": MAX_SEGMENTS,
                },
                "abstain": {
                    "type": ["string", "null"],
                    "enum": [*codes, None],
                    "description": "A reason code when the evidence cannot answer the question; JSON null, not a word, when answering.",
                },
            },
            "required": ["segments", "abstain"],
            "additionalProperties": False,
        }

    def _get_declaration(self) -> types.FunctionDeclaration:
        return types.FunctionDeclaration(name=self.name, description=self.description, parameters_json_schema=self.schema())

    def validate_args(self, args: dict[str, Any]) -> str | None:
        """The plugin's §5.3 argument check (it calls this before the tool runs)."""
        found = problems(self.schema(), nulled(self.schema(), args))
        return f"invalid arguments for submit_answer: {'; '.join(found)}."[:300] if found else None

    def _segment(self, i: int, text: str) -> tuple[dict[str, Any] | None, str | None, str | None]:
        """(segment, problem for the model, reason code if it stands). Problems name the rule, never the text — except the
        number word or sign the grammar matched, one of its own list (`_typed`)."""
        if typed_bracket(text):
            return None, f"segment {i}: never type a ref; cite only handles in braces, e.g. {{S1.r0.<column>}}.", "unresolved_ref"
        out = expand(text, self._handles)
        if out == CANNOT_VERIFY:
            return None, f"segment {i}: a handle did not resolve; cite only handles returned in this run.", "unresolved_ref"
        refs = list(dict.fromkeys(ref_id(t) for t in _CANONICAL.findall(out)))
        if not refs:
            # A2: the live miss left after the fixes was a segment saying a read had no rows; core refuses it too, and the claim
            # has no cell anywhere, so it is dropped, never moved.
            return None, f"segment {i}: it cites no cell; every segment cites a handle in braces. {EMPTY_READ}", "missing_ref"
        v = check_grammar(out)
        if v is not None:
            return None, f"segment {i}: {'; '.join(_typed(w) for w in _every(out, v))}; {OUTSIDE_BRACES}", reason_code(v)
        untied = self._untied_outlet(out)
        if untied is not None:
            # The outlet's name is the run frame's (tenant-trusted), never model text. The claim is dropped or cited, never moved.
            what = f"segment {i}: it names {untied}, but no cell it cites is that outlet's; cite that outlet's own cell or leave it out."
            return None, what, "missing_ref"
        if len(out) > TEXT_CHARS:
            return None, f"segment {i}: too long; split it.", "missing_ref"
        return {"text": out, "refs": refs}, None, None

    def _untied_outlet(self, out: str) -> str | None:
        """The name of the first outlet the segment names with no cited cell tied to it, or None. Only figures that have an
        outlet (their template reads by `outlet_id` or returns it) need the tie: a supplier's price is no outlet's, so a
        sentence naming where a dish is sold beside it claims no outlet's figure (the graph's butter answer, R68)."""
        named = [oid for oid, mark in self._marks.items() if mark.search(out)]
        if not named:
            return None
        tied: set[object] = set()
        per_outlet = False
        for token in _CANONICAL.findall(out):
            inner = token[1:-1]
            if not inner.startswith("snap:"):
                continue
            sid, row, _col = inner.removeprefix("snap:").split(DOT)
            snap = self._handles.minted(sid)
            if snap is None or int(row) >= len(snap["rows"]):
                continue
            params = snap.get("params") or {}
            per_outlet = per_outlet or "outlet_id" in params or any(c["name"] == "outlet_id" for c in snap["columns"])
            tied |= {snap["rows"][int(row)].get("outlet_id"), params.get("outlet_id")}
        if not per_outlet:
            return None
        return next((self._outlets[oid] for oid in named if oid not in tied), None)

    def _done(self, tool_context: ToolContext, envelope: dict[str, Any]) -> None:
        self.envelope = AnswerEnvelope.model_validate({"answer_id": self._answer_id, **envelope})
        tool_context.actions.skip_summarization = True

    async def run_async(self, *, args: dict[str, Any], tool_context: ToolContext) -> Any:
        if self.envelope is not None:
            return {"error": "An answer was already submitted."}
        code = nulled(self.schema(), args)["abstain"]
        if code is not None:
            self._done(tool_context, {"segments": [], "abstained": True, "reason_code": code})
            return {"status": "abstained", "reason_code": code}
        texts = [s["text"] for s in args["segments"]]
        segments: list[dict[str, Any]] = []
        found, reason = ([], None) if texts else (["Give at least one segment, or abstain with a reason code."], "missing_ref")
        # Every segment is checked, so the one retry can fix them all (A2: told of the first bad segment only, Nemotron fixed
        # it, and the second refusal, for the next segment, ended the answer). The code that stands is the first problem's.
        for i, text in enumerate(texts):
            seg, problem, code = self._segment(i, text)
            if seg is not None:
                segments.append(seg)
            else:
                found.append(str(problem))
                reason = reason or code
        if not found:
            self._done(tool_context, {"segments": segments, "abstained": False, "reason_code": None})
            return {"status": "submitted"}
        self._refused += 1
        if self._refused > 1:
            self._done(tool_context, {"segments": [], "abstained": True, "reason_code": reason})
            return {"status": "abstained", "reason_code": reason}
        return {"error": " ".join(found)}
