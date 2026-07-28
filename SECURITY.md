# Security and privacy

## Supported version

Security and privacy fixes are applied to the latest release.

## Reporting

Please report security issues privately through GitHub's security advisory
feature. Do not open a public issue containing customer email, mailbox data,
credentials, tokens, or private company information.

## Data boundary

The extension reads email content locally and does not send message bodies or
reply drafts to Google, DeepL, OpenAI, or other cloud translation services.
The native host uses local English-to-Chinese, Russian-to-English,
Chinese-to-English, English-to-Russian, and English-to-Arabic models with a
deterministic terminology layer. Russian-to-Chinese reading translation uses
the local Russian-to-English and English-to-Chinese models in sequence.
