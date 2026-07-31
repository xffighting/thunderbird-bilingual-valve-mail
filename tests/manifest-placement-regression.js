const assert = require("assert");
const fs = require("fs");
const path = require("path");

const manifestPath = path.join(__dirname, "..", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const packageManifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
);
const background = fs.readFileSync(path.join(__dirname, "..", "src", "background.js"), "utf8");
const threadKeeper = fs.readFileSync(
  path.join(__dirname, "..", "src", "thread-keeper.js"),
  "utf8"
);
const inlineButton = fs.readFileSync(
  path.join(__dirname, "..", "ui", "message-summary-button.js"),
  "utf8"
);
const nativeInstaller = fs.readFileSync(
  path.join(__dirname, "..", "native-host", "install_macos.sh"),
  "utf8"
);

assert.strictEqual(
  manifest.version,
  packageManifest.version,
  "The Thunderbird and release package versions must stay aligned."
);
assert.ok(manifest.action, "The add-on should keep the main Thunderbird toolbar button.");
assert.ok(manifest.action.default_title.length <= 8, "Keep the main toolbar title short.");
assert.ok(
  manifest.permissions.includes("messagesRead") && manifest.permissions.includes("scripting"),
  "The add-on should use the Thunderbird 128+ scripting.messageDisplay API."
);
assert.ok(
  manifest.permissions.includes("compose"),
  "The multilingual reply assistant needs access to the active compose editor."
);
assert.ok(
  manifest.permissions.includes("nativeMessaging"),
  "Offline translation should use a local native host instead of a remote translation API."
);
assert.ok(
  manifest.permissions.includes("alarms"),
  "Signed glossary checks need a restart-safe 24-hour schedule."
);
assert.deepStrictEqual(
  manifest.host_permissions,
  [
    "https://xffighting.github.io/open-valve-glossary/*",
    "https://feiver.net/open-valve-glossary/*",
    "https://api.github.com/repos/xffighting/open-valve-glossary/releases/*",
    "https://github.com/xffighting/open-valve-glossary/releases/*",
    "https://release-assets.githubusercontent.com/*"
  ],
  "Glossary networking must remain limited to the public registry and signed GitHub Release fallback."
);
assert.ok(
  !manifest.permissions.includes("messagesModify"),
  "The add-on must remain read-only with respect to Thunderbird messages."
);
assert.ok(!manifest.message_display_scripts, "Do not use the TB151-only manifest property when supporting TB128.");
assert.ok(!manifest.message_display_action, "Do not place the add-on near Reply/Archive/Delete.");
const requiredBackgroundScripts = [
  "src/customer-intelligence.js",
  "src/customer-research.js",
  "src/translation-preferences.js",
  "src/summary.js",
  "src/translation-native.js",
  "src/glossary-update.js",
  "src/opportunity-intake-native.js",
  "src/compose-assistant-core.js",
  "src/thread-keeper.js",
  "src/compose-assistant-background.js",
  "src/background.js"
];
for (const script of requiredBackgroundScripts) {
  assert.ok(manifest.background.scripts.includes(script), `${script} must load in the background.`);
}
assert.strictEqual(
  manifest.background.scripts.at(-1),
  "src/background.js",
  "The background event router must load after its dependencies."
);

for (const filePath of [
  "ui/message-summary-button.js",
  "ui/message-summary-button.css",
  "ui/inline-translation.js",
  "ui/inline-translation.css",
  "src/inline-translation-core.js"
]) {
  assert.ok(
    fs.existsSync(path.join(__dirname, "..", filePath)),
    `${filePath} should exist for the inline message-view fallback.`
  );
}

assert.ok(
  background.includes("getSummaryForDisplayedMessage"),
  "The inline button should request the summary for the displayed message tab."
);
assert.ok(background.includes("getDisplayedMessages"), "Use the Manifest V3 message display API.");
assert.ok(
  background.includes("createOpportunityFromCurrentMessage") &&
  background.includes("messages.getRaw") &&
  background.includes("authorized !== true"),
  "Opportunity intake must read only the selected message and require explicit user authorization."
);
assert.ok(background.includes("onMessagesDisplayed"), "Use the Manifest V3 message display event.");
assert.ok(
  background.includes("onNewMailReceived") &&
  background.includes("scheduleBackgroundResearch") &&
  background.includes("getCustomerResearchForDisplayedMessage"),
  "New mail should prepare versioned customer intelligence before the user opens it."
);
assert.ok(background.includes("scripting.messageDisplay.registerScripts"), "Register the inline script on TB128+.");
assert.ok(background.includes("scripting.executeScript"), "Inject the inline entry into already-open message tabs.");
const composeBackground = fs.readFileSync(
  path.join(__dirname, "..", "src", "compose-assistant-background.js"),
  "utf8"
);
const summarySource = fs.readFileSync(
  path.join(__dirname, "..", "src", "summary.js"),
  "utf8"
);
const optionsHtml = fs.readFileSync(
  path.join(__dirname, "..", "ui", "options.html"),
  "utf8"
);
const composeAssistantHtml = fs.readFileSync(
  path.join(__dirname, "..", "ui", "compose-assistant.html"),
  "utf8"
);
assert.ok(
  composeBackground.includes("scripting?.compose") &&
  composeBackground.includes("registerScripts"),
  "Register the compose assistant through the Thunderbird 128+ scripting.compose API."
);
assert.ok(
  composeBackground.includes("insertComposeSuggestion"),
  "Selected language content should be sent back to the current compose editor."
);
assert.ok(
  composeBackground.includes("latestFingerprintByTab") &&
  composeBackground.includes("composeDraftPreviewPending") &&
  composeBackground.includes("focused: false") &&
  !composeBackground.includes("focused: true"),
  "Real-time compose refresh must discard stale results and must not steal typing focus."
);
assert.ok(
  composeBackground.includes("reviewRequired") &&
  composeAssistantHtml.includes('id="reviewConfirmation"'),
  "High-risk business templates must require visible human review before insertion."
);
assert.ok(
  threadKeeper.includes("compose.onBeforeSend") &&
  threadKeeper.includes("overrideDefaultFccFolderId") &&
  threadKeeper.includes("compose.onAfterSend"),
  "Replies should resolve the customer thread before sending and verify the resulting FCC copy."
);
assert.ok(
  inlineButton.includes("openReplyForDisplayedMessage") &&
  threadKeeper.includes("compose.beginReply"),
  "The inline reply entry should always start from the original displayed customer message."
);
assert.ok(
  summarySource.includes("composeAssistantEnabled: true") &&
  composeBackground.includes("composeAssistantEnabled !== false") &&
  optionsHtml.includes('id="composeAssistantEnabled"'),
  "The automatic compose popup should be enabled by default and switchable in Settings."
);
assert.ok(!manifest.permissions.includes("tabs"), "Do not request broad tab metadata access.");
assert.ok(
  fs.existsSync(path.join(__dirname, "..", "native-host", "valve_glossary.json")),
  "The offline translator should ship with the Lianggu valve glossary."
);
assert.ok(
  fs.existsSync(
    path.join(__dirname, "..", "native-host", "valve_glossary_multilingual.json")
  ),
  "The offline translator should ship with the four-language valve glossary."
);
assert.ok(
  fs.existsSync(
    path.join(
      __dirname,
      "..",
      "native-host",
      "valve_glossary_batch_2026_07_30.json"
    )
  ),
  "The offline translator should ship with the independently reviewed glossary batch."
);
assert.ok(
  fs.existsSync(
    path.join(
      __dirname,
      "..",
      "native-host",
      "valve_glossary_batch_2026_07_30_round2.json"
    )
  ),
  "The offline translator should ship with the round-two QA-whitelisted glossary."
);
assert.ok(
  fs.existsSync(
    path.join(__dirname, "..", "native-host", "reply_intents_multilingual.json")
  ),
  "The offline translator should ship with the QA-whitelisted reply-intent library."
);
assert.ok(
  fs.existsSync(
    path.join(__dirname, "..", "native-host", "open_valve_glossary_bundle.json")
  ) &&
  fs.existsSync(
    path.join(__dirname, "..", "native-host", "glossary_provider.py")
  ),
  "The native host should ship with the verified provider and v1.2.0 fallback bundle."
);
assert.ok(
  nativeInstaller.includes('cp "${SOURCE_DIR}/valve_glossary.json" "${APP_DIR}/valve_glossary.json"'),
  "The macOS installer should install the valve glossary next to the native host."
);
assert.ok(
  nativeInstaller.includes(
    'cp "${SOURCE_DIR}/valve_glossary_multilingual.json" "${APP_DIR}/valve_glossary_multilingual.json"'
  ),
  "The macOS installer should install the four-language valve glossary."
);
assert.ok(
  nativeInstaller.includes(
    'cp "${SOURCE_DIR}/valve_glossary_batch_2026_07_30.json" "${APP_DIR}/valve_glossary_batch_2026_07_30.json"'
  ),
  "The macOS installer should install the independently reviewed glossary batch."
);
assert.ok(
  nativeInstaller.includes(
    'cp "${SOURCE_DIR}/valve_glossary_batch_2026_07_30_round2.json" "${APP_DIR}/valve_glossary_batch_2026_07_30_round2.json"'
  ),
  "The macOS installer should install the round-two QA-whitelisted glossary."
);
assert.ok(
  nativeInstaller.includes(
    'cp "${SOURCE_DIR}/reply_intents_multilingual.json" "${APP_DIR}/reply_intents_multilingual.json"'
  ),
  "The macOS installer should install the controlled reply-intent library."
);
assert.ok(
  nativeInstaller.includes(
    'cp "${SOURCE_DIR}/glossary_provider.py" "${APP_DIR}/glossary_provider.py"'
  ) &&
  nativeInstaller.includes(
    'cp "${SOURCE_DIR}/open_valve_glossary_bundle.json" "${APP_DIR}/open_valve_glossary_bundle.json"'
  ),
  "The macOS installer should install the signed glossary provider and embedded bundle."
);
assert.ok(
  background.includes("getGlossaryUpdateStatus") &&
  background.includes("checkGlossaryUpdate") &&
  background.includes("rollbackGlossaryUpdate"),
  "Settings must expose status, signed update, and rollback messages."
);
console.log("manifest-placement-regression: ok");
