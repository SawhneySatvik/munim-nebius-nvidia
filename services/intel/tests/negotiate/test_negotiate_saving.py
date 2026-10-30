"""NB-6: the PO draft cites `purchasing.quote_compare` v2's saving and the last price paid it was taken from (migration 0037), so
the approver sees the saving as a cell with its source — never a figure intel, a model or the browser computed (rule 3).

Hand values (Cobnut's hazelnuts, lanes/A.report.md P2): the last receipt cost 148,000 paise per kg; Steady Wholesale (simulated)
agreed 146,520 for 1.324 kg → saving = (148,000 − 146,520) × 1,324 ÷ 1,000 = 1,959.52 → 1,960 (0037 rounds once). Those numbers
are the snapshot's cells: the draft cites them by ref and types neither. A quote with no price paid in the books (NULL cells)
cites nothing more, and the draft is the five-cell draft it was before.
"""

from __future__ import annotations

from typing import Any

from munim_intel.contracts_gen.models import InternalDraftsRequest
from munim_intel.negotiate.review import PoRequest, po_draft, review_quote

COMPARE, INPUTS, SHORT, PRICE = (f"0199a000-0000-7000-8000-00000000f02{n}" for n in range(4))
RUN, INGREDIENT, OUTLET = (
    "0199a000-0000-7000-8000-00000000f031",
    "0199a000-0000-7000-8000-00000000f032",
    "0199a000-0000-7000-8000-00000000f033",
)
STEADY = "0199a000-0000-7000-8000-00000000f034"


def draft(reference: int | None, saving: int | None) -> dict[str, Any]:
    row = {"quote_id": "0199a000-0000-7000-8000-00000000f035", "supplier_id": STEADY, "unit_price_minor": 146_520, "qty_milli": 1_324,
           "min_order_qty_milli": 0, "reference_unit_price_minor": reference, "saving_minor": saving}  # fmt: skip
    compare = {"snapshot_id": COMPARE, "rows": [row]}
    inputs = {"snapshot_id": INPUTS, "rows": [{"quote_total_minor": 193_993, "quote_payment_days": 15, "budget_left_minor": 500_000,
              "open_commit_qty_milli": 0, "need_qty_milli": 1_324, "use_in_shelf_life_qty_milli": 5_000, "margin_at_quote_bp": None,
              "margin_rule_applies": False, "margin_floor_bp": None, "min_payment_days": 7}]}  # fmt: skip
    win = review_quote(compare, 0, inputs)
    assert win.passed
    req = PoRequest(RUN, INGREDIENT, "kg", "INR", (OUTLET,), "2026-10-29", f"⟨snap:{SHORT}·0·shortfall_qty_milli⟩", SHORT,
                    f"⟨snap:{PRICE}·0·latest_minor⟩", PRICE, None)  # fmt: skip
    body = po_draft(win, compare, req)
    InternalDraftsRequest.model_validate(body)
    return body


def test_the_po_cites_the_saving_and_the_reference_it_was_taken_from() -> None:
    body = draft(148_000, 1_960)
    assert body["based_on"][-2:] == [f"⟨snap:{COMPARE}·0·reference_unit_price_minor⟩", f"⟨snap:{COMPARE}·0·saving_minor⟩"]
    # quote_compare's own reference, beside the anchor the negotiation's bounds came from (price_creep), never instead of it.
    assert f"⟨snap:{PRICE}·0·latest_minor⟩" in body["based_on"] and len(body["based_on"]) == 7
    text = str(body)
    assert "1960" not in text and "148000" not in text, "the draft types neither figure"


def test_a_quote_with_no_price_paid_in_the_books_cites_no_saving() -> None:
    body = draft(None, None)
    assert len(body["based_on"]) == 5 and not any("saving_minor" in r or "reference_unit_price_minor" in r for r in body["based_on"])
