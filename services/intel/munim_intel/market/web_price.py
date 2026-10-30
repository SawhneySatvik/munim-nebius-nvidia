"""One web search for an ingredient's market price (NB-7). Tavily's text is untrusted (rule 8, gotcha 15): it is read by
deterministic code only, never by a model, never logged or traced. What leaves this module is a CSV in core's
`market_signal_v2` layout, which a person uploads and an owner approves (R28): the price becomes a number on screen only
as a `market.ingredient_price` cell, after that approval. Nothing here writes Postgres (rule 1).

Live when TAVILY_API_KEY is present and MUNIM_MODEL_MODE=live; otherwise the recorded synthetic fixture, whose source token
says `tavily-recorded:` so the screen can label it (EV-7)."""

from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path

import httpx

from munim_intel.config import Config

TAVILY_URL = "https://api.tavily.com/search"
FIXTURE_DIR = Path(__file__).parent / "fixtures"
#: How a web page writes a money amount, per currency (the page's own text, not a country rule): the symbols tried and the
#: currency's minor digits (the country pack's value, restated here because a page is read before any tenant is known).
CURRENCY_TEXT: dict[str, tuple[tuple[str, ...], int]] = {"INR": (("₹", "Rs.", "Rs", "INR"), 2), "AUD": (("A$", "AUD"), 2)}
UNITS = ("kg", "g", "l", "ml")
SOURCE = re.compile(r"^[a-z0-9][a-z0-9._:-]{0,79}$")  # 0037's source CHECK


class WebPriceError(Exception):
    """A refusal with a code; its message never carries page text."""


@dataclass(frozen=True)
class WebPrice:
    host: str
    price_minor: int
    qty_milli: int
    unit: str
    currency: str
    recorded: bool

    @property
    def source(self) -> str:
        return f"{'tavily-recorded' if self.recorded else 'tavily'}:{self.host}"


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def _host(url: str) -> str | None:
    m = re.match(r"^https://([a-z0-9][a-z0-9.-]{0,60})(?:[/:?#]|$)", url.strip().lower())
    return m.group(1) if m and SOURCE.match(f"tavily-recorded:{m.group(1)}") else None


def extract(results: list[dict[str, object]], currency: str, *, recorded: bool) -> WebPrice | None:
    """The first result with a price in `currency` per kg/g/l/ml. The digits come from the matched text, so a number that is
    not on the page cannot be produced; a result with no host token or no such price is skipped."""
    if currency not in CURRENCY_TEXT:
        raise WebPriceError("currency_unsupported")
    symbols, digits = CURRENCY_TEXT[currency]
    pat = re.compile(
        r"(?:%s)\s?(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,%d}))?\s*(?:/|per\s+)(%s)\b" % ("|".join(re.escape(s) for s in symbols), digits, "|".join(UNITS))
    )
    for r in results:
        host, text = _host(str(r.get("url", ""))), str(r.get("content", ""))
        m = pat.search(text)
        if host is None or m is None:
            continue
        major = int(m.group(1).replace(",", ""))
        minor = major * 10**digits + int((m.group(2) or "").ljust(digits, "0") or "0")
        if minor <= 0:
            continue
        return WebPrice(host, minor, 1000, m.group(3), currency, recorded)
    return None


def search(cfg: Config, ingredient: str, *, http: httpx.Client | None = None) -> tuple[list[dict[str, object]], bool]:
    """(results, recorded). Live needs the key and live mode; the recorded fixture answers only the ingredient it was
    written for. A live failure raises a WebPriceError; it never falls back to the fixture silently."""
    key = cfg.tavily_key()
    if key and cfg.model_mode == "live":
        q = f"{ingredient} wholesale price per kg"
        try:
            with http or httpx.Client(timeout=20.0) as c:
                r = c.post(TAVILY_URL, headers={"Authorization": f"Bearer {key}"}, json={"query": q, "max_results": 5, "search_depth": "basic"})
            r.raise_for_status()
            results = r.json()["results"]
        except Exception as e:  # noqa: BLE001 - the message may carry the key or page text; say only what class failed
            raise WebPriceError(f"search_failed:{type(e).__name__}") from None
        return [x for x in results if isinstance(x, dict)], False
    fixture = FIXTURE_DIR / f"tavily_{_slug(ingredient)}.json"
    if not fixture.is_file():
        raise WebPriceError("no_recorded_fixture")
    return json.loads(fixture.read_text("utf8"))["results"], True


def signal_csv(ingredient: str, price: WebPrice, on_date: date) -> str:
    """The proposal as a `market_signal_v2` file. The ingredient is the tenant's own name for it (a person's upload
    resolves it by exact name); the price is written in the currency's major unit, as the layout's `major` says."""
    digits = CURRENCY_TEXT[price.currency][1]
    major = (Decimal(price.price_minor) / Decimal(10**digits)).quantize(Decimal(1).scaleb(-digits))
    out = io.StringIO()
    w = csv.writer(out, lineterminator="\n")
    w.writerow(["on_date", "kind", "label", "outlet_ref", "ingredient", "price", "value", "unit", "source"])
    w.writerow([on_date.isoformat(), "ingredient_price", f"price.{_slug(ingredient)}", "", ingredient, f"{major}", f"{price.qty_milli // 1000}", price.unit, price.source])
    return out.getvalue()


def model_view(price: WebPrice) -> dict[str, str]:
    """All a model may be told: that a proposal exists and where it came from. No figure (rule 3): the price reaches a screen
    only as a cell, after an owner approves the import."""
    return {
        "status": "proposed",
        "source": price.source,
        "note": "A web price is waiting for the owner's import approval; it is a figure only once approved.",
    }


def propose(cfg: Config, ingredient: str, currency: str, on_date: date, *, http: httpx.Client | None = None) -> tuple[str, WebPrice]:
    """The one search: results → price → CSV. Raises WebPriceError('no_price_found') when no result reads as a price."""
    results, recorded = search(cfg, ingredient, http=http)
    price = extract(results, currency, recorded=recorded)
    if price is None:
        raise WebPriceError("no_price_found")
    return signal_csv(ingredient, price, on_date), price
