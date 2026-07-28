const assert = require("assert");

require("../src/inline-translation-core.js");

const core = globalThis.InlineTranslationCore;

assert(core, "inline translation core should be exported");

assert.strictEqual(
  core.isEnglishLine("Please quote your best price and delivery time."),
  true,
  "business English should be translated"
);

assert.strictEqual(
  core.detectSourceLanguage("Please quote your best price and delivery time."),
  "en",
  "business English should be detected as English"
);

assert.strictEqual(
  core.detectSourceLanguage("Просим предоставить цену на шаровой кран DN50 PN16."),
  "ru",
  "business Russian should be detected as Russian"
);

assert.strictEqual(
  core.isTranslatableLine("Просим предоставить цену на шаровой кран DN50 PN16."),
  true,
  "business Russian should be translated"
);

assert.strictEqual(
  core.isEnglishLine("请提供最优价格和交期。"),
  false,
  "existing Chinese should not be translated"
);

assert.strictEqual(
  core.isEnglishLine("https://example.com/RFQ-100"),
  false,
  "a URL should not be sent to the translator"
);

assert.strictEqual(
  core.isEnglishLine("DN50 PN16 WCB RFQ-100"),
  false,
  "technical identifiers without a sentence should remain untouched"
);

for (const headerLine of [
  "From: sender@example.test",
  "Sent: Monday, July 27, 2026 3:24 PM",
  "To: buyer@example.test",
  "Cc: team@example.test",
  "Subject: Re: RFQ-100",
  "From: sender@example.test Sent: Monday To: buyer@example.test Subject: RFQ-100",
  "-----Original Message-----"
]) {
  assert.strictEqual(
    core.isEnglishLine(headerLine),
    false,
    `forwarded-mail header should not be translated: ${headerLine}`
  );
}

assert.deepStrictEqual(
  core.normalizeTranslationResponse(
    ["Please quote.", "Delivery: 4 weeks.", "Материал корпуса: WCB."],
    { ok: true, translations: ["请报价。", "交期：4周。", "阀体材质：WCB。"] }
  ),
  [
    { source: "Please quote.", translation: "请报价。" },
    { source: "Delivery: 4 weeks.", translation: "交期：4周。" },
    { source: "Материал корпуса: WCB.", translation: "阀体材质：WCB。" }
  ],
  "English and Russian translations should keep a stable one-to-one source mapping"
);

assert.deepStrictEqual(
  core.normalizeTranslationResponse(
    ["API 6D", "Ball valve"],
    { ok: true, translations: ["API 6D", "球阀"] }
  ),
  [
    { source: "API 6D", translation: "" },
    { source: "Ball valve", translation: "球阀" }
  ],
  "unchanged technical text should not create a duplicate translation row"
);

assert.deepStrictEqual(
  core.normalizeTranslationResponse(
    ["Please confirm the attached commercial offer."],
    { ok: true, translations: ["鹰嘴".repeat(80)] }
  ),
  [
    {
      source: "Please confirm the attached commercial offer.",
      translation: ""
    }
  ],
  "repetitive model garbage should never be inserted into the email"
);

console.log("inline translation regression passed");
