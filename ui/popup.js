/* global browser, messenger */
(function initPopup(global) {
  const api = global.messenger || global.browser;
  const state = document.getElementById("state");
  const summaryNode = document.getElementById("summary");
  const refreshButton = document.getElementById("refresh");
  const optionsButton = document.getElementById("openOptions");
  const dingTalkButton = document.getElementById("openDingTalk");
  const drawerBackdrop = document.getElementById("customerDrawer");
  const showDrawerButton = document.getElementById("showCustomerBackground");
  const closeDrawerButton = document.getElementById("closeCustomerBackground");
  let activeSummary = null;
  let previousFocus = null;

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

  function openDrawer() {
    previousFocus = document.activeElement;
    drawerBackdrop.hidden = false;
    closeDrawerButton.focus();
  }

  function closeDrawer() {
    drawerBackdrop.hidden = true;
    if (previousFocus?.focus) previousFocus.focus();
  }

  async function load(force) {
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

  refreshButton.addEventListener("click", () => load(true));
  optionsButton.addEventListener("click", () => api.runtime.sendMessage({ type: "openOptionsPage" }));
  dingTalkButton.addEventListener("click", async () => {
    const url = activeSummary?.customer?.dingtalk?.url;
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

  load(false);
})(globalThis);
