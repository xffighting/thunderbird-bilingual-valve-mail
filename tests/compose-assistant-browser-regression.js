const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const mockSession = {
  ok: true,
  id: "compose-42",
  source: "球阀DN50 PN16报价做好了，请查收附件。",
  sourceFingerprint: "sample",
  isPlainText: false,
  requiresHumanReview: false,
  highRiskIntentIds: [],
  engine: "argos-offline",
  technicalTerms: ["球阀 / Ball Valve", "DN50", "PN16"],
  warnings: ["涉及数字、价格、交期或条款时，请以最终审核结果为准。"],
  candidates: [
    {
      code: "zh",
      label: "中文",
      nativeLabel: "中文",
      lang: "zh-CN",
      direction: "ltr",
      blocks: [
        { type: "greeting", text: "您好，" },
        { type: "field", label: "报价信息", text: "球阀 DN50 PN16 报价单已准备完成，敬请查收。" },
        { type: "closing", text: "如有任何问题，请随时与我们联系。" }
      ]
    },
    {
      code: "en",
      label: "英语",
      nativeLabel: "English",
      lang: "en",
      direction: "ltr",
      blocks: [
        { type: "greeting", text: "Hello," },
        { type: "field", label: "Quotation", text: "The quotation for Ball Valve DN50 PN16 is ready for your review." },
        { type: "closing", text: "Please feel free to contact us if you have any questions." }
      ]
    },
    {
      code: "ru",
      label: "俄语",
      nativeLabel: "Русский",
      lang: "ru",
      direction: "ltr",
      blocks: [
        { type: "greeting", text: "Здравствуйте," },
        { type: "field", label: "Коммерческое предложение", text: "Коммерческое предложение подготовлено." },
        { type: "field", label: "Термины для сверки", text: "Ball Valve; DN50; PN16" },
        { type: "closing", text: "Если у Вас возникнут вопросы, пожалуйста, свяжитесь с нами." }
      ]
    },
    {
      code: "ar",
      label: "阿拉伯语",
      nativeLabel: "العربية",
      lang: "ar",
      direction: "rtl",
      blocks: [
        { type: "greeting", text: "مرحبًا،" },
        { type: "field", label: "عرض السعر", text: "تم إعداد عرض السعر لمراجعتكم." },
        { type: "field", label: "مصطلحات مرجعية", text: "Ball Valve; DN50; PN16" },
        { type: "closing", text: "إذا كانت لديكم أي أسئلة، فلا تترددوا في التواصل معنا." }
      ]
    }
  ]
};

(async () => {
  const browser = await chromium.launch({ headless: true });

  const composePage = await browser.newPage();
  const previewRequests = [];
  await composePage.setContent(`
    <!doctype html>
    <html>
      <body contenteditable="true">
        <div id="compose-content">
          <div id="draft">球阀DN50 PN16报价做好了，请查收附件。</div>
          <div class="moz-signature">Clair<br>Lianggu Valve</div>
          <blockquote type="cite"><p>Original customer message</p></blockquote>
        </div>
      </body>
    </html>
  `);
  await composePage.exposeFunction("captureComposePreview", request => {
    previewRequests.push(request);
  });
  await composePage.evaluate(() => {
    const listeners = [];
    globalThis.__composeListeners = listeners;
    globalThis.browser = {
      runtime: {
        sendMessage: async request => {
          await globalThis.captureComposePreview(request);
          return { ok: true };
        },
        onMessage: {
          addListener(listener) {
            listeners.push(listener);
          }
        }
      }
    };
  });
  await composePage.addScriptTag({
    path: path.join(__dirname, "..", "src", "compose-assistant-core.js")
  });
  await composePage.addStyleTag({
    path: path.join(__dirname, "..", "ui", "compose-assistant-compose.css")
  });
  await composePage.addScriptTag({
    path: path.join(__dirname, "..", "ui", "compose-assistant-compose.js")
  });
  await composePage.evaluate(() => {
    document.body.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  await composePage.waitForTimeout(650);
  const draftPreviewRequests = previewRequests.filter(
    request => request.type === "previewComposeDraft"
  );
  assert.strictEqual(draftPreviewRequests.length, 1);
  assert.ok(previewRequests.some(request => request.type === "composeDraftPreviewPending"));
  assert.ok(!draftPreviewRequests[0].source.includes("Original customer message"));
  assert.ok(!draftPreviewRequests[0].source.includes("Lianggu Valve"));

  const staleResult = await composePage.evaluate(async ({ candidate, sourceFingerprint }) => {
    document.getElementById("draft").append(" 请再确认交期。");
    return globalThis.__composeListeners[0]({
      type: "insertComposeSuggestion",
      candidate,
      isPlainText: false,
      sourceFingerprint
    });
  }, {
    candidate: mockSession.candidates[1],
    sourceFingerprint: draftPreviewRequests[0].sourceFingerprint
  });
  assert.strictEqual(staleResult.ok, false);
  assert.strictEqual(staleResult.stale, true);
  assert.ok((await composePage.locator("body").innerText()).includes("请再确认交期"));

  await composePage.evaluate(async candidate => {
    const response = await globalThis.__composeListeners[0]({
      type: "insertComposeSuggestion",
      candidate,
      isPlainText: false
    });
    if (!response.ok) throw new Error(response.message);
  }, mockSession.candidates[1]);
  assert.strictEqual(await composePage.locator("strong").first().textContent(), "Quotation：");
  assert.strictEqual(await composePage.locator(".moz-signature").count(), 1);
  assert.strictEqual(await composePage.locator("blockquote[type='cite']").count(), 1);
  assert.ok((await composePage.locator("body").innerText()).includes("Ball Valve DN50 PN16"));

  await composePage.evaluate(async candidate => {
    document.body.innerHTML = `
      <div>请插入阿拉伯语版本。</div>
      <div class="moz-signature">Clair<br>Lianggu Valve</div>
      <blockquote type="cite"><p>Original customer message</p></blockquote>
    `;
    const response = await globalThis.__composeListeners[0]({
      type: "insertComposeSuggestion",
      candidate,
      isPlainText: true
    });
    if (!response.ok) throw new Error(response.message);
  }, mockSession.candidates[3]);
  assert.strictEqual(await composePage.locator("strong").count(), 0);
  assert.ok((await composePage.locator("body").innerText()).includes("عرض السعر："));
  assert.strictEqual(await composePage.locator(".moz-signature").count(), 1);
  assert.strictEqual(await composePage.locator("blockquote[type='cite']").count(), 1);

  const assistantPage = await browser.newPage({ viewport: { width: 520, height: 800 } });
  const applyRequests = [];
  await assistantPage.exposeFunction("captureApplyRequest", request => {
    applyRequests.push(request);
  });
  await assistantPage.addInitScript(session => {
    globalThis.browser = {
      runtime: {
        sendMessage: async request => {
          if (request.type === "getComposeSuggestionSession") {
            return { ok: true, session };
          }
          if (request.type === "applyComposeSuggestion") {
            await globalThis.captureApplyRequest(request);
            return { ok: true };
          }
          return {};
        },
        onMessage: { addListener() {} }
      }
    };
  }, mockSession);
  const assistantUrl = `${pathToFileURL(
    path.join(__dirname, "..", "ui", "compose-assistant.html")
  ).href}?session=compose-42`;
  await assistantPage.goto(assistantUrl);
  await assistantPage.waitForSelector("#assistantContent:not([hidden])");
  assert.ok((await assistantPage.locator("#syncState").textContent()).includes("已同步"));
  assert.ok((await assistantPage.locator("#updatedAt").textContent()).includes("实时跟随"));
  assert.strictEqual(await assistantPage.locator(".language-tab").count(), 4);
  assert.strictEqual(await assistantPage.locator(".chip").count(), 3);
  await assistantPage.locator(".language-tab[data-language='ar']").click();
  assert.strictEqual(await assistantPage.locator("#candidatePreview").getAttribute("dir"), "rtl");
  assert.ok((await assistantPage.locator("#candidatePreview").innerText()).includes("Ball Valve"));

  fs.mkdirSync(path.join(__dirname, ".artifacts"), { recursive: true });
  await assistantPage.screenshot({
    path: path.join(__dirname, ".artifacts", "compose-assistant.png"),
    fullPage: true
  });
  await assistantPage.setViewportSize({ width: 360, height: 800 });
  const narrowOverflow = await assistantPage.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  assert.strictEqual(narrowOverflow, false, "The assistant must not overflow at 360px.");
  await assistantPage.locator("#insertCandidate").click();
  await assistantPage.waitForTimeout(50);
  assert.deepStrictEqual(applyRequests, [{
    type: "applyComposeSuggestion",
    sessionId: "compose-42",
    language: "ar",
    humanReviewConfirmed: false
  }]);

  const reviewPage = await browser.newPage({ viewport: { width: 520, height: 800 } });
  const reviewApplyRequests = [];
  await reviewPage.exposeFunction("captureReviewApplyRequest", request => {
    reviewApplyRequests.push(request);
  });
  await reviewPage.addInitScript(session => {
    globalThis.browser = {
      runtime: {
        sendMessage: async request => {
          if (request.type === "getComposeSuggestionSession") {
            return { ok: true, session };
          }
          if (request.type === "applyComposeSuggestion") {
            await globalThis.captureReviewApplyRequest(request);
            return { ok: true };
          }
          return {};
        },
        onMessage: { addListener() {} }
      }
    };
  }, {
    ...mockSession,
    requiresHumanReview: true,
    highRiskIntentIds: ["payment_due_by_date"],
    warnings: ["该表达涉及高风险商务条件，请复核。"]
  });
  await reviewPage.goto(assistantUrl);
  await reviewPage.waitForSelector("#assistantContent:not([hidden])");
  assert.strictEqual(await reviewPage.locator("#reviewConfirmation").isVisible(), true);
  assert.strictEqual(await reviewPage.locator("#insertCandidate").isDisabled(), true);
  await reviewPage.locator("#reviewCheckbox").check();
  assert.strictEqual(await reviewPage.locator("#insertCandidate").isEnabled(), true);
  await reviewPage.locator("#insertCandidate").click();
  await reviewPage.waitForTimeout(50);
  assert.deepStrictEqual(reviewApplyRequests, [{
    type: "applyComposeSuggestion",
    sessionId: "compose-42",
    language: "zh",
    humanReviewConfirmed: true
  }]);

  await browser.close();
  console.log("compose-assistant-browser-regression: ok");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
  process.exit();
});
