(function initInlineTranslationCore(global) {
  const CJK_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/u;
  const LATIN_PATTERN = /[A-Za-z]/gu;
  const WORD_PATTERN = /[A-Za-z]{2,}/gu;
  const CYRILLIC_PATTERN = /[\u0400-\u04ff]/gu;
  const RUSSIAN_WORD_PATTERN = /[\u0400-\u04ff]{2,}/gu;
  const ARABIC_PATTERN = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/gu;
  const ARABIC_WORD_PATTERN = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]{2,}/gu;
  const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/giu;
  const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
  const TECHNICAL_TOKEN_PATTERN = /\b(?:DN|NPS|PN|CL|CLASS|ANSI|API|ASME|ASTM|ISO|EN|DIN|JIS|BS|RFQ|BOQ|PO|WCB|WC6|WC9|CF8M?|SS(?:304|316L?)?|PTFE|NACE|PED|PMI|RT|UT)[-./\s]*[A-Z0-9./-]*\b/giu;
  const EMAIL_HEADER_PATTERN = /^(?:(?:from|sent|to|cc|bcc|subject|date|reply-to|return-path)|(?:от|отправлено|кому|копия|тема|дата)|(?:من|أرسل|إلى|نسخة|نسخة\s+مخفية|الموضوع|التاريخ|الرد\s+إلى))\s*:/iu;
  const ORIGINAL_MESSAGE_PATTERN = /^(?:-{2,}\s*)?(?:(?:original|forwarded)\s+message|исходное\s+сообщение|пересланное\s+сообщение|الرسالة\s+الأصلية|رسالة\s+معاد\s+توجيهها)(?:\s*-{2,})?$/iu;
  const REPEATED_CJK_PATTERN = /([\u3400-\u9fff]{1,4})\1{4,}/u;

  function cleanLine(value) {
    return String(value || "")
      .replace(/\u00a0/gu, " ")
      .replace(/[ \t]+/gu, " ")
      .trim();
  }

  function canonical(value) {
    return cleanLine(value)
      .replace(/[。.!！?？]+$/u, "")
      .toLowerCase();
  }

  function isEmailHeaderLine(value) {
    const text = cleanLine(value);
    return EMAIL_HEADER_PATTERN.test(text)
      || ORIGINAL_MESSAGE_PATTERN.test(text)
      || /^on\s.{1,250}\swrote:\s*$/iu.test(text);
  }

  function detectSourceLanguage(value) {
    const text = cleanLine(value);
    if (
      text.length < 4
      || text.length > 1200
      || CJK_PATTERN.test(text)
      || isEmailHeaderLine(text)
    ) return false;

    const withoutContacts = text
      .replace(URL_PATTERN, " ")
      .replace(EMAIL_PATTERN, " ")
      .trim();
    if (!withoutContacts) return "";

    const latinCount = (withoutContacts.match(LATIN_PATTERN) || []).length;
    const cyrillicCount = (withoutContacts.match(CYRILLIC_PATTERN) || []).length;
    const arabicCount = (withoutContacts.match(ARABIC_PATTERN) || []).length;

    const naturalText = withoutContacts
      .replace(TECHNICAL_TOKEN_PATTERN, " ")
      .replace(/[0-9_#./:+*-]+/gu, " ")
      .replace(/\s+/gu, " ")
      .trim();
    const visibleCount = withoutContacts.replace(/\s/gu, "").length || 1;
    const arabicWords = naturalText.match(ARABIC_WORD_PATTERN) || [];
    if (
      arabicCount >= 4
      && arabicWords.length >= 2
      && arabicCount / visibleCount >= 0.28
    ) {
      return "ar";
    }

    const russianWords = naturalText.match(RUSSIAN_WORD_PATTERN) || [];
    if (
      cyrillicCount >= 4
      && russianWords.length >= 2
      && cyrillicCount / visibleCount >= 0.28
    ) {
      return "ru";
    }

    const englishWords = naturalText.match(WORD_PATTERN) || [];
    if (
      latinCount >= 4
      && englishWords.length >= 2
      && latinCount / visibleCount >= 0.32
    ) {
      return "en";
    }
    return "";
  }

  function isEnglishLine(value) {
    return detectSourceLanguage(value) === "en";
  }

  function isRussianLine(value) {
    return detectSourceLanguage(value) === "ru";
  }

  function isArabicLine(value) {
    return detectSourceLanguage(value) === "ar";
  }

  function isTranslatableLine(value) {
    return Boolean(detectSourceLanguage(value));
  }

  function isUsableTranslation(source, value) {
    const translation = cleanLine(value);
    if (!translation || canonical(translation) === canonical(source)) return false;
    if (!CJK_PATTERN.test(translation)) return false;
    if (/[\uFFFD\u2047]/u.test(translation)) return false;

    const compact = translation.replace(/\s+/gu, "");
    if (REPEATED_CJK_PATTERN.test(compact)) return false;
    if (translation.length > Math.max(240, cleanLine(source).length * 4)) return false;

    const cjkCharacters = [...compact].filter(character => CJK_PATTERN.test(character));
    if (cjkCharacters.length >= 40) {
      const uniqueRatio = new Set(cjkCharacters).size / cjkCharacters.length;
      if (uniqueRatio < 0.14) return false;
    }
    return true;
  }

  function normalizeTranslationResponse(sources, response) {
    const sourceLines = Array.isArray(sources) ? sources.map(cleanLine) : [];
    const translations = response?.ok && Array.isArray(response.translations)
      ? response.translations
      : [];

    return sourceLines.map((source, index) => {
      const translation = cleanLine(translations[index]);
      return {
        source,
        translation: isUsableTranslation(source, translation) ? translation : ""
      };
    });
  }

  global.InlineTranslationCore = {
    cleanLine,
    detectSourceLanguage,
    isEmailHeaderLine,
    isEnglishLine,
    isRussianLine,
    isArabicLine,
    isTranslatableLine,
    isUsableTranslation,
    normalizeTranslationResponse
  };
})(globalThis);
