#!/usr/bin/env python3
"""Offline Argos Translate native-messaging host for Thunderbird."""

from __future__ import annotations

import json
import os
import pathlib
import re
import struct
import sys
import time
from html import unescape as html_unescape
from typing import Any

MAX_NATIVE_MESSAGE_BYTES = 1_048_576
MAX_LINES = 80
MAX_LINE_LENGTH = 1_200
MAX_TOTAL_LENGTH = 24_000
_ENGINE = None
_ENGINE_ROOT = None
_ENGINE_CACHE: dict[str, Any] = {}
_GLOSSARY = None
_REPLY_INTENTS = None
CJK_PATTERN = re.compile(r"[\u3400-\u9fff\uf900-\ufaff]")
REPEATED_CJK_PATTERN = re.compile(r"([\u3400-\u9fff]{1,4})\1{4,}")


def read_message() -> dict[str, Any] | None:
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    if len(raw_length) != 4:
        raise ValueError("Incomplete native-message length header")

    message_length = struct.unpack("<I", raw_length)[0]
    if message_length < 2 or message_length > MAX_NATIVE_MESSAGE_BYTES:
        raise ValueError("Native message size is outside the allowed range")

    payload = sys.stdin.buffer.read(message_length)
    if len(payload) != message_length:
        raise ValueError("Incomplete native-message payload")
    return json.loads(payload.decode("utf-8"))


def write_message(payload: dict[str, Any]) -> None:
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


class TranslationEngine:
    def __init__(self, model_root: pathlib.Path | None = None) -> None:
        import ctranslate2
        import sentencepiece

        model_root = model_root or pathlib.Path(
            os.environ.get(
                "LIANGGU_TRANSLATION_MODEL_DIR",
                pathlib.Path(__file__).resolve().parent / "model",
            )
        )
        model_path = model_root / "model"
        tokenizer_path = model_root / "sentencepiece.model"
        if not model_path.is_dir() or not tokenizer_path.is_file():
            raise RuntimeError("Requested offline translation model is not installed")

        self.tokenizer = sentencepiece.SentencePieceProcessor(
            model_file=str(tokenizer_path)
        )
        self.translator = ctranslate2.Translator(
            str(model_path),
            device="cpu",
            compute_type="auto",
        )

    def translate_batch(self, texts: list[str]) -> list[str]:
        token_batches = [
            self.tokenizer.encode(text, out_type=str)
            for text in texts
        ]
        results = self.translator.translate_batch(
            token_batches,
            beam_size=4,
        )
        return [
            self.tokenizer.decode(result.hypotheses[0]).lstrip("▁ ").strip()
            for result in results
        ]


def _is_model_root(path: pathlib.Path) -> bool:
    return (path / "model").is_dir() and (path / "sentencepiece.model").is_file()


def _model_metadata(model_root: pathlib.Path) -> dict[str, str]:
    if model_root.name == "model":
        return {
            "modelId": "translate-en_zh-1_9",
            "source": "en",
            "target": "zh",
        }
    metadata_path = model_root / "lianggu-model.json"
    try:
        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
        source = str(payload.get("source") or "").strip().lower()
        target = str(payload.get("target") or "").strip().lower()
        model_id = str(payload.get("modelId") or model_root.name).strip()
        if source and target:
            return {"modelId": model_id, "source": source, "target": target}
    except (OSError, ValueError, TypeError):
        pass

    match = re.search(r"translate-([a-z]{2,3})_([a-z]{2,3})", model_root.name)
    if match:
        return {
            "modelId": model_root.name,
            "source": match.group(1),
            "target": match.group(2),
        }
    return {"modelId": model_root.name, "source": "", "target": ""}


def discover_model_roots(
    source: str | None = None,
    target: str | None = None,
) -> list[pathlib.Path]:
    host_root = pathlib.Path(__file__).resolve().parent
    candidates = [
        pathlib.Path(os.environ["LIANGGU_TRANSLATION_MODEL_DIR"])
        if os.environ.get("LIANGGU_TRANSLATION_MODEL_DIR")
        else None,
        host_root / "model",
    ]
    models_root = host_root / "models"
    if models_root.is_dir():
        candidates.extend(sorted(path for path in models_root.iterdir() if path.is_dir()))

    output: list[pathlib.Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        if candidate is None:
            continue
        resolved = candidate.expanduser().resolve()
        key = str(resolved)
        if key in seen or not _is_model_root(resolved):
            continue
        seen.add(key)
        metadata = _model_metadata(resolved)
        if source and metadata["source"] != source:
            continue
        if target and metadata["target"] != target:
            continue
        output.append(resolved)
    return output


def _model_id(model_root: pathlib.Path) -> str:
    raw_model_id = _model_metadata(model_root)["modelId"]
    return re.sub(r"[^A-Za-z0-9._-]+", "-", raw_model_id).strip("-") or "local-model"


def _selection_path() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parent / "model-selection.json"


def _read_selected_model_root(candidates: list[pathlib.Path]) -> pathlib.Path | None:
    try:
        payload = json.loads(_selection_path().read_text(encoding="utf-8"))
        selected = pathlib.Path(payload.get("modelRoot", "")).expanduser().resolve()
    except (OSError, ValueError, TypeError):
        return None
    return selected if selected in candidates else None


def _write_selected_model_root(model_root: pathlib.Path) -> None:
    payload = {
        "modelRoot": str(model_root),
        "modelId": _model_id(model_root),
        "selectedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    _selection_path().write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def get_translation_engine() -> TranslationEngine:
    global _ENGINE, _ENGINE_ROOT
    if _ENGINE is None:
        candidates = discover_model_roots("en", "zh")
        if not candidates:
            raise RuntimeError("English to Chinese offline model is not installed")
        _ENGINE_ROOT = _read_selected_model_root(candidates) or candidates[0]
        _ENGINE = TranslationEngine(_ENGINE_ROOT)
        _ENGINE_CACHE["en:zh"] = _ENGINE
    return _ENGINE


def get_directional_engine(source: str, target: str) -> TranslationEngine:
    key = f"{source}:{target}"
    if key == "en:zh":
        return get_translation_engine()
    if key in _ENGINE_CACHE:
        return _ENGINE_CACHE[key]
    candidates = discover_model_roots(source, target)
    if not candidates:
        raise RuntimeError(
            f"Offline reply model {source} to {target} is not installed"
        )
    _ENGINE_CACHE[key] = TranslationEngine(candidates[0])
    return _ENGINE_CACHE[key]


def get_active_model_metadata() -> dict[str, Any]:
    get_translation_engine()
    candidates = discover_model_roots("en", "zh")
    return {
        "modelId": _model_id(_ENGINE_ROOT),
        "candidateCount": len(candidates),
    }


def sanitize_texts(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []

    output: list[str] = []
    total_length = 0
    for value in values:
        if len(output) >= MAX_LINES:
            break
        text = str(value or "").strip()[:MAX_LINE_LENGTH]
        if not text or total_length + len(text) > MAX_TOTAL_LENGTH:
            continue
        output.append(text)
        total_length += len(text)
    return output


def sanitize_custom_terms(values: Any) -> list[dict[str, str]]:
    if not isinstance(values, list):
        return []

    by_english: dict[str, dict[str, str]] = {}
    for value in values:
        if not isinstance(value, dict) or value.get("enabled") is False:
            continue
        english = re.sub(r"\s+", " ", str(value.get("en") or "")).strip()[:240]
        chinese = re.sub(r"\s+", " ", str(value.get("zh") or "")).strip()[:240]
        if not english or not chinese:
            continue
        source_language = (
            value.get("sourceLanguage")
            if value.get("sourceLanguage") in {"en", "ru", "ar"}
            else "en"
        )
        by_english[f"{source_language}\0{english.casefold()}"] = {
            "en": english,
            "zh": chinese,
            "category": str(value.get("category") or "custom")[:40],
            "context": "valve" if value.get("context") == "valve" else "always",
            "sourceLanguage": source_language,
        }
    return list(by_english.values())[-300:]


def get_valve_glossary() -> dict[str, Any]:
    global _GLOSSARY
    if _GLOSSARY is not None:
        return _GLOSSARY

    glossary_path = pathlib.Path(__file__).resolve().parent / "valve_glossary.json"
    with glossary_path.open("r", encoding="utf-8") as handle:
        glossary = json.load(handle)
    if glossary.get("name") != "lianggu-valve-glossary":
        raise RuntimeError("Valve glossary identity check failed")
    if not isinstance(glossary.get("terms"), list):
        raise RuntimeError("Valve glossary terms are unavailable")
    if not isinstance(glossary.get("preserve_patterns"), list):
        raise RuntimeError("Valve glossary preserve patterns are unavailable")

    base_by_english = {
        str(term.get("en") or "").casefold(): term
        for term in glossary["terms"]
        if str(term.get("en") or "").strip()
    }
    glossary["baseVersion"] = glossary.get("version", "unknown")
    multilingual_count = 0
    multilingual_sources: list[dict[str, Any]] = []
    glossary_dir = pathlib.Path(__file__).resolve().parent
    multilingual_paths = [
        glossary_dir / "valve_glossary_multilingual.json",
        *sorted(glossary_dir.glob("valve_glossary_batch_*.json")),
    ]
    for index, multilingual_path in enumerate(multilingual_paths):
        with multilingual_path.open("r", encoding="utf-8") as handle:
            multilingual = json.load(handle)
        expected_name = (
            "lianggu-valve-multilingual-glossary"
            if index == 0
            else "lianggu-valve-multilingual-glossary-batch"
        )
        if multilingual.get("name") != expected_name:
            raise RuntimeError(
                f"Multilingual valve glossary identity check failed: {multilingual_path.name}"
            )
        fields = multilingual.get("fields")
        if fields != ["en", "zh", "ru", "ar", "category", "context"]:
            raise RuntimeError(
                f"Multilingual valve glossary schema check failed: {multilingual_path.name}"
            )
        aliases = multilingual.get("aliases")
        aliases = aliases if isinstance(aliases, dict) else {}
        for raw_term in multilingual.get("terms", []):
            if not isinstance(raw_term, list) or len(raw_term) != len(fields):
                raise RuntimeError(
                    f"Multilingual valve glossary term is invalid: {multilingual_path.name}"
                )
            term = dict(zip(fields, raw_term))
            if not all(
                str(term.get(language) or "").strip()
                for language in ("en", "zh", "ru", "ar")
            ):
                raise RuntimeError(
                    f"Multilingual valve glossary translation is incomplete: {multilingual_path.name}"
                )
            key = str(term["en"]).casefold()
            target = base_by_english.get(key)
            if target is None:
                target = {
                    "en": term["en"],
                    "zh": term["zh"],
                    "category": term["category"],
                    "context": term["context"],
                }
                glossary["terms"].append(target)
                base_by_english[key] = target
            target["ru"] = term["ru"]
            target["ar"] = term["ar"]
            term_aliases = aliases.get(term["en"])
            if isinstance(term_aliases, dict):
                for language in ("en", "zh", "ru", "ar"):
                    alias_key = f"{language}Aliases"
                    target[alias_key] = list(
                        dict.fromkeys(
                            [
                                *target.get(alias_key, []),
                                *[
                                    str(value).strip()
                                    for value in term_aliases.get(language, [])
                                    if str(value).strip()
                                ],
                            ]
                        )
                    )
            multilingual_count += 1
        glossary["version"] = multilingual.get(
            "version",
            glossary.get("version", glossary["baseVersion"]),
        )
        glossary["languages"] = multilingual.get(
            "languages",
            glossary.get("languages", ["zh-CN", "en", "ru", "ar"]),
        )
        multilingual_sources.extend(multilingual.get("sources", []))

    glossary["multilingualTermCount"] = multilingual_count
    glossary["multilingualSources"] = multilingual_sources
    glossary["sources"] = [
        *glossary.get("sources", []),
        *glossary["multilingualSources"],
    ]
    _GLOSSARY = glossary
    return glossary


def get_glossary_metadata() -> dict[str, Any]:
    glossary = get_valve_glossary()
    return {
        "name": glossary["name"],
        "version": glossary.get("version", "unknown"),
        "termCount": len(glossary["terms"]),
        "multilingualTermCount": glossary.get("multilingualTermCount", 0),
        "russianTermCount": sum(
            1 for term in glossary["terms"] if str(term.get("ru") or "").strip()
        ),
        "arabicTermCount": sum(
            1 for term in glossary["terms"] if str(term.get("ar") or "").strip()
        ),
        "languages": glossary.get("languages", ["zh-CN", "en"]),
        "sourceCount": len(glossary.get("sources", [])),
    }


def _phrase_pattern(value: str) -> re.Pattern[str]:
    parts = [re.escape(part) for part in re.split(r"[\s-]+", value.strip()) if part]
    return re.compile(
        r"(?<![\w])" + r"[\s-]+".join(parts) + r"(?![\w])",
        re.IGNORECASE,
    )


def _source_phrase_pattern(value: str, source_language: str) -> re.Pattern[str]:
    if source_language != "ar":
        return _phrase_pattern(value)
    parts = [
        re.escape(part)
        for part in re.split(r"[\s-]+", value.strip())
        if part
    ]
    return re.compile(
        r"(?<![\w])(?:[وفبكل]|لل)?(?:ال)?"
        + r"[\s-]+".join(parts)
        + r"(?![\w])",
        re.IGNORECASE,
    )


def _is_valve_context(source: str, glossary: dict[str, Any]) -> bool:
    if re.search(r"\bvalves?\b", source, re.IGNORECASE):
        return True

    if re.search(
        r"^\s*body\s+material\b|^\s*body\s*(?::|=|/|$)",
        source,
        re.IGNORECASE,
    ):
        return True

    for term in glossary["terms"]:
        if term.get("category") in {
            "valve_type",
            "operator",
            "connection",
            "requirement",
            "inspection",
        } and _phrase_pattern(term["en"]).search(source):
            return True

    if re.search(
        r"\b(?:bonnet|stem|wedge|trim|gasket|actuator|flanged|wafer)\b",
        source,
        re.IGNORECASE,
    ):
        return True

    return any(
        re.search(pattern, source, re.IGNORECASE)
        for pattern in glossary["preserve_patterns"]
    )


def _is_russian_valve_context(source: str, glossary: dict[str, Any]) -> bool:
    if re.search(
        r"\b(?:клапан|задвижка|кран|затвор|арматура|фланец|привод)\b",
        source,
        re.IGNORECASE,
    ):
        return True
    if re.search(
        r"^\s*(?:материал\s+)?корпус(?:а)?\s*(?::|=|/|$)",
        source,
        re.IGNORECASE,
    ):
        return True
    return any(
        re.search(pattern, source, re.IGNORECASE)
        for pattern in glossary["preserve_patterns"]
    )


def _is_arabic_valve_context(source: str, glossary: dict[str, Any]) -> bool:
    if re.search(
        r"(?:صمام|صمامات|محبس|بوابة|كروي|فراشة|مشغل|"
        r"جسم\s+الصمام|ساق\s+الصمام|مقعد\s+الصمام|شفة)",
        source,
        re.IGNORECASE,
    ):
        return True
    if re.search(
        r"^\s*مادة\s+(?:جسم|بدن)\s+الصمام\s*(?::|=|/|$)",
        source,
        re.IGNORECASE,
    ):
        return True
    return any(
        re.search(pattern, source, re.IGNORECASE)
        for pattern in glossary["preserve_patterns"]
    )


def _glossary_source_terms(
    glossary: dict[str, Any],
    source_language: str,
) -> list[dict[str, str]]:
    source_key = source_language if source_language in {"ru", "ar"} else "en"
    alias_key = f"{source_key}Aliases"
    output: list[dict[str, str]] = []
    seen: set[str] = set()
    for term in glossary["terms"]:
        values = [term.get(source_key), *term.get(alias_key, [])]
        for raw_value in values:
            value = str(raw_value or "").strip()
            if not value or value.casefold() in seen:
                continue
            seen.add(value.casefold())
            output.append(
                {
                    "en": value,
                    "zh": str(term.get("zh") or "").strip(),
                    "category": str(term.get("category") or "custom"),
                    "context": str(term.get("context") or "always"),
                    "sourceLanguage": source_key,
                }
            )
    return output


def protect_valve_terms(
    source: str,
    custom_terms: Any = None,
    source_language: str = "en",
) -> tuple[str, list[dict[str, str]]]:
    glossary = get_valve_glossary()
    source_language = source_language if source_language in {"en", "ru", "ar"} else "en"
    if source_language == "ru":
        valve_context = _is_russian_valve_context(source, glossary)
    elif source_language == "ar":
        valve_context = _is_arabic_valve_context(source, glossary)
    else:
        valve_context = _is_valve_context(source, glossary)
    protected = source
    replacements: list[dict[str, str]] = []

    def replace_match(match: re.Match[str], replacement: str, kind: str) -> str:
        token = f"[TERM{len(replacements):03d}]"
        replacements.append(
            {
                "token": token,
                "replacement": replacement,
                "source": match.group(0),
                "kind": kind,
            }
        )
        return token

    custom_source_terms = [
        term
        for term in sanitize_custom_terms(custom_terms)
        if term.get("sourceLanguage", "en") == source_language
    ]
    base_terms = _glossary_source_terms(glossary, source_language)
    terms = sorted(
        [*custom_source_terms, *base_terms],
        key=lambda item: len(item["en"]),
        reverse=True,
    )
    for term in terms:
        if term.get("context") == "valve" and not valve_context:
            continue
        protected = _source_phrase_pattern(term["en"], source_language).sub(
            lambda match, value=term["zh"]: replace_match(match, value, "term"),
            protected,
        )

    for raw_pattern in glossary["preserve_patterns"]:
        protected = re.sub(
            raw_pattern,
            lambda match: replace_match(match, match.group(0), "preserve"),
            protected,
            flags=re.IGNORECASE,
        )

    return protected, replacements


def restore_valve_terms(
    translated: str,
    replacements: list[dict[str, str]],
) -> str:
    result = re.sub(
        r"(\[TERM\d{3}\])\s*(?=\[TERM\d{3}\])",
        r"\1 ",
        translated,
        flags=re.IGNORECASE,
    )
    missing: list[str] = []
    for item in replacements:
        token_pattern = re.compile(re.escape(item["token"]), re.IGNORECASE)
        result, count = token_pattern.subn(
            lambda _match, value=item["replacement"]: value,
            result,
        )
        if count == 0 and item["replacement"] not in result:
            missing.append(item["replacement"])

    if missing:
        unique_missing = list(dict.fromkeys(missing))
        result = f"{result.rstrip()}（术语：{'、'.join(unique_missing)}）"
    language_suffix = re.search(r"\s*[\(（]英语[\)）]([。.]?)\s*$", result)
    if language_suffix:
        punctuation = language_suffix.group(1)
        result = result[: language_suffix.start()].rstrip()
        if punctuation and not result.endswith((".", "。")):
            result += punctuation
    return result.strip()


def is_usable_translation(source: str, translated: str) -> bool:
    result = translated.strip()
    if not result or result.casefold().rstrip("。.!！?？") == source.strip().casefold().rstrip("。.!！?？"):
        return False
    if not CJK_PATTERN.search(result):
        return False
    if "\ufffd" in result or "\u2047" in result:
        return False

    compact = re.sub(r"\s+", "", result)
    if REPEATED_CJK_PATTERN.search(compact):
        return False
    if len(result) > max(240, len(source.strip()) * 4):
        return False

    cjk_characters = CJK_PATTERN.findall(compact)
    if len(cjk_characters) >= 40:
        if len(set(cjk_characters)) / len(cjk_characters) < 0.14:
            return False
    return True


def translate_with_glossary(
    texts: list[str],
    translate_batch: Any,
    custom_terms: Any = None,
    source_language: str = "en",
) -> list[str]:
    protected_texts: list[str] = []
    replacement_batches: list[list[dict[str, str]]] = []
    for source in texts:
        protected, replacements = protect_valve_terms(
            source,
            custom_terms,
            source_language,
        )
        protected_texts.append(protected)
        replacement_batches.append(replacements)

    translated_texts = translate_batch(protected_texts)
    output: list[str] = []
    for index, source in enumerate(texts):
        translated = translated_texts[index] if index < len(translated_texts) else ""
        restored = restore_valve_terms(translated, replacement_batches[index])
        processed = post_process_translation(source, restored)
        output.append(processed if is_usable_translation(source, processed) else "")
    return output


def translate_russian_to_chinese_batch(texts: list[str]) -> list[str]:
    english = get_directional_engine("ru", "en").translate_batch(texts)
    return get_translation_engine().translate_batch(english)


def translate_arabic_to_chinese_batch(texts: list[str]) -> list[str]:
    english = get_directional_engine("ar", "en").translate_batch(texts)
    return get_translation_engine().translate_batch(english)


BENCHMARK_CASES = [
    ("Please quote Ball Valve DN50 PN16 with WCB body.", ("球阀", "阀体", "报价", "DN50", "PN16", "WCB")),
    ("Please confirm the delivery time and export packing.", ("确认", "交期", "包装")),
    ("The quotation shall include unit price and sea freight.", ("报价单", "单价", "海运费")),
    ("Material test certificate and hydrostatic test report are required.", ("材料试验证书", "水压试验")),
    ("Kindly advise whether the valve is fire safe and anti-static.", ("防火", "防静电")),
    ("Please find the revised commercial offer attached for your review.", ("商务报价", "随附", "审阅")),
]


def benchmark_score(
    translated_expected_pairs: list[tuple[str, tuple[str, ...]]],
    latency_ms: float,
) -> int:
    if not translated_expected_pairs:
        return 0
    usable_count = sum(
        1 for translated, _expected in translated_expected_pairs
        if CJK_PATTERN.search(translated or "") and not REPEATED_CJK_PATTERN.search(translated or "")
    )
    expected_count = sum(len(expected) for _translated, expected in translated_expected_pairs)
    hit_count = sum(
        1
        for translated, expected in translated_expected_pairs
        for token in expected
        if token in (translated or "")
    )
    usable_score = 60 * usable_count / len(translated_expected_pairs)
    terminology_score = 35 * hit_count / max(1, expected_count)
    latency_score = max(0.0, 5.0 - max(0.0, latency_ms - 100.0) / 200.0)
    return round(min(100.0, usable_score + terminology_score + latency_score))


def benchmark_translation_models(custom_terms: Any = None) -> dict[str, Any]:
    global _ENGINE, _ENGINE_ROOT
    candidates = discover_model_roots("en", "zh")
    if not candidates:
        raise RuntimeError("English to Chinese offline model is not installed")

    results: list[dict[str, Any]] = []
    engines: dict[str, TranslationEngine] = {}
    sources = [source for source, _expected in BENCHMARK_CASES]
    for model_root in candidates:
        started = time.perf_counter()
        try:
            engine = TranslationEngine(model_root)
            translations = translate_with_glossary(
                sources,
                engine.translate_batch,
                custom_terms,
            )
            latency_ms = round((time.perf_counter() - started) * 1000)
            pairs = [
                (translations[index] if index < len(translations) else "", expected)
                for index, (_source, expected) in enumerate(BENCHMARK_CASES)
            ]
            score = benchmark_score(pairs, latency_ms)
            model_id = _model_id(model_root)
            engines[str(model_root)] = engine
            results.append(
                {
                    "modelId": model_id,
                    "score": score,
                    "latencyMs": latency_ms,
                    "usableCount": sum(1 for translated, _expected in pairs if translated),
                    "sampleCount": len(BENCHMARK_CASES),
                    "_modelRoot": str(model_root),
                }
            )
        except Exception as error:
            results.append(
                {
                    "modelId": _model_id(model_root),
                    "score": 0,
                    "latencyMs": 0,
                    "usableCount": 0,
                    "sampleCount": len(BENCHMARK_CASES),
                    "error": str(error),
                    "_modelRoot": str(model_root),
                }
            )

    successful = [result for result in results if result["score"] > 0]
    if not successful:
        raise RuntimeError("No installed offline model passed the local quality benchmark")
    winner = max(successful, key=lambda item: (item["score"], -item["latencyMs"]))
    winner_root = pathlib.Path(winner["_modelRoot"])
    _write_selected_model_root(winner_root)
    _ENGINE_ROOT = winner_root
    _ENGINE = engines[str(winner_root)]
    _ENGINE_CACHE["en:zh"] = _ENGINE

    public_results = [
        {key: value for key, value in result.items() if key != "_modelRoot"}
        for result in results
    ]
    return {
        "selectedModel": winner["modelId"],
        "candidateCount": len(candidates),
        "score": winner["score"],
        "latencyMs": winner["latencyMs"],
        "sampleCount": len(BENCHMARK_CASES),
        "results": public_results,
    }


def post_process_translation(source: str, translated: str) -> str:
    """Apply deterministic foreign-trade wording after valve terms are restored."""
    result = re.sub(r"\s*_{2,}\s*", "", translated.strip())
    source_lower = source.lower()

    if re.search(r"\b(?:quote|quotation)\b", source_lower):
        result = result.replace("引用", "报价")
    if re.search(r"\bquotation\b", source_lower):
        result = (
            result.replace("引文表", "报价单")
            .replace("引用表", "报价单")
            .replace("报价表", "报价单")
        )
    if re.search(r"\b(?:delivery\s+time|lead\s+time)\b", source_lower):
        result = result.replace("交货时间", "交期").replace("交付时间", "交期")
    if "best price" in source_lower:
        result = result.replace("你最好的价格", "最优价格").replace("最好的价格", "最优价格")
    if re.search(r"\bplease\s+(?:kindly\s+)?quote\s+(?:us\s+|your\s+)?", source_lower):
        result = re.sub(r"^请(?:向我们)?报价(?:你的|你)?", "请提供", result)
    if re.search(r"\b(?:soft|gentle|kind|friendly)\s+reminder\b", source_lower):
        result = (
            result.replace("支付状况", "付款状态")
            .replace("支付状态", "付款状态")
        )
        result = re.sub(r"^友情提醒\s*[:：,，]?\s*", "友情提醒：", result)
        result = re.sub(r"\.$", "。", result)

    return result


FIELD_LABELS = {
    "zh": {
        "technical": "技术要点",
        "quotation": "报价信息",
        "delivery": "交付信息",
        "documents": "文件与附件",
        "commercial": "商务条款",
        "next_step": "下一步",
        "technical_anchor": "技术术语",
    },
    "en": {
        "technical": "Technical details",
        "quotation": "Quotation",
        "delivery": "Delivery",
        "documents": "Documents and attachments",
        "commercial": "Commercial terms",
        "next_step": "Next step",
        "technical_anchor": "Technical terms",
    },
    "ru": {
        "technical": "Технические данные",
        "quotation": "Коммерческое предложение",
        "delivery": "Срок поставки",
        "documents": "Документы и вложения",
        "commercial": "Коммерческие условия",
        "next_step": "Следующий шаг",
        "technical_anchor": "Термины для сверки",
    },
    "ar": {
        "technical": "البيانات الفنية",
        "quotation": "عرض السعر",
        "delivery": "موعد التسليم",
        "documents": "المستندات والمرفقات",
        "commercial": "الشروط التجارية",
        "next_step": "الخطوة التالية",
        "technical_anchor": "مصطلحات مرجعية",
    },
}

GREETING_TEXT = {
    "zh": "您好，",
    "en": "Hello,",
    "ru": "Здравствуйте,",
    "ar": "مرحبًا،",
}

CLOSING_TEXT = {
    "zh": "如有任何问题，请随时与我们联系。",
    "en": "If you have any questions, please feel free to contact us.",
    "ru": "Если у Вас возникнут вопросы, пожалуйста, свяжитесь с нами.",
    "ar": "إذا كانت لديكم أي أسئلة، فلا تترددوا في التواصل معنا.",
}

INFORMAL_REPLY_REWRITES = [
    (r"^收到(?:客户)?询价", "感谢您的询价，我们已收到相关信息"),
    (r"看看附件", "请查收随附文件"),
    (r"请看附件", "请查收随附文件"),
    (r"附件是报价(?:单)?", "随附我们的报价单，敬请查收"),
    (r"报价做好了", "报价单已准备完成"),
    (r"有问题(?:再)?联系(?:我|我们)?", "如有任何问题，请随时与我们联系"),
    (r"尽快回复(?:我|我们)?", "请您方便时回复"),
    (r"马上", "尽快"),
    (r"最低价", "有竞争力的价格"),
    (r"我们保证", "我们将尽力确保"),
    (r"明天回复", "预计明天回复"),
]

FIELD_PATTERNS = [
    ("quotation", re.compile(r"报价|价格|单价|总价|成本")),
    ("delivery", re.compile(r"交期|货期|发货|出货|交付|运输")),
    ("documents", re.compile(r"附件|文件|图纸|证书|报价单|数据表|清单")),
    ("commercial", re.compile(r"付款|账期|贸易术语|质保|保函|币种")),
    (
        "technical",
        re.compile(
            r"阀|口径|压力|材质|连接|执行器|标准|型号|"
            r"\b(?:DN|PN|NPS|Class|CL)\s*\d+|"
            r"\b(?:WCB|CF8M?|SS(?:304|316L?)|PTFE|RPTFE|NACE|API|ASME|ASTM)\b",
            re.IGNORECASE,
        ),
    ),
    ("next_step", re.compile(r"确认|回复|反馈|查收|审阅|安排")),
]


def _clean_compose_source(value: Any) -> str:
    text = str(value or "").replace("\u00a0", " ")
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:500]


def _formalize_chinese_sentence(value: str) -> str:
    result = value.strip(" \t\r\n，,；;")
    for pattern, replacement in INFORMAL_REPLY_REWRITES:
        result = re.sub(pattern, replacement, result)
    result = re.sub(r"^(?:你好|您好)[，,：:\s]*", "", result)
    result = re.sub(r"\s*([，。；：！？])\s*", r"\1", result)
    if result and result[-1] not in "。！？!?":
        result += "。"
    return result


def _sentence_parts(value: str) -> list[str]:
    parts = re.split(r"(?<=[。！？!?；;])|\n+", value)
    return [
        sentence
        for sentence in (_formalize_chinese_sentence(part) for part in parts)
        if sentence
    ]


def _field_key(value: str) -> str | None:
    for key, pattern in FIELD_PATTERNS:
        if pattern.search(value):
            return key
    return None


def get_reply_intents() -> dict[str, Any]:
    global _REPLY_INTENTS
    if _REPLY_INTENTS is not None:
        return _REPLY_INTENTS
    path = pathlib.Path(__file__).resolve().parent / "reply_intents_multilingual.json"
    if not path.is_file():
        _REPLY_INTENTS = {
            "name": "lianggu-reply-intents-multilingual",
            "version": "unavailable",
            "intents": [],
            "sources": [],
        }
        return _REPLY_INTENTS
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if payload.get("name") != "lianggu-reply-intents-multilingual":
        raise RuntimeError("Reply intent library identity check failed")
    if not isinstance(payload.get("intents"), list):
        raise RuntimeError("Reply intent library is unavailable")
    seen_ids: set[str] = set()
    for intent in payload["intents"]:
        intent_id = str(intent.get("intent_id") or "").strip()
        if not intent_id or intent_id in seen_ids:
            raise RuntimeError("Reply intent identifier is missing or duplicated")
        seen_ids.add(intent_id)
        patterns = intent.get("trigger_zh_patterns")
        if not isinstance(patterns, list) or not patterns:
            raise RuntimeError(f"Reply intent triggers are missing: {intent_id}")
        for pattern in patterns:
            if len(str(pattern)) > 180:
                raise RuntimeError(f"Reply intent trigger is too long: {intent_id}")
            re.compile(str(pattern))
        if not all(str(intent.get(language) or "").strip() for language in ("zh", "en", "ru", "ar")):
            raise RuntimeError(f"Reply intent translations are incomplete: {intent_id}")
        variables = [
            str(value).strip()
            for value in intent.get("variables", [])
            if str(value).strip()
        ]
        for language in ("zh", "en", "ru", "ar"):
            if set(re.findall(r"\{[a-z][a-z0-9_]*\}", str(intent[language]))) != set(variables):
                raise RuntimeError(f"Reply intent placeholders do not align: {intent_id}")
    _REPLY_INTENTS = payload
    return payload


def _intent_template_match(template: str, source: str) -> dict[str, str] | None:
    pieces = re.split(r"(\{[a-z][a-z0-9_]*\})", template)
    pattern_parts: list[str] = []
    variables: list[str] = []
    for piece in pieces:
        variable_match = re.fullmatch(r"\{([a-z][a-z0-9_]*)\}", piece)
        if variable_match:
            variable = variable_match.group(1)
            variables.append(variable)
            pattern_parts.append(rf"(?P<{variable}>.+?)")
        else:
            escaped = re.escape(piece)
            pattern_parts.append(re.sub(r"(?:\\\s)+", r"\\s*", escaped))
    pattern = re.compile(
        r"^\s*" + "".join(pattern_parts).rstrip(r"\。") + r"[。.!！?？]?\s*$"
    )
    match = pattern.fullmatch(source)
    if not match:
        return None
    return {
        variable: str(match.group(variable) or "").strip(" \t\r\n，,；;。.")
        for variable in variables
    }


def _match_reply_intent(
    source: str,
) -> tuple[dict[str, Any], dict[str, str]] | None:
    normalized_source = str(source or "").strip()
    if not normalized_source:
        return None
    for intent in get_reply_intents()["intents"]:
        variables = _intent_template_match(str(intent["zh"]), normalized_source)
        if (
            variables is None
            and not intent.get("variables")
            and intent.get("allow_pattern_match") is True
            and len(normalized_source) <= 160
        ):
            if any(
                re.search(str(pattern), normalized_source)
                for pattern in intent["trigger_zh_patterns"]
            ):
                variables = {}
        if variables is None:
            continue
        return intent, variables
    return None


def controlled_reply_intent(source: str, target_language: str) -> str | None:
    if target_language not in {"zh", "en", "ru", "ar"}:
        return None
    matched = _match_reply_intent(source)
    if matched is None:
        return None
    intent, variables = matched
    rendered = str(intent[target_language])
    for variable, value in variables.items():
        rendered = rendered.replace(f"{{{variable}}}", value)
    if re.search(r"\{[a-z][a-z0-9_]*\}", rendered):
        return None
    if target_language != "zh" and CJK_PATTERN.search(rendered):
        return None
    return rendered


def matched_reply_intents(source: str) -> list[dict[str, Any]]:
    candidates = [str(source or "").strip(), *_sentence_parts(str(source or ""))]
    output: list[dict[str, Any]] = []
    seen: set[str] = set()
    for candidate in candidates:
        matched = _match_reply_intent(candidate)
        if matched is None:
            continue
        intent, _ = matched
        intent_id = str(intent.get("intent_id") or "").strip()
        if intent_id and intent_id not in seen:
            seen.add(intent_id)
            output.append(intent)
    return output


def reply_intent_review(source: str) -> dict[str, Any]:
    matched = matched_reply_intents(source)
    high_risk_ids = [
        str(intent["intent_id"])
        for intent in matched
        if intent.get("requires_human_review") is True
        or str(intent.get("risk_level") or "").strip().lower() == "high"
    ]
    medium_risk_ids = [
        str(intent["intent_id"])
        for intent in matched
        if str(intent.get("risk_level") or "").strip().lower() == "medium"
    ]
    return {
        "requiresHumanReview": bool(high_risk_ids),
        "highRiskIntentIds": high_risk_ids,
        "mediumRiskIntentIds": medium_risk_ids,
    }


def reply_intent_warning(source: str) -> str | None:
    review = reply_intent_review(source)
    if review["requiresHumanReview"]:
        return (
            "该表达涉及付款、交期、报价、检验或技术承诺等高风险条件，"
            "请复核编号、金额、日期、范围和书面确认边界。"
        )
    if review["mediumRiskIntentIds"]:
        return "该表达包含商务条件，请复核编号、日期、金额及适用范围。"
    return None


def optimize_chinese_reply(value: Any) -> list[dict[str, Any]]:
    source = _clean_compose_source(value)
    if not source or len(CJK_PATTERN.findall(source)) < 6:
        raise ValueError("请输入至少 6 个中文字符的简短回复")

    blocks: list[dict[str, Any]] = [
        {"type": "greeting", "key": "greeting", "text": GREETING_TEXT["zh"]}
    ]
    has_closing = False
    controlled_source = controlled_reply_intent(source, "zh")
    sentences = [controlled_source] if controlled_source else _sentence_parts(source)
    for sentence in sentences:
        sentence = controlled_reply_intent(sentence, "zh") or sentence
        short_thanks = (
            len(sentence) <= 20
            and re.fullmatch(r"(?:谢谢|感谢(?:您的)?(?:配合|支持|理解)?)[。！？]?", sentence)
        )
        if re.search(r"如有任何问题|随时.{0,4}联系|此致|敬礼", sentence) or short_thanks:
            has_closing = True
            blocks.append({"type": "closing", "key": "closing", "text": sentence})
            continue
        key = _field_key(sentence)
        if key:
            blocks.append({"type": "field", "key": key, "text": sentence})
        else:
            blocks.append({"type": "paragraph", "key": "paragraph", "text": sentence})

    if len(blocks) == 1:
        raise ValueError("中文回复内容过短，尚不足以生成邮件")
    if not has_closing:
        blocks.append({"type": "closing", "key": "closing", "text": CLOSING_TEXT["zh"]})
    return blocks


def _reply_terms(custom_terms: Any = None) -> list[dict[str, str]]:
    glossary_terms = get_valve_glossary()["terms"]
    expanded_glossary_terms: list[dict[str, str]] = []
    for term in glossary_terms:
        expanded_glossary_terms.append(term)
        for chinese_alias in term.get("zhAliases", []):
            expanded_glossary_terms.append({**term, "zh": chinese_alias})
    english_custom_terms = [
        term
        for term in sanitize_custom_terms(custom_terms)
        if term.get("sourceLanguage", "en") == "en"
    ]
    return sorted(
        [*english_custom_terms, *expanded_glossary_terms],
        key=lambda item: (len(item.get("zh", "")), len(item.get("en", ""))),
        reverse=True,
    )


def extract_technical_terms(
    source: str,
    custom_terms: Any = None,
) -> tuple[list[str], list[str]]:
    display_terms: list[str] = []
    english_terms: list[str] = []
    occupied_chinese: set[str] = set()
    for term in _reply_terms(custom_terms):
        if term.get("category") in {"business", "business_phrase"}:
            continue
        chinese = str(term.get("zh") or "").strip()
        english = str(term.get("en") or "").strip()
        if not chinese or not english or chinese in occupied_chinese or chinese not in source:
            continue
        occupied_chinese.add(chinese)
        display_terms.append(f"{chinese} / {english}")
        english_terms.append(english)

    for raw_pattern in get_valve_glossary()["preserve_patterns"]:
        for match in re.finditer(raw_pattern, source, re.IGNORECASE):
            token = match.group(0).strip()
            if token:
                display_terms.append(token)
                english_terms.append(token)
    return (
        list(dict.fromkeys(display_terms))[:24],
        list(dict.fromkeys(english_terms))[:24],
    )


def _localized_technical_descriptor(
    source: str,
    target_language: str,
    custom_terms: Any = None,
) -> str:
    values: list[str] = []
    for term in _reply_terms(custom_terms):
        if term.get("category") in {"business", "business_phrase"}:
            continue
        chinese = str(term.get("zh") or "").strip()
        english = str(term.get("en") or "").strip()
        if not chinese or not english or chinese not in source:
            continue
        if target_language in {"ru", "ar"}:
            localized = str(term.get(target_language) or english).strip()
            if target_language == "ru" and localized:
                localized = localized[:1].lower() + localized[1:]
            values.append(localized)
        else:
            values.append(english)
    for raw_pattern in get_valve_glossary()["preserve_patterns"]:
        values.extend(
            match.group(0).strip()
            for match in re.finditer(raw_pattern, source, re.IGNORECASE)
        )
    return " ".join(dict.fromkeys(value for value in values if value))


def _material_facts(source: str, target_language: str) -> list[str]:
    labels = {
        "en": {
            "阀体": "Body material",
            "阀座": "Seat material",
            "阀杆": "Stem material",
            "内件": "Trim material",
        },
        "ru": {
            "阀体": "Материал корпуса",
            "阀座": "Материал седла",
            "阀杆": "Материал штока",
            "内件": "Материал внутренних деталей",
        },
        "ar": {
            "阀体": "مادة جسم الصمام",
            "阀座": "مادة مقعد الصمام",
            "阀杆": "مادة ساق الصمام",
            "内件": "مادة الأجزاء الداخلية",
        },
    }[target_language]
    facts: list[str] = []
    for component, label in labels.items():
        match = re.search(
            rf"{component}(?:材质)?\s*(?:为|是|[:：])?\s*"
            r"([A-Za-z0-9][A-Za-z0-9./+-]{1,30})",
            source,
            re.IGNORECASE,
        )
        if match:
            facts.append(f"{label}: {match.group(1)}")
    return facts


def _localized_duration(source: str, target_language: str) -> str:
    match = re.search(
        r"(?:交期|货期|交付时间)\s*(?:为|是|[:：])?\s*"
        r"([0-9一二三四五六七八九十]+)\s*(个?月|周|天)",
        source,
    )
    if not match:
        return ""
    raw_number, raw_unit = match.groups()
    chinese_numbers = {
        "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
        "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
    }
    number = int(raw_number) if raw_number.isdigit() else chinese_numbers.get(raw_number)
    number_text = str(number) if number is not None else raw_number
    unit = raw_unit.lstrip("个")
    if target_language == "en":
        names = {"天": "day", "周": "week", "月": "month"}
        suffix = "" if number == 1 else "s"
        return f"{number_text} {names[unit]}{suffix}"
    if target_language == "ru":
        if unit == "周":
            word = "неделя" if number == 1 else "недели" if number in {2, 3, 4} else "недель"
        elif unit == "天":
            word = "день" if number == 1 else "дня" if number in {2, 3, 4} else "дней"
        else:
            word = "месяц" if number == 1 else "месяца" if number in {2, 3, 4} else "месяцев"
        return f"{number_text} {word}"
    names = {"天": "أيام", "周": "أسابيع", "月": "أشهر"}
    return f"{number_text} {names[unit]}"


def controlled_reply_translation(
    source: str,
    target_language: str,
    custom_terms: Any = None,
) -> str | None:
    if target_language not in {"en", "ru", "ar"}:
        return None
    intent_translation = controlled_reply_intent(source, target_language)
    if intent_translation:
        return intent_translation
    descriptor = _localized_technical_descriptor(
        source,
        target_language,
        custom_terms,
    )

    if re.search(r"(?:友情|温馨|善意|友好)?提醒", source):
        if re.search(r"(?:付款|支付)", source):
            if re.search(r"(?:确认|状态|情况|进度)", source):
                return {
                    "en": "Just a reminder—please confirm the payment status.",
                    "ru": "Напоминаем Вам: пожалуйста, подтвердите статус оплаты.",
                    "ar": "نود تذكيركم بلطف؛ يرجى تأكيد حالة الدفع.",
                }[target_language]
            if re.search(r"(?:安排|办理|完成)", source):
                return {
                    "en": "Just a reminder—please arrange the payment.",
                    "ru": "Напоминаем Вам: пожалуйста, организуйте оплату.",
                    "ar": "نود تذكيركم بلطف؛ يرجى ترتيب عملية الدفع.",
                }[target_language]
        if re.search(r"(?:回复|反馈)", source):
            return {
                "en": "Just a reminder—we look forward to your reply.",
                "ru": "Напоминаем Вам, что ожидаем Вашего ответа.",
                "ar": "نود تذكيركم بلطف بأننا نتطلع إلى ردكم.",
            }[target_language]

    if re.search(r"报价(?:单)?.{0,8}(?:准备|完成|做好)|报价做好", source):
        if target_language == "en":
            subject = f" for {descriptor}" if descriptor else ""
            result = f"The quotation{subject} is ready."
            if re.search(r"附件|查收|随附", source):
                result += " Please find it attached for your review."
            return result
        if target_language == "ru":
            subject = f" на {descriptor}" if descriptor else ""
            result = f"Коммерческое предложение{subject} готово."
            if re.search(r"附件|查收|随附", source):
                result += " Пожалуйста, ознакомьтесь с приложением."
            return result
        subject = f" الخاص بـ {descriptor}" if descriptor else ""
        result = f"عرض السعر{subject} جاهز."
        if re.search(r"附件|查收|随附", source):
            result += " يرجى الاطلاع على المرفق."
        return result

    if re.search(r"附件.{0,8}图纸|图纸.{0,8}(?:附件|确认)", source):
        materials = _material_facts(source, target_language)
        if target_language == "en":
            result = "Please confirm the attached drawings."
        elif target_language == "ru":
            result = "Пожалуйста, подтвердите приложенные чертежи."
        else:
            result = "يرجى تأكيد الرسومات المرفقة."
        if materials:
            result += f" {'; '.join(materials)}."
        return result

    duration = _localized_duration(source, target_language)
    if duration:
        prefix = f"{descriptor}. " if descriptor else ""
        asks_confirmation = bool(re.search(r"确认", source))
        if target_language == "en":
            result = f"{prefix}Delivery time: {duration}."
            return result + (" Please confirm." if asks_confirmation else "")
        if target_language == "ru":
            result = f"{prefix}Срок поставки: {duration}."
            return result + (" Пожалуйста, подтвердите." if asks_confirmation else "")
        result = f"{prefix}مدة التسليم: {duration}."
        return result + (" يرجى التأكيد." if asks_confirmation else "")

    if re.search(r"收到.{0,8}(?:询价|邮件|资料)|(?:询价|邮件|资料).{0,8}收到", source):
        has_review = bool(re.search(r"技术.{0,8}(?:审核|评审|确认)", source))
        tomorrow = "明天" in source
        if target_language == "en":
            result = "Thank you for your inquiry. We have received it."
            if has_review:
                result += " Our technical team is reviewing the details."
            if tomorrow:
                result += " We will reply tomorrow."
            return result
        if target_language == "ru":
            result = "Благодарим Вас за запрос. Мы его получили."
            if has_review:
                result += " Наша техническая команда проверяет детали."
            if tomorrow:
                result += " Мы ответим завтра."
            return result
        result = "شكرًا لاستفساركم. لقد استلمناه."
        if has_review:
            result += " يقوم فريقنا الفني بمراجعة التفاصيل."
        if tomorrow:
            result += " سنرد عليكم غدًا."
        return result

    if re.search(r"保证|有竞争力的价格|最低价", source) and re.search(r"发货|交付", source):
        if target_language == "en":
            return (
                "We will offer a competitive price and arrange shipment as soon as possible, "
                "subject to final confirmation."
            )
        if target_language == "ru":
            return (
                "Мы предложим конкурентоспособную цену и организуем отгрузку "
                "в кратчайшие сроки после окончательного подтверждения."
            )
        return (
            "سنقدم سعرًا تنافسيًا ونرتب الشحن في أقرب وقت ممكن، "
            "وذلك بعد التأكيد النهائي."
        )

    if re.search(r"附件|随附", source):
        if target_language == "en":
            return "Please find the attachment for your review."
        if target_language == "ru":
            return "Пожалуйста, ознакомьтесь с приложением."
        return "يرجى الاطلاع على المرفق."
    return None


def _protect_reply_terms(
    value: str,
    source_language: str,
    target_language: str,
    custom_terms: Any = None,
) -> tuple[str, list[dict[str, str]]]:
    protected = value
    replacements: list[dict[str, str]] = []

    if source_language == "zh":
        outbound_english = {
            "友情提醒": "Just a reminder",
            "温馨提醒": "This is a gentle reminder",
        }
        for term in _reply_terms(custom_terms):
            chinese = str(term.get("zh") or "").strip()
            english = str(term.get("en") or "").strip()
            if not chinese or not english or chinese not in protected:
                continue
            english = outbound_english.get(chinese, english)
            protected = protected.replace(chinese, english)
    elif source_language == "en" and target_language in {"ru", "ar"}:
        target_terms = [
            term
            for term in _reply_terms(custom_terms)
            if str(term.get(target_language) or "").strip()
        ]
        for term in sorted(
            target_terms,
            key=lambda item: len(str(item.get("en") or "")),
            reverse=True,
        ):
            english = str(term.get("en") or "").strip()
            replacement = str(term.get(target_language) or "").strip()
            if not english or not replacement:
                continue
            parts = [
                re.escape(part)
                for part in re.split(r"[\s-]+", english)
                if part
            ]
            term_pattern = re.compile(
                r"(?<![\w])(?:the\s+)?"
                + r"[\s-]+".join(parts)
                + r"(?![\w])",
                re.IGNORECASE,
            )

            def protect_target_term(match: re.Match[str]) -> str:
                token = f"[RPL{len(replacements):03d}]"
                replacements.append(
                    {
                        "token": token,
                        "source": match.group(0),
                        "replacement": replacement,
                    }
                )
                return token

            protected = term_pattern.sub(protect_target_term, protected)

    for raw_pattern in get_valve_glossary()["preserve_patterns"]:
        def protect_code(match: re.Match[str]) -> str:
            token = f"[RPL{len(replacements):03d}]"
            replacements.append(
                {
                    "token": token,
                    "source": match.group(0),
                    "replacement": match.group(0),
                }
            )
            return token

        protected = re.sub(
            raw_pattern,
            protect_code,
            protected,
            flags=re.IGNORECASE,
        )
    protected = re.sub(r"\s{2,}", " ", protected).strip()
    protected = re.sub(r"\(\s*[;,،；\s]*\)", "", protected)
    return protected, replacements


def _restore_reply_terms(
    translated: str,
    replacements: list[dict[str, str]],
) -> str:
    result = translated
    missing: list[str] = []
    for index, item in enumerate(replacements):
        if not item["token"]:
            if item["replacement"] not in result:
                missing.append(item["replacement"])
            continue
        token_pattern = re.compile(
            rf"\[\s*RPL\s*0*{index}\s*\]",
            re.IGNORECASE,
        )
        result, count = token_pattern.subn(item["replacement"], result)
        if count == 0 and item["replacement"] not in result:
            missing.append(item["replacement"])
    result = result.replace("▁", " ")
    if missing:
        result = f"{result.rstrip()} ({'; '.join(dict.fromkeys(missing))})"
    return re.sub(r"\s+([,.;:!?])", r"\1", result).strip()


def _post_process_reply_translation(
    value: str,
    target_language: str,
) -> str:
    result = html_unescape(value).replace("▁", " ")
    result = re.sub(r"\s{2,}", " ", result).strip(" \t\r\n\"'")
    if target_language == "en":
        result = (
            result.replace("check the attachment", "review the attachment")
            .replace("Check the attachment", "Review the attachment")
        )
        result = re.sub(
            r"^(.+?)\s+Quotation Sheet is ready\.",
            r"The quotation for the \1 is ready.",
            result,
        )
    elif target_language == "ru":
        result = re.sub(
            r"\b(?:Квотный|Котировочный)\s+лист\b",
            "Коммерческое предложение",
            result,
            flags=re.IGNORECASE,
        )
        result = result.replace(
            "Коммерческое предложение готов.",
            "Коммерческое предложение готово.",
        )
        result = (
            result.replace(
                "Цитата для указанного клапана готова.",
                "Коммерческое предложение на указанный клапан готово.",
            )
            .replace(
                "Пожалуйста, проверьте крепление.",
                "Пожалуйста, ознакомьтесь с приложением.",
            )
        )
    elif target_language == "ar":
        result = (
            result.replace("صحيفة التأجير", "عرض السعر")
            .replace("صحيفة الاقتباس", "عرض السعر")
            .replace("ورقة الاقتباس", "عرض السعر")
            .replace("صحيفة الحصص", "عرض السعر")
            .replace("اقتباس الصمام المحدد جاهز", "عرض السعر للصمام المحدد جاهز")
            .replace("إعادة النظر في الملحق", "الاطلاع على المرفق")
        )
    return result


def translate_reply_texts(
    texts: list[str],
    source_language: str,
    target_language: str,
    custom_terms: Any = None,
) -> list[str]:
    protected_texts: list[str] = []
    replacement_batches: list[list[dict[str, str]]] = []
    for text in texts:
        protected, replacements = _protect_reply_terms(
            text,
            source_language,
            target_language,
            custom_terms,
        )
        protected_texts.append(protected)
        replacement_batches.append(replacements)
    translated = get_directional_engine(
        source_language,
        target_language,
    ).translate_batch(protected_texts)
    output: list[str] = []
    for index, source in enumerate(texts):
        value = translated[index].strip() if index < len(translated) else ""
        restored = _post_process_reply_translation(
            _restore_reply_terms(value, replacement_batches[index]),
            target_language,
        )
        if not restored:
            raise RuntimeError(
                f"Offline reply model {source_language} to {target_language} returned no text"
            )
        if restored.casefold().strip("。.!！?？") == source.casefold().strip("。.!！?？"):
            raise RuntimeError(
                f"Offline reply model {source_language} to {target_language} did not translate"
            )
        output.append(restored)
    return output


def _candidate_from_blocks(
    source_blocks: list[dict[str, Any]],
    target_language: str,
    custom_terms: Any = None,
    english_anchor_terms: list[str] | None = None,
    english_content_by_id: dict[int, str] | None = None,
) -> dict[str, Any]:
    if target_language == "zh":
        translated_texts = [block["text"] for block in source_blocks]
    else:
        content_blocks = [
            block for block in source_blocks
            if block["key"] not in {"greeting", "closing"}
        ]
        english_texts = [
            (english_content_by_id or {})[id(block)]
            for block in content_blocks
        ]
        if target_language == "en":
            translated_content = [
                controlled_reply_translation(
                    block["text"],
                    "en",
                    custom_terms,
                ) or english_texts[index]
                for index, block in enumerate(content_blocks)
            ]
        else:
            translated_content: list[str] = [""] * len(content_blocks)
            unresolved_indexes: list[int] = []
            for index, block in enumerate(content_blocks):
                controlled = controlled_reply_translation(
                    block["text"],
                    target_language,
                    custom_terms,
                )
                if controlled:
                    translated_content[index] = controlled
                else:
                    unresolved_indexes.append(index)
            if unresolved_indexes:
                fallback = translate_reply_texts(
                    [english_texts[index] for index in unresolved_indexes],
                    "en",
                    target_language,
                    custom_terms,
                )
                for fallback_index, content_index in enumerate(unresolved_indexes):
                    translated_content[content_index] = fallback[fallback_index]
        translated_by_id = {
            id(block): translated_content[index]
            for index, block in enumerate(content_blocks)
        }
        translated_texts = [
            GREETING_TEXT[target_language]
            if block["key"] == "greeting"
            else CLOSING_TEXT[target_language]
            if block["key"] == "closing"
            else translated_by_id[id(block)]
            for block in source_blocks
        ]

    blocks: list[dict[str, Any]] = []
    for index, source_block in enumerate(source_blocks):
        key = source_block["key"]
        block = {
            "type": source_block["type"],
            "text": translated_texts[index],
        }
        if source_block["type"] == "field":
            block["label"] = FIELD_LABELS[target_language][key]
            block["emphasis"] = True
        blocks.append(block)

    if target_language in {"en", "ru", "ar"} and english_anchor_terms:
        localized_anchor_terms = english_anchor_terms
        if target_language in {"ru", "ar"}:
            glossary_by_english = {
                str(term.get("en") or "").casefold(): term
                for term in get_valve_glossary()["terms"]
            }
            localized_anchor_terms = []
            for english_term in english_anchor_terms:
                glossary_term = glossary_by_english.get(english_term.casefold())
                localized = str(
                    (glossary_term or {}).get(target_language) or ""
                ).strip()
                localized_anchor_terms.append(
                    f"{localized} / {english_term}" if localized else english_term
                )
        blocks.insert(
            max(1, len(blocks) - 1),
            {
                "type": "field",
                "label": FIELD_LABELS[target_language]["technical_anchor"],
                "text": "; ".join(localized_anchor_terms),
                "emphasis": True,
            },
        )
    language_meta = {
        "zh": ("中文", "中文", "zh-CN", "ltr"),
        "en": ("英语", "English", "en", "ltr"),
        "ru": ("俄语", "Русский", "ru", "ltr"),
        "ar": ("阿拉伯语", "العربية", "ar", "rtl"),
    }[target_language]
    return {
        "code": target_language,
        "label": language_meta[0],
        "nativeLabel": language_meta[1],
        "lang": language_meta[2],
        "direction": language_meta[3],
        "blocks": blocks,
    }


def compose_reply_warnings(source: str) -> list[str]:
    warnings: list[str] = []
    intent_warning = reply_intent_warning(source)
    if intent_warning:
        warnings.append(intent_warning)
    if re.search(r"保证|一定|百分之百|终身|绝对", source):
        warnings.append("原文包含承诺性措辞，请确认后再发送。")
    if re.search(r"价格|报价|交期|付款|质保|今天|明天|本周|下周|\d", source):
        warnings.append("涉及数字、时间、价格、交期或条款时，请以最终审核结果为准。")
    return warnings


def create_compose_suggestions(
    value: Any,
    custom_terms: Any = None,
) -> dict[str, Any]:
    source = _clean_compose_source(value)
    source_blocks = optimize_chinese_reply(source)
    display_terms, english_terms = extract_technical_terms(source, custom_terms)
    content_blocks = [
        block for block in source_blocks
        if block["key"] not in {"greeting", "closing"}
    ]
    english_content: list[str] = [""] * len(content_blocks)
    unresolved_english: list[int] = []
    for index, block in enumerate(content_blocks):
        controlled = controlled_reply_translation(
            block["text"],
            "en",
            custom_terms,
        )
        if controlled:
            english_content[index] = controlled
        else:
            unresolved_english.append(index)
    if unresolved_english:
        fallback_english = translate_reply_texts(
            [content_blocks[index]["text"] for index in unresolved_english],
            "zh",
            "en",
            custom_terms,
        )
        for fallback_index, content_index in enumerate(unresolved_english):
            english_content[content_index] = fallback_english[fallback_index]
    english_content_by_id = {
        id(block): english_content[index]
        for index, block in enumerate(content_blocks)
    }
    intent_review = reply_intent_review(source)
    return {
        "ok": True,
        "engine": "argos-offline",
        "optimizedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "replyIntentVersion": get_reply_intents().get("version", "unavailable"),
        "technicalTerms": display_terms,
        "warnings": compose_reply_warnings(source),
        **intent_review,
        "candidates": [
            _candidate_from_blocks(
                source_blocks,
                language,
                custom_terms,
                english_terms,
                english_content_by_id,
            )
            for language in ("zh", "en", "ru", "ar")
        ],
    }


def handle_message(request: dict[str, Any]) -> dict[str, Any]:
    request_type = request.get("type")
    if request_type == "health":
        get_translation_engine()
        glossary = get_glossary_metadata()
        reply_intents = get_reply_intents()
        model = get_active_model_metadata()
        russian_models = discover_model_roots("ru", "en")
        arabic_models = discover_model_roots("ar", "en")
        return {
            "ok": True,
            "engine": "argos-offline",
            "source": "en",
            "sources": [
                "en",
                *(["ru"] if russian_models else []),
                *(["ar"] if arabic_models else []),
            ],
            "target": "zh",
            "terminology": glossary["name"],
            "terminologyVersion": glossary["version"],
            "termCount": glossary["termCount"],
            "multilingualTermCount": glossary["multilingualTermCount"],
            "russianTermCount": glossary["russianTermCount"],
            "arabicTermCount": glossary["arabicTermCount"],
            "terminologySourceCount": glossary["sourceCount"],
            "replyIntentVersion": reply_intents.get("version", "unavailable"),
            "replyIntentCount": len(reply_intents.get("intents", [])),
            "replyIntentSourceCount": len(reply_intents.get("sources", [])),
            "russianModelId": _model_id(russian_models[0]) if russian_models else "",
            "arabicModelId": _model_id(arabic_models[0]) if arabic_models else "",
            **model,
        }

    if request_type == "benchmark":
        benchmark = benchmark_translation_models(request.get("customTerms"))
        glossary = get_glossary_metadata()
        return {
            "ok": True,
            "engine": "argos-offline",
            "terminology": glossary["name"],
            "terminologyVersion": glossary["version"],
            "termCount": glossary["termCount"],
            **benchmark,
        }

    if request_type == "compose_suggest":
        requested_targets = request.get("targets")
        if requested_targets != ["zh", "en", "ru", "ar"]:
            return {"ok": False, "message": "Four-language reply targets are required"}
        return create_compose_suggestions(
            request.get("text"),
            request.get("customTerms"),
        )

    if request_type != "translate":
        return {"ok": False, "message": "Unsupported native host request"}

    source_language = request.get("source", "en")
    if source_language not in {"en", "ru", "ar"} or request.get("target", "zh") != "zh":
        return {
            "ok": False,
            "message": "Only English, Russian, or Arabic to Chinese translation is enabled",
        }

    texts = sanitize_texts(request.get("texts"))
    if source_language == "ru":
        translate_batch = translate_russian_to_chinese_batch
    elif source_language == "ar":
        translate_batch = translate_arabic_to_chinese_batch
    else:
        translate_batch = get_translation_engine().translate_batch
    translated_texts = translate_with_glossary(
        texts,
        translate_batch,
        request.get("customTerms"),
        source_language=source_language,
    )
    if source_language in {"ru", "ar"}:
        pivot_models = discover_model_roots(source_language, "en")
        if not pivot_models:
            language_name = "Russian" if source_language == "ru" else "Arabic"
            raise RuntimeError(f"{language_name} to English offline model is not installed")
        model = {
            "modelId": f"{_model_id(pivot_models[0])}+{get_active_model_metadata()['modelId']}",
            "candidateCount": len(pivot_models),
        }
    else:
        model = get_active_model_metadata()
    return {
        "ok": True,
        "engine": "argos-offline",
        "source": source_language,
        "target": "zh",
        "terminology": get_valve_glossary()["name"],
        "terminologyVersion": get_valve_glossary().get("version", "unknown"),
        "customTermCount": len(sanitize_custom_terms(request.get("customTerms"))),
        **model,
        "translations": translated_texts,
    }


def self_test() -> int:
    translation_response = handle_message(
        {
            "type": "translate",
            "source": "en",
            "target": "zh",
            "texts": [
                "Please quote your best price and delivery time.",
                "Ball valve DN50 PN16 WCB.",
            ],
        }
    )
    reply_response = handle_message(
        {
            "type": "compose_suggest",
            "source": "zh",
            "targets": ["zh", "en", "ru", "ar"],
            "text": "球阀 DN50 PN16 报价做好了，请查收附件。",
        }
    )
    russian_response = handle_message(
        {
            "type": "translate",
            "source": "ru",
            "target": "zh",
            "texts": ["Шаровой кран DN50 PN16."],
        }
    )
    arabic_response = handle_message(
        {
            "type": "translate",
            "source": "ar",
            "target": "zh",
            "texts": ["صمام كروي DN50 PN16."],
        }
    )
    response = {
        "translation": translation_response,
        "russianTranslation": russian_response,
        "arabicTranslation": arabic_response,
        "composeAssistant": reply_response,
    }
    print(json.dumps(response, ensure_ascii=False, indent=2))
    candidates = reply_response.get("candidates", [])
    candidate_text = {
        candidate.get("code"): " ".join(
            block.get("text", "") for block in candidate.get("blocks", [])
        )
        for candidate in candidates
    }
    return 0 if (
        translation_response.get("ok")
        and len(translation_response.get("translations", [])) == 2
        and russian_response.get("ok")
        and "球阀" in russian_response.get("translations", [""])[0]
        and arabic_response.get("ok")
        and "球阀" in arabic_response.get("translations", [""])[0]
        and [candidate.get("code") for candidate in candidates] == ["zh", "en", "ru", "ar"]
        and all(
            token in candidate_text.get("en", "")
            for token in ("Ball Valve", "DN50", "PN16")
        )
        and "Коммерческое предложение" in candidate_text.get("ru", "")
        and "عرض السعر" in candidate_text.get("ar", "")
        and all("▁" not in text for text in candidate_text.values())
    ) else 1


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()

    while True:
        try:
            request = read_message()
            if request is None:
                return 0
            write_message(handle_message(request))
        except Exception as error:  # Native hosts must reply instead of leaking tracebacks to stdout.
            write_message({"ok": False, "message": str(error)})
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
