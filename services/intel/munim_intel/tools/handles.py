"""The run's handle table (ADR-014 §5.7, review minor 6): one table per run, shared by the Manager and every branch
through the tool factories' closures, so handles never need re-basing.

    S<n>            a snapshot minted in this run        S<n>.r<i>.<column>   one of its cells
    D<n>            a document / chunk / claim cite       F<n>                 a finding          P<n>   a draft
    G<n>            a graph node a graph tool returned (an intel.entity id)
    O<n>            an outlet of core's run frame (the run's outlet scope), named in the frame block

The model writes handles; the tool layer expands them before anything reaches core-api:
  • a payload leaf or `{S2.r3.unit_price_minor}` in prose → the canonical ref ⟨snap:<uuid>·3·unit_price_minor⟩;
  • a cell of type uuid used as an id → that cell's literal value, so the model never types a UUID;
  • O<n> as an outlet argument → that outlet's id (A2: with only outlet names in its context, the model typed a name or
    "None" as `outlet_id`, or read unrelated templates to borrow an outlet_id cell); in any other id slot it is refused.
    An outlet cites nothing: O<n> in prose is no ref, and its digit makes the number grammar refuse it.
An unresolved handle in prose is left in place: it contains digits, so the number grammar refuses it ("cannot verify").
Error texts name handles, row ranges and column names only — never a cell value (§5.3).
"""

from __future__ import annotations

import re
from typing import Any

SNAP_OPEN, SNAP_CLOSE, DOT = "⟨", "⟩", "·"

_INDEX = r"(?:0|[1-9][0-9]*)"
_N = r"[1-9][0-9]*"
CELL = re.compile(rf"^S({_N})\.r({_INDEX})\.([a-z_][a-z0-9_]*)$")
SNAPSHOT = re.compile(rf"^S({_N})$")
DOC = re.compile(rf"^D({_N})$")
FINDING = re.compile(rf"^F({_N})$")
DRAFT = re.compile(rf"^P({_N})$")
NODE = re.compile(rf"^G({_N})$")
OUTLET = re.compile(rf"^O({_N})$")
#: A handle written in prose: {S2.r3.col} or {D1}.
PROSE_HANDLE = re.compile(rf"\{{(S{_N}\.r{_INDEX}\.[a-z_][a-z0-9_]*|D{_N})\}}")


class HandleError(Exception):
    """An actionable, value-free message for the model (§5.3)."""


def _range(kind: str, n: int) -> str:
    return "none yet" if n == 0 else (f"{kind}1" if n == 1 else f"{kind}1–{kind}{n}")


class HandleTable:
    def __init__(self, index: dict[str, str] | None = None) -> None:
        #: handle -> canonical form; pass RunState.handles so the run's other code (context, plugin) sees the same table.
        self.index: dict[str, str] = index if index is not None else {}
        self._snapshots: list[dict[str, Any]] = []
        self._snapshot_handle: dict[str, str] = {}
        self._by_key: dict[str, str] = {}
        self._docs: list[str] = []
        self._findings: list[str] = []
        self._drafts: list[str] = []
        self._nodes: list[str] = []
        self._outlets: list[str] = []

    # -- minting --------------------------------------------------------------------------------------------

    def add_snapshot(self, snapshot: dict[str, Any], key: str | None = None) -> str:
        """`snapshot` is the core-api Snapshot body. The same snapshot id always gets the same handle."""
        sid = snapshot["snapshot_id"]
        if sid in self._snapshot_handle:
            return self._snapshot_handle[sid]
        self._snapshots.append(snapshot)
        h = f"S{len(self._snapshots)}"
        self._snapshot_handle[sid] = h
        self.index[h] = f"snap:{sid}"
        if key is not None:
            self._by_key[key] = h
        return h

    def cached(self, key: str) -> str | None:
        """The handle of a snapshot this run already minted with the same template and params (page re-reads)."""
        return self._by_key.get(key)

    def _add(self, kind: str, store: list[str], value: str) -> str:
        if value in store:
            return f"{kind}{store.index(value) + 1}"
        store.append(value)
        h = f"{kind}{len(store)}"
        self.index[h] = value
        return h

    def add_cite(self, cite_ref: str) -> str:
        """A well-formed ⟨cite:…⟩ ref (rendered from a source span, never model-typed)."""
        return self._add("D", self._docs, cite_ref)

    def add_finding(self, finding_id: str) -> str:
        return self._add("F", self._findings, finding_id)

    def add_draft(self, draft_id: str) -> str:
        return self._add("P", self._drafts, draft_id)

    def add_node(self, entity_id: str) -> str:
        return self._add("G", self._nodes, entity_id)

    def add_outlet(self, outlet_id: str) -> str:
        """An outlet of core's run frame, so one named in the question can be passed as an argument."""
        return self._add("O", self._outlets, outlet_id)

    # -- reading --------------------------------------------------------------------------------------------

    def snapshot(self, handle: str) -> dict[str, Any]:
        m = SNAPSHOT.match(handle)
        if not m:
            raise HandleError(f"{handle!r} is not a snapshot handle; use S<n>, e.g. S1.")
        n = int(m.group(1))
        if n > len(self._snapshots):
            raise HandleError(f"{handle} does not exist in this run. Minted: {_range('S', len(self._snapshots))}.")
        return self._snapshots[n - 1]

    def _cell(self, handle: str) -> tuple[dict[str, Any], int, str, str]:
        m = CELL.match(handle)
        if not m:
            raise HandleError(f"{handle!r} is not a cell handle; use S<n>.r<i>.<column>, e.g. S1.r0.<column>.")
        snap = self.snapshot(f"S{m.group(1)}")
        row, col = int(m.group(2)), m.group(3)
        columns = {c["name"]: c["type"] for c in snap["columns"]}
        rows = len(snap["rows"])
        if row >= rows or col not in columns:
            span = "no rows" if rows == 0 else f"rows r0–r{rows - 1}"
            raise HandleError(f"S{m.group(1)} has {span}, columns {{{', '.join(columns)}}}."[:300])
        return snap, row, col, columns[col]

    def ref(self, handle: str) -> str:
        """Canonical ref for a payload leaf: a cell → ⟨snap:…⟩, D<n> → its ⟨cite:…⟩."""
        d = DOC.match(handle)
        if d:
            n = int(d.group(1))
            if n > len(self._docs):
                raise HandleError(f"{handle} does not exist in this run. Minted: {_range('D', len(self._docs))}.")
            return self._docs[n - 1]
        snap, row, col, _ = self._cell(handle)
        return f"{SNAP_OPEN}snap:{snap['snapshot_id']}{DOT}{row}{DOT}{col}{SNAP_CLOSE}"

    def ref_id(self, handle: str) -> str:
        """The bare RefId a payload leaf like `evidence_ref` holds: S<n> → snap:<uuid>, D<n> → its cite id."""
        if DOC.match(handle):
            return self.ref(handle)[len(SNAP_OPEN) : -len(SNAP_CLOSE)].removeprefix("cite:").split(DOT)[0]
        return f"snap:{self.snapshot_id(handle)}"

    def minted(self, snapshot_id: str) -> dict[str, Any] | None:
        """The snapshot body core returned for an id this run minted (its rows and the params it was read with), else None."""
        h = self._snapshot_handle.get(snapshot_id)
        return None if h is None else self.snapshot(h)

    def has_cell(self, snapshot_id: str, row: int, column: str) -> bool | None:
        """Whether a snapshot minted in this run has that row and column; None when this run did not mint it."""
        h = self._snapshot_handle.get(snapshot_id)
        if h is None:
            return None
        snap = self.snapshot(h)
        return 0 <= row < len(snap["rows"]) and column in {c["name"] for c in snap["columns"]}

    def cell_holding(self, value: str) -> str | None:
        """The first uuid cell minted in this run that holds `value` (earliest snapshot, lowest row, column order) as its path
        S<n>.r<i>.<column>; None when no snapshot of this run holds it. A graph tool names a node the run already holds by
        that path, so the model can join a graph row to the snapshot row behind it (R68: a dish the graph reached is then
        a row of the margin snapshot, and its margin a cell the model can cite)."""
        for n, snap in enumerate(self._snapshots, start=1):
            ids = [c["name"] for c in snap["columns"] if c["type"] == "uuid"]
            for i, row in enumerate(snap["rows"]):
                for col in ids:
                    if row.get(col) == value:
                        return f"S{n}.r{i}.{col}"
        return None

    def literal_id(self, handle: str, *, outlet: bool = False) -> str:
        """The uuid a cell handle holds, or, for an `outlet` argument only, a run-frame outlet's id (the model never types an
        id). Elsewhere O<n> is refused like any wrong handle: an outlet's id in an item or supplier slot reads nothing true."""
        o = OUTLET.match(handle)
        if o and not outlet:
            raise HandleError(f"{handle} is an outlet; pass O<n> only as an outlet argument, and a cell handle here.")
        if o:
            n = int(o.group(1))
            if n > len(self._outlets):
                raise HandleError(f"{handle} is not an outlet of this run. Outlets: {_range('O', len(self._outlets))}.")
            return self._outlets[n - 1]
        snap, row, col, typ = self._cell(handle)
        value = snap["rows"][row].get(col)
        if typ != "uuid" or not isinstance(value, str):
            raise HandleError(f"{handle} does not hold an id; use a cell of an id column.")
        return value

    def snapshot_id(self, handle: str) -> str:
        return str(self.snapshot(handle)["snapshot_id"])

    def finding_id(self, handle: str) -> str:
        m = FINDING.match(handle)
        if not m:
            raise HandleError(f"{handle!r} is not a finding handle; use F<n>, e.g. F1.")
        n = int(m.group(1))
        if n > len(self._findings):
            raise HandleError(f"{handle} does not exist in this run. Known: {_range('F', len(self._findings))}.")
        return self._findings[n - 1]

    def entity_id(self, handle: str) -> str:
        """A graph start: a node (G<n>), a finding (F<n> — a finding node reuses the finding's id) or an id cell."""
        m = NODE.match(handle)
        if m:
            n = int(m.group(1))
            if n > len(self._nodes):
                raise HandleError(f"{handle} does not exist in this run. Known: {_range('G', len(self._nodes))}.")
            return self._nodes[n - 1]
        if FINDING.match(handle):
            return self.finding_id(handle)
        return self.literal_id(handle)

    def expand_text(self, text: str) -> str:
        """Replace every resolvable {S<n>.r<i>.<col>} / {D<n>} with its canonical ref; leave the rest untouched."""

        def one(m: re.Match[str]) -> str:
            try:
                return self.ref(m.group(1))
            except HandleError:
                return m.group(0)

        return PROSE_HANDLE.sub(one, text)
