/* Customer intelligence helpers. All matching and scoring stays local. */
(function initCustomerIntelligence(global) {
  const PUBLIC_EMAIL_DOMAINS = new Set([
    "gmail.com",
    "googlemail.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "msn.com",
    "yahoo.com",
    "icloud.com",
    "me.com",
    "qq.com",
    "163.com",
    "126.com",
    "sina.com",
    "foxmail.com",
    "proton.me",
    "protonmail.com"
  ]);

  const GRADE_INFO = {
    A: { score: 90, zh: "战略重点", en: "Strategic priority" },
    B: { score: 70, zh: "重点跟进", en: "High-value follow-up" },
    C: { score: 50, zh: "常规培育", en: "Standard nurture" },
    D: { score: 30, zh: "低频维护", en: "Low-touch maintenance" }
  };

  const HEADER_ALIASES = {
    email: ["email", "emails", "邮箱", "电子邮箱"],
    domain: ["domain", "domains", "域名", "公司域名"],
    company: ["company", "公司", "客户公司", "客户名称"],
    contact: ["contact", "联系人", "姓名"],
    country: ["country", "国家", "地区"],
    industry: ["industry", "行业"],
    grade: ["grade", "customer_grade", "客户等级", "客户重要度"],
    backgroundZh: ["background_zh", "backgroundzh", "客户背景", "中文背景"],
    backgroundEn: ["background_en", "backgrounden", "english_background", "英文背景"],
    orderCount: ["order_count", "ordercount", "历史订单数", "订单数"],
    orderValue: ["order_value", "ordervalue", "历史成交额", "成交额"],
    activeOpportunities: ["active_opportunities", "activeopportunities", "活跃商机数", "商机数"],
    lastOrderDate: ["last_order_date", "lastorderdate", "最近订单日期", "最后成交日期"],
    projects: ["projects", "项目", "历史项目"],
    tags: ["tags", "标签"],
    dingtalkUrl: ["dingtalk_url", "dingtalkurl", "钉钉链接", "钉钉客户链接"]
  };

  function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeEmail(value) {
    const match = String(value || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu);
    return match ? match[0].toLowerCase() : "";
  }

  function domainFromEmail(email) {
    const normalized = normalizeEmail(email);
    return normalized.includes("@") ? normalized.split("@").pop() : "";
  }

  function normalizeDomain(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/^https?:\/\//u, "")
      .replace(/^www\./u, "")
      .replace(/^@/u, "")
      .split(/[/?#\s]/u)[0]
      .trim();
  }

  function parseMailbox(value) {
    const raw = normalizeWhitespace(value);
    const email = normalizeEmail(raw);
    const angleName = raw.match(/^\s*([^<]+?)\s*<[^>]+>/u);
    const name = angleName
      ? normalizeWhitespace(angleName[1]).replace(/^["']|["']$/gu, "")
      : normalizeWhitespace(raw.replace(email, "").replace(/[<>"]/gu, ""));
    return {
      raw,
      email,
      domain: domainFromEmail(email),
      name
    };
  }

  function splitList(value) {
    if (Array.isArray(value)) return value.map(normalizeWhitespace).filter(Boolean);
    return String(value || "")
      .split(/[;；|\n]+/u)
      .map(normalizeWhitespace)
      .filter(Boolean);
  }

  function toNumber(value) {
    const normalized = String(value ?? "").replace(/[,\s]/gu, "");
    if (!normalized) return 0;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : 0;
  }

  function normalizeGrade(value) {
    const raw = normalizeWhitespace(value).toUpperCase();
    const match = raw.match(/\b([ABCD])\b/u) || raw.match(/^([ABCD])/u);
    return match ? match[1] : "";
  }

  function pickAliasedValue(input, key) {
    const aliases = HEADER_ALIASES[key] || [key];
    const normalizedEntries = new Map(
      Object.entries(input || {}).map(([inputKey, value]) => [String(inputKey).trim().toLowerCase(), value])
    );
    for (const alias of aliases) {
      const value = normalizedEntries.get(alias.toLowerCase());
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return "";
  }

  function normalizeCustomerRecord(input, index) {
    const emailValues = splitList(pickAliasedValue(input, "email")).map(normalizeEmail).filter(Boolean);
    const explicitDomains = splitList(pickAliasedValue(input, "domain")).map(normalizeDomain).filter(Boolean);
    const derivedDomains = emailValues.map(domainFromEmail).filter(Boolean);
    const domains = [...new Set([...explicitDomains, ...derivedDomains].filter(Boolean))];

    return {
      id: normalizeWhitespace(input?.id) || `customer-${index + 1}`,
      emails: [...new Set(emailValues)],
      domains,
      company: normalizeWhitespace(pickAliasedValue(input, "company")),
      contact: normalizeWhitespace(pickAliasedValue(input, "contact")),
      country: normalizeWhitespace(pickAliasedValue(input, "country")),
      industry: normalizeWhitespace(pickAliasedValue(input, "industry")),
      grade: normalizeGrade(pickAliasedValue(input, "grade")),
      backgroundZh: normalizeWhitespace(pickAliasedValue(input, "backgroundZh")),
      backgroundEn: normalizeWhitespace(pickAliasedValue(input, "backgroundEn")),
      orderCount: Math.max(0, Math.round(toNumber(pickAliasedValue(input, "orderCount")))),
      orderValue: Math.max(0, toNumber(pickAliasedValue(input, "orderValue"))),
      activeOpportunities: Math.max(0, Math.round(toNumber(pickAliasedValue(input, "activeOpportunities")))),
      lastOrderDate: normalizeWhitespace(pickAliasedValue(input, "lastOrderDate")),
      projects: splitList(pickAliasedValue(input, "projects")),
      tags: splitList(pickAliasedValue(input, "tags")),
      dingtalkUrl: normalizeWhitespace(pickAliasedValue(input, "dingtalkUrl"))
    };
  }

  function parseDelimited(text, delimiter) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '"') {
        if (quoted && next === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === delimiter && !quoted) {
        row.push(field);
        field = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") index += 1;
        row.push(field);
        if (row.some(value => String(value).trim())) rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }

    row.push(field);
    if (row.some(value => String(value).trim())) rows.push(row);
    if (!rows.length) return [];

    const headers = rows.shift().map(value => String(value).replace(/^\uFEFF/u, "").trim());
    return rows.map(values => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = values[index] ?? "";
      });
      return record;
    });
  }

  function parseRegistryText(text, fileName) {
    const source = String(text || "").trim();
    if (!source) return [];

    let rawRecords;
    if (/\.json$/iu.test(fileName || "") || /^[\[{]/u.test(source)) {
      const parsed = JSON.parse(source);
      rawRecords = Array.isArray(parsed) ? parsed : parsed.records || parsed.customers || [];
      if (!Array.isArray(rawRecords)) throw new Error("JSON 必须是客户数组，或包含 records/customers 数组。");
    } else {
      const firstLine = source.split(/\r?\n/u)[0] || "";
      const delimiter = firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
      rawRecords = parseDelimited(source, delimiter);
    }

    return rawRecords
      .map((record, index) => normalizeCustomerRecord(record, index))
      .filter(record => record.emails.length || record.domains.length || record.company);
  }

  function normalizeRegistry(records) {
    return (Array.isArray(records) ? records : [])
      .map((record, index) => normalizeCustomerRecord(record, index))
      .filter(record => record.emails.length || record.domains.length || record.company);
  }

  function isOwnMailbox(mailbox, ownDomains, ownEmails) {
    const normalizedOwnDomains = new Set(splitList(ownDomains).map(normalizeDomain).filter(Boolean));
    const normalizedOwnEmails = new Set(splitList(ownEmails).map(normalizeEmail).filter(Boolean));
    return normalizedOwnEmails.has(mailbox.email) || normalizedOwnDomains.has(mailbox.domain);
  }

  function getCandidateMailboxes(header, entries, options) {
    const ownDomains = options.ownDomains || [];
    const ownEmails = options.ownEmails || [];
    const currentAuthor = parseMailbox(header?.author || "");
    const currentRecipients = [
      ...(header?.recipients || []),
      ...(header?.ccList || [])
    ].map(parseMailbox);

    if (currentAuthor.email && !isOwnMailbox(currentAuthor, ownDomains, ownEmails)) {
      return [currentAuthor];
    }

    const recipients = currentRecipients.filter(mailbox => mailbox.email && !isOwnMailbox(mailbox, ownDomains, ownEmails));
    if (recipients.length) return recipients;

    const latestExternalAuthors = [...(entries || [])]
      .reverse()
      .map(entry => parseMailbox(entry?.header?.author || ""))
      .filter(mailbox => mailbox.email && !isOwnMailbox(mailbox, ownDomains, ownEmails));
    return latestExternalAuthors.length ? latestExternalAuthors : [currentAuthor].filter(mailbox => mailbox.email);
  }

  function matchCustomerRecord(mailboxes, records) {
    const exactMatches = [];
    for (const mailbox of mailboxes) {
      const emailMatches = records.filter(record => record.emails.includes(mailbox.email));
      if (emailMatches.length > 1) {
        return { record: null, mailbox, matchType: "email", confidence: "low", ambiguous: true };
      }
      if (emailMatches.length === 1) exactMatches.push({ record: emailMatches[0], mailbox });
    }

    const uniqueExactRecords = new Map(exactMatches.map(match => [match.record.id, match]));
    if (uniqueExactRecords.size > 1) {
      return { record: null, mailbox: mailboxes[0], matchType: "email", confidence: "low", ambiguous: true };
    }
    if (uniqueExactRecords.size === 1) {
      const exact = [...uniqueExactRecords.values()][0];
      if (exact.mailbox.domain && !PUBLIC_EMAIL_DOMAINS.has(exact.mailbox.domain)) {
        const domainMatches = records.filter(record => record.domains.includes(exact.mailbox.domain));
        if (domainMatches.length > 1 || (domainMatches.length === 1 && domainMatches[0].id !== exact.record.id)) {
          return { record: null, mailbox: exact.mailbox, matchType: "conflict", confidence: "low", ambiguous: true };
        }
      }
      return { record: exact.record, mailbox: exact.mailbox, matchType: "email", confidence: "high", ambiguous: false };
    }

    const domainMatchesByRecord = new Map();
    for (const mailbox of mailboxes) {
      if (!mailbox.domain || PUBLIC_EMAIL_DOMAINS.has(mailbox.domain)) continue;
      const domainMatches = records.filter(record => record.domains.includes(mailbox.domain));
      if (domainMatches.length > 1) {
        return { record: null, mailbox, matchType: "domain", confidence: "low", ambiguous: true };
      }
      if (domainMatches.length === 1) {
        domainMatchesByRecord.set(domainMatches[0].id, { record: domainMatches[0], mailbox });
      }
    }
    if (domainMatchesByRecord.size > 1) {
      return { record: null, mailbox: mailboxes[0], matchType: "domain", confidence: "low", ambiguous: true };
    }
    if (domainMatchesByRecord.size === 1) {
      const match = [...domainMatchesByRecord.values()][0];
      return { record: match.record, mailbox: match.mailbox, matchType: "domain", confidence: "medium", ambiguous: false };
    }

    const candidateDomains = new Set(mailboxes.map(mailbox => mailbox.domain).filter(Boolean));
    if (candidateDomains.size > 1) {
      return {
        record: null,
        mailbox: mailboxes[0],
        matchType: "multiple-external-recipients",
        confidence: "low",
        ambiguous: true
      };
    }

    return {
      record: null,
      mailbox: mailboxes[0] || { email: "", domain: "", name: "" },
      matchType: "none",
      confidence: "low",
      ambiguous: false
    };
  }

  function gradeFromScore(score) {
    if (score >= 80) return "A";
    if (score >= 60) return "B";
    if (score >= 40) return "C";
    return "D";
  }

  function assessImportance(record, summary, match) {
    if (!record) {
      return {
        level: "unrated",
        score: null,
        labelZh: "待评估",
        labelEn: "Needs assessment",
        source: "not-connected",
        provisional: true,
        confidence: "low",
        reasons: [{
          zh: match.ambiguous ? "匹配到多条客户资料，需要人工确认" : "未匹配到客户主数据，不能据此判断长期客户价值",
          en: match.ambiguous
            ? "Multiple customer records matched; manual confirmation is required"
            : "No customer master record matched; long-term customer value cannot be rated"
        }]
      };
    }

    const reasons = [];
    let score = 25;
    let source = "conversation-estimate";

    if (record?.grade && GRADE_INFO[record.grade]) {
      score = GRADE_INFO[record.grade].score;
      source = "customer-registry";
      reasons.push({
        zh: `客户资料已确认等级 ${record.grade}`,
        en: `Customer registry confirms grade ${record.grade}`
      });
    } else {
      if (record?.orderCount >= 3) {
        score += 30;
        reasons.push({ zh: `已有 ${record.orderCount} 笔历史订单`, en: `${record.orderCount} historical orders` });
      } else if (record?.orderCount >= 1) {
        score += 20;
        reasons.push({ zh: `已有 ${record.orderCount} 笔历史订单`, en: `${record.orderCount} historical order(s)` });
      }

      if (record?.activeOpportunities >= 2) {
        score += 15;
        reasons.push({ zh: `有 ${record.activeOpportunities} 个活跃商机`, en: `${record.activeOpportunities} active opportunities` });
      } else if (record?.activeOpportunities === 1) {
        score += 10;
        reasons.push({ zh: "有 1 个活跃商机", en: "1 active opportunity" });
      }

      const tags = (record?.tags || []).join(" ");
      if (/战略|重点|strategic|key\s*account/iu.test(tags)) {
        score += 15;
        reasons.push({ zh: "客户资料含战略/重点标签", en: "Registry includes a strategic/key-account tag" });
      }

      if (summary?.orderStatus?.level === "done") {
        score += 15;
        reasons.push({ zh: "当前会话存在明确订单或成交信号", en: "Current thread includes a confirmed order/deal signal" });
      }

      if ((summary?.conversation?.messageCount || 0) >= 8) {
        score += 8;
        reasons.push({ zh: "当前邮件往来较深入", en: "The current email thread is relatively mature" });
      } else if ((summary?.conversation?.messageCount || 0) >= 4) {
        score += 4;
        reasons.push({ zh: "已有多轮邮件往来", en: "There have been multiple email exchanges" });
      }

      if ((summary?.productCategories || []).length >= 3) {
        score += 5;
        reasons.push({ zh: "本次询价覆盖多个产品品类", en: "The inquiry spans multiple product categories" });
      }
    }

    score = Math.max(0, Math.min(100, score));
    const level = record?.grade && GRADE_INFO[record.grade] ? record.grade : gradeFromScore(score);
    const info = GRADE_INFO[level];
    const provisional = source !== "customer-registry";
    const confidence = source === "customer-registry"
      ? "high"
      : match.record && (record.orderCount || record.activeOpportunities || record.tags.length)
        ? "medium"
        : "low";

    if (!reasons.length) {
      reasons.push({
        zh: "缺少历史订单与 CRM 等级，仅按当前会话暂估",
        en: "No CRM grade or order history; estimated from the current thread only"
      });
    }

    return {
      level,
      score,
      labelZh: `${level} · ${info.zh}${provisional ? "（暂估）" : ""}`,
      labelEn: `${level} · ${info.en}${provisional ? " (provisional)" : ""}`,
      source,
      provisional,
      confidence,
      reasons: reasons.slice(0, 4)
    };
  }

  function validateDingTalkUrl(value) {
    const raw = normalizeWhitespace(value);
    if (!raw) return { status: "missing", url: "", reason: "not-configured" };
    try {
      const url = new URL(raw);
      const host = url.hostname.toLowerCase();
      const officialHost = host === "dingtalk.com"
        || host.endsWith(".dingtalk.com")
        || host === "alidocs.com"
        || host.endsWith(".alidocs.com");
      if (url.protocol === "https:" && officialHost) {
        return { status: "available", url: raw, reason: "official-https" };
      }
      return { status: "invalid", url: "", reason: "unsupported-host-or-protocol" };
    } catch (error) {
      return { status: "invalid", url: "", reason: "invalid-url" };
    }
  }

  function backgroundFacts(record) {
    if (!record) return [];
    const facts = [];
    if (record.country) facts.push({ labelZh: "国家/地区", labelEn: "Country/region", value: record.country });
    if (record.industry) facts.push({ labelZh: "行业", labelEn: "Industry", value: record.industry });
    if (record.orderCount) facts.push({ labelZh: "历史订单", labelEn: "Historical orders", value: String(record.orderCount) });
    if (record.activeOpportunities) facts.push({ labelZh: "活跃商机", labelEn: "Active opportunities", value: String(record.activeOpportunities) });
    if (record.lastOrderDate) facts.push({ labelZh: "最近订单", labelEn: "Latest order", value: record.lastOrderDate });
    if (record.projects.length) facts.push({ labelZh: "历史项目", labelEn: "Known projects", value: record.projects.slice(0, 4).join("；") });
    return facts;
  }

  function buildCustomerInsight(header, entries, summary, options) {
    const records = normalizeRegistry(options?.customerRecords || []);
    const mailboxes = getCandidateMailboxes(header, entries, options || {});
    const match = matchCustomerRecord(mailboxes, records);
    const record = match.record;
    const mailbox = match.mailbox || {};
    const importance = assessImportance(record, summary, match);
    if (record && match.matchType === "domain" && importance.level !== "unrated") {
      importance.provisional = true;
      importance.confidence = "medium";
      importance.labelZh = `${importance.level} · ${GRADE_INFO[importance.level]?.zh || "客户等级"}（域名匹配，待确认）`;
      importance.labelEn = `${importance.level} · ${GRADE_INFO[importance.level]?.en || "Customer grade"} (domain match; review required)`;
      importance.reasons.unshift({
        zh: "仅按公司域名匹配，客户等级需人工确认",
        en: "Matched by company domain only; customer grade requires manual confirmation"
      });
    }
    const validatedDingTalk = validateDingTalkUrl(record?.dingtalkUrl || "");
    const dingtalk = match.matchType === "email"
      ? validatedDingTalk
      : {
          status: validatedDingTalk.status === "invalid" ? "invalid" : "review",
          url: "",
          reason: match.matchType === "domain" ? "exact-email-required" : "unique-customer-match-required"
        };

    const company = record?.company || mailbox.domain || "未识别";
    const contact = record?.contact || mailbox.name || "";
    const matched = Boolean(record);
    const matchLabelZh = match.ambiguous
      ? "匹配到多条记录，需要人工确认"
      : match.matchType === "email"
        ? "邮箱精确匹配"
        : match.matchType === "domain"
          ? "公司域名匹配"
          : "未匹配客户资料";
    const matchLabelEn = match.ambiguous
      ? "Multiple records matched; manual review required"
      : match.matchType === "email"
        ? "Exact email match"
        : match.matchType === "domain"
          ? "Company-domain match"
          : "No customer record matched";

    return {
      identity: {
        company,
        contact,
        email: mailbox.email || "",
        domain: mailbox.domain || "",
        matched,
        matchType: match.matchType,
        matchLabelZh,
        matchLabelEn,
        confidence: match.confidence,
        ambiguous: match.ambiguous
      },
      importance,
      background: {
        zh: record?.backgroundZh || "暂无已导入的客户背景说明。",
        en: record?.backgroundEn || "No imported customer background is available.",
        facts: backgroundFacts(record),
        tags: record?.tags || [],
        source: matched ? "customer-registry" : "email-header-only"
      },
      dingtalk: {
        ...dingtalk,
        labelZh: dingtalk.status === "available"
          ? "在钉钉中打开客户/商机"
          : dingtalk.status === "review"
            ? "需精确邮箱匹配后才能打开"
            : "未配置钉钉链接",
        labelEn: dingtalk.status === "available"
          ? "Open customer/opportunity in DingTalk"
          : dingtalk.status === "review"
            ? "Exact email match required before opening"
            : "DingTalk link not configured"
      }
    };
  }

  function getTopGroupValues(summary, ids, language, limit) {
    const values = [];
    for (const group of summary?.analysisKeyPointGroups || summary?.keyPointGroups || []) {
      for (const item of group.items || []) {
        if (!ids.includes(item.id)) continue;
        const value = language === "zh"
          ? item.valueZh || item.zh || item.value
          : item.valueEn || item.en || item.rawValue || item.value;
        if (value && !values.includes(value)) values.push(value);
        if (values.length >= limit) return values;
      }
    }
    return values;
  }

  function splitBilingualProduct(value, language) {
    const parts = String(value || "").split(/\s*\/\s*/u);
    return language === "en" ? parts[1] || parts[0] : parts[0];
  }

  function buildBusinessBrief(summary, customer) {
    const productsZh = (summary.productCategories || []).map(value => splitBilingualProduct(value, "zh"));
    const productsEn = (summary.productCategories || []).map(value => splitBilingualProduct(value, "en"));
    const briefFieldIds = ["quantity", "size", "pressure", "material", "standard", "connection", "delivery", "payment"];
    const parametersZh = getTopGroupValues(summary, briefFieldIds, "zh", 5);
    const parametersEn = getTopGroupValues(summary, briefFieldIds, "en", 5);
    const actionsZh = getTopGroupValues(summary, ["customerQuestion", "internalAction"], "zh", 2);
    const actionsEn = getTopGroupValues(summary, ["customerQuestion", "internalAction"], "en", 2);
    const projectNames = summary.projectNames || [];
    const projectNamesEn = summary.project?.nameCandidates?.length
      ? summary.project.nameCandidates.map(item => item.valueEn || item.value)
      : projectNames;
    const projectConfidence = projectNames.length
      ? /\bproject\s*(?:name|no\.?|number)?\s*[:：#-]|项目(?:名称|编号)?\s*[:：#-]?/iu.test(summary._analysisText || "")
        ? "high"
        : "medium"
      : "low";

    const triage = summary.messageTriage || {};
    const productTextZh = productsZh.length ? productsZh.join("、") : "品类待确认";
    const productTextEn = productsEn.length ? productsEn.join(", ") : "category pending confirmation";
    const parameterTextZh = parametersZh.length ? `；关键参数：${parametersZh.join("；")}` : "；关键参数待补充";
    const parameterTextEn = parametersEn.length ? `; key parameters: ${parametersEn.join("; ")}` : "; key parameters pending";
    const inquiryBrief = triage.category === "noise"
      ? {
          zh: "非询价邮件：疑似市场推广、调研报告或数据服务信息，建议忽略或人工确认。",
          en: "Not an RFQ: likely marketing, market-research, or data-service outreach; ignore or review manually.",
          confidence: triage.confidence || "high"
        }
      : triage.category === "receipt"
        ? {
            zh: "邮件状态：这是已读回执，没有发现新的询价参数或客户动作。",
            en: "Mail status: this is a read receipt; no new RFQ parameters or customer action were found.",
            confidence: triage.confidence || "high"
          }
        : triage.category === "order_follow_up"
          ? {
              zh: `订单/技术跟进：${productsZh.length ? productsZh.join("、") : "产品范围以原订单为准"}；请重点核对 ITP、符合性、见证点或最新技术文件，当前邮件不作为新询价。`,
              en: `Order/technical follow-up: ${productsEn.length ? productsEn.join(", ") : "refer to the existing order for product scope"}; review the ITP, compliance, witness points, or latest technical documents. This is not a new RFQ.`,
              confidence: triage.confidence || "high"
            }
          : triage.category === "general_follow_up"
            ? {
                zh: "一般跟进：对方要求确认、回复或补充现有文件；当前邮件没有形成新的阀门询价参数。",
                en: "General follow-up: the sender requests confirmation, a reply, or completion of existing documents; no new valve RFQ parameters were found.",
                confidence: triage.confidence || "medium"
              }
            : triage.category === "inquiry_follow_up"
              ? {
                  zh: `询价跟进：${productsZh.length ? productsZh.join("、") : "产品范围待确认"}${parametersZh.length ? `；已识别：${parametersZh.join("；")}` : "；本封邮件未新增明确参数"}。`,
                  en: `Inquiry follow-up: ${productsEn.length ? productsEn.join(", ") : "product scope pending confirmation"}${parametersEn.length ? `; identified: ${parametersEn.join("; ")}` : "; this message adds no clear parameters"}.`,
                  confidence: triage.confidence || "medium"
                }
              : {
                  zh: `客户问询：${productTextZh}${parameterTextZh}。`,
                  en: `Customer inquiry: ${productTextEn}${parameterTextEn}.`,
                  confidence: productsZh.length && parametersZh.length ? "high" : productsZh.length ? "medium" : "low"
                };

    return {
      inquiry: inquiryBrief,
      project: {
        zh: projectNames.length ? `项目：${projectNames.join("；")}。` : "项目名称尚未可靠识别。",
        en: projectNamesEn.length ? `Project: ${projectNamesEn.join("; ")}.` : "Project name has not been identified reliably.",
        confidence: projectConfidence
      },
      customer: {
        zh: `客户：${customer.identity.company}${customer.identity.contact ? ` · ${customer.identity.contact}` : ""}；重要度：${customer.importance.labelZh}。`,
        en: `Customer: ${customer.identity.company}${customer.identity.contact ? ` · ${customer.identity.contact}` : ""}; importance: ${customer.importance.labelEn}.`,
        confidence: customer.importance.confidence
      },
      nextAction: {
        zh: actionsZh.length ? `下一步：${actionsZh.join("；")}。` : "下一步：请人工核对缺失参数和回复事项。",
        en: actionsEn.length ? `Next: ${actionsEn.join("; ")}.` : "Next: manually review missing parameters and reply items.",
        confidence: actionsZh.length ? "medium" : "low"
      }
    };
  }

  global.CustomerIntelligence = {
    PUBLIC_EMAIL_DOMAINS,
    parseMailbox,
    parseRegistryText,
    normalizeRegistry,
    validateDingTalkUrl,
    buildCustomerInsight,
    buildBusinessBrief
  };
})(globalThis);
