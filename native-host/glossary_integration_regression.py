#!/usr/bin/env python3
"""Exercise the real offline engine with non-sensitive valve terminology samples."""

from translator_host import handle_message


def main() -> None:
    response = handle_message(
        {
            "type": "translate",
            "source": "en",
            "target": "zh",
            "texts": [
                "Please quote Globe Valve body, bonnet, stem, disc and seat, "
                "DN50 PN16 WCB, RF.",
                "Butterfly Valve with Gear Operator and PTFE seat, "
                "Class 150, API 609.",
                "Gate Valve shall comply with API 600, API 598 and ASME B16.5.",
                "Body material: ASTM A216 WCB.",
                "Body",
                "The human body needs water.",
                "We are a professional valve factory.",
                "Sorry to keep you waiting. "
                "Please find the quotation sheet attached for your reference. "
                "Kindly check it at your convenience.",
            ],
        }
    )
    assert response.get("ok") is True, response
    assert response.get("terminology") == "open-valve-glossary", response
    translations = response.get("translations", [])
    assert len(translations) == 8, response

    first = translations[0]
    for expected in (
        "截止阀",
        "阀体",
        "阀盖",
        "阀杆",
        "阀瓣",
        "阀座",
        "DN50",
        "PN16",
        "WCB",
        "RF",
    ):
        assert expected in first, (expected, first)

    second = translations[1]
    for expected in ("蝶阀", "齿轮驱动", "PTFE", "阀座", "Class 150", "API 609"):
        assert expected in second, (expected, second)

    third = translations[2]
    for expected in ("闸阀", "API 600", "API 598", "ASME B16.5"):
        assert expected in third, (expected, third)

    assert "阀体" in translations[3], translations[3]
    assert "ASTM A216" in translations[3], translations[3]
    assert "WCB" in translations[3], translations[3]
    assert "阀体" in translations[4], translations[4]
    assert "阀体" not in translations[5], translations[5]
    assert "工厂" in translations[6], translations[6]
    assert "事实" not in translations[6], translations[6]
    assert "报价单" in translations[7], translations[7]
    assert "抱歉让您久等了" in translations[7], translations[7]
    assert "请查收随附的报价单，供您参考" in translations[7], translations[7]
    assert "请您方便时查阅" in translations[7], translations[7]
    assert "引文" not in translations[7], translations[7]
    assert "引用" not in translations[7], translations[7]
    assert "_" not in translations[7], translations[7]

    assert not any("[TERM" in value or "（术语：" in value for value in translations)
    print("glossary integration regression passed")


if __name__ == "__main__":
    main()
