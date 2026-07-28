/* global browser, messenger */
(function initOfflineMailTranslator(global) {
  const api = global.messenger || global.browser;
  const HOST_NAME = "com.lianggu.mail_translate";
  const MAX_LINES = 80;
  const MAX_LINE_LENGTH = 1200;
  const MAX_TOTAL_LENGTH = 24000;
  const cache = new Map();

  function sanitizeTexts(values) {
    const output = [];
    let totalLength = 0;

    for (const value of Array.isArray(values) ? values : []) {
      if (output.length >= MAX_LINES) break;
      const text = String(value || "").trim().slice(0, MAX_LINE_LENGTH);
      if (!text || totalLength + text.length > MAX_TOTAL_LENGTH) continue;
      output.push(text);
      totalLength += text.length;
    }

    return output;
  }

  function sanitizeCustomTerms(values) {
    if (global.TranslationPreferences?.normalizeCustomTerms) {
      return global.TranslationPreferences.normalizeCustomTerms(values)
        .filter(term => term.enabled !== false);
    }
    return [];
  }

  function glossarySignature(customTerms) {
    return customTerms
      .map(term => {
        const sourceLanguage = term.sourceLanguage === "ru" ? "ru" : "en";
        const locale = sourceLanguage === "ru" ? "ru-RU" : "en-US";
        return `${sourceLanguage}:${term.en.toLocaleLowerCase(locale)}=${term.zh}`;
      })
      .sort()
      .join("\u001f");
  }

  async function callNative(payload) {
    if (!api?.runtime?.sendNativeMessage) {
      throw new Error("当前 Thunderbird 不支持本机离线翻译连接。");
    }
    const response = await api.runtime.sendNativeMessage(HOST_NAME, payload);
    if (!response || response.ok !== true) {
      throw new Error(response?.message || "本机离线翻译服务未就绪。");
    }
    return response;
  }

  async function translateBatch(values, customTermValues) {
    const texts = sanitizeTexts(values);
    const customTerms = sanitizeCustomTerms(customTermValues);
    const signature = glossarySignature(customTerms);
    const sourceLanguageFor = text => {
      return global.InlineTranslationCore?.detectSourceLanguage(text) || "en";
    };
    const cacheKey = (sourceLanguage, text) => {
      return `${sourceLanguage}\u0000${signature}\u0000${text}`;
    };
    const groups = new Map();
    for (const text of texts) {
      const sourceLanguage = sourceLanguageFor(text);
      if (!groups.has(sourceLanguage)) groups.set(sourceLanguage, []);
      if (!cache.has(cacheKey(sourceLanguage, text))) {
        groups.get(sourceLanguage).push(text);
      }
    }

    for (const [sourceLanguage, valuesForLanguage] of groups) {
      const missing = [...new Set(valuesForLanguage)];
      if (!missing.length) continue;
      const response = await callNative({
        type: "translate",
        source: sourceLanguage,
        target: "zh",
        texts: missing,
        customTerms
      });
      const translations = Array.isArray(response.translations) ? response.translations : [];
      for (let index = 0; index < missing.length; index += 1) {
        cache.set(
          cacheKey(sourceLanguage, missing[index]),
          String(translations[index] || "").trim()
        );
      }
    }

    return {
      ok: true,
      engine: "argos-offline",
      customTermCount: customTerms.length,
      sourceLanguages: texts.map(sourceLanguageFor),
      translations: texts.map(text => {
        const sourceLanguage = sourceLanguageFor(text);
        return cache.get(cacheKey(sourceLanguage, text)) || "";
      })
    };
  }

  async function composeSuggestions(source, customTermValues) {
    const text = sanitizeTexts([source])[0] || "";
    if (!text) {
      throw new Error("请先输入简短中文回复。");
    }
    return callNative({
      type: "compose_suggest",
      source: "zh",
      targets: ["zh", "en", "ru", "ar"],
      text,
      customTerms: sanitizeCustomTerms(customTermValues)
    });
  }

  async function health() {
    return callNative({ type: "health" });
  }

  async function benchmark(customTermValues) {
    return callNative({
      type: "benchmark",
      source: "en",
      target: "zh",
      customTerms: sanitizeCustomTerms(customTermValues)
    });
  }

  global.OfflineMailTranslator = {
    HOST_NAME,
    benchmark,
    composeSuggestions,
    health,
    sanitizeCustomTerms,
    sanitizeTexts,
    translateBatch
  };
})(globalThis);
