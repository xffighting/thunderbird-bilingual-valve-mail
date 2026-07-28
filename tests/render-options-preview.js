const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const outputPath = process.argv[2] || path.join(__dirname, "options-preview.png");
const optionsUrl = pathToFileURL(path.join(__dirname, "..", "ui", "options.html")).href;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const defaults = {
      maxMessages: 40,
      bodyLimitPerMessage: 12000,
      keyPointLimit: 12,
      includeSubFolders: false,
      ownDomains: ["our-company.com"],
      ownEmails: [],
      customerRecords: [],
      registryUpdatedAt: "",
      customTerms: [
        {
          id: "term-1",
          en: "Quotation Sheet",
          zh: "报价单",
          category: "business",
          context: "always",
          enabled: true
        }
      ],
      translationFeedback: [
        {
          id: "feedback-1",
          source: "Материал корпуса",
          sourceLanguage: "ru",
          currentTranslation: "身体材料",
          suggestedTranslation: "阀体材质",
          status: "pending",
          createdAt: "2026-07-28T08:00:00.000Z"
        }
      ]
    };
    window.browser = {
      runtime: {
        sendMessage: async request => {
          if (request.type === "getOptions") return defaults;
          if (request.type === "saveOptions") return { ...defaults, ...request.options };
          if (request.type === "checkOfflineTranslator") {
            return {
              ok: true,
              engine: "argos-offline",
              terminology: "lianggu-valve-glossary",
              terminologyVersion: "2026.07.28.1",
              termCount: 45
            };
          }
          if (request.type === "runTranslationBenchmark") {
            return {
              ok: true,
              selectedModel: "translate-en_zh-1_9",
              candidateCount: 1,
              score: 96,
              latencyMs: 138,
              sampleCount: 6
            };
          }
          if (request.type === "reviewTranslationFeedback") {
            return {
              ...defaults,
              customTerms: [
                ...defaults.customTerms,
                {
                  id: request.feedbackId,
                  en: "Материал корпуса",
                  zh: "阀体材质",
                  category: "feedback",
                  context: "always",
                  sourceLanguage: "ru",
                  enabled: true
                }
              ],
              translationFeedback: defaults.translationFeedback.map(item => ({
                ...item,
                status: request.action === "approve" ? "approved" : "rejected"
              }))
            };
          }
          return {};
        }
      }
    };
  });
  await page.goto(optionsUrl);
  await page.waitForSelector("#maxMessages");
  await page.locator("#checkTranslator").click();
  await page.waitForFunction(() => document.getElementById("translatorStatus").textContent.includes("良固阀门术语库"));
  assert.ok(
    (await page.locator("#translatorStatus").textContent()).includes("45 条"),
    "The settings page should show the active valve terminology count."
  );
  assert.strictEqual(await page.locator("#customTermCount").textContent(), "1 条");
  assert.strictEqual(await page.locator(".custom-term-row").count(), 1);
  assert.strictEqual(await page.locator(".feedback-review-row").count(), 1);
  assert.ok(
    (await page.locator(".feedback-review-row strong").textContent()).includes("俄语 → 中文"),
    "pending Russian corrections should display their translation direction"
  );
  await page.getByRole("button", { name: "批准为术语" }).click();
  await page.waitForFunction(() => document.getElementById("pendingFeedbackCount").textContent === "0 条待确认");
  assert.strictEqual(await page.locator(".feedback-review-row").count(), 0);
  assert.strictEqual(await page.locator(".custom-term-row").count(), 2);
  assert.strictEqual(
    await page.locator(".custom-term-row").nth(1).locator("select").first().inputValue(),
    "ru",
    "approved Russian feedback should become an active Russian-to-Chinese custom term"
  );
  await page.locator("#addCustomTerm").click();
  assert.strictEqual(await page.locator(".custom-term-row").count(), 3);
  await page.locator("#runTranslationBenchmark").click();
  await page.waitForFunction(() => document.getElementById("benchmarkStatus").textContent.includes("96"));
  assert.ok(
    (await page.locator("#benchmarkStatus").textContent()).includes("translate-en_zh-1_9"),
    "The selected local model should be visible after evaluation."
  );

  await page.setInputFiles("#registryFile", {
    name: "customers.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([
      "email,domain,company,grade,background_zh,background_en,dingtalk_url",
      "buyer@example-industrial.com,example-industrial.com,Example Industrial,A,重点阀门客户,Priority valve customer,https://docs.dingtalk.com/i/nodes/example"
    ].join("\n"))
  });
  await page.waitForFunction(() => document.getElementById("registryCount").textContent.includes("1"));
  assert.strictEqual(await page.locator("#registryCount").textContent(), "1 条");
  assert.strictEqual(
    await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
    false,
    "Settings must not overflow horizontally."
  );
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.strictEqual(
      await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
      false,
      `Settings must not overflow horizontally at ${width}px.`
    );
  }
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.screenshot({ path: outputPath, fullPage: true });
  await page.locator("#saveTop").click();
  await page.waitForFunction(() => document.getElementById("status").textContent.includes("已保存"));
  assert.deepStrictEqual(pageErrors, [], `Settings should render without page errors: ${pageErrors.join("; ")}`);

  await browser.close();
  console.log(`options-ui-regression: ok (${outputPath})`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
