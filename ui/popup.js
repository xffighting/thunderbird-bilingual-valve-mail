/* global browser, messenger, CustomerResearch */
(function initPopup(global) {
  const api = global.messenger || global.browser;
  const state = document.getElementById("state");
  const summaryNode = document.getElementById("summary");
  const refreshButton = document.getElementById("refresh");
  const refreshResearchButton = document.getElementById("refreshResearch");
  const optionsButton = document.getElementById("openOptions");
  const dingTalkButton = document.getElementById("openDingTalk");
  const createOpportunityButton = document.getElementById("createOpportunity");
  const opportunityStatus = document.getElementById("opportunityStatus");
  const opportunityConfirm = document.getElementById("opportunityConfirm");
  const cancelOpportunityButton = document.getElementById("cancelOpportunity");
  const confirmOpportunityButton = document.getElementById("confirmOpportunity");
  const drawerBackdrop = document.getElementById("customerDrawer");
  const showDrawerButton = document.getElementById("showCustomerBackground");
  const closeDrawerButton = document.getElementById("closeCustomerBackground");
  let activeSummary = null;
  let activeResearch = null;
  let previousFocus = null;
  let confirmPreviousFocus = null;

  function clear(node) {
    node.replaceChildren();
  }

  function appendLine(parent, className, value) {
    if (!value) return;
    const div = document.createElement("div");
    div.className = className;
    div.textContent = value;
    parent.appendChild(div);
  }

  function renderBilingualBlock(node, zh, en) {
    clear(node);
    appendLine(node, "zh", zh || "未识别");
    appendLine(node, "en", en || "Not identified");
  }

  function setState(message, isError) {
    state.hidden = false;
    state.textContent = message;
    state.classList.toggle("error", Boolean(isError));
    if (isError) summaryNode.hidden = true;
  }

  function confidenceText(value) {
    const labels = {
      high: "高置信 / High",
      medium: "中置信 / Medium",
      low: "低置信 / Low",
      unknown: "待确认 / Review"
    };
    return labels[value] || labels.unknown;
  }

  function applyConfidence(node, value) {
    node.textContent = confidenceText(value);
    node.dataset.confidence = value || "unknown";
  }

  function setScore(scoreId, labelId, result) {
    const score = document.getElementById(scoreId);
    const label = document.getElementById(labelId);
    score.textContent = String(Number(result?.score || 0));
    score.dataset.band = result?.band || "pending";
    label.textContent = result?.labelZh || "待评估";
  }

  function renderInquiryQuality(summary) {
    setScore(
      "inquiryQualityScore",
      "inquiryQualityLabel",
      CustomerResearch.scoreInquiry(summary)
    );
  }

  function renderChips(node, values, fallback) {
    clear(node);
    const items = values?.length ? values : [fallback || "未识别 / Not identified"];
    for (const value of items) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = value;
      node.appendChild(chip);
    }
  }

  function appendFact(list, labelZh, labelEn, value) {
    if (!value || (Array.isArray(value) && !value.length)) return;
    const term = document.createElement("dt");
    term.textContent = `${labelZh} / ${labelEn}`;
    const detail = document.createElement("dd");
    detail.textContent = Array.isArray(value) ? value.join("；") : String(value);
    list.append(term, detail);
  }

  function renderInquiry(summary) {
    const inquiry = summary.inquiry || {};
    renderChips(document.getElementById("products"), inquiry.categories || summary.productCategories);
    applyConfidence(document.getElementById("inquiryConfidence"), inquiry.confidence);

    const facts = document.getElementById("inquiryFacts");
    clear(facts);
    appendFact(facts, "数量", "Quantity", inquiry.quantity);
    appendFact(facts, "口径/尺寸", "Size", inquiry.specifications?.sizes);
    appendFact(facts, "压力等级", "Pressure", inquiry.specifications?.pressureRatings);
    appendFact(facts, "材质", "Material", inquiry.specifications?.materials);
    appendFact(facts, "连接", "Connection", inquiry.specifications?.connections);
    appendFact(facts, "驱动", "Actuation", inquiry.specifications?.actuations);
    appendFact(facts, "标准", "Standards", inquiry.specifications?.standards);
    appendFact(facts, "交期", "Lead time", inquiry.commercial?.leadTimes);
    appendFact(facts, "贸易条款", "Delivery terms", inquiry.commercial?.deliveryTerms);

    const missing = document.getElementById("missingFields");
    const missingFields = inquiry.missingCriticalFields || [];
    missing.hidden = !missingFields.length;
    missing.textContent = missingFields.length
      ? `仍需确认 / Missing: ${missingFields.map(item => `${item.labelZh} / ${item.labelEn}`).join("、")}`
      : "";
  }

  function renderProject(summary) {
    const project = summary.project || {};
    renderBilingualBlock(
      document.getElementById("projectBrief"),
      summary.brief?.project?.zh || "项目名称尚未可靠识别。",
      summary.brief?.project?.en || "Project name has not been identified reliably."
    );
    applyConfidence(document.getElementById("projectConfidence"), project.confidence);

    const candidates = document.getElementById("projects");
    clear(candidates);
    const names = project.nameCandidates?.length
      ? project.nameCandidates.map(item => item.value)
      : summary.projectNames || [];
    if (!names.length) {
      appendLine(candidates, "empty", "邮件中未发现可靠项目名称 / No reliable project name found");
      return;
    }
    renderChips(candidates, names);
    if (names.length > 1) {
      const warning = document.createElement("div");
      warning.className = "candidate-warning";
      warning.textContent = `发现 ${names.length} 个候选，请人工确认 / ${names.length} candidates require review`;
      candidates.prepend(warning);
    }
  }

  function renderReasons(node, reasons, limit) {
    clear(node);
    const values = (reasons || []).slice(0, limit || 4);
    if (!values.length) {
      appendLine(node, "empty", "暂无依据 / No evidence available");
      return;
    }
    for (const reason of values) {
      const item = document.createElement("div");
      item.className = "reason-item";
      appendLine(item, "zh", reason.zh);
      appendLine(item, "en", reason.en);
      node.appendChild(item);
    }
  }

  function renderCustomer(summary) {
    const customer = summary.customer || {};
    const identity = customer.identity || {};
    const importance = customer.importance || {};
    const company = identity.company || "未匹配客户";

    document.getElementById("customerName").textContent = company;
    document.getElementById("customerMatch").textContent = `${identity.matchLabelZh || "未连接客户资料"} / ${identity.matchLabelEn || "Customer data not connected"}`;
    renderBilingualBlock(
      document.getElementById("customerBrief"),
      summary.brief?.customer?.zh || "客户重要度待评估。",
      summary.brief?.customer?.en || "Customer importance needs assessment."
    );
    applyConfidence(document.getElementById("customerConfidence"), importance.confidence);
    renderReasons(document.getElementById("importanceReasons"), importance.reasons, 2);

    const importanceBadge = document.getElementById("importanceBadge");
    importanceBadge.textContent = importance.labelZh || "待评估";
    importanceBadge.className = `status-pill importance-${String(importance.level || "unrated").toLowerCase()}`;

    const dingtalk = customer.dingtalk || {};
    dingTalkButton.disabled = dingtalk.status !== "available";
    dingTalkButton.textContent = dingtalk.status === "available" ? "打开钉钉" : "钉钉未连接";
    const hint = document.getElementById("dingtalkHint");
    hint.classList.remove("error-text");
    hint.textContent = dingtalk.status === "invalid"
      ? "已阻止不安全或非官方钉钉链接。/ Unsafe or non-official DingTalk link blocked."
      : dingtalk.status === "available"
        ? "只打开已配置记录，不会写入或修改钉钉。/ Opens the configured record without writing data."
        : dingtalk.status === "review"
          ? "当前仅按域名或多候选匹配；需精确邮箱确认后才能打开钉钉。/ Exact email confirmation is required before opening DingTalk."
          : "请在设置中导入带钉钉链接的客户资料。/ Import customer data with a DingTalk link in Settings.";
  }

  function renderGroupItem(list, item) {
    const li = document.createElement("li");
    appendLine(li, "zh", item.zh || item.value || "未识别明确内容。");
    appendLine(li, "en", item.en || item.value || "No clear content identified.");
    if (item.evidence) appendLine(li, "source", `依据 / Evidence: ${item.evidence}`);
    list.appendChild(li);
  }

  function renderKeyPointGroups(summary) {
    const root = document.getElementById("keyPointGroups");
    clear(root);
    const groups = summary.keyPointGroups || [];
    if (!groups.length) {
      appendLine(root, "empty", "暂无可用要点 / No available key points");
      return;
    }

    for (const group of groups) {
      const section = document.createElement("section");
      section.className = "point-group";
      const title = document.createElement("h4");
      title.textContent = `${group.zhTitle || "要点"} / ${group.enTitle || "Key points"}`;
      section.appendChild(title);
      const list = document.createElement("ol");
      for (const item of group.items || []) renderGroupItem(list, item);
      section.appendChild(list);
      root.appendChild(section);
    }
  }

  function renderOrder(summary) {
    const orderZh = summary.orderStatus?.labelZh || "未知";
    const orderEn = summary.orderStatus?.labelEn || "Unknown";
    renderBilingualBlock(document.getElementById("order"), orderZh, orderEn);

    const badge = document.getElementById("orderBadge");
    badge.textContent = orderZh;
    badge.className = `status-pill order-${summary.orderStatus?.level || "unknown"}`;

    const evidence = document.getElementById("evidence");
    clear(evidence);
    if (summary.orderStatus?.evidence) {
      appendLine(evidence, "zh", `依据：${summary.orderStatus.evidence}`);
      appendLine(evidence, "en", `Evidence: ${summary.orderStatus.evidence}`);
    }
  }

  function renderDrawer(summary) {
    const customer = summary.customer || {};
    const identity = customer.identity || {};
    const background = customer.background || {};
    document.getElementById("drawerTitle").textContent = identity.company || "客户资料";
    document.getElementById("drawerMatch").textContent = `${identity.matchLabelZh || "未连接"} / ${identity.matchLabelEn || "Not connected"}`;
    renderBilingualBlock(document.getElementById("drawerBackground"), background.zh, background.en);

    const facts = document.getElementById("drawerFacts");
    clear(facts);
    appendFact(facts, "联系人", "Contact", identity.contact);
    appendFact(facts, "邮箱", "Email", identity.email);
    appendFact(facts, "域名", "Domain", identity.domain);
    for (const fact of background.facts || []) appendFact(facts, fact.labelZh, fact.labelEn, fact.value);
    renderReasons(document.getElementById("drawerReasons"), customer.importance?.reasons, 8);
    renderChips(document.getElementById("drawerTags"), background.tags || [], "暂无标签 / No tags");
  }

  function renderSummary(summary) {
    activeSummary = summary;
    state.hidden = true;
    summaryNode.hidden = false;

    renderBilingualBlock(
      document.getElementById("brief"),
      summary.brief?.inquiry?.zh || summary.overview?.zh || "未生成总体摘要。",
      summary.brief?.inquiry?.en || summary.overview?.en || "No overall summary generated."
    );
    renderInquiry(summary);
    renderInquiryQuality(summary);
    renderProject(summary);
    renderCustomer(summary);
    renderKeyPointGroups(summary);
    renderOrder(summary);
    renderDrawer(summary);

    const conversation = summary.conversation || {};
    document.getElementById("conversation").textContent = `${conversation.messageCount || 0} 封邮件 · ${conversation.fromDate || "未知"} 至 ${conversation.toDate || "未知"}`;
    document.getElementById("generated").textContent = summary.generatedAt
      ? `更新 ${new Date(summary.generatedAt).toLocaleString()}`
      : "";
  }

  function updateStatusText(research) {
    const update = research?.update || {};
    if (update.status === "updated") {
      return `钉钉已补全并回读：${update.updatedFields?.join("、") || "背调资料"}。`;
    }
    if (update.status === "local_version_saved") {
      return "本地版本已保存；钉钉当前不可写或该客户尚未建档。";
    }
    if (update.status === "review_required") {
      return "发现多个钉钉客户候选，系统已停止自动关联。";
    }
    if (update.status === "evidence_required") {
      return "公开证据质量低于 60 分，已保留待补版本，没有覆盖钉钉资料。";
    }
    return research?.dingtalk?.status === "matched"
      ? "已直接读取钉钉客户资料；资料完整且未过期时不会重复背调。"
      : "未命中钉钉客户，已完成本地背景版本，不会自动创建客户档案。";
  }

  function researchReasons(research) {
    const output = [];
    if (research?.research?.fitHits?.length) {
      output.push({
        zh: `业务匹配信号：${research.research.fitHits.join("、")}`,
        en: `Business-fit signals: ${research.research.fitHits.join(", ")}`
      });
    }
    if (research?.research?.buyerHits?.length) {
      output.push({
        zh: `采购角色信号：${research.research.buyerHits.join("、")}`,
        en: `Buyer-role signals: ${research.research.buyerHits.join(", ")}`
      });
    }
    if (research?.research?.competitorHits?.length) {
      output.push({
        zh: `竞品/代理信号：${research.research.competitorHits.join("、")}`,
        en: `Competitor/principal signals: ${research.research.competitorHits.join(", ")}`
      });
    }
    return output;
  }

  function renderResearchDrawer(research) {
    const identity = research.identity || {};
    const profile = research.profile || {};
    const completeness = profile.completeness || {};
    document.getElementById("drawerTitle").textContent = identity.company || "客户资料";
    document.getElementById("drawerMatch").textContent = research.dingtalk?.status === "matched"
      ? `钉钉已匹配 · ${research.dingtalk.matchEvidence === "exact_email" ? "精确邮箱" : "唯一公司域名"}`
      : research.dingtalk?.status === "review_required"
        ? "多个候选，需人工确认"
        : "未命中钉钉客户";
    renderBilingualBlock(
      document.getElementById("drawerBackground"),
      research.research?.summaryZh || "背景资料待补强。",
      `Customer fit ${research.research?.matchScore || 0}/100; research quality ${research.research?.quality || 0}/100.`
    );
    const facts = document.getElementById("drawerFacts");
    clear(facts);
    appendFact(facts, "联系人", "Contact", identity.contact);
    appendFact(facts, "邮箱", "Email", identity.email);
    appendFact(facts, "域名", "Domain", identity.domain);
    appendFact(facts, "国家", "Country", identity.country);
    appendFact(facts, "官网", "Website", profile.website);
    appendFact(facts, "行业", "Industry", profile.industry);
    appendFact(facts, "资料完整度", "Completeness", `${completeness.score || 0}/100`);
    appendFact(facts, "背调版本", "Research version", `v${research.version?.number || 0}`);
    appendFact(facts, "更新日期", "Updated", research.version?.updatedAt
      ? new Date(research.version.updatedAt).toLocaleString()
      : "");
    renderReasons(document.getElementById("drawerReasons"), researchReasons(research), 8);
    renderChips(
      document.getElementById("drawerTags"),
      [
        ...(research.research?.fitHits || []),
        ...(research.research?.buyerHits || []),
        ...(research.research?.groupHits || [])
      ],
      "暂无标签 / No tags"
    );
  }

  function renderResearch(research) {
    activeResearch = research;
    const match = CustomerResearch.customerMatch(research);
    setScore("customerFitScore", "customerFitLabel", match);
    document.getElementById("researchVersion").textContent = `v${research.version?.number || 0}`;
    document.getElementById("researchUpdatedAt").textContent = research.version?.updatedAt
      ? `更新 ${new Date(research.version.updatedAt).toLocaleString()} · 核验 ${new Date(research.version.checkedAt).toLocaleString()}`
      : "等待后台核验";
    document.getElementById("researchQuality").textContent =
      `质量 ${research.research?.quality || 0}/100`;
    renderBilingualBlock(
      document.getElementById("researchBrief"),
      research.research?.summaryZh || "客户背景尚待补强。",
      `Customer fit ${match.score}/100 · ${match.labelEn}.`
    );
    const facts = document.getElementById("researchFacts");
    clear(facts);
    appendFact(facts, "钉钉匹配", "DingTalk match", research.dingtalk?.status === "matched"
      ? (research.dingtalk.matchEvidence === "exact_email" ? "精确邮箱" : "唯一公司域名")
      : research.dingtalk?.status === "review_required" ? "多个候选，需确认" : "未命中");
    appendFact(facts, "资料完整度", "Completeness", `${research.profile?.completeness?.score || 0}/100`);
    appendFact(facts, "公开证据", "Public sources", `${research.research?.sourceCount || 0} 条`);
    appendFact(facts, "待补字段", "Missing fields", research.profile?.completeness?.missing);
    document.getElementById("researchStatus").textContent = updateStatusText(research);

    document.getElementById("customerName").textContent =
      research.identity?.company || activeSummary?.customer?.identity?.company || "待确认客户";
    document.getElementById("customerMatch").textContent =
      `${match.labelZh} · ${match.score}/100 / ${match.labelEn}`;
    const importanceBadge = document.getElementById("importanceBadge");
    importanceBadge.textContent = `匹配 ${match.score}`;
    importanceBadge.className = `status-pill research-${match.band}`;
    renderBilingualBlock(
      document.getElementById("customerBrief"),
      research.research?.summaryZh || "客户重要度待评估。",
      `Customer fit ${match.score}/100; research quality ${research.research?.quality || 0}/100.`
    );
    renderReasons(document.getElementById("importanceReasons"), researchReasons(research), 3);

    const available = research.dingtalk?.status === "matched" && Boolean(research.dingtalk?.url);
    dingTalkButton.disabled = !available;
    dingTalkButton.textContent = available ? "打开钉钉客户" : "钉钉未匹配";
    const hint = document.getElementById("dingtalkHint");
    hint.textContent = available
      ? "只读打开钉钉客户表；自动补强仅写 AI 背调区块和空白官网字段。"
      : updateStatusText(research);
    renderResearchDrawer(research);
  }

  function openDrawer() {
    previousFocus = document.activeElement;
    drawerBackdrop.hidden = false;
    closeDrawerButton.focus();
  }

  function closeDrawer() {
    drawerBackdrop.hidden = true;
    if (previousFocus?.focus) previousFocus.focus();
  }

  function opportunityResultText(result) {
    const number = result.dingtalk_opportunity_number
      ? `商机号 ${result.dingtalk_opportunity_number}。`
      : "";
    if (result.status === "completed") {
      return `${number}钉钉待审核记录和本地同号归档均已完成。`;
    }
    if (result.status === "already_completed") {
      return `${number}此邮件此前已完成商机建档，本次没有重复创建。`;
    }
    if (result.status === "partial") {
      return `${number}钉钉记录已建立或命中；本地归档仍需人工复核。`;
    }
    if (result.status === "blocked") {
      return "客户、商机或收件人角色存在歧义，流程已安全停止，没有强行写入。";
    }
    return "商机流程未完成，请检查本机助手和良固任务卡。";
  }

  function openOpportunityConfirm() {
    confirmPreviousFocus = document.activeElement;
    opportunityConfirm.hidden = false;
    confirmOpportunityButton.focus();
  }

  function closeOpportunityConfirm() {
    opportunityConfirm.hidden = true;
    if (confirmPreviousFocus?.focus) confirmPreviousFocus.focus();
  }

  async function createOpportunity() {
    closeOpportunityConfirm();
    createOpportunityButton.disabled = true;
    confirmOpportunityButton.disabled = true;
    createOpportunityButton.textContent = "正在建立…";
    createOpportunityButton.dataset.status = "";
    opportunityStatus.classList.remove("error-text");
    opportunityStatus.textContent = "正在查重客户与商机，并等待钉钉正式号回读…";
    try {
      const result = await api.runtime.sendMessage({
        type: "createOpportunityFromCurrentMessage",
        authorized: true
      });
      opportunityStatus.textContent = opportunityResultText(result || {});
      const finished = ["completed", "already_completed"].includes(result?.status);
      createOpportunityButton.dataset.status = finished ? "completed" : "warning";
      createOpportunityButton.textContent = finished ? "商机已建立 ✓" : "需要复核";
    } catch (error) {
      opportunityStatus.textContent = error.message || "本机商机流程执行失败。";
      opportunityStatus.classList.add("error-text");
      createOpportunityButton.dataset.status = "warning";
      createOpportunityButton.textContent = "重新建立商机";
    } finally {
      createOpportunityButton.disabled = false;
      confirmOpportunityButton.disabled = false;
    }
  }

  async function loadSummary(force) {
    try {
      state.setAttribute("aria-busy", "true");
      setState(force ? "正在重新分析 / Re-analyzing..." : "正在读取当前邮件 / Reading current email...", false);
      const summary = await api.runtime.sendMessage({
        type: "getSummaryForCurrentMessage",
        options: { force: Boolean(force) }
      });
      renderSummary(summary);
    } catch (error) {
      setState(error.message || "摘要生成失败 / Summary generation failed", true);
    } finally {
      state.setAttribute("aria-busy", "false");
    }
  }

  async function loadResearch(force) {
    const previous = state.textContent;
    state.hidden = false;
    state.setAttribute("aria-busy", "true");
    state.textContent = force ? "正在更新背调与钉钉版本…" : "正在读取后台客户情报…";
    try {
      const research = await api.runtime.sendMessage({
        type: "getCustomerResearchForCurrentMessage",
        options: { force: Boolean(force) }
      });
      renderResearch(research);
      state.hidden = true;
    } catch (error) {
      document.getElementById("researchStatus").textContent =
        `背调暂未完成：${error.message || error}。邮件摘要仍可正常使用。`;
      state.hidden = true;
    } finally {
      state.setAttribute("aria-busy", "false");
      if (!state.hidden) state.textContent = previous;
    }
  }

  async function loadAll() {
    await loadSummary(false);
    await loadResearch(false);
  }

  refreshButton.addEventListener("click", () => loadSummary(true));
  refreshResearchButton.addEventListener("click", () => loadResearch(true));
  optionsButton.addEventListener("click", () => api.runtime.sendMessage({ type: "openOptionsPage" }));
  createOpportunityButton.addEventListener("click", openOpportunityConfirm);
  cancelOpportunityButton.addEventListener("click", closeOpportunityConfirm);
  confirmOpportunityButton.addEventListener("click", createOpportunity);
  opportunityConfirm.addEventListener("click", event => {
    if (event.target === opportunityConfirm) closeOpportunityConfirm();
  });
  dingTalkButton.addEventListener("click", async () => {
    const url = activeResearch?.dingtalk?.url || activeSummary?.customer?.dingtalk?.url;
    if (!url) return;
    try {
      await api.runtime.sendMessage({ type: "openDingTalkLink", url });
    } catch (error) {
      const hint = document.getElementById("dingtalkHint");
      hint.textContent = error.message || "无法打开钉钉链接。/ Failed to open DingTalk link.";
      hint.classList.add("error-text");
    }
  });
  showDrawerButton.addEventListener("click", openDrawer);
  closeDrawerButton.addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", event => {
    if (event.target === drawerBackdrop) closeDrawer();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !opportunityConfirm.hidden) {
      closeOpportunityConfirm();
      return;
    }
    if (event.key === "Escape" && !drawerBackdrop.hidden) closeDrawer();
    if (event.key === "Tab" && !drawerBackdrop.hidden) {
      const focusable = [...drawerBackdrop.querySelectorAll("button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  loadAll();
})(globalThis);
