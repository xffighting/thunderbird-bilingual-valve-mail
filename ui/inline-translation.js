/* global browser, messenger, InlineTranslationCore */
(function initInlineTranslation(global) {
  const api = global.messenger || global.browser;
  const core = global.InlineTranslationCore;
  const toggleId = "gms-inline-translation-toggle";
  const excludedSelector = [
    `#${toggleId}`,
    "#game-mail-summary-inline-root",
    ".gms-inline-translation",
    "script",
    "style",
    "noscript",
    "svg"
  ].join(", ");
  const blockSelector = "p, div, li, td, th, pre, h1, h2, h3, h4, h5, h6";
  let translated = false;
  let translating = false;
  let hidden = false;

  if (!api?.runtime?.sendMessage || !core || document.getElementById(toggleId)) return;

  function createToggle() {
    const button = document.createElement("button");
    button.id = toggleId;
    button.type = "button";
    button.textContent = "中译";
    button.title = "逐行中文对照";
    button.setAttribute("aria-label", "显示或隐藏逐行中文翻译");
    button.addEventListener("click", () => {
      if (!translated && !translating) {
        translateDocument(button, true);
        return;
      }
      hidden = !hidden;
      document.documentElement.classList.toggle("gms-hide-inline-translations", hidden);
      button.textContent = hidden ? "中译" : "中译 ✓";
      button.setAttribute("aria-pressed", String(!hidden));
    });
    document.body.appendChild(button);
    return button;
  }

  function isExcluded(element, includeQuoted) {
    if (!(element instanceof Element)) return true;
    if (element.matches(excludedSelector) || element.closest(excludedSelector)) return true;
    if (!includeQuoted && element.closest("blockquote, [type='cite'], .moz-signature, .gmail_quote")) return true;
    return false;
  }

  function meaningfulText(element) {
    return core.cleanLine(element.textContent || "");
  }

  function candidateBlocks(includeQuoted) {
    const all = [...document.body.querySelectorAll(blockSelector)]
      .filter(element => !isExcluded(element, includeQuoted))
      .filter(element => meaningfulText(element));

    const leafBlocks = all.filter(element => {
      return !all.some(other => other !== element && element.contains(other));
    });

    if (leafBlocks.length) return leafBlocks;
    return isExcluded(document.body, includeQuoted) ? [] : [document.body];
  }

  function linePlansFor(element) {
    if (element.dataset.gmsInlineTranslationProcessed === "true") return [];

    const directBreaks = [...element.children].filter(child => child.tagName === "BR");
    if (
      !directBreaks.length
      && element.tagName === "PRE"
      && !element.children.length
      && element.textContent.includes("\n")
    ) {
      const plans = [];
      const lines = element.textContent.split("\n");
      element.replaceChildren();
      for (let index = 0; index < lines.length; index += 1) {
        const sourceNode = document.createElement("span");
        sourceNode.className = "gms-inline-source-line";
        sourceNode.textContent = lines[index];
        element.appendChild(sourceNode);

        const anchor = index < lines.length - 1 ? document.createElement("br") : null;
        if (anchor) {
          anchor.className = "gms-inline-source-break";
          element.appendChild(anchor);
        }

        const text = core.cleanLine(lines[index]);
        const sourceLanguage = core.detectSourceLanguage(text);
        if (sourceLanguage) plans.push({ element, anchor, text, sourceLanguage });
      }
      return plans;
    }

    if (!directBreaks.length) {
      const text = core.cleanLine(element.textContent || "");
      const sourceLanguage = core.detectSourceLanguage(text);
      return sourceLanguage
        ? [{ element, anchor: null, text, sourceLanguage }]
        : [];
    }

    const plans = [];
    let segmentNodes = [];
    for (const child of [...element.childNodes]) {
      if (child.nodeType === Node.ELEMENT_NODE && child.tagName === "BR") {
        const text = core.cleanLine(segmentNodes.map(node => node.textContent || "").join(""));
        const sourceLanguage = core.detectSourceLanguage(text);
        if (sourceLanguage) plans.push({ element, anchor: child, text, sourceLanguage });
        segmentNodes = [];
      } else {
        segmentNodes.push(child);
      }
    }

    const trailingText = core.cleanLine(segmentNodes.map(node => node.textContent || "").join(""));
    const sourceLanguage = core.detectSourceLanguage(trailingText);
    if (sourceLanguage) {
      plans.push({ element, anchor: null, text: trailingText, sourceLanguage });
    }
    return plans;
  }

  function collectPlans(includeQuoted) {
    return candidateBlocks(includeQuoted)
      .flatMap(linePlansFor)
      .slice(0, 80);
  }

  function insertTranslation(plan, translation) {
    if (!translation) return;
    const breakNode = document.createElement("br");
    breakNode.className = "gms-inline-translation-break";
    const translationNode = document.createElement("span");
    translationNode.className = "gms-inline-translation";
    translationNode.lang = "zh-CN";
    translationNode.textContent = translation;

    if (plan.anchor) {
      plan.element.insertBefore(breakNode, plan.anchor);
      plan.element.insertBefore(translationNode, plan.anchor);
    } else {
      plan.element.appendChild(breakNode);
      plan.element.appendChild(translationNode);
    }
  }

  function setToggleState(button, state, message) {
    button.dataset.state = state;
    button.title = message;
    if (state === "loading") button.textContent = "翻译中";
    if (state === "ready") button.textContent = "中译 ✓";
    if (state === "error") button.textContent = "中译 !";
    if (state === "idle") button.textContent = "中译";
  }

  async function translateDocument(button, force) {
    if (translating || translated) return;
    translating = true;
    setToggleState(button, "loading", "正在使用本机离线模型翻译...");

    try {
      const options = await api.runtime.sendMessage({ type: "getOptions" });
      if (!force && !options.inlineTranslationEnabled) {
        setToggleState(button, "idle", "逐行翻译已在设置中关闭；点击可临时启用。");
        return;
      }

      const plans = collectPlans(Boolean(options.inlineTranslationIncludeQuoted));
      if (!plans.length) {
        translated = true;
        setToggleState(button, "idle", "当前邮件没有需要翻译的英文段落。");
        return;
      }

      const response = await api.runtime.sendMessage({
        type: "translateInlineBatch",
        texts: plans.map(plan => plan.text)
      });
      if (!response?.ok) throw new Error(response?.message || "离线翻译失败。");

      const pairs = core.normalizeTranslationResponse(
        plans.map(plan => plan.text),
        response
      );
      for (let index = 0; index < plans.length; index += 1) {
        insertTranslation(plans[index], pairs[index]?.translation);
        plans[index].element.dataset.gmsInlineTranslationProcessed = "true";
      }

      translated = true;
      hidden = false;
      setToggleState(button, "ready", "译文由本机 Argos Translate 离线生成；点击隐藏。");
      button.setAttribute("aria-pressed", "true");
    } catch (error) {
      setToggleState(
        button,
        "error",
        `离线翻译不可用：${error.message || error}。点击重试。`
      );
    } finally {
      translating = false;
    }
  }

  async function mount() {
    if (!document.body || document.getElementById(toggleId)) return;
    const button = createToggle();
    await translateDocument(button, false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})(globalThis);
