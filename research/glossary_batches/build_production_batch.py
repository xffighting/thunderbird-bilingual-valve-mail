#!/usr/bin/env python3
"""Build the reviewed production glossary batch from the merged research artifact."""

from __future__ import annotations

import argparse
import collections
import json
import pathlib
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_INPUT = pathlib.Path(__file__).with_name("2026-07-30-merged.json")
DEFAULT_OUTPUT = ROOT / "native-host" / "valve_glossary_batch_2026_07_30.json"
FIELDS = ["en", "zh", "ru", "ar", "category", "context"]


def load_json(path: pathlib.Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=pathlib.Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=pathlib.Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    merged = load_json(args.input)
    entries = merged.get("entries", [])
    if len(entries) != 53 or merged.get("summary", {}).get("gaps") != 0:
        raise ValueError("Expected 53 complete independent-QA-approved entries")

    referenced_source_ids = {
        source_id
        for entry in entries
        for source_id in entry.get("source_ids", [])
    }
    sources = [
        source
        for source in merged.get("sources", [])
        if source.get("id") in referenced_source_ids
    ]
    missing_sources = referenced_source_ids - {
        str(source.get("id") or "") for source in sources
    }
    if missing_sources:
        raise ValueError(f"Missing source metadata: {sorted(missing_sources)}")

    category_source_refs: dict[str, list[str]] = collections.defaultdict(list)
    aliases: dict[str, dict[str, list[str]]] = {}
    terms: list[list[str]] = []
    for entry in entries:
        terms.append([str(entry[field]).strip() for field in FIELDS])
        for source_id in entry.get("source_ids", []):
            if source_id not in category_source_refs[entry["category"]]:
                category_source_refs[entry["category"]].append(source_id)
        ru_aliases = [
            str(value).strip()
            for value in entry.get("ru_aliases", [])
            if str(value).strip()
        ]
        ar_aliases = [
            str(value).strip()
            for value in entry.get("ar_aliases", [])
            if str(value).strip()
        ]
        if ru_aliases or ar_aliases:
            aliases[entry["en"]] = {
                "ru": list(dict.fromkeys(ru_aliases)),
                "ar": list(dict.fromkeys(ar_aliases)),
            }

    output = {
        "name": "lianggu-valve-multilingual-glossary-batch",
        "version": "2026.07.30.3",
        "languages": ["zh-CN", "en", "ru", "ar"],
        "fields": FIELDS,
        "review_policy": (
            "Production batch approved by independent QA: 53 approved, "
            "6 deferred for review, and 1 rejected."
        ),
        "sources": sources,
        "category_source_refs": dict(category_source_refs),
        "terms": terms,
        "aliases": aliases,
        "qa": {
            "source_file": merged.get("qa", {}).get("file"),
            "approved": len(terms),
            "review_required": len(merged.get("qa", {}).get("review_required", [])),
            "rejected": len(merged.get("qa", {}).get("rejected", [])),
        },
    }
    args.output.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"production glossary batch built: terms={len(terms)} "
        f"sources={len(sources)} aliases={len(aliases)}"
    )


if __name__ == "__main__":
    main()
