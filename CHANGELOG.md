# Changelog

All notable changes follow [Semantic Versioning](https://semver.org/).

## [0.12.2] - 2026-07-31

### Fixed

- Detect missing Manifest V3 host grants after an upgrade instead of reporting
  an ambiguous network failure.
- Let the user grant the five fixed glossary-download origins from the
  Settings “立即检查” gesture; no mail or customer origin is requested.
- Show a clear “待授权” state while the embedded offline glossary remains
  available.

## [0.12.1] - 2026-07-31

### Fixed

- Reinsert a technical placeholder beside the nearest surviving token when a
  small offline model drops one item from a consecutive DN/PN/material code
  sequence.
- Remove stray model language suffixes such as `中文(简体)` from translated
  valve-field output.
- Added deterministic and real-model regression coverage to prevent
  outward-facing `（术语：…）` fallback notes.

## [0.12.0] - 2026-07-31

### Added

- Integrated the independent `open-valve-glossary` v1 provider with 309
  approved Chinese-English-Russian-Arabic terms and 32 approved reply intents.
- Added signed automatic glossary checks, manual checks, version status, and
  one-click rollback in Settings.
- Added RSA-PSS-SHA256 manifest verification, SHA-256 package integrity,
  schema, four-language, alias collision, placeholder, and high-risk intent
  gates before activation.

### Safety and rollback

- Version checks are limited to the fixed Open Valve Glossary registry and
  never include message content, customer information, query terms, or email
  addresses.
- Unsigned, downgraded, oversized, corrupted, hash-mismatched, or
  schema-incompatible packages are rejected.
- Activation uses an atomic pointer and retains the current and previous two
  versions. A failed load automatically returns to the last valid bundle or
  the embedded v1.0.0 fallback.
- The legacy JSON loader remains available for one compatibility release.

## [0.11.0] - 2026-07-30

### Added

- Added 89 independently approved Chinese-English-Russian-Arabic valve and
  tender terms from a 120-entry expert candidate set.
- Added 32 controlled four-language export-sales reply intents covering
  inquiry, quotation, payment, delivery, shipping, inspection, tender,
  samples, after-sales, purchase orders, and production.
- Added visible human confirmation before inserting any of the 22 approved
  high-risk reply templates.

### Changed

- The compose assistant now follows eligible Chinese drafts after a 500 ms
  pause, refreshes without taking keyboard focus, supports monitors with
  negative screen coordinates, and discards stale translation results.
- The assistant opens for an eligible draft that already exists when the
  compose window loads.
- Pattern-only matching is disabled for the controlled intent library. Seven
  broad templates that could reverse a negated sentence remain outside
  production.
- The production glossary now contains 297 complete four-language rows and
  309 runtime search terms.

### Quality and safety

- Independent QA approved only 89 of 120 glossary candidates and 32 of 42
  reply intents; 39 items remain under review and 2 were rejected.
- Outward English generation rejects `Soft reminder` in any capitalization.
- One colliding Russian alias for `Financial Proposal` was excluded at release
  build time instead of being allowed to overwrite `Commercial Offer`.

## [0.10.1] - 2026-07-30

### Added

- Added 53 independently reviewed Chinese-English-Russian-Arabic valve terms
  and export-sales phrases from a 60-entry complete candidate batch.
- Added controlled reminder phrases for payment, quotation, delivery, and
  follow-up correspondence.

### Changed

- Expanded the production glossary to 208 complete four-language rows and 220
  runtime search terms.
- Incoming `Soft Reminder` now reads naturally as `友情提醒`; outgoing Chinese
  reminders use native business English such as `Just a reminder` instead of
  the non-native heading `Soft Reminder`.
- Deferred six technically ambiguous terms for a later expert decision and
  rejected one phrase that could change the source action.

## [0.10.0] - 2026-07-30

### Added

- Added a reviewed 149-entry Chinese-English-Russian-Arabic valve and export
  glossary, normalized from official Chinese, Russian, international, and
  Saudi standards plus Lianggu export correspondence.
- Added automatic Arabic-line detection and private offline
  Arabic-to-English-to-Chinese translation.
- Added Arabic-to-Chinese custom terminology and correction-review support.
- Added the pinned offline Arabic-to-English model with SHA-256 verification.

### Changed

- Russian incoming mail and Russian/Arabic reply candidates now use the same
  multilingual terminology asset instead of small hardcoded term lists.
- Technical terms, standards, pressure classes, dimensions, and materials are
  restored in place in Russian and Arabic output.

### Security

- English, Russian, Arabic, and Chinese translation content remains inside
  Thunderbird and the local Native Messaging host. Web access is used only
  during installation to download checksum-pinned offline models.

## [0.9.2] - 2026-07-30

### Changed

- Removed the correction button and correction dialog from every translated
  message row to keep the reading view quiet and uncluttered.
- Existing approved terminology and pending local correction records remain
  available in Settings; no stored translation data is removed.

## [0.9.0] - 2026-07-29

### Added

- Added queued customer research for new messages and displayed-message
  preparation with per-message cache and in-flight deduplication.
- Added customer-match and inquiry-quality scores to the floating message
  control, inline detail panel, and toolbar popup.
- Reused uniquely matched DingTalk customer research and refreshed incomplete
  or 90-day-stale profiles with public evidence.
- Added immutable local customer-research versions with separate content
  update and latest-check timestamps.
- Added Settings controls for background preparation and guarded DingTalk
  research updates.

### Security

- DingTalk matching still accepts only a unique exact email or unique
  non-generic company domain; ambiguous matches stop for review.
- Automatic writes are limited to the AI-managed research remark block and an
  empty website field. Human remarks, grade, owner, follower, and sales fields
  are preserved.
- Research below the evidence threshold and unmatched customers are stored
  locally only; no customer record is created automatically.

## [0.8.0] - 2026-07-28

### Added

- Added “一键建立商机” to the popup and the message-view floating controls.
- Reused the Lianggu sales operating system flow for exact customer matching,
  DingTalk GET-before-write opportunity handling, attachment upload, review
  todo creation, formal `SJ` readback, and same-number local archiving.
- Added a local authorization card before any DingTalk write or archive action.
- Added chunked Native Messaging with size, sequence, and SHA-256 validation.

### Security

- Only the user-selected raw email is passed to the fixed local host
  `com.lianggu.thunderbird_intake`.
- Duplicate clicks use the Lianggu Message-ID/content fingerprint receipt.
- The extension does not send, move, or delete Thunderbird messages and does
  not expose message content, customer identity, or DingTalk record IDs.

## [0.7.1] - 2026-07-28

### Added

- Added automatic Russian-line detection and private offline
  Russian-to-English-to-Chinese translation.
- Added 26 Russian valve and foreign-trade terminology rules, including
  standard translations for ball valve, valve body, body material, delivery
  time, and quotation.
- Added English/Russian source-language selection to custom terminology and
  preserved that language through correction approval.

### Fixed

- The correction dialog now closes only after the local background process
  explicitly confirms persistence.
- Failed correction saves keep the dialog open and restore the submit button
  for retry.
- Successful corrections show a visible saved mark, restore focus to the
  source row, and cannot be submitted twice.
- Repeated pending corrections for the same source phrase now update the
  existing local record instead of creating duplicates.
- Removed an unmatched closing element from the correction dialog markup.

### Security

- Russian and English email text remains inside Thunderbird and the local
  Native Messaging host. No cloud translation service is used.

## [0.7.0] - 2026-07-28

### Added

- Added an automatic short-Chinese reply assistant to Thunderbird compose
  windows. It opens a quiet side popup after the writer pauses.
- Added Chinese, English, Russian, and Arabic candidates that share one
  fact-preserving structure and can be inserted into the active draft.
- Added rich-text insertion with bold field labels. Plain-text composers use
  explicit section labels instead.
- Added local Chinese-to-English, English-to-Russian, and English-to-Arabic
  models, with protected valve terms, model numbers, materials, pressure
  classes, and standards.
- Added Russian and Arabic technical-reference anchors so critical English
  valve terms remain visible for final review.
- Added a Settings toggle to turn the automatic compose popup on or off.

### Changed

- Selecting a language replaces only the short draft above the signature and
  quoted history. It does not send the message or alter earlier correspondence.

### Security

- Reply optimization and all four translations run through the local Native
  Messaging host. Draft text is kept in memory and is not uploaded or saved as
  translation history.

## [0.6.0] - 2026-07-28

### Added

- Expanded the built-in valve and export-sales glossary from 54 to 153
  reviewed terms covering valve types, components, structures, inspection,
  certificates, trade documents, and quotation language.
- Added a local custom terminology editor with enable, disable, valve-context,
  and delete controls.
- Added per-line translation correction in the Thunderbird reading view.
  Corrections remain pending locally until approved in Settings.
- Added a six-sample privacy-safe local model benchmark that automatically
  selects the best installed English-to-Chinese model.
- Added responsive macOS-style Settings navigation and search.

### Changed

- Custom terminology now takes priority over the built-in glossary and the
  offline model.
- Translation cache keys now include the active custom terminology so edits
  take effect without stale translations.

### Security

- Model evaluation uses only bundled synthetic phrases and never reads or
  uploads customer email.
- Translation corrections and custom terminology remain in Thunderbird local
  extension storage.

## [0.5.2] - 2026-07-28

### Added

- Added deterministic business terminology for `factory`, `quotation`, common
  quotation-email phrases, and business sign-offs.
- Added translation quality gates for repeated CJK garbage, replacement
  characters, and abnormal output length.

### Fixed

- Prevented forwarded-mail headers such as `From`, `Sent`, `To`, `Cc`, and
  `Subject` from being sent to the translator.
- Removed repeated underscore artifacts produced by the offline model.
- Standardized `quotation` and `quotation sheet` as “报价单”.

## [0.5.1] - 2026-07-28

### Fixed

- Standardized standalone valve specification labels such as `Body`,
  `Body material`, and `Body / Bonnet` as “阀体”.
- Preserved ordinary meanings in phrases such as `human body`.

## [0.5.0] - 2026-07-28

### Added

- Added the local Lianggu valve glossary and protected valve types,
  components, materials, pressure classes, standards, and model identifiers
  before offline translation.
- Added glossary status to the extension settings page.

## [0.4.1] - 2026-07-28

### Changed

- Improved the typography, spacing, and visual hierarchy of inline Chinese
  translations.

## [0.4.0]

### Added

- Added read-only, line-by-line English-to-Chinese translation using a local
  Native Messaging host.
