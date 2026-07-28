#!/usr/bin/env python3

from translator_host import (
    get_glossary_metadata,
    is_usable_translation,
    post_process_translation,
    protect_valve_terms,
    restore_valve_terms,
    translate_with_glossary,
)


def main() -> None:
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
            item["replacement"] == "阀体"
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

    metadata = get_glossary_metadata()
    assert metadata["name"] == "lianggu-valve-glossary"
    assert metadata["termCount"] >= 35
    assert metadata["sourceCount"] >= 3
    print("translation quality regression passed")


if __name__ == "__main__":
    main()
