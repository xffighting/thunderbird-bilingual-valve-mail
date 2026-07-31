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
Arabic-to-English, Chinese-to-English, English-to-Russian, and
English-to-Arabic models with a deterministic terminology layer.
Russian-to-Chinese and Arabic-to-Chinese reading translation use their local
English pivot models in sequence.

The one-click opportunity action sends only the user-selected raw message to
the fixed local Native Messaging host `com.lianggu.thunderbird_intake`. The
host runs the Lianggu sales operating system on the same Mac. It requires an
in-product authorization confirmation before DingTalk candidate creation,
attachment upload, review-todo creation, or local archiving. The result
returned to the extension is redacted and excludes message bodies, customer
identity, and DingTalk record IDs.

## Background customer research

When background research is enabled, the raw message is passed only to the
same fixed local host. Email headers and body are parsed locally. Customer
matching accepts only a unique exact email or a unique non-generic company
domain.

If an existing DingTalk profile is incomplete or has not been checked for 90
days, the local sales workflow may query public websites using the inferred
company name, company domain, country, and official website. The message body
is not used as a public search query. The workflow also reads the authorized
DingTalk customer table.

Automatic DingTalk updates are guarded as follows:

- ambiguous matches never write;
- evidence quality below 60 is saved locally only;
- new customers are never created automatically;
- only the delimited `AI客户背调` remark block and an empty website field may
  be updated;
- human remarks, customer grade, owner, follower, and sales fields are not
  overwritten;
- the record is read before and after every update.

Research versions are stored locally under the Lianggu sales operating
system's private `_客户背调版本` directory. A new immutable version is created
only when the retained research content changes; every check updates the
latest-check timestamp.
