(function initMessageSummaryButton(global) {
  const api = global.messenger || global.browser;
  const rootId = "game-mail-summary-inline-root";

  if (!api?.runtime?.sendMessage || document.getElementById(rootId)) return;

  let isLoaded = false;
  let isLoading = false;
  let activeSummary = null;
  let dingTalkButton = null;

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

  function renderSummary(summary, contentNode, stateNode) {
    activeSummary = summary;
    contentNode.replaceChildren();
    stateNode.hidden = true;

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

    if (dingTalkButton) {
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

  function mount() {
    if (!document.body || document.getElementById(rootId)) return;

    const root = createElement("section", "gms-root");
    root.id = rootId;
    root.setAttribute("aria-live", "polite");

    const trigger = createElement("button", "gms-summary-trigger", "摘要");
    trigger.type = "button";
    trigger.title = "显示邮件摘要";
    trigger.setAttribute("aria-label", "显示邮件摘要");

    const panel = createElement("aside", "gms-panel");
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "邮件摘要");

    const header = createElement("div", "gms-panel-header");
    header.appendChild(createElement("strong", "", "邮件摘要"));

    const close = createElement("button", "gms-icon-button", "×");
    close.type = "button";
    close.title = "关闭";
    close.setAttribute("aria-label", "关闭摘要面板");
    header.appendChild(close);

    const stateNode = createElement("div", "gms-state", "点击刷新生成摘要。");
    const contentNode = createElement("div", "gms-content");

    const footer = createElement("div", "gms-panel-footer");
    dingTalkButton = createElement("button", "gms-dingtalk", "钉钉未连接");
    dingTalkButton.type = "button";
    dingTalkButton.disabled = true;
    const refresh = createElement("button", "gms-refresh", "重新分析");
    refresh.type = "button";
    footer.appendChild(dingTalkButton);
    footer.appendChild(refresh);

    panel.appendChild(header);
    panel.appendChild(stateNode);
    panel.appendChild(contentNode);
    panel.appendChild(footer);

    trigger.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden && !isLoaded) loadSummary(contentNode, stateNode, false);
    });
    close.addEventListener("click", () => {
      panel.hidden = true;
    });
    refresh.addEventListener("click", () => loadSummary(contentNode, stateNode, true));
    dingTalkButton.addEventListener("click", async () => {
      const url = activeSummary?.customer?.dingtalk?.url;
      if (!url) return;
      try {
        await api.runtime.sendMessage({ type: "openDingTalkLink", url });
      } catch (error) {
        stateNode.hidden = false;
        setText(stateNode, `钉钉链接打开失败：${error.message || error}`);
      }
    });

    root.appendChild(trigger);
    root.appendChild(panel);
    document.body.appendChild(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})(globalThis);
