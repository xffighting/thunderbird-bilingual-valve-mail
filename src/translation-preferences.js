/* global crypto */
(function initTranslationPreferences(global) {
  const MAX_CUSTOM_TERMS = 300;
  const MAX_FEEDBACK_ITEMS = 100;

  function cleanText(value, maxLength) {
    return String(value || "").replace(/\s+/gu, " ").trim().slice(0, maxLength);
  }

  function createId(prefix) {
    if (global.crypto?.randomUUID) return `${prefix}-${global.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeCustomTerms(values) {
    const byEnglish = new Map();
    for (const raw of Array.isArray(values) ? values : []) {
      const en = cleanText(raw?.en, 240);
      const zh = cleanText(raw?.zh, 240);
      if (!en || !zh) continue;
      const key = en.toLocaleLowerCase("en-US");
      byEnglish.set(key, {
        id: cleanText(raw?.id, 120) || createId("term"),
        en,
        zh,
        category: cleanText(raw?.category, 40) || "custom",
        context: raw?.context === "valve" ? "valve" : "always",
        enabled: raw?.enabled !== false
      });
    }
    return [...byEnglish.values()].slice(-MAX_CUSTOM_TERMS);
  }

  function normalizeTranslationFeedback(values) {
    const output = [];
    for (const raw of Array.isArray(values) ? values : []) {
      const source = cleanText(raw?.source, 600);
      const suggestedTranslation = cleanText(raw?.suggestedTranslation, 600);
      if (!source || !suggestedTranslation) continue;
      const status = ["pending", "approved", "rejected"].includes(raw?.status)
        ? raw.status
        : "pending";
      output.push({
        id: cleanText(raw?.id, 120) || createId("feedback"),
        source,
        currentTranslation: cleanText(raw?.currentTranslation, 600),
        suggestedTranslation,
        status,
        createdAt: cleanText(raw?.createdAt, 40) || new Date().toISOString()
      });
    }
    return output.slice(-MAX_FEEDBACK_ITEMS);
  }

  function createTranslationFeedback(input) {
    return normalizeTranslationFeedback([
      {
        id: createId("feedback"),
        source: input?.source,
        currentTranslation: input?.currentTranslation,
        suggestedTranslation: input?.suggestedTranslation,
        status: "pending",
        createdAt: new Date().toISOString()
      }
    ])[0] || null;
  }

  function reviewTranslationFeedback(feedbackValues, customTermValues, feedbackId, action) {
    const feedback = normalizeTranslationFeedback(feedbackValues);
    let customTerms = normalizeCustomTerms(customTermValues);
    const target = feedback.find(item => item.id === feedbackId);
    if (!target || !["approve", "reject"].includes(action)) {
      return { feedback, customTerms };
    }

    target.status = action === "approve" ? "approved" : "rejected";
    if (action === "approve") {
      customTerms = normalizeCustomTerms([
        ...customTerms,
        {
          id: target.id,
          en: target.source,
          zh: target.suggestedTranslation,
          category: "feedback",
          context: "always",
          enabled: true
        }
      ]);
    }
    return { feedback, customTerms };
  }

  global.TranslationPreferences = {
    MAX_CUSTOM_TERMS,
    MAX_FEEDBACK_ITEMS,
    createTranslationFeedback,
    normalizeCustomTerms,
    normalizeTranslationFeedback,
    reviewTranslationFeedback
  };
})(globalThis);
