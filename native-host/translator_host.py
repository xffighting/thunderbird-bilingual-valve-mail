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
from typing import Any

MAX_NATIVE_MESSAGE_BYTES = 1_048_576
MAX_LINES = 80
MAX_LINE_LENGTH = 1_200
MAX_TOTAL_LENGTH = 24_000
_ENGINE = None
_ENGINE_ROOT = None
_ENGINE_CACHE: dict[str, Any] = {}
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
        by_english[english.casefold()] = {
            "en": english,
            "zh": chinese,
            "category": str(value.get("category") or "custom")[:40],
            "context": "valve" if value.get("context") == "valve" else "always",
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


def protect_valve_terms(
    source: str,
    custom_terms: Any = None,
) -> tuple[str, list[dict[str, str]]]:
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

    terms = sorted(
        [*sanitize_custom_terms(custom_terms), *glossary["terms"]],
        key=lambda item: len(item["en"]),
        reverse=True,
    )
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
    custom_terms: Any = None,
) -> list[str]:
    protected_texts: list[str] = []
    replacement_batches: list[list[dict[str, str]]] = []
    for source in texts:
        protected, replacements = protect_valve_terms(source, custom_terms)
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
    (r"看看附件", "请查收随附文件"),
    (r"请看附件", "请查收随附文件"),
    (r"附件是报价(?:单)?", "随附我们的报价单，敬请查收"),
    (r"报价做好了", "报价单已准备完成"),
    (r"有问题(?:再)?联系(?:我|我们)?", "如有任何问题，请随时与我们联系"),
    (r"尽快回复(?:我|我们)?", "请您方便时回复"),
    (r"马上", "尽快"),
    (r"最低价", "有竞争力的价格"),
]

FIELD_PATTERNS = [
    (
        "technical",
        re.compile(
            r"阀|口径|压力|材质|连接|执行器|标准|型号|"
            r"\b(?:DN|PN|NPS|Class|CL)\s*\d+|"
            r"\b(?:WCB|CF8M?|SS(?:304|316L?)|PTFE|RPTFE|NACE|API|ASME|ASTM)\b",
            re.IGNORECASE,
        ),
    ),
    ("quotation", re.compile(r"报价|价格|单价|总价|成本")),
    ("delivery", re.compile(r"交期|货期|发货|出货|交付|运输")),
    ("documents", re.compile(r"附件|文件|图纸|证书|报价单|数据表|清单")),
    ("commercial", re.compile(r"付款|账期|贸易术语|质保|保函|币种")),
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


def optimize_chinese_reply(value: Any) -> list[dict[str, Any]]:
    source = _clean_compose_source(value)
    if not source or len(CJK_PATTERN.findall(source)) < 6:
        raise ValueError("请输入至少 6 个中文字符的简短回复")

    blocks: list[dict[str, Any]] = [
        {"type": "greeting", "key": "greeting", "text": GREETING_TEXT["zh"]}
    ]
    has_closing = False
    for sentence in _sentence_parts(source):
        if re.search(r"如有任何问题|随时.{0,4}联系|此致|敬礼|谢谢|感谢", sentence):
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
    return sorted(
        [*sanitize_custom_terms(custom_terms), *glossary_terms],
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


def _protect_reply_terms(
    value: str,
    source_language: str,
    custom_terms: Any = None,
) -> tuple[str, list[dict[str, str]]]:
    protected = value
    replacements: list[dict[str, str]] = []

    def replacement_token(raw_source: str, target_value: str) -> str:
        token = f"[RPL{len(replacements):03d}]"
        replacements.append(
            {"token": token, "source": raw_source, "replacement": target_value}
        )
        return token

    if source_language == "zh":
        for term in _reply_terms(custom_terms):
            chinese = str(term.get("zh") or "").strip()
            english = str(term.get("en") or "").strip()
            if not chinese or not english:
                continue
            protected = protected.replace(
                chinese,
                replacement_token(chinese, english),
            )

    for raw_pattern in get_valve_glossary()["preserve_patterns"]:
        protected = re.sub(
            raw_pattern,
            lambda match: replacement_token(match.group(0), match.group(0)),
            protected,
            flags=re.IGNORECASE,
        )
    return protected, replacements


def _restore_reply_terms(
    translated: str,
    replacements: list[dict[str, str]],
) -> str:
    result = translated
    missing: list[str] = []
    for index, item in enumerate(replacements):
        token_pattern = re.compile(
            rf"\[\s*RPL\s*0*{index}\s*\]",
            re.IGNORECASE,
        )
        result, count = token_pattern.subn(item["replacement"], result)
        if count == 0 and item["replacement"] not in result:
            missing.append(item["replacement"])
    if missing:
        result = f"{result.rstrip()} ({'; '.join(dict.fromkeys(missing))})"
    return re.sub(r"\s+([,.;:!?])", r"\1", result).strip()


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
        restored = _restore_reply_terms(value, replacement_batches[index])
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
) -> dict[str, Any]:
    if target_language == "zh":
        translated_texts = [block["text"] for block in source_blocks]
    else:
        content_blocks = [
            block for block in source_blocks
            if block["key"] not in {"greeting", "closing"}
        ]
        chinese_texts = [block["text"] for block in content_blocks]
        english_texts = translate_reply_texts(
            chinese_texts,
            "zh",
            "en",
            custom_terms,
        )
        if target_language == "en":
            translated_content = english_texts
        else:
            translated_content = translate_reply_texts(
                english_texts,
                "en",
                target_language,
                custom_terms,
            )
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

    if target_language in {"ru", "ar"} and english_anchor_terms:
        blocks.insert(
            max(1, len(blocks) - 1),
            {
                "type": "field",
                "label": FIELD_LABELS[target_language]["technical_anchor"],
                "text": "; ".join(english_anchor_terms),
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
    if re.search(r"保证|一定|百分之百|终身|绝对", source):
        warnings.append("原文包含承诺性措辞，请确认后再发送。")
    if re.search(r"价格|报价|交期|付款|质保|\d", source):
        warnings.append("涉及数字、价格、交期或条款时，请以最终审核结果为准。")
    return warnings


def create_compose_suggestions(
    value: Any,
    custom_terms: Any = None,
) -> dict[str, Any]:
    source = _clean_compose_source(value)
    source_blocks = optimize_chinese_reply(source)
    display_terms, english_terms = extract_technical_terms(source, custom_terms)
    return {
        "ok": True,
        "engine": "argos-offline",
        "optimizedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "technicalTerms": display_terms,
        "warnings": compose_reply_warnings(source),
        "candidates": [
            _candidate_from_blocks(
                source_blocks,
                language,
                custom_terms,
                english_terms,
            )
            for language in ("zh", "en", "ru", "ar")
        ],
    }


def handle_message(request: dict[str, Any]) -> dict[str, Any]:
    request_type = request.get("type")
    if request_type == "health":
        get_translation_engine()
        glossary = get_glossary_metadata()
        model = get_active_model_metadata()
        return {
            "ok": True,
            "engine": "argos-offline",
            "source": "en",
            "target": "zh",
            "terminology": glossary["name"],
            "terminologyVersion": glossary["version"],
            "termCount": glossary["termCount"],
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

    if request.get("source", "en") != "en" or request.get("target", "zh") != "zh":
        return {"ok": False, "message": "Only English to Chinese translation is enabled"}

    texts = sanitize_texts(request.get("texts"))
    translated_texts = translate_with_glossary(
        texts,
        get_translation_engine().translate_batch,
        request.get("customTerms"),
    )
    model = get_active_model_metadata()
    return {
        "ok": True,
        "engine": "argos-offline",
        "terminology": get_valve_glossary()["name"],
        "terminologyVersion": get_valve_glossary().get("version", "unknown"),
        "customTermCount": len(sanitize_custom_terms(request.get("customTerms"))),
        **model,
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
