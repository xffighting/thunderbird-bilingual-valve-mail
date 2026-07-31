#!/usr/bin/env python3

from translator_host import (
    benchmark_score,
    _protect_reply_terms,
    _restore_reply_terms,
    compose_reply_warnings,
    controlled_reply_intent,
    controlled_reply_translation,
    extract_technical_terms,
    get_glossary_metadata,
    get_reply_intents,
    is_usable_translation,
    optimize_chinese_reply,
    post_process_translation,
    protect_valve_terms,
    reply_intent_review,
    restore_valve_terms,
    sanitize_custom_terms,
    translate_with_glossary,
)


def main() -> None:
    reply_blocks = optimize_chinese_reply(
        "球阀DN50 PN16报价做好了，请查收附件。交期四周。"
    )
    assert reply_blocks[0] == {
        "type": "greeting",
        "key": "greeting",
        "text": "您好，",
    }
    assert any(
        block["type"] == "field" and block["key"] == "quotation"
        for block in reply_blocks
    )
    assert reply_blocks[-1]["type"] == "closing"
    display_terms, english_terms = extract_technical_terms(
        "球阀 DN50 PN16 WCB"
    )
    assert "球阀 / Ball Valve" in display_terms
    assert {"Ball Valve", "DN50", "PN16", "WCB"}.issubset(set(english_terms))
    assert not any("Please" in term for term in english_terms)
    assert compose_reply_warnings("报价为100美元，交期四周。")
    assert controlled_reply_translation(
        "球阀 DN50 PN16 报价单已准备完成，请查收附件。",
        "en",
    ) == (
        "The quotation for Ball Valve DN50 PN16 is ready. "
        "Please find it attached for your review."
    )
    assert "Коммерческое предложение" in controlled_reply_translation(
        "球阀 DN50 PN16 报价单已准备完成，请查收附件。",
        "ru",
    )
    assert "عرض السعر" in controlled_reply_translation(
        "球阀 DN50 PN16 报价单已准备完成，请查收附件。",
        "ar",
    )

    custom_terms = sanitize_custom_terms(
        [
            {"en": "quotation sheet", "zh": "正式报价单", "enabled": True},
            {"en": "Quotation Sheet", "zh": "报价单", "enabled": False},
            {"en": "", "zh": "无效"},
        ]
    )
    assert custom_terms == [
        {
            "en": "quotation sheet",
            "zh": "正式报价单",
            "category": "custom",
            "context": "always",
            "sourceLanguage": "en",
        }
    ]

    assert (
        post_process_translation(
            "Please quote your best price and delivery time.",
            "请引用你最好的价格和交货时间。",
        )
        == "请提供最优价格和交期。"
    )
    assert (
        post_process_translation(
            "Please provide the lead time.",
            "请提供交货时间。",
        )
        == "请提供交期。"
    )
    assert (
        post_process_translation(
            "Ball valve DN50 PN16 WCB.",
            "球阀 DN50 PN16 WCB.",
        )
        == "球阀 DN50 PN16 WCB."
    )

    source = "Globe Valve body, bonnet, stem and seat: DN50 PN16 WCB, RF."
    protected, replacements = protect_valve_terms(source)
    assert "Globe Valve" not in protected
    assert "DN50" not in protected
    assert len(replacements) >= 8
    restored = restore_valve_terms(protected, replacements)
    assert restored == "截止阀 阀体, 阀盖, 阀杆 and 阀座: DN50 PN16 WCB, RF."
    restored_placeholder_only = restore_valve_terms(
        f"{protected.rstrip('.')} (英语).",
        replacements,
    )
    assert restored_placeholder_only == restored
    restored_compacted = restore_valve_terms(
        protected.replace("] [", "]["),
        replacements,
    )
    assert restored_compacted == restored

    ordinary_text = "The ball is on the seat."
    ordinary_protected, ordinary_replacements = protect_valve_terms(ordinary_text)
    assert ordinary_protected == ordinary_text
    assert ordinary_replacements == []

    for body_source in (
        "Body",
        "Body:",
        "Body material",
        "BODY MATERIAL:",
        "Body / Bonnet",
        "Body: ASTM A216 WCB",
    ):
        body_protected, body_replacements = protect_valve_terms(body_source)
        assert "body" not in body_protected.lower(), body_source
        assert any(
            item["replacement"] in {"阀体", "阀体材质"}
            for item in body_replacements
        ), body_source

    for ordinary_body_source in (
        "The human body needs water.",
        "The body of this email has two paragraphs.",
    ):
        ordinary_body_protected, ordinary_body_replacements = protect_valve_terms(
            ordinary_body_source
        )
        assert ordinary_body_protected == ordinary_body_source
        assert ordinary_body_replacements == []

    factory_source = "We are a professional valve factory."
    factory_protected, factory_replacements = protect_valve_terms(factory_source)
    assert "factory" not in factory_protected.lower()
    assert any(
        item["replacement"] == "工厂"
        for item in factory_replacements
    )
    assert is_usable_translation(
        "We are a professional valve factory.",
        "我们是一家专业的阀门工厂。",
    )
    assert not is_usable_translation(
        "Please confirm the attached commercial offer.",
        "鹰嘴" * 80,
    )

    quotation_source = "Please find the quotation sheet attached for your reference."
    quotation_protected, quotation_replacements = protect_valve_terms(
        quotation_source
    )
    assert "quotation" not in quotation_protected.lower()
    assert any(
        "报价单" in item["replacement"]
        for item in quotation_replacements
    )
    cleaned_symbols = post_process_translation(
        quotation_source,
        "请查收随附的报价单，__供您参考。__",
    )
    assert cleaned_symbols == "请查收随附的报价单，供您参考。"
    common_business_translation = translate_with_glossary(
        [
            "Sorry to keep you waiting. "
            "Please find the quotation sheet attached for your reference. "
            "Kindly check it at your convenience."
        ],
        lambda texts: texts,
    )[0]
    for expected_phrase in (
        "抱歉让您久等了",
        "请查收随附的报价单，供您参考",
        "请您方便时查阅",
    ):
        assert expected_phrase in common_business_translation
    assert "_" not in common_business_translation

    soft_reminder_translation = translate_with_glossary(
        ["Soft reminder: please confirm the payment status."],
        lambda texts: texts,
    )[0]
    assert "友情提醒" in soft_reminder_translation
    assert "软提醒" not in soft_reminder_translation
    assert post_process_translation(
        "Soft reminder: please confirm the payment status.",
        "友情提醒:请确认支付状况.",
    ) == "友情提醒：请确认付款状态。"
    outbound_reminder, _ = _protect_reply_terms(
        "友情提醒，请确认付款状态。",
        "zh",
        "en",
    )
    assert "Just a reminder" in outbound_reminder
    assert "Soft Reminder" not in outbound_reminder
    assert controlled_reply_translation(
        "友情提醒，请确认付款状态。",
        "en",
    ) == "Just a reminder—please confirm the payment status."
    assert controlled_reply_translation(
        "友情提醒，请确认付款状态。",
        "ru",
    ) == "Напоминаем Вам: пожалуйста, подтвердите статус оплаты."
    assert controlled_reply_translation(
        "友情提醒，请确认付款状态。",
        "ar",
    ) == "نود تذكيركم بلطف؛ يرجى تأكيد حالة الدفع."

    reply_intents = get_reply_intents()
    assert reply_intents["name"] == "lianggu-reply-intents-multilingual"
    assert reply_intents["version"] == "2026.07.30.4"
    assert len(reply_intents["intents"]) == 32
    assert sum(
        intent.get("requires_human_review") is True
        for intent in reply_intents["intents"]
    ) == 22
    assert all(
        intent.get("allow_pattern_match") is False
        for intent in reply_intents["intents"]
    )
    quotation_intent_source = (
        "随附报价单 Q-2026-071，有效期至 2026-08-15。"
        "请重点核对技术范围、数量、贸易术语和交期。"
    )
    assert controlled_reply_intent(quotation_intent_source, "en") == (
        "Please find quotation Q-2026-071 attached, valid until 2026-08-15. "
        "Kindly review the technical scope, quantities, Incoterms rule and lead time."
    )
    assert "Q-2026-071" in controlled_reply_intent(
        quotation_intent_source,
        "ru",
    )
    assert "2026-08-15" in controlled_reply_intent(
        quotation_intent_source,
        "ar",
    )
    high_risk_source = (
        "根据已确认的付款条件，USD 10,000 应于 2026-08-15 前支付。"
        "请确认能否按期安排。"
    )
    review = reply_intent_review(high_risk_source)
    assert review["requiresHumanReview"] is True
    assert review["highRiskIntentIds"] == ["payment_due_by_date"]
    assert controlled_reply_intent(high_risk_source, "en") == (
        "Under the agreed payment terms, USD 10,000 is due by 2026-08-15. "
        "Please confirm whether payment can be arranged by that date."
    )
    for negative_source in (
        "不可以参与报价。",
        "无法出席投标前会议。",
        "停止操作供应商门户。",
        "确认电源已满足。",
        "这不是预算报价。",
    ):
        assert controlled_reply_intent(negative_source, "en") is None
        assert reply_intent_review(negative_source)["requiresHumanReview"] is False
    outward_english = [intent["en"].casefold() for intent in reply_intents["intents"]]
    assert all("soft reminder" not in value for value in outward_english)
    for intent in reply_intents["intents"]:
        for forbidden in intent.get("do_not_use", []):
            assert str(forbidden).casefold() not in outward_english

    translated = translate_with_glossary(
        [
            "Please quote Gate Valve with Raised Face.",
            "Butterfly Valve with Gear Operator and PTFE seat.",
            "API 600, API 598 and ASME B16.5 shall apply.",
        ],
        lambda texts: [text.replace("Please quote", "请提供报价") for text in texts],
    )
    assert translated[0] == "请提供报价 闸阀 with 突面."
    assert "蝶阀" in translated[1]
    assert "齿轮驱动" in translated[1]
    assert "PTFE" in translated[1]
    assert "阀座" in translated[1]
    assert translated[2] == ""

    custom_translation = translate_with_glossary(
        ["Please review the commercial offer."],
        lambda texts: texts,
        [{"en": "commercial offer", "zh": "商务报价", "enabled": True}],
    )[0]
    assert "商务报价" in custom_translation

    russian_translation = translate_with_glossary(
        [
            "Просим предоставить цену на шаровой кран DN50 PN16.",
            "Материал корпуса: WCB.",
            "Коммерческое предложение приложено.",
        ],
        lambda texts: texts,
        source_language="ru",
    )
    assert "球阀" in russian_translation[0]
    assert "DN50" in russian_translation[0]
    assert "PN16" in russian_translation[0]
    assert "阀体材质" in russian_translation[1]
    assert "WCB" in russian_translation[1]
    assert any(value in russian_translation[2] for value in ("商务报价", "报价单"))

    arabic_translation = translate_with_glossary(
        [
            "يرجى تقديم أفضل سعر لصمام كروي DN50 PN16.",
            "مادة جسم الصمام: WCB.",
            "عرض السعر مرفق.",
        ],
        lambda texts: texts,
        source_language="ar",
    )
    assert "球阀" in arabic_translation[0]
    assert "DN50" in arabic_translation[0]
    assert "PN16" in arabic_translation[0]
    assert "阀体材质" in arabic_translation[1]
    assert "WCB" in arabic_translation[1]
    assert any(value in arabic_translation[2] for value in ("商务报价", "报价单"))

    russian_protected, russian_replacements = _protect_reply_terms(
        "The quotation for the Ball Valve DN50 PN16 is ready.",
        "en",
        "ru",
    )
    russian_restored = _restore_reply_terms(
        russian_protected,
        russian_replacements,
    )
    assert "Шаровой кран" in russian_restored
    assert "DN50" in russian_restored
    assert "PN16" in russian_restored
    assert "Ball Valve" not in russian_restored

    arabic_protected, arabic_replacements = _protect_reply_terms(
        "The quotation for the Ball Valve DN50 PN16 is ready.",
        "en",
        "ar",
    )
    arabic_restored = _restore_reply_terms(
        arabic_protected,
        arabic_replacements,
    )
    assert "صمام كروي" in arabic_restored
    assert "DN50" in arabic_restored
    assert "PN16" in arabic_restored
    assert "Ball Valve" not in arabic_restored

    score = benchmark_score(
        [
            ("请提供球阀报价。", ("球阀", "报价")),
            ("交期为四周。", ("交期",)),
        ],
        latency_ms=150,
    )
    assert 80 <= score <= 100, score

    metadata = get_glossary_metadata()
    assert metadata["name"] == "lianggu-valve-glossary"
    assert metadata["termCount"] == 309
    assert metadata["multilingualTermCount"] == 297
    assert metadata["russianTermCount"] == 297
    assert metadata["arabicTermCount"] == 297
    assert metadata["sourceCount"] == 105
    print("translation quality regression passed")


if __name__ == "__main__":
    main()
