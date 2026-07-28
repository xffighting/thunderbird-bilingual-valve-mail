# Changelog

All notable changes follow [Semantic Versioning](https://semver.org/).

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
