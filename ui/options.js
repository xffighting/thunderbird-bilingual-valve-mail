/* global browser, messenger, CustomerIntelligence, TranslationSettingsUI */
(function initOptions(global) {
  const api = global.messenger || global.browser;
  const form = document.getElementById("options-form");
  const status = document.getElementById("status");
  const registryStatus = document.getElementById("registryStatus");
  const registryCount = document.getElementById("registryCount");
  const fileInput = document.getElementById("registryFile");
  const translationSettings = TranslationSettingsUI.create(api);
  let customerRecords = [];
  let registryUpdatedAt = "";

  function splitLines(value) {
    return String(value || "")
      .split(/[\n,;；]+/u)
      .map(item => item.trim())
      .filter(Boolean);
  }

  function readForm() {
    return {
      maxMessages: Number(document.getElementById("maxMessages").value),
      bodyLimitPerMessage: Number(document.getElementById("bodyLimitPerMessage").value),
      keyPointLimit: Number(document.getElementById("keyPointLimit").value),
      includeSubFolders: document.getElementById("includeSubFolders").checked,
      autoCustomerResearchEnabled: document.getElementById("autoCustomerResearchEnabled").checked,
      autoUpdateDingTalkResearch: document.getElementById("autoUpdateDingTalkResearch").checked,
      inlineTranslationEnabled: document.getElementById("inlineTranslationEnabled").checked,
      inlineTranslationIncludeQuoted: document.getElementById("inlineTranslationIncludeQuoted").checked,
      composeAssistantEnabled: document.getElementById("composeAssistantEnabled").checked,
      glossaryAutoUpdateEnabled: document.getElementById("glossaryAutoUpdateEnabled").checked,
      ownDomains: splitLines(document.getElementById("ownDomains").value),
      ownEmails: splitLines(document.getElementById("ownEmails").value),
      customerRecords,
      registryUpdatedAt,
      ...translationSettings.read()
    };
  }

  function writeForm(options) {
    document.getElementById("maxMessages").value = options.maxMessages;
    document.getElementById("bodyLimitPerMessage").value = options.bodyLimitPerMessage;
    document.getElementById("keyPointLimit").value = options.keyPointLimit;
    document.getElementById("includeSubFolders").checked = Boolean(options.includeSubFolders);
    document.getElementById("autoCustomerResearchEnabled").checked = options.autoCustomerResearchEnabled !== false;
    document.getElementById("autoUpdateDingTalkResearch").checked = options.autoUpdateDingTalkResearch !== false;
    document.getElementById("inlineTranslationEnabled").checked = options.inlineTranslationEnabled !== false;
    document.getElementById("inlineTranslationIncludeQuoted").checked = Boolean(options.inlineTranslationIncludeQuoted);
    document.getElementById("composeAssistantEnabled").checked = options.composeAssistantEnabled !== false;
    document.getElementById("glossaryAutoUpdateEnabled").checked = options.glossaryAutoUpdateEnabled !== false;
    document.getElementById("ownDomains").value = (options.ownDomains || []).join("\n");
    document.getElementById("ownEmails").value = (options.ownEmails || []).join("\n");
    customerRecords = CustomerIntelligence.normalizeRegistry(options.customerRecords || []);
    registryUpdatedAt = options.registryUpdatedAt || "";
    translationSettings.write(options);
    updateRegistryStatus();
  }

  function updateRegistryStatus(message) {
    registryCount.textContent = `${customerRecords.length} 条`;
    if (message) {
      registryStatus.textContent = message;
    } else if (customerRecords.length) {
      const dateText = registryUpdatedAt ? new Date(registryUpdatedAt).toLocaleString() : "时间未知";
      registryStatus.textContent = `已载入 ${customerRecords.length} 条客户资料，更新于 ${dateText}。`;
    } else {
      registryStatus.textContent = "尚未导入客户资料。";
    }
  }

  async function load() {
    const options = await api.runtime.sendMessage({ type: "getOptions" });
    writeForm(options);
  }

  async function save() {
    status.textContent = "正在保存... / Saving...";
    const saved = await api.runtime.sendMessage({ type: "saveOptions", options: readForm() });
    writeForm(saved);
    status.textContent = "已保存。新的客户资料会立即用于后续摘要。/ Saved.";
  }

  async function importFile(file) {
    const text = await file.text();
    const parsed = CustomerIntelligence.parseRegistryText(text, file.name);
    if (!parsed.length) throw new Error("文件中没有可用客户记录。");
    customerRecords = parsed;
    registryUpdatedAt = new Date().toISOString();
    updateRegistryStatus(`已读取 ${parsed.length} 条客户资料。请点击“保存设置”完成导入。`);
  }

  function downloadTemplate() {
    const headers = [
      "email",
      "domain",
      "company",
      "contact",
      "country",
      "industry",
      "grade",
      "background_zh",
      "background_en",
      "order_count",
      "active_opportunities",
      "last_order_date",
      "projects",
      "tags",
      "dingtalk_url"
    ];
    const example = [
      "buyer@example-industrial.com",
      "example-industrial.com",
      "Example Industrial",
      "Alex",
      "UAE",
      "Oil & Gas",
      "B",
      "示例客户背景",
      "Example customer background",
      "2",
      "1",
      "2026-06-30",
      "Project Alpha;Project Beta",
      "重点客户;EPC",
      "https://alidocs.dingtalk.com/"
    ];
    const csv = `\uFEFF${headers.join(",")}\n${example.map(value => `"${String(value).replace(/"/gu, '""')}"`).join(",")}\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "customer-registry-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    save().catch(error => {
      status.textContent = error.message || "保存失败。/ Failed to save.";
    });
  });
  document.getElementById("saveTop").addEventListener("click", () => {
    form.requestSubmit();
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    importFile(file).catch(error => {
      updateRegistryStatus(`导入失败：${error.message}`);
    });
  });
  document.getElementById("downloadTemplate").addEventListener("click", downloadTemplate);
  document.getElementById("settingsSearch").addEventListener("input", event => {
    const query = String(event.target.value || "").trim().toLocaleLowerCase("zh-CN");
    for (const card of document.querySelectorAll(".settings-card")) {
      const searchable = `${card.dataset.search || ""} ${card.textContent}`.toLocaleLowerCase("zh-CN");
      card.hidden = Boolean(query) && !searchable.includes(query);
    }
  });
  document.getElementById("clearRegistry").addEventListener("click", () => {
    if (!global.confirm("确定清空已导入的客户资料吗？现有邮件摘要功能不会受影响。")) return;
    customerRecords = [];
    registryUpdatedAt = new Date().toISOString();
    fileInput.value = "";
    updateRegistryStatus("客户资料已在当前页面清空；点击“保存设置”后生效。");
  });

  load().catch(error => {
    status.textContent = error.message || "读取设置失败。/ Failed to load settings.";
  });
})(globalThis);
