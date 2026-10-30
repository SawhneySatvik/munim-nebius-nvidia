"""Argument check against a model-facing tool schema. The schemas are inside the lint subset (packages/contracts
src/ontology/lint.ts: type, properties, required, additionalProperties false, items, enum, minItems, maxItems), so
this is the whole of what needs checking. Messages carry the JSON path and the expected form, never a value (§5.3).
"""

from __future__ import annotations

from typing import Any

_PY: dict[str, tuple[type, ...]] = {
    "string": (str,),
    "boolean": (bool,),
    "integer": (int,),
    "number": (int, float),
    "object": (dict,),
    "array": (list,),
}


def _is(value: Any, typ: str) -> bool:
    if typ == "null":
        return value is None
    if typ in ("integer", "number") and isinstance(value, bool):
        return False
    return isinstance(value, _PY[typ])


#: What a model may write for null (A2, measured on Nemotron: "none" or "None" for a null outlet, channel, channel kind and
#: abstain code; a typed "none" channel kind filtered a read to nothing). No model-facing enum, id or code takes either word.
NULL_WORDS = frozenset({"none", "null"})


def nulled(schema: dict[str, Any], args: dict[str, Any]) -> dict[str, Any]:
    """`args` with each top-level null word read as null where that argument admits null; anything else as it was."""
    props: dict[str, Any] = schema.get("properties", {})

    def admits_null(key: str) -> bool:
        t = props.get(key, {}).get("type")
        return t == "null" or (isinstance(t, list) and "null" in t)

    return {k: None if isinstance(v, str) and v.strip().lower() in NULL_WORDS and admits_null(k) else v for k, v in args.items()}


def problems(schema: dict[str, Any], value: Any, path: str = "") -> list[str]:
    where = path or "(args)"
    t = schema["type"]
    types = t if isinstance(t, list) else [t]
    if not any(_is(value, x) for x in types):
        return [f"{where}: expected {' or '.join(types)}"]
    if value is None:
        return []
    if "enum" in schema and value not in schema["enum"]:
        return [f"{where}: expected one of {', '.join(str(e) for e in schema['enum'] if e is not None)}"]
    out: list[str] = []
    if isinstance(value, dict):
        props: dict[str, Any] = schema["properties"]
        out += [f"{path}/{k}: unknown argument" for k in value if k not in props]
        out += [f"{path}/{k}: missing" for k in schema["required"] if k not in value]
        for k, sub in props.items():
            if k in value:
                out += problems(sub, value[k], f"{path}/{k}")
    elif isinstance(value, list):
        if len(value) < schema.get("minItems", 0) or len(value) > schema["maxItems"]:
            out.append(f"{where}: expected {schema.get('minItems', 0)}–{schema['maxItems']} items")
        for i, v in enumerate(value):
            out += problems(schema["items"], v, f"{path}/{i}")
    return out
