#!/usr/bin/env python3
"""Offline Argos Translate native-messaging host for Thunderbird."""

from __future__ import annotations

import json
import os
import pathlib
import re
import struct
import sys
from typing import Any

MAX_NATIVE_MESSAGE_BYTES = 1_048_576
MAX_LINES = 80
MAX_LINE_LENGTH = 1_200
MAX_TOTAL_LENGTH = 24_000
_ENGINE = None
_GLOSSARY = None
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
    def __init__(self) -> None:
        import ctranslate2
        import sentencepiece

        model_root = pathlib.Path(
            os.environ.get(
                "LIANGGU_TRANSLATION_MODEL_DIR",
                pathlib.Path(__file__).resolve().parent / "model",
            )
        )
        model_path = model_root / "model"
        tokenizer_path = model_root / "sentencepiece.model"
        if not model_path.is_dir() or not tokenizer_path.is_file():
            raise RuntimeError("English to Chinese offline model is not installed")

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


def get_translation_engine() -> TranslationEngine:
    global _ENGINE
    if _ENGINE is None:
        _ENGINE = TranslationEngine()
    return _ENGINE


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
    _GLOSSARY = glossary
    return glossary


def get_glossary_metadata() -> dict[str, Any]:
    glossary = get_valve_glossary()
    return {
        "name": glossary["name"],
        "version": glossary.get("version", "unknown"),
        "termCount": len(glossary["terms"]),
        "sourceCount": len(glossary.get("sources", [])),
    }


def _phrase_pattern(value: str) -> re.Pattern[str]:
    parts = [re.escape(part) for part in re.split(r"[\s-]+", value.strip()) if part]
    return re.compile(
        r"(?<![A-Za-z0-9])" + r"[\s-]+".join(parts) + r"(?![A-Za-z0-9])",
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


def protect_valve_terms(source: str) -> tuple[str, list[dict[str, str]]]:
    glossary = get_valve_glossary()
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

    terms = sorted(glossary["terms"], key=lambda item: len(item["en"]), reverse=True)
    for term in terms:
        if term.get("context") == "valve" and not valve_context:
            continue
        protected = _phrase_pattern(term["en"]).sub(
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
) -> list[str]:
    protected_texts: list[str] = []
    replacement_batches: list[list[dict[str, str]]] = []
    for source in texts:
        protected, replacements = protect_valve_terms(source)
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

    return result


def handle_message(request: dict[str, Any]) -> dict[str, Any]:
    request_type = request.get("type")
    if request_type == "health":
        get_translation_engine()
        glossary = get_glossary_metadata()
        return {
            "ok": True,
            "engine": "argos-offline",
            "source": "en",
            "target": "zh",
            "terminology": glossary["name"],
            "terminologyVersion": glossary["version"],
            "termCount": glossary["termCount"],
        }

    if request_type != "translate":
        return {"ok": False, "message": "Unsupported native host request"}

    if request.get("source", "en") != "en" or request.get("target", "zh") != "zh":
        return {"ok": False, "message": "Only English to Chinese translation is enabled"}

    texts = sanitize_texts(request.get("texts"))
    translated_texts = translate_with_glossary(
        texts,
        get_translation_engine().translate_batch,
    )
    return {
        "ok": True,
        "engine": "argos-offline",
        "terminology": get_valve_glossary()["name"],
        "translations": translated_texts,
    }


def self_test() -> int:
    response = handle_message(
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
    print(json.dumps(response, ensure_ascii=False, indent=2))
    return 0 if response.get("ok") and len(response.get("translations", [])) == 2 else 1


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
