const assert = require("assert");

require("../src/translation-preferences.js");

const preferences = globalThis.TranslationPreferences;

assert(preferences, "translation preferences should be exported");

const normalizedTerms = preferences.normalizeCustomTerms([
  {
    id: " first ",
    en: "  quotation sheet ",
    zh: " 报价单 ",
    category: "business",
    enabled: true
  },
  {
    id: "second",
    en: "Quotation Sheet",
    zh: "正式报价单",
    category: "business",
    enabled: true
  },
  { en: "", zh: "无效词条" },
  { en: "Body", zh: "" }
]);

assert.deepStrictEqual(
  normalizedTerms,
  [
    {
      id: "second",
      en: "Quotation Sheet",
      zh: "正式报价单",
      category: "business",
      context: "always",
      enabled: true
    }
  ],
  "custom terms should be trimmed, validated and deduplicated case-insensitively"
);

const normalizedFeedback = preferences.normalizeTranslationFeedback([
  {
    id: "feedback-1",
    source: " Please quote your best price. ",
    currentTranslation: "请报价你的最好价格。",
    suggestedTranslation: "请提供最优价格。",
    status: "pending",
    createdAt: "2026-07-28T08:00:00.000Z"
  },
  {
    id: "invalid",
    source: "",
    suggestedTranslation: "无效"
  }
]);

assert.strictEqual(normalizedFeedback.length, 1);
assert.strictEqual(normalizedFeedback[0].source, "Please quote your best price.");
assert.strictEqual(normalizedFeedback[0].status, "pending");

const approved = preferences.reviewTranslationFeedback(
  normalizedFeedback,
  normalizedTerms,
  "feedback-1",
  "approve"
);

assert.strictEqual(approved.feedback[0].status, "approved");
assert.deepStrictEqual(
  approved.customTerms.find(term => term.en === "Please quote your best price."),
  {
    id: "feedback-1",
    en: "Please quote your best price.",
    zh: "请提供最优价格。",
    category: "feedback",
    context: "always",
    enabled: true
  },
  "approving feedback should turn it into an active local terminology rule"
);

const rejected = preferences.reviewTranslationFeedback(
  normalizedFeedback,
  normalizedTerms,
  "feedback-1",
  "reject"
);
assert.strictEqual(rejected.feedback[0].status, "rejected");
assert.strictEqual(rejected.customTerms.length, normalizedTerms.length);

console.log("translation preferences regression passed");
