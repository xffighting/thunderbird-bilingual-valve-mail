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
      sourceLanguage: "en",
      enabled: true
    }
  ],
  "custom terms should be trimmed, validated and deduplicated case-insensitively"
);

const normalizedFeedback = preferences.normalizeTranslationFeedback([
  {
    id: "feedback-1",
    source: " Please quote your best price. ",
    sourceLanguage: "en",
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
assert.strictEqual(normalizedFeedback[0].sourceLanguage, "en");
assert.strictEqual(normalizedFeedback[0].status, "pending");

const upserted = preferences.upsertTranslationFeedback(
  normalizedFeedback,
  {
    source: "please quote your best price.",
    sourceLanguage: "en",
    currentTranslation: "旧译文",
    suggestedTranslation: "更新后的标准译文"
  }
);
assert.strictEqual(upserted.created, false);
assert.strictEqual(upserted.feedback.length, 1);
assert.strictEqual(upserted.record.id, "feedback-1");
assert.strictEqual(upserted.record.suggestedTranslation, "更新后的标准译文");

const russianFeedback = preferences.upsertTranslationFeedback(
  upserted.feedback,
  {
    source: "Материал корпуса",
    sourceLanguage: "ru",
    currentTranslation: "身体材料",
    suggestedTranslation: "阀体材质"
  }
);
assert.strictEqual(russianFeedback.created, true);
assert.strictEqual(russianFeedback.record.sourceLanguage, "ru");

const approved = preferences.reviewTranslationFeedback(
  russianFeedback.feedback,
  normalizedTerms,
  russianFeedback.record.id,
  "approve"
);

assert.strictEqual(
  approved.feedback.find(item => item.id === russianFeedback.record.id).status,
  "approved"
);
assert.deepStrictEqual(
  approved.customTerms.find(term => term.en === "Материал корпуса"),
  {
    id: russianFeedback.record.id,
    en: "Материал корпуса",
    zh: "阀体材质",
    category: "feedback",
    context: "always",
    sourceLanguage: "ru",
    enabled: true
  },
  "approving Russian feedback should turn it into an active Russian-to-Chinese terminology rule"
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
