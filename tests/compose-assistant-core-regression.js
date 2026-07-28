const assert = require("assert");
const core = require("../src/compose-assistant-core.js");

assert.strictEqual(
  core.isEligibleChineseDraft("报价单已经做好，请查收附件。"),
  true,
  "a short Chinese business reply should trigger the assistant"
);
assert.strictEqual(
  core.isEligibleChineseDraft("谢谢"),
  false,
  "a courtesy fragment should not interrupt the user"
);
assert.strictEqual(
  core.isEligibleChineseDraft("Please review the attached quotation."),
  false,
  "non-Chinese drafts should not trigger the Chinese optimization flow"
);
assert.strictEqual(
  core.isEligibleChineseDraft("中".repeat(501)),
  false,
  "long Chinese messages should stay outside the short-reply assistant"
);

const response = core.normalizeSuggestionResponse(
  "报价单已经做好，请查收附件。",
  {
    ok: true,
    engine: "argos-offline",
    technicalTerms: ["球阀 / Ball Valve", "DN50"],
    warnings: ["请复核价格。"],
    candidates: core.LANGUAGE_ORDER.map(code => ({
      code,
      blocks: [
        { type: "greeting", text: `${code}-hello` },
        { type: "field", label: `${code}-label`, text: `${code}-content`, emphasis: true },
        { type: "closing", text: `${code}-close` }
      ]
    }))
  }
);

assert.deepStrictEqual(
  response.candidates.map(candidate => candidate.code),
  ["zh", "en", "ru", "ar"],
  "all four languages should remain in the fixed decision order"
);
assert.strictEqual(response.candidates[3].direction, "rtl");
assert.strictEqual(
  core.candidateToPlainText(response.candidates[0]),
  "zh-hello\n\nzh-label：zh-content\n\nzh-close",
  "plain-text insertion should keep clear field labels"
);
assert.strictEqual(
  response.sourceFingerprint,
  core.fingerprint("报价单已经做好，请查收附件。"),
  "the source fingerprint should be stable across the editor and popup"
);

console.log("compose-assistant-core-regression: ok");
