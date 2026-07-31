const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const requests = [];

  await page.setContent("<!doctype html><html><body><article>Current synthetic RFQ email.</article></body></html>");
  await page.exposeFunction("captureOpportunityRequest", request => {
    requests.push(request);
  });
  await page.evaluate(() => {
    globalThis.confirm = () => true;
    globalThis.browser = {
      runtime: {
        sendMessage: async request => {
          if (request.type === "createOpportunityFromCurrentMessage") {
            await globalThis.captureOpportunityRequest(request);
            return {
              status: "completed",
              dingtalk_opportunity_number: "SJ-SYNTHETIC"
            };
          }
          if (request.type === "getSummaryForDisplayedMessage") {
            return {
              brief: {
                inquiry: { zh: "合成询价。", en: "Synthetic RFQ." },
                customer: { zh: "待审核客户。", en: "Customer pending review." },
                project: { zh: "合成项目。", en: "Synthetic project." }
              },
              productCategories: [],
              keyPointGroups: [],
              orderStatus: {},
              customer: {},
              conversation: {}
            };
          }
          if (request.type === "getCustomerResearchForDisplayedMessage") {
            return {
              status: "ready",
              identity: { company: "Synthetic Customer" },
              dingtalk: { status: "matched", matchEvidence: "exact_email", url: "https://docs.dingtalk.com/i/nodes/example" },
              profile: { completeness: { score: 84, missing: [] } },
              research: {
                matchScore: 78,
                matchLabelZh: "高度匹配",
                quality: 82,
                sourceCount: 3,
                summaryZh: "合成客户与良固阀门业务高度匹配。",
                competitorHits: [],
                groupHits: []
              },
              version: {
                number: 2,
                previous: 1,
                changed: false,
                updatedAt: "2026-07-29T08:00:00Z",
                checkedAt: "2026-07-29T08:00:00Z"
              },
              update: { status: "not_needed", updatedFields: [] }
            };
          }
          return {};
        }
      }
    };
  });
  await page.addStyleTag({
    path: path.join(__dirname, "..", "ui", "message-summary-button.css")
  });
  await page.addScriptTag({
    path: path.join(__dirname, "..", "src", "customer-research.js")
  });
  await page.addScriptTag({
    path: path.join(__dirname, "..", "ui", "message-summary-button.js")
  });

  const opportunityButton = page.locator(".gms-opportunity-trigger");
  await page.waitForFunction(() => {
    return document.querySelector(".gms-summary-trigger")?.textContent.includes("78");
  });
  await opportunityButton.click();
  await page.waitForFunction(() => {
    return document.querySelector(".gms-opportunity-trigger")?.textContent.includes("已建商机");
  });

  assert.deepStrictEqual(
    requests,
    [{ type: "createOpportunityFromCurrentMessage", authorized: true }],
    "The inline one-click button must carry explicit user authorization."
  );
  assert.strictEqual(await page.locator(".gms-panel").isVisible(), true);
  assert.ok(
    (await page.locator(".gms-state").textContent()).includes("SJ-SYNTHETIC"),
    "The inline result should show the formal DingTalk opportunity number."
  );

  const artifactDir = path.join(__dirname, ".artifacts");
  fs.mkdirSync(artifactDir, { recursive: true });
  await page.screenshot({
    path: path.join(artifactDir, "opportunity-intake-inline.png"),
    fullPage: true
  });

  await browser.close();
  console.log("opportunity intake browser regression passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
