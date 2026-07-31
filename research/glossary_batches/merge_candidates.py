#!/usr/bin/env python3
"""Merge independently researched glossary batches without changing production data."""

from __future__ import annotations

import argparse
import collections
import json
import pathlib
import re
import unicodedata
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_BASE = ROOT / "native-host" / "valve_glossary_multilingual.json"
DEFAULT_BASE_CORE = ROOT / "native-host" / "valve_glossary.json"
DEFAULT_BATCHES = {
    "zh-en": pathlib.Path(__file__).with_name("2026-07-30-zh-en.json"),
    "ru": pathlib.Path(__file__).with_name("2026-07-30-ru.json"),
    "ar": pathlib.Path(__file__).with_name("2026-07-30-ar.json"),
}
DEFAULT_PRIORITY = pathlib.Path(__file__).with_name("2026-07-30-priority.json")
DEFAULT_QA = pathlib.Path(__file__).with_name("2026-07-30-qa.json")
DEFAULT_OUTPUT = pathlib.Path(__file__).with_name("2026-07-30-merged.json")


def normalize_english(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    text = re.sub(r"[\u2010-\u2015]", "-", text)
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def load_json(path: pathlib.Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def pick_consensus(values: list[str], fallback: str) -> str:
    cleaned = [str(value or "").strip() for value in values if str(value or "").strip()]
    return collections.Counter(cleaned).most_common(1)[0][0] if cleaned else fallback


def namespace_sources(
    focus: str,
    batch: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    output: list[dict[str, Any]] = []
    source_map: dict[str, str] = {}
    for index, raw_source in enumerate(batch.get("sources", []), start=1):
        if not isinstance(raw_source, dict):
            continue
        raw_id = str(raw_source.get("id") or f"source-{index}").strip()
        source_id = f"{focus}:{raw_id}"
        source_map[raw_id] = source_id
        output.append({"id": source_id, "focus": focus, **raw_source})
        output[-1]["id"] = source_id
    return output, source_map


def index_entries(
    focus: str,
    batch: dict[str, Any],
    source_map: dict[str, str],
) -> dict[str, dict[str, Any]]:
    output: dict[str, dict[str, Any]] = {}
    for raw_entry in batch.get("entries", []):
        if not isinstance(raw_entry, dict):
            continue
        key = normalize_english(raw_entry.get("en"))
        if not key:
            continue
        entry = dict(raw_entry)
        entry["_focus"] = focus
        entry["_source_ids"] = [
            source_map.get(str(value), f"{focus}:{value}")
            for value in raw_entry.get("source_ids", [])
            if str(value).strip()
        ]
        existing = output.get(key)
        if existing is None:
            output[key] = entry
            continue
        existing_confidence = str(existing.get("confidence") or "medium")
        incoming_confidence = str(entry.get("confidence") or "medium")
        if existing_confidence != "high" and incoming_confidence == "high":
            output[key] = entry
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", type=pathlib.Path, default=DEFAULT_BASE)
    parser.add_argument("--base-core", type=pathlib.Path, default=DEFAULT_BASE_CORE)
    parser.add_argument("--zh-en", type=pathlib.Path, default=DEFAULT_BATCHES["zh-en"])
    parser.add_argument("--ru", type=pathlib.Path, default=DEFAULT_BATCHES["ru"])
    parser.add_argument("--ar", type=pathlib.Path, default=DEFAULT_BATCHES["ar"])
    parser.add_argument("--priority", type=pathlib.Path, default=DEFAULT_PRIORITY)
    parser.add_argument("--qa", type=pathlib.Path, default=DEFAULT_QA)
    parser.add_argument("--output", type=pathlib.Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    base = load_json(args.base)
    base_core = load_json(args.base_core)
    base_keys = {
        normalize_english(row[0])
        for row in base.get("terms", [])
        if isinstance(row, list) and row
    }
    base_keys.update(
        normalize_english(term.get("en"))
        for term in base_core.get("terms", [])
        if isinstance(term, dict) and term.get("en")
    )

    batch_paths = {"zh-en": args.zh_en, "ru": args.ru, "ar": args.ar}
    batches = {focus: load_json(path) for focus, path in batch_paths.items()}
    sources: list[dict[str, Any]] = []
    indexes: dict[str, dict[str, dict[str, Any]]] = {}
    for focus, batch in batches.items():
        focus_sources, source_map = namespace_sources(focus, batch)
        sources.extend(focus_sources)
        indexes[focus] = index_entries(focus, batch, source_map)

    qa: dict[str, Any] = {}
    if args.priority.exists():
        priority = load_json(args.priority)
        priority_entries = {
            normalize_english(entry.get("en")): entry
            for entry in priority.get("entries", [])
            if isinstance(entry, dict) and normalize_english(entry.get("en"))
        }
        for key, priority_entry in priority_entries.items():
            researched_entry = indexes["zh-en"].get(key, {})
            indexes["zh-en"][key] = {
                **researched_entry,
                **priority_entry,
                "_focus": "zh-en",
                "_source_ids": researched_entry.get("_source_ids", []),
            }
        candidate_keys = sorted(priority_entries)
        if args.qa.exists():
            qa = load_json(args.qa)
            approved_keys = {
                normalize_english(value)
                for value in qa.get("approved_keys", [])
                if normalize_english(value)
            }
            candidate_keys = [key for key in candidate_keys if key in approved_keys]
    else:
        candidate_keys = sorted(set().union(*(set(index) for index in indexes.values())))
    complete: list[dict[str, Any]] = []
    gaps: list[dict[str, Any]] = []
    for key in candidate_keys:
        if key in base_keys:
            continue
        zh_entry = indexes["zh-en"].get(key, {})
        ru_entry = indexes["ru"].get(key, {})
        ar_entry = indexes["ar"].get(key, {})
        entries = [entry for entry in (zh_entry, ru_entry, ar_entry) if entry]
        english = next(
            (str(entry.get("en") or "").strip() for entry in entries if entry.get("en")),
            key,
        )
        values = {
            "en": english,
            "zh": str(zh_entry.get("zh") or "").strip(),
            "ru": str(ru_entry.get("ru") or "").strip(),
            "ar": str(ar_entry.get("ar") or "").strip(),
        }
        provenance = list(
            dict.fromkeys(
                source_id
                for entry in entries
                for source_id in entry.get("_source_ids", [])
            )
        )
        category = str(zh_entry.get("category") or "").strip() or pick_consensus(
            [str(entry.get("category") or "") for entry in entries],
            "business_phrase" if "reminder" in key else "requirement",
        )
        context = str(zh_entry.get("context") or "").strip() or pick_consensus(
            [str(entry.get("context") or "") for entry in entries],
            "always",
        )
        confidences = [
            str(entry.get("confidence") or "medium")
            for entry in entries
        ]
        merged = {
            **values,
            "category": category,
            "context": context,
            "source_ids": provenance,
            "confidence": "high" if confidences and all(value == "high" for value in confidences) else "medium",
            "ru_aliases": ru_entry.get("ru_aliases", []),
            "ar_aliases": ar_entry.get("ar_aliases", []),
            "notes": list(
                dict.fromkeys(
                    str(entry.get("notes") or "").strip()
                    for entry in entries
                    if str(entry.get("notes") or "").strip()
                )
            ),
        }
        missing = [language for language in ("zh", "ru", "ar") if not merged[language]]
        if missing:
            merged["missing"] = missing
            gaps.append(merged)
        else:
            complete.append(merged)

    result = {
        "batch_id": "2026-07-30-merged",
        "base_version": base.get("version"),
        "base_core_version": base_core.get("version"),
        "review_policy": (
            "Only complete four-language rows are eligible for production. "
            "Only independent-QA-approved rows are promoted when a QA file is present."
        ),
        "summary": {
            "complete": len(complete),
            "gaps": len(gaps),
            "source_count": len(sources),
        },
        "sources": sources,
        "entries": complete,
        "gaps": gaps,
    }
    if args.qa.exists():
        result["qa"] = {
            "file": args.qa.name,
            "status": qa.get("status"),
            "review_required": qa.get("review_required", []),
            "rejected": qa.get("rejected", []),
        }
    args.output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"merged glossary candidates: complete={len(complete)} "
        f"gaps={len(gaps)} sources={len(sources)}"
    )


if __name__ == "__main__":
    main()
