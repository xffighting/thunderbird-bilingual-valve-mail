/* global TranslationPreferences */
(function initTranslationSettingsUI(global) {
  function create(api) {
    const termList = document.getElementById("customTermsList");
    const feedbackList = document.getElementById("feedbackReviewList");
    const termCount = document.getElementById("customTermCount");
    const feedbackCount = document.getElementById("pendingFeedbackCount");
    const translatorStatus = document.getElementById("translatorStatus");
    const benchmarkStatus = document.getElementById("benchmarkStatus");
    const benchmarkButton = document.getElementById("runTranslationBenchmark");
    let customTerms = [];
    let translationFeedback = [];

    function createDraftTerm() {
      return {
        id: `term-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        en: "",
        zh: "",
        category: "custom",
        context: "always",
        sourceLanguage: "en",
        enabled: true
      };
    }

    function createButton(label, className, action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = className;
      button.textContent = label;
      button.addEventListener("click", action);
      return button;
    }

    function renderTerms() {
      termList.replaceChildren();
      termCount.textContent = `${customTerms.filter(term => term.en && term.zh).length} 条`;
      if (!customTerms.length) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "还没有自定义术语。基础阀门术语库仍然有效。";
        termList.appendChild(empty);
        return;
      }

      customTerms.forEach((term, index) => {
        const row = document.createElement("div");
        row.className = "custom-term-row";

        const sourceLanguage = document.createElement("select");
        sourceLanguage.setAttribute("aria-label", `第 ${index + 1} 条原文语言`);
        sourceLanguage.innerHTML = `
          <option value="en">英语 → 中文</option>
          <option value="ru">俄语 → 中文</option>
          <option value="ar">阿拉伯语 → 中文</option>
        `;
        sourceLanguage.value = ["en", "ru", "ar"].includes(term.sourceLanguage)
          ? term.sourceLanguage
          : "en";

        const english = document.createElement("input");
        english.type = "text";
        english.maxLength = 240;
        const updateSourcePlaceholder = () => {
          const labels = {
            en: {
              name: "英文",
              placeholder: "英文术语，如 Quotation Sheet"
            },
            ru: {
              name: "俄文",
              placeholder: "俄文术语，如 шаровой кран"
            },
            ar: {
              name: "阿拉伯文",
              placeholder: "阿拉伯文术语，如 صمام كروي"
            }
          };
          const selected = labels[sourceLanguage.value] || labels.en;
          english.placeholder = selected.placeholder;
          english.setAttribute(
            "aria-label",
            `第 ${index + 1} 条${selected.name}术语`
          );
        };
        updateSourcePlaceholder();
        english.value = term.en;
        english.addEventListener("input", () => {
          term.en = english.value;
          termCount.textContent = `${customTerms.filter(item => item.en.trim() && item.zh.trim()).length} 条`;
        });
        sourceLanguage.addEventListener("change", () => {
          term.sourceLanguage = sourceLanguage.value;
          updateSourcePlaceholder();
        });

        const chinese = document.createElement("input");
        chinese.type = "text";
        chinese.maxLength = 240;
        chinese.placeholder = "标准中文译法，如 报价单";
        chinese.setAttribute("aria-label", `第 ${index + 1} 条中文译法`);
        chinese.value = term.zh;
        chinese.addEventListener("input", () => {
          term.zh = chinese.value;
          termCount.textContent = `${customTerms.filter(item => item.en.trim() && item.zh.trim()).length} 条`;
        });

        const context = document.createElement("select");
        context.setAttribute("aria-label", `第 ${index + 1} 条适用场景`);
        context.innerHTML = `
          <option value="always">全部邮件</option>
          <option value="valve">仅阀门语境</option>
        `;
        context.value = term.context === "valve" ? "valve" : "always";
        context.addEventListener("change", () => {
          term.context = context.value;
        });

        const enabledLabel = document.createElement("label");
        enabledLabel.className = "compact-toggle";
        const enabled = document.createElement("input");
        enabled.type = "checkbox";
        enabled.checked = term.enabled !== false;
        enabled.addEventListener("change", () => {
          term.enabled = enabled.checked;
        });
        enabledLabel.append(enabled, document.createTextNode("启用"));

        const remove = createButton("删除", "text-button danger-text", () => {
          customTerms.splice(index, 1);
          renderTerms();
        });
        row.append(sourceLanguage, english, chinese, context, enabledLabel, remove);
        termList.appendChild(row);
      });
    }

    async function reviewFeedback(id, action, button) {
      button.disabled = true;
      try {
        const saved = await api.runtime.sendMessage({
          type: "reviewTranslationFeedback",
          feedbackId: id,
          action
        });
        if (!saved?.customTerms || !saved?.translationFeedback) {
          throw new Error(saved?.message || "纠错处理未完成");
        }
        write(saved);
      } catch (error) {
        button.disabled = false;
        button.textContent = error.message || "处理失败";
      }
    }

    function renderFeedback() {
      feedbackList.replaceChildren();
      const pending = translationFeedback.filter(item => item.status === "pending");
      feedbackCount.textContent = `${pending.length} 条待确认`;
      if (!pending.length) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "没有待确认纠错。邮件里的“纠错”记录会显示在这里。";
        feedbackList.appendChild(empty);
        return;
      }

      pending.forEach(item => {
        const row = document.createElement("article");
        row.className = "feedback-review-row";
        const copy = document.createElement("div");
        copy.className = "feedback-copy";
        const source = document.createElement("strong");
        const sourceLanguageLabel = {
          en: "英语",
          ru: "俄语",
          ar: "阿拉伯语"
        }[item.sourceLanguage] || "英语";
        source.textContent =
          `${sourceLanguageLabel} → 中文：${item.source}`;
        const current = document.createElement("span");
        current.textContent = `当前：${item.currentTranslation || "无可用译文"}`;
        const suggested = document.createElement("span");
        suggested.className = "feedback-suggested";
        suggested.textContent = `建议：${item.suggestedTranslation}`;
        copy.append(source, current, suggested);

        const actions = document.createElement("div");
        actions.className = "feedback-actions";
        const approve = createButton("批准为术语", "secondary-button", event => {
          reviewFeedback(item.id, "approve", event.currentTarget);
        });
        const reject = createButton("忽略", "text-button", event => {
          reviewFeedback(item.id, "reject", event.currentTarget);
        });
        actions.append(approve, reject);
        row.append(copy, actions);
        feedbackList.appendChild(row);
      });
    }

    function read() {
      return {
        customTerms: TranslationPreferences.normalizeCustomTerms(customTerms),
        translationFeedback: TranslationPreferences.normalizeTranslationFeedback(
          translationFeedback
        )
      };
    }

    function write(options) {
      customTerms = TranslationPreferences.normalizeCustomTerms(options?.customTerms || []);
      translationFeedback = TranslationPreferences.normalizeTranslationFeedback(
        options?.translationFeedback || []
      );
      renderTerms();
      renderFeedback();
    }

    async function checkTranslator() {
      translatorStatus.textContent = "正在检查本机离线翻译…";
      try {
        const result = await api.runtime.sendMessage({ type: "checkOfflineTranslator" });
        if (result?.ok && result.terminology === "lianggu-valve-glossary") {
          const model = result.modelId ? `；模型 ${result.modelId}` : "";
          const sourceLabels = { en: "英语", ru: "俄语", ar: "阿拉伯语" };
          const sourceText = (Array.isArray(result.sources) ? result.sources : ["en"])
            .map(code => sourceLabels[code])
            .filter(Boolean)
            .join("、");
          const multilingualCount = Number(result.multilingualTermCount) || 0;
          const multilingualSummary = multilingualCount
            ? `，其中四语专业术语 ${multilingualCount} 条`
            : "";
          translatorStatus.textContent =
            `${sourceText}转中文可用。良固阀门术语库 ${Number(result.termCount) || 0} 条` +
            `${multilingualSummary}${model}；邮件正文只在本机处理。`;
        } else {
          translatorStatus.textContent = result?.ok
            ? "离线翻译可用，但良固阀门术语库尚未启用。"
            : "离线翻译组件未就绪。";
        }
      } catch (error) {
        translatorStatus.textContent = `离线翻译不可用：${error.message || error}`;
      }
    }

    async function runBenchmark() {
      benchmarkButton.disabled = true;
      benchmarkStatus.textContent = "正在用内置脱敏样本评测本机模型…";
      try {
        const result = await api.runtime.sendMessage({ type: "runTranslationBenchmark" });
        if (!result?.ok) throw new Error(result?.message || "质量评测失败");
        benchmarkStatus.textContent =
          `已选择 ${result.selectedModel}；质量 ${Number(result.score) || 0}/100；` +
          `${Number(result.sampleCount) || 0} 条样本耗时 ${Number(result.latencyMs) || 0} ms；` +
          `共发现 ${Number(result.candidateCount) || 0} 个本机模型。`;
      } catch (error) {
        benchmarkStatus.textContent = `评测失败：${error.message || error}`;
      } finally {
        benchmarkButton.disabled = false;
      }
    }

    document.getElementById("addCustomTerm").addEventListener("click", () => {
      customTerms.push(createDraftTerm());
      renderTerms();
      termList.querySelector(".custom-term-row:last-child input")?.focus();
    });
    document.getElementById("checkTranslator").addEventListener("click", checkTranslator);
    benchmarkButton.addEventListener("click", runBenchmark);

    return { read, write };
  }

  global.TranslationSettingsUI = { create };
})(globalThis);
