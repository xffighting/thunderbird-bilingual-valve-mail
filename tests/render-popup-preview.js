const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const outputPath = process.argv[2] || path.join(__dirname, "popup-preview.png");
const drawerOutputPath = outputPath.replace(/(\.[^.]+)$/u, "-drawer$1");
const popupUrl = pathToFileURL(path.join(__dirname, "..", "ui", "popup.html")).href;

const mockSummary = {
  schemaVersion: 3,
  generatedAt: "2026-07-24T05:20:00Z",
  conversation: { messageCount: 8, fromDate: "2026-07-10", toDate: "2026-07-24" },
  overview: {
    zh: "客户询价球阀与止回阀，主要参数已基本明确，仍需确认最终交期。",
    en: "The customer is requesting ball and check valves. Core specifications are mostly clear; final lead time still needs confirmation."
  },
  brief: {
    inquiry: {
      zh: "客户问询：球阀、止回阀；关键参数：100 pcs；DN50；PN16；WCB。",
      en: "Customer inquiry: Ball valve, Check valve; key parameters: 100 pcs; DN50; PN16; WCB."
    },
    project: {
      zh: "项目：Alpha Expansion。",
      en: "Project: Alpha Expansion."
    },
    customer: {
      zh: "客户：Example Industrial · Alex；重要度：A · 战略重点。",
      en: "Customer: Example Industrial · Alex; importance: A · Strategic priority."
    }
  },
  inquiry: {
    status: "rfq",
    categories: ["球阀 / Ball valve", "止回阀 / Check valve"],
    quantity: ["100 pcs"],
    specifications: {
      sizes: ["DN50"],
      pressureRatings: ["PN16"],
      materials: ["WCB"],
      connections: ["法兰 / flanged"],
      actuations: ["手动 / manual"],
      standards: ["API 6D"]
    },
    commercial: { leadTimes: [], deliveryTerms: ["FOB Shanghai"], paymentTerms: [] },
    missingCriticalFields: [{ field: "leadTime", labelZh: "最终交期", labelEn: "Final lead time" }],
    confidence: "high"
  },
  project: {
    status: "inferred",
    confirmedName: "Alpha Expansion",
    nameCandidates: [{ value: "Alpha Expansion", confidence: "high" }],
    confidence: "high"
  },
  projectNames: ["Alpha Expansion"],
  productCategories: ["球阀 / Ball valve", "止回阀 / Check valve"],
  keyPointGroups: [{
    zhTitle: "规格与技术参数",
    enTitle: "Specifications and technical parameters",
    items: [
      { id: "size", zh: "口径或尺寸：DN50", en: "Size or dimension: DN50", evidence: "Size: DN50" },
      { id: "pressure", zh: "压力等级：PN16", en: "Pressure rating: PN16", evidence: "Pressure: PN16" },
      { id: "material", zh: "材质要求：WCB", en: "Material requirement: WCB", evidence: "Material: WCB" }
    ]
  }],
  orderStatus: {
    level: "possible",
    labelZh: "已有询价或报价信号，未发现明确成交",
    labelEn: "Inquiry or quotation signal found; no confirmed deal detected",
    evidence: "RFQ / quotation"
  },
  customer: {
    identity: {
      company: "Example Industrial",
      contact: "Alex",
      email: "buyer@example-industrial.com",
      domain: "example-industrial.com",
      matched: true,
      matchType: "email",
      matchLabelZh: "邮箱精确匹配",
      matchLabelEn: "Exact email match",
      confidence: "high"
    },
    importance: {
      level: "A",
      labelZh: "A · 战略重点",
      labelEn: "A · Strategic priority",
      confidence: "high",
      reasons: [
        { zh: "客户资料已确认等级 A", en: "Customer registry confirms grade A" },
        { zh: "已有 3 笔历史订单", en: "3 historical orders" }
      ]
    },
    background: {
      zh: "中东地区工业与油气项目客户，已有多次阀门询价和成交记录。",
      en: "A Middle East industrial and oil-and-gas customer with repeat valve inquiries and orders.",
      facts: [
        { labelZh: "国家/地区", labelEn: "Country/region", value: "UAE" },
        { labelZh: "历史订单", labelEn: "Historical orders", value: "3" },
        { labelZh: "活跃商机", labelEn: "Active opportunities", value: "2" }
      ],
      tags: ["EPC", "重点客户"]
    },
    dingtalk: {
      status: "available",
      url: "https://docs.dingtalk.com/i/nodes/example"
    }
  }
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(summary => {
    window.browser = {
      runtime: {
        sendMessage: async request => {
          if (request.type === "getSummaryForCurrentMessage") return summary;
          if (request.type === "openDingTalkLink") return { opened: true };
          if (request.type === "openOptionsPage") return true;
          return {};
        }
      }
    };
  }, mockSummary);
  await page.goto(popupUrl);
  await page.waitForSelector("#summary:not([hidden])");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert.strictEqual(overflow, false, "Popup must not overflow horizontally at 760px.");
  assert.strictEqual(await page.locator("#openDingTalk").isEnabled(), true);
  await page.screenshot({ path: outputPath, fullPage: true });

  await page.locator("#showCustomerBackground").click();
  await page.waitForSelector("#customerDrawer:not([hidden])");
  await page.waitForTimeout(220);
  await page.screenshot({ path: drawerOutputPath });
  await page.keyboard.press("Escape");
  assert.strictEqual(await page.locator("#customerDrawer").isHidden(), true);

  await page.setViewportSize({ width: 520, height: 900 });
  const narrowOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert.strictEqual(narrowOverflow, false, "Popup must not overflow horizontally at 520px.");
  assert.deepStrictEqual(pageErrors, [], `Popup should render without page errors: ${pageErrors.join("; ")}`);

  await browser.close();
  console.log(`popup-ui-regression: ok (${outputPath}, ${drawerOutputPath})`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
