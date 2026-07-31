(function initMessageSummaryButton(global) {
  const api = global.messenger || global.browser;
  const rootId = "game-mail-summary-inline-root";

  if (!api?.runtime?.sendMessage || document.getElementById(rootId)) return;

  let isLoaded = false;
  let isLoading = false;
  let isResearchLoading = false;
  let activeSummary = null;
  let activeResearch = null;
  let dingTalkButton = null;
  let opportunityButton = null;
  let replyButton = null;
  let researchTrigger = null;
  let customerScoreNode = null;
  let customerScoreLabel = null;
  let inquiryScoreNode = null;
  let inquiryScoreLabel = null;
  let researchNode = null;

  function createElement(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function setText(node, text) {
    node.textContent = text || "";
  }

  function appendLine(parent, className, text) {
    if (!text) return;
    const line = createElement("div", className, text);
    parent.appendChild(line);
  }

  function appendField(parent, label, lines) {
    const field = createElement("section", "gms-field");
    field.appendChild(createElement("div", "gms-label", label));

    const value = createElement("div", "gms-value");
    for (const line of lines.filter(Boolean)) {
      appendLine(value, "gms-line", line);
    }

    if (!value.childElementCount) appendLine(value, "gms-empty", "未识别 / Not identified");
    field.appendChild(value);
    parent.appendChild(field);
  }

  function renderKeyPoints(parent, summary) {
    const field = createElement("section", "gms-field");
    field.appendChild(createElement("div", "gms-label", "清晰要点 / Key points"));

    const list = createElement("ol", "gms-points");
    const groups = summary.keyPointGroups || [];

    for (const group of groups.slice(0, 2)) {
      for (const item of (group.items || []).slice(0, 3)) {
        const point = createElement("li", "");
        appendLine(point, "gms-line", item.zh || item.value || "未识别明确内容。");
        appendLine(point, "gms-line gms-muted", item.en || item.value || "No clear content identified.");
        list.appendChild(point);
      }
    }

    if (!list.childElementCount && summary.structuredKeyPoints?.length) {
      for (const item of summary.structuredKeyPoints.slice(0, 4)) {
        const point = createElement("li", "");
        appendLine(point, "gms-line", item.zh || item.value || "未识别明确内容。");
        appendLine(point, "gms-line gms-muted", item.en || item.value || "No clear content identified.");
        list.appendChild(point);
      }
    }

    if (!list.childElementCount && summary.keyPoints?.length) {
      for (const value of summary.keyPoints.slice(0, 4)) {
        list.appendChild(createElement("li", "", value));
      }
    }

    if (!list.childElementCount) {
      field.appendChild(createElement("div", "gms-empty", "暂无可用要点 / No available key points"));
    } else {
      field.appendChild(list);
    }

    parent.appendChild(field);
  }

  function renderProducts(parent, summary) {
    const products = summary.productCategories || [];
    const field = createElement("section", "gms-field");
    field.appendChild(createElement("div", "gms-label", "品类 / Categories"));

    const chips = createElement("div", "gms-chips");
    for (const product of products.slice(0, 8)) {
      chips.appendChild(createElement("span", "gms-chip", product));
    }

    field.appendChild(chips.childElementCount ? chips : createElement("div", "gms-empty", "未识别 / Not identified"));
    parent.appendChild(field);
  }

  function scoreBand(value) {
    if (value >= 75) return "high";
    if (value >= 55) return "medium-high";
    if (value >= 35) return "medium";
    return "low";
  }

  function setScore(node, labelNode, value, label, band) {
    const numeric = Number(value || 0);
    node.textContent = String(numeric);
    node.dataset.band = band || scoreBand(numeric);
    labelNode.textContent = label || "待评估";
  }

  function updateTriggerLabel() {
    if (!researchTrigger) return;
    const customer = Number(activeResearch?.research?.matchScore || 0);
    const inquiry = global.CustomerResearch?.scoreInquiry(activeSummary || {})?.score || 0;
    if (!activeSummary && !activeResearch) {
      researchTrigger.textContent = "客户情报 · 准备中";
      researchTrigger.setAttribute("aria-label", "客户情报正在后台准备");
      return;
    }
    researchTrigger.textContent = `客户 ${customer || "—"} · 询盘 ${inquiry || "—"}`;
    researchTrigger.setAttribute(
      "aria-label",
      `打开客户情报，客户匹配 ${customer || "待评估"} 分，询盘质量 ${inquiry || "待评估"} 分`
    );
  }

  function renderInquiryScore(summary) {
    const quality = global.CustomerResearch?.scoreInquiry(summary) || {
      score: 0,
      band: "pending",
      labelZh: "待评估"
    };
    setScore(inquiryScoreNode, inquiryScoreLabel, quality.score, quality.labelZh, quality.band);
    inquiryScoreNode.parentElement.title = quality.missing?.length
      ? `待补：${quality.missing.join("、")}`
      : (quality.reasons || []).join(" · ");
    updateTriggerLabel();
  }

  function researchStatusText(research) {
    const update = research?.update || {};
    if (update.status === "updated") {
      return `钉钉已补全并回读 · ${update.updatedFields?.join("、") || "背调资料"}`;
    }
    if (update.status === "local_version_saved") {
      return "本地版本已保存；钉钉暂未更新，可稍后重试。";
    }
    if (update.status === "evidence_required") {
      return "公开证据不足 60 分，已保留为待补证据版本，没有覆盖钉钉。";
    }
    if (update.status === "review_required") {
      return "发现多个客户候选，已停止自动关联，请人工确认。";
    }
    return research?.dingtalk?.status === "matched"
      ? "已读取钉钉客户资料。"
      : "未命中钉钉客户；已完成本地背景版本，不会自动新建客户。";
  }

  function renderResearch(research, stateNode) {
    activeResearch = research;
    researchNode.replaceChildren();
    const match = global.CustomerResearch?.customerMatch(research) || {
      score: 0,
      band: "pending",
      labelZh: "待评估"
    };
    setScore(customerScoreNode, customerScoreLabel, match.score, match.labelZh, match.band);

    appendField(researchNode, "客户匹配 / Customer fit", [
      `${research.identity?.company || "待确认客户"} · ${match.score || 0}/100`,
      research.research?.summaryZh || "",
      research.dingtalk?.status === "matched"
        ? `钉钉：已匹配（${research.dingtalk.matchEvidence === "exact_email" ? "精确邮箱" : "唯一公司域名"}）`
        : research.dingtalk?.status === "review_required"
          ? "钉钉：存在多个候选，需确认"
          : "钉钉：未命中现有客户"
    ]);

    const completeness = research.profile?.completeness || {};
    appendField(researchNode, "背调版本 / Research version", [
      `v${research.version?.number || 0} · 信息完整度 ${completeness.score || 0}/100 · 背调质量 ${research.research?.quality || 0}/100`,
      `更新 ${research.version?.updatedAt ? new Date(research.version.updatedAt).toLocaleString() : "待确认"}`,
      `最近核验 ${research.version?.checkedAt ? new Date(research.version.checkedAt).toLocaleString() : "待确认"}`,
      research.version?.changed
        ? `本次产生新版本；上一版本 v${research.version.previous || 0}`
        : "本次核验内容未变化，沿用当前版本",
      completeness.missing?.length ? `待补：${completeness.missing.join("、")}` : "关键资料已齐"
    ]);

    appendField(researchNode, "后台处理 / Background processing", [
      researchStatusText(research),
      research.cache?.status === "hit" ? "已命中后台缓存，打开邮件无需重新等待。" : "",
      research.research?.competitorHits?.length
        ? `竞品/代理信号：${research.research.competitorHits.join("、")}`
        : "未发现明确竞品代理公开信号",
      research.research?.groupHits?.length
        ? `集团信号：${research.research.groupHits.join("、")}`
        : "集团关系暂无明确公开信号"
    ]);

    const available = research.dingtalk?.status === "matched" && Boolean(research.dingtalk?.url);
    dingTalkButton.disabled = !available;
    dingTalkButton.textContent = available ? "打开钉钉客户" : "钉钉未匹配";
    dingTalkButton.title = available
      ? "只读打开钉钉客户表"
      : "只在唯一精确匹配后启用";
    stateNode.hidden = true;
    updateTriggerLabel();
  }

  function renderSummary(summary, contentNode, stateNode) {
    activeSummary = summary;
    contentNode.replaceChildren();
    stateNode.hidden = true;
    renderInquiryScore(summary);

    appendField(contentNode, "询价简述 / Inquiry brief", [
      summary.brief?.inquiry?.zh || summary.overview?.zh || "未生成总体摘要。",
      summary.brief?.inquiry?.en || summary.overview?.en || "No overall summary generated."
    ]);

    appendField(contentNode, "客户与重要度 / Customer & importance", [
      summary.brief?.customer?.zh || summary.customer?.importance?.labelZh || "待评估",
      summary.brief?.customer?.en || summary.customer?.importance?.labelEn || "Needs assessment",
      summary.customer?.identity?.matchLabelZh
    ]);

    appendField(contentNode, "项目 / Project", [
      summary.brief?.project?.zh || (summary.projectNames?.length ? summary.projectNames.join("; ") : ""),
      summary.brief?.project?.en || ""
    ]);

    renderKeyPoints(contentNode, summary);
    renderProducts(contentNode, summary);

    appendField(contentNode, "订单状态 / Order status", [
      summary.orderStatus?.labelZh || "未知",
      summary.orderStatus?.labelEn || "Unknown",
      summary.orderStatus?.evidence ? `依据 / Evidence: ${summary.orderStatus.evidence}` : ""
    ]);

    const conversation = summary.conversation || {};
    appendField(contentNode, "往来 / Conversation", [
      `${conversation.messageCount || 0} 封 / messages`,
      `${conversation.fromDate || "未知"} 至 / to ${conversation.toDate || "未知"}`
    ]);

    if (dingTalkButton && !activeResearch) {
      const available = summary.customer?.dingtalk?.status === "available";
      dingTalkButton.disabled = !available;
      dingTalkButton.textContent = available ? "打开钉钉" : "钉钉未连接";
      dingTalkButton.title = available
        ? "只读打开已配置的客户或商机记录"
        : "请在插件设置中导入客户与钉钉映射";
    }
  }

  async function loadSummary(contentNode, stateNode, force) {
    if (isLoading) return;
    isLoading = true;
    stateNode.hidden = false;
    setText(stateNode, "正在分析当前邮件...");
    contentNode.replaceChildren();

    try {
      const summary = await api.runtime.sendMessage({
        type: "getSummaryForDisplayedMessage",
        options: { force: Boolean(force) }
      });
      renderSummary(summary, contentNode, stateNode);
      isLoaded = true;
    } catch (error) {
      stateNode.hidden = false;
      setText(stateNode, `摘要读取失败：${error.message || error}`);
    } finally {
      isLoading = false;
    }
  }

  async function loadResearch(stateNode, force) {
    if (isResearchLoading) return;
    isResearchLoading = true;
    stateNode.hidden = false;
    setText(
      stateNode,
      force ? "正在更新客户背调并核验钉钉版本…" : "正在读取后台客户情报…"
    );
    try {
      const research = await api.runtime.sendMessage({
        type: "getCustomerResearchForDisplayedMessage",
        options: { force: Boolean(force) }
      });
      renderResearch(research, stateNode);
    } catch (error) {
      researchNode.replaceChildren();
      appendField(researchNode, "客户背调 / Customer research", [
        `暂未完成：${error.message || error}`,
        "邮件摘要仍可正常查看；请检查本机背调助手或稍后重试。"
      ]);
      customerScoreNode.textContent = "—";
      customerScoreLabel.textContent = "暂不可用";
      stateNode.hidden = true;
      updateTriggerLabel();
    } finally {
      isResearchLoading = false;
    }
  }

  function opportunityResultText(result) {
    const number = result.dingtalk_opportunity_number
      ? `商机号 ${result.dingtalk_opportunity_number}。`
      : "";
    if (result.status === "completed") return `${number}商机建立和本地归档均已完成。`;
    if (result.status === "already_completed") return `${number}此邮件已建立商机，没有重复创建。`;
    if (result.status === "partial") return `${number}钉钉已完成，本地归档仍需复核。`;
    if (result.status === "blocked") return "存在客户或商机歧义，流程已安全停止。";
    return "商机流程未完成，请检查良固任务卡。";
  }

  function mount() {
    if (!document.body || document.getElementById(rootId)) return;

    const root = createElement("section", "gms-root");
    root.id = rootId;
    root.setAttribute("aria-live", "polite");

    const triggerGroup = createElement("div", "gms-trigger-group");
    replyButton = createElement("button", "gms-reply-trigger", "回复客户");
    replyButton.type = "button";
    replyButton.title = "从客户原邮件打开回复，保持会话聚合";
    replyButton.setAttribute("aria-label", "从客户原邮件打开回复");

    opportunityButton = createElement("button", "gms-opportunity-trigger", "建商机");
    opportunityButton.type = "button";
    opportunityButton.title = "一键建立当前邮件的完整商机";
    opportunityButton.setAttribute("aria-label", "一键建立当前邮件的完整商机");

    researchTrigger = createElement("button", "gms-summary-trigger", "客户情报 · 准备中");
    researchTrigger.type = "button";
    researchTrigger.title = "查看客户匹配、询盘质量和背调版本";
    researchTrigger.setAttribute("aria-label", "客户情报正在后台准备");
    triggerGroup.append(replyButton, opportunityButton, researchTrigger);

    const panel = createElement("aside", "gms-panel");
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "客户与询盘情报");

    const header = createElement("div", "gms-panel-header");
    header.appendChild(createElement("strong", "", "客户与询盘情报"));

    const close = createElement("button", "gms-icon-button", "×");
    close.type = "button";
    close.title = "关闭";
    close.setAttribute("aria-label", "关闭客户情报面板");
    header.appendChild(close);

    const scoreGrid = createElement("div", "gms-score-grid");
    const customerScoreCard = createElement("section", "gms-score-card");
    customerScoreCard.appendChild(createElement("span", "gms-score-title", "客户匹配"));
    customerScoreNode = createElement("strong", "gms-score-value", "—");
    customerScoreNode.dataset.band = "pending";
    customerScoreLabel = createElement("span", "gms-score-label", "后台准备中");
    customerScoreCard.append(customerScoreNode, customerScoreLabel);
    const inquiryScoreCard = createElement("section", "gms-score-card");
    inquiryScoreCard.appendChild(createElement("span", "gms-score-title", "询盘质量"));
    inquiryScoreNode = createElement("strong", "gms-score-value", "—");
    inquiryScoreNode.dataset.band = "pending";
    inquiryScoreLabel = createElement("span", "gms-score-label", "邮件分析中");
    inquiryScoreCard.append(inquiryScoreNode, inquiryScoreLabel);
    scoreGrid.append(customerScoreCard, inquiryScoreCard);

    const stateNode = createElement("div", "gms-state", "正在读取后台情报…");
    researchNode = createElement("div", "gms-research-content");
    const contentNode = createElement("div", "gms-content");

    const footer = createElement("div", "gms-panel-footer");
    dingTalkButton = createElement("button", "gms-dingtalk", "钉钉未连接");
    dingTalkButton.type = "button";
    dingTalkButton.disabled = true;
    const refreshResearch = createElement("button", "gms-refresh", "更新背调");
    refreshResearch.type = "button";
    refreshResearch.title = "跳过缓存，重新核验公开资料与钉钉版本";
    const refresh = createElement("button", "gms-refresh", "重析邮件");
    refresh.type = "button";
    footer.appendChild(dingTalkButton);
    footer.appendChild(refreshResearch);
    footer.appendChild(refresh);

    panel.appendChild(header);
    panel.appendChild(scoreGrid);
    panel.appendChild(stateNode);
    panel.appendChild(researchNode);
    panel.appendChild(contentNode);
    panel.appendChild(footer);

    researchTrigger.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) close.focus();
    });
    close.addEventListener("click", () => {
      panel.hidden = true;
    });
    refresh.addEventListener("click", () => loadSummary(contentNode, stateNode, true));
    refreshResearch.addEventListener("click", () => loadResearch(stateNode, true));
    replyButton.addEventListener("click", async () => {
      replyButton.disabled = true;
      replyButton.textContent = "正在打开…";
      try {
        await api.runtime.sendMessage({
          type: "openReplyForDisplayedMessage",
          replyType: "replyToSender"
        });
        replyButton.textContent = "已打开 ✓";
      } catch (error) {
        global.alert(`无法打开客户原信回复：${error.message || error}`);
        replyButton.textContent = "重试回复";
      } finally {
        replyButton.disabled = false;
      }
    });
    opportunityButton.addEventListener("click", async () => {
      const authorized = global.confirm(
        "确认建立当前邮件的完整商机？\n\n" +
        "系统会先查钉钉现状，再匹配或建立待审核客户/商机、上传附件、创建审核待办，" +
        "回读正式 SJ 号后完成本地同号归档。\n\n不会发送、移动或删除 Thunderbird 邮件。"
      );
      if (!authorized) return;
      panel.hidden = false;
      opportunityButton.disabled = true;
      opportunityButton.textContent = "处理中…";
      stateNode.hidden = false;
      setText(stateNode, "正在查重客户与商机，并等待钉钉正式号回读…");
      try {
        const result = await api.runtime.sendMessage({
          type: "createOpportunityFromCurrentMessage",
          authorized: true
        });
        setText(stateNode, opportunityResultText(result || {}));
        opportunityButton.textContent = ["completed", "already_completed"].includes(result?.status)
          ? "已建商机 ✓"
          : "需复核";
      } catch (error) {
        setText(stateNode, `商机建立失败：${error.message || error}`);
        opportunityButton.textContent = "重试建商机";
      } finally {
        opportunityButton.disabled = false;
      }
    });
    dingTalkButton.addEventListener("click", async () => {
      const url = activeResearch?.dingtalk?.url || activeSummary?.customer?.dingtalk?.url;
      if (!url) return;
      try {
        await api.runtime.sendMessage({ type: "openDingTalkLink", url });
      } catch (error) {
        stateNode.hidden = false;
        setText(stateNode, `钉钉链接打开失败：${error.message || error}`);
      }
    });

    root.appendChild(triggerGroup);
    root.appendChild(panel);
    document.body.appendChild(root);
    loadSummary(contentNode, stateNode, false);
    loadResearch(stateNode, false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})(globalThis);
