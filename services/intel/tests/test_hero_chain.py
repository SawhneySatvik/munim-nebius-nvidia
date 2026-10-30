"""The hero chain's model links (events build, P2), on what Nemotron really answered: the committed sample invoice (SYNTHETIC,
tests/fixtures/invoice/riverbank-sample.png) as Nemotron VL read it live, and a simulated supplier's reply as the extractor read
it (tests/fixtures/nemotron, recorded on 24 Oct). Offline, recorded.

Every number a draft carries is a ref: an invoice line's quantity, price and tax are spans of the page the model transcribed
(`⟨cite:doc:<id>·<start>-<end>⟩`), checked here against the transcript; a quote's fields are tokens of the reply. Red-proof
on the same live reads: a number the model "read" that is not on the page abstains the whole draft (`value_not_on_page`), and a
price that is not in the reply drops the quote (`not_in_reply:unit_price_minor`) — a forged figure never reaches a draft. Core's
own side (a forged or unresolved ref in a stored answer or draft → "cannot verify") is its validator's gate, unchanged here.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from munim_intel.contracts_gen.models import InternalDraftsRequest
from munim_intel.ingest.invoice import InvoiceRead, invoice_draft
from munim_intel.ingest.link import Alias, AliasTable
from munim_intel.negotiate.extract import QuoteFields, Rfq, ground
from munim_intel.tools.grammar import ANY_REF

NEMOTRON = Path(__file__).resolve().parent / "fixtures" / "nemotron"
#: The reply the recorded quote read was given (tests/fixtures/record_nemotron.py sent exactly this; checked below).
QUOTE_REPLY = "Hello from Riverbank Dairy (simulated). Butter (synthetic): INR 575.00 per kg for 10 kg, minimum order 5 kg, net 15 days."
DOCUMENT = "01a16a00-0000-7000-8000-00000000d0c1"
SUPPLIER = "01a16a00-0000-7000-8000-0000000005a1"
BUTTER = "01a16a00-0000-7000-8000-00000000b077"
CREAM = "01a16a00-0000-7000-8000-00000000c4ea"
#: Cobnut's names (tools/worldgen/src/worlds/cobnut.ts), linked by exact alias as core stores them.
ALIASES = AliasTable(
    [
        Alias("01a16a00-0000-7000-8000-0000000e0001", "supplier", f"core.supplier:{SUPPLIER}", "Riverbank Dairy (simulated)"),
        Alias("01a16a00-0000-7000-8000-0000000e0002", "ingredient", f"core.ingredient:{BUTTER}", "Butter (synthetic)"),
        Alias("01a16a00-0000-7000-8000-0000000e0003", "ingredient", f"core.ingredient:{CREAM}", "Fresh cream (synthetic)"),
    ]
)


def nemotron_read() -> InvoiceRead:
    body = json.loads((NEMOTRON / "invoice.json").read_text("utf8"))
    return InvoiceRead.model_validate_json(body["response"]["choices"][0]["message"]["content"])


def numbers(v: Any, path: str = "") -> list[str]:
    """Every typed number in a payload, by JSON pointer (a ref is a string)."""
    if isinstance(v, bool):
        return []
    if isinstance(v, int | float):
        return [path]
    if isinstance(v, list):
        return [p for i, x in enumerate(v) for p in numbers(x, f"{path}/{i}")]
    if isinstance(v, dict):
        return [p for k, x in v.items() for p in numbers(x, f"{path}/{k}")]
    return []


def test_the_live_invoice_read_becomes_a_draft_whose_every_number_is_a_span_of_the_page() -> None:
    read = nemotron_read()
    draft = invoice_draft(DOCUMENT, read, ALIASES, "INR")
    assert draft.reason_code is None and draft.body is not None
    InternalDraftsRequest.model_validate(draft.body)
    payload = draft.body["payload"]
    assert payload["supplier_id"] == SUPPLIER and [line["ingredient_id"] for line in payload["lines"]] == [BUTTER, CREAM]
    assert numbers(payload) == [], "a draft carries no typed number"
    # Hand values: the six figures printed on the sample's two lines, each found as a span of the transcript.
    page = read.transcript
    cited = [page[s:e] for s, e in draft.spans]
    assert cited == ["10", "610.00", "732.00", "6", "180.00", "54.00"]
    refs = [line[k] for line in payload["lines"] for k in ("qty_milli", "unit_price_minor", "tax_minor")]
    assert all(ANY_REF.fullmatch(r) and r.startswith(f"⟨cite:doc:{DOCUMENT}·") for r in refs)


def test_a_forged_figure_in_the_read_abstains_the_whole_draft() -> None:
    """Red-proof on the live read: one price the page does not show (598.00), and the draft is withheld, never sent with it."""
    read = nemotron_read()
    forged = read.model_copy(update={"lines": [read.lines[0].model_copy(update={"unit_price": "598.00"}), *read.lines[1:]]})
    assert invoice_draft(DOCUMENT, forged, ALIASES, "INR").reason_code == "value_not_on_page"
    unknown = read.model_copy(update={"supplier_name": "Riverbank Dairy"})
    assert invoice_draft(DOCUMENT, unknown, ALIASES, "INR").reason_code == "supplier_unlinked"
    # Paired: the read as Nemotron returned it drafts.
    assert invoice_draft(DOCUMENT, read, ALIASES, "INR").reason_code is None


def test_the_live_quote_read_grounds_in_the_reply_and_a_forged_price_drops_it() -> None:
    assert f'QUOTE_REPLY = "{QUOTE_REPLY}"' in (NEMOTRON.parent / "record_nemotron.py").read_text("utf8")
    body = json.loads((NEMOTRON / "quote.json").read_text("utf8"))
    fields = QuoteFields.model_validate_json(body["response"]["choices"][0]["message"]["content"])
    rfq = Rfq(item_name="Butter (synthetic)", unit="kg", qty_milli=10_000, currency="INR", minor_unit=2)
    got = ground(fields, QUOTE_REPLY, rfq)
    assert got.reason is None and got.fields == fields and fields.unit_price_minor == 57_500
    assert QUOTE_REPLY[slice(*got.spans["unit_price_minor"])] == "575.00"
    forged = ground(fields.model_copy(update={"unit_price_minor": 55_000}), QUOTE_REPLY, rfq)
    assert (forged.fields, forged.reason) == (None, "not_in_reply:unit_price_minor")
