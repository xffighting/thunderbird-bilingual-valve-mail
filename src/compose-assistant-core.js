/* exported ComposeAssistantCore */
(function initComposeAssistantCore(global) {
  const LANGUAGE_ORDER = ["zh", "en", "ru", "ar"];
  const LANGUAGE_META = {
    zh: { code: "zh", label: "中文", nativeLabel: "中文", lang: "zh-CN", direction: "ltr" },
    en: { code: "en", label: "英语", nativeLabel: "English", lang: "en", direction: "ltr" },
    ru: { code: "ru", label: "俄语", nativeLabel: "Русский", lang: "ru", direction: "ltr" },
    ar: { code: "ar", label: "阿拉伯语", nativeLabel: "العربية", lang: "ar", direction: "rtl" }
  };
  const MAX_DRAFT_LENGTH = 500;

  function cleanText(value, limit = MAX_DRAFT_LENGTH) {
    return String(value || "")
      .replace(/\u00a0/gu, " ")
      .replace(/\r\n?/gu, "\n")
      .replace(/[ \t]+/gu, " ")
      .replace(/\n{3,}/gu, "\n\n")
      .trim()
      .slice(0, limit);
  }

  function chineseCharacterCount(value) {
    return (String(value || "").match(/[\u3400-\u9fff\uf900-\ufaff]/gu) || []).length;
  }

  function isEligibleChineseDraft(value) {
    const normalized = String(value || "")
      .replace(/\u00a0/gu, " ")
      .replace(/\r\n?/gu, "\n")
      .replace(/[ \t]+/gu, " ")
      .replace(/\n{3,}/gu, "\n\n")
      .trim();
    if (!normalized || normalized.length > MAX_DRAFT_LENGTH) return false;
    const text = cleanText(normalized);
    const chineseCount = chineseCharacterCount(text);
    if (chineseCount < 6) return false;
    const visibleCount = text.replace(/\s/gu, "").length;
    return chineseCount / Math.max(1, visibleCount) >= 0.3;
  }

  function fingerprint(value) {
    const text = cleanText(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function normalizeBlock(value) {
    const type = ["greeting", "paragraph", "field", "closing"].includes(value?.type)
      ? value.type
      : "paragraph";
    const text = cleanText(value?.text, 1200);
    if (!text) return null;
    return {
      type,
      label: type === "field" ? cleanText(value?.label, 80) : "",
      text,
      emphasis: value?.emphasis === true || type === "field"
    };
  }

  function normalizeCandidate(value, code) {
    const meta = LANGUAGE_META[code];
    const blocks = (Array.isArray(value?.blocks) ? value.blocks : [])
      .map(normalizeBlock)
      .filter(Boolean)
      .slice(0, 16);
    if (!blocks.length) return null;
    return {
      ...meta,
      blocks
    };
  }

  function normalizeSuggestionResponse(source, response) {
    if (!response || response.ok !== true) {
      throw new Error(response?.message || "本机多语回复服务未就绪。");
    }
    const candidates = LANGUAGE_ORDER
      .map(code => normalizeCandidate(
        (response.candidates || []).find(candidate => candidate?.code === code),
        code
      ))
      .filter(Boolean);
    if (candidates.length !== LANGUAGE_ORDER.length) {
      throw new Error("四语种候选不完整，请检查本机回复模型。");
    }
    return {
      ok: true,
      source: cleanText(source),
      sourceFingerprint: fingerprint(source),
      optimizedAt: String(response.optimizedAt || ""),
      engine: String(response.engine || "argos-offline"),
      technicalTerms: [...new Set(
        (Array.isArray(response.technicalTerms) ? response.technicalTerms : [])
          .map(value => cleanText(value, 80))
          .filter(Boolean)
      )].slice(0, 24),
      warnings: (Array.isArray(response.warnings) ? response.warnings : [])
        .map(value => cleanText(value, 240))
        .filter(Boolean)
        .slice(0, 8),
      requiresHumanReview: response.requiresHumanReview === true,
      highRiskIntentIds: (Array.isArray(response.highRiskIntentIds)
        ? response.highRiskIntentIds
        : [])
        .map(value => cleanText(value, 80))
        .filter(Boolean)
        .slice(0, 12),
      candidates
    };
  }

  function candidateToPlainText(candidate) {
    return (candidate?.blocks || []).map(block => {
      if (block.type === "field" && block.label) {
        return `${block.label}：${block.text}`;
      }
      return block.text;
    }).join("\n\n").trim();
  }

  const api = {
    LANGUAGE_META,
    LANGUAGE_ORDER,
    MAX_DRAFT_LENGTH,
    candidateToPlainText,
    chineseCharacterCount,
    cleanText,
    fingerprint,
    isEligibleChineseDraft,
    normalizeSuggestionResponse
  };

  global.ComposeAssistantCore = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
