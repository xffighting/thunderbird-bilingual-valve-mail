#!/usr/bin/env python3
"""Build the round-two glossary and reply-intent release from QA whitelists."""

from __future__ import annotations

import collections
import json
import pathlib
import re
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parents[2]
BATCH_DIR = pathlib.Path(__file__).resolve().parent
VALVE_INPUT = BATCH_DIR / "2026-07-30-round2-valve.json"
TENDER_INPUT = BATCH_DIR / "2026-07-30-round2-tender.json"
INTENT_INPUT = BATCH_DIR / "2026-07-30-round2-trade-intents.json"
QA_INPUT = BATCH_DIR / "2026-07-30-round2-independent-qa.json"
GLOSSARY_OUTPUT = (
    ROOT / "native-host" / "valve_glossary_batch_2026_07_30_round2.json"
)
INTENT_OUTPUT = ROOT / "native-host" / "reply_intents_multilingual.json"
EXISTING_GLOSSARIES = [
    ROOT / "native-host" / "valve_glossary.json",
    ROOT / "native-host" / "valve_glossary_multilingual.json",
    ROOT / "native-host" / "valve_glossary_batch_2026_07_30.json",
]
FIELDS = ["en", "zh", "ru", "ar", "category", "context"]
LANGUAGES = ("en", "zh", "ru", "ar")
PLACEHOLDER_PATTERN = re.compile(r"\{[a-z][a-z0-9_]*\}")


def load_json(path: pathlib.Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def write_json(path: pathlib.Path, value: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def clean_values(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    return list(
        dict.fromkeys(
            str(value).strip()
            for value in values
            if str(value).strip()
        )
    )


def existing_surface_map() -> tuple[set[str], dict[tuple[str, str], str]]:
    english_keys: set[str] = set()
    surfaces: dict[tuple[str, str], str] = {}
    for path in EXISTING_GLOSSARIES:
        payload = load_json(path)
        aliases = payload.get("aliases")
        aliases = aliases if isinstance(aliases, dict) else {}
        fields = payload.get("fields")
        for raw_term in payload.get("terms", []):
            if isinstance(raw_term, dict):
                term = raw_term
            elif isinstance(raw_term, list) and fields:
                term = dict(zip(fields, raw_term))
            else:
                raise ValueError(f"Invalid production glossary row: {path.name}")
            english = str(term.get("en") or "").strip()
            if not english:
                continue
            english_keys.add(english.casefold())
            for language in LANGUAGES:
                primary = str(term.get(language) or "").strip()
                if primary:
                    surfaces.setdefault((language, primary.casefold()), english)
                for alias in clean_values(
                    (aliases.get(english) or {}).get(language, [])
                ):
                    surfaces.setdefault((language, alias.casefold()), english)
    return english_keys, surfaces


def build_glossary(
    valve: dict[str, Any],
    tender: dict[str, Any],
    qa: dict[str, Any],
) -> dict[str, Any]:
    approved = set(qa["glossary"]["approved_keys"])
    if len(approved) != qa["release_recommendation"]["publishable_glossary_count"]:
        raise ValueError("QA glossary whitelist count does not match release recommendation")

    candidate_rows: dict[str, tuple[str, dict[str, Any]]] = {}
    for namespace, payload in (("valve", valve), ("tender", tender)):
        for entry in payload.get("entries", []):
            english = str(entry.get("en") or "").strip()
            if english in candidate_rows:
                raise ValueError(f"Duplicate candidate glossary key: {english}")
            candidate_rows[english] = (namespace, entry)
    missing = approved - set(candidate_rows)
    if missing:
        raise ValueError(f"Approved glossary keys are missing: {sorted(missing)}")

    existing_english, surfaces = existing_surface_map()
    sources: list[dict[str, Any]] = []
    source_lookup: dict[tuple[str, str], dict[str, Any]] = {}
    for namespace, payload in (("valve", valve), ("tender", tender)):
        for source in payload.get("sources", []):
            source_id = str(source.get("id") or "").strip()
            if not source_id:
                raise ValueError(f"Missing source ID in {namespace} batch")
            source_lookup[(namespace, source_id)] = {
                **source,
                "id": f"round2-{namespace}:{source_id}",
                "original_id": source_id,
                "source_batch": namespace,
            }

    category_source_refs: dict[str, list[str]] = collections.defaultdict(list)
    output_aliases: dict[str, dict[str, list[str]]] = {}
    excluded_aliases: list[dict[str, str]] = []
    terms: list[list[str]] = []
    referenced_sources: set[tuple[str, str]] = set()
    for english in qa["glossary"]["approved_keys"]:
        namespace, entry = candidate_rows[english]
        if english.casefold() in existing_english:
            raise ValueError(f"Approved glossary key overlaps production: {english}")
        context = str(entry.get("context") or "").strip()
        if namespace == "tender":
            context = "always"
        elif context not in {"always", "valve"}:
            raise ValueError(f"Unsupported valve context for {english}: {context}")

        term = {
            language: str(entry.get(language) or "").strip()
            for language in LANGUAGES
        }
        if not all(term.values()):
            raise ValueError(f"Incomplete approved glossary row: {english}")
        term["category"] = str(entry.get("category") or "").strip()
        term["context"] = context

        aliases_by_language: dict[str, list[str]] = {}
        raw_aliases = entry.get("aliases")
        raw_aliases = raw_aliases if isinstance(raw_aliases, dict) else {}
        for language in LANGUAGES:
            primary = term[language]
            primary_key = (language, primary.casefold())
            primary_owner = surfaces.get(primary_key)
            if primary_owner and primary_owner.casefold() != english.casefold():
                raise ValueError(
                    f"Cross-language primary collision: {language} {primary!r} "
                    f"maps to both {primary_owner!r} and {english!r}"
                )
            surfaces[primary_key] = english
            candidate_aliases = [
                value
                for value in clean_values(raw_aliases.get(language, []))
                if value.casefold() != primary.casefold()
            ]
            values: list[str] = []
            for alias in candidate_aliases:
                surface_key = (language, alias.casefold())
                owner = surfaces.get(surface_key)
                if owner and owner.casefold() != english.casefold():
                    excluded_aliases.append(
                        {
                            "key": english,
                            "language": language,
                            "alias": alias,
                            "conflicts_with": owner,
                        }
                    )
                    continue
                surfaces[surface_key] = english
                values.append(alias)
            if values:
                aliases_by_language[language] = values
        if aliases_by_language:
            output_aliases[english] = aliases_by_language

        terms.append([term[field] for field in FIELDS])
        for source_id in clean_values(entry.get("source_ids", [])):
            source_key = (namespace, source_id)
            if source_key not in source_lookup:
                raise ValueError(f"Missing source metadata for {namespace}:{source_id}")
            referenced_sources.add(source_key)
            namespaced = source_lookup[source_key]["id"]
            if namespaced not in category_source_refs[term["category"]]:
                category_source_refs[term["category"]].append(namespaced)

    sources = [
        source_lookup[key]
        for key in source_lookup
        if key in referenced_sources
    ]
    return {
        "name": "lianggu-valve-multilingual-glossary-batch",
        "version": "2026.07.30.4",
        "languages": ["zh-CN", "en", "ru", "ar"],
        "fields": FIELDS,
        "review_policy": (
            "Round-two independent-QA whitelist release: 89 approved, "
            "30 deferred for review, and 1 rejected. Unapproved rows are excluded."
        ),
        "sources": sources,
        "category_source_refs": dict(category_source_refs),
        "terms": terms,
        "aliases": output_aliases,
        "qa": {
            "source_file": str(QA_INPUT.relative_to(ROOT)),
            "approved": len(terms),
            "review_required": len(qa["glossary"]["review_required"]),
            "rejected": len(qa["glossary"]["rejected"]),
            "whole_batch_release": False,
            "excluded_colliding_aliases": excluded_aliases,
        },
    }


def build_intents(
    candidates: dict[str, Any],
    qa: dict[str, Any],
) -> dict[str, Any]:
    approved_ids = qa["trade_intents"]["approved_ids"]
    if len(approved_ids) != qa["release_recommendation"]["publishable_trade_intent_count"]:
        raise ValueError("QA intent whitelist count does not match release recommendation")
    by_id = {
        str(intent.get("intent_id") or ""): intent
        for intent in candidates.get("intents", [])
    }
    missing = set(approved_ids) - set(by_id)
    if missing:
        raise ValueError(f"Approved reply intents are missing: {sorted(missing)}")

    high_risk_ids = set(
        qa["trade_intents"]["high_risk_approved_with_mandatory_pre_send_review"]
    )
    source_lookup = {
        str(source.get("id") or ""): source
        for source in candidates.get("sources", [])
    }
    referenced_source_ids: set[str] = set()
    output_intents: list[dict[str, Any]] = []
    for intent_id in approved_ids:
        intent = dict(by_id[intent_id])
        if intent.get("variables") == []:
            raise ValueError(
                f"Trigger-only intent was not excluded by independent QA: {intent_id}"
            )
        expected_placeholders = set(clean_values(intent.get("variables", [])))
        for language in LANGUAGES:
            value = str(intent.get(language) or "").strip()
            if not value:
                raise ValueError(f"Incomplete intent translation: {intent_id} {language}")
            if set(PLACEHOLDER_PATTERN.findall(value)) != expected_placeholders:
                raise ValueError(f"Intent placeholders do not align: {intent_id}")
        english = str(intent["en"])
        if re.search(r"\bsoft\s+reminder\b", english, re.IGNORECASE):
            raise ValueError(f"Forbidden outward Soft reminder: {intent_id}")
        intent["allow_pattern_match"] = False
        intent["requires_human_review"] = intent_id in high_risk_ids
        intent["source_ids"] = [
            f"round2-trade:{source_id}"
            for source_id in clean_values(intent.get("source_ids", []))
        ]
        referenced_source_ids.update(
            source_id.removeprefix("round2-trade:")
            for source_id in intent["source_ids"]
        )
        output_intents.append(intent)

    missing_sources = referenced_source_ids - set(source_lookup)
    if missing_sources:
        raise ValueError(f"Missing reply-intent sources: {sorted(missing_sources)}")
    sources = [
        {
            **source_lookup[source_id],
            "id": f"round2-trade:{source_id}",
            "original_id": source_id,
            "source_batch": "trade",
        }
        for source_id in source_lookup
        if source_id in referenced_source_ids
    ]
    return {
        "name": "lianggu-reply-intents-multilingual",
        "version": "2026.07.30.4",
        "languages": ["zh-CN", "en", "ru", "ar"],
        "privacy": "local_offline_only",
        "review_policy": (
            "Only 32 independent-QA-approved intent templates are enabled. "
            "Pattern-only matching is disabled. Twenty-two high-risk templates "
            "require visible human review before insertion."
        ),
        "forbidden_outward_patterns": [r"(?i)\bsoft\s+reminder\b"],
        "sources": sources,
        "intents": output_intents,
        "qa": {
            "source_file": str(QA_INPUT.relative_to(ROOT)),
            "approved": len(output_intents),
            "review_required": len(qa["trade_intents"]["review_required"]),
            "rejected": len(qa["trade_intents"]["rejected"]),
            "high_risk_requires_human_review": len(high_risk_ids),
            "whole_batch_release": False,
        },
    }


def main() -> None:
    valve = load_json(VALVE_INPUT)
    tender = load_json(TENDER_INPUT)
    intents = load_json(INTENT_INPUT)
    qa = load_json(QA_INPUT)
    glossary_output = build_glossary(valve, tender, qa)
    intent_output = build_intents(intents, qa)
    write_json(GLOSSARY_OUTPUT, glossary_output)
    write_json(INTENT_OUTPUT, intent_output)
    print(
        "round-two release built: "
        f"glossary={len(glossary_output['terms'])} "
        f"intents={len(intent_output['intents'])} "
        f"high-risk={intent_output['qa']['high_risk_requires_human_review']}"
    )


if __name__ == "__main__":
    main()
