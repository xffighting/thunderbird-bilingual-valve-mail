# 销售邮件速览 / Sales Mail Brief for Thunderbird

Thunderbird 本地只读邮件助手。查看或选中邮件时，生成阀门业务双语简述，并把已导入的客户资料、重要度、背景与钉钉入口放在同一张决策卡中。

开源地址：[xffighting/thunderbird-bilingual-valve-mail](https://github.com/xffighting/thunderbird-bilingual-valve-mail)

许可证：MIT。版本采用 Semantic Versioning，每次发布同步更新
[`CHANGELOG.md`](CHANGELOG.md) 并创建对应 Git 标签。

## 当前能力

- 打开英文邮件时，自动在原文下一行显示中文译文。
- 逐行翻译默认跳过中文、网址、纯型号参数和引用的历史邮件。
- 邮件阅读页提供“中英”按钮，可随时隐藏或重新显示译文。
- 正文翻译通过 Thunderbird Native Messaging 调用本机 Argos Translate，不经过云端翻译接口。
- 读取当前打开或选中的邮件。
- 按标准化后的主题搜索同一会话邮件。
- 第一屏显示四个决策信息：
  - 询价阀门、数量、DN/NPS、PN/Class、材质、连接、驱动、标准和交期。
  - 项目名称候选和置信度；多个候选会明确提示人工确认。
  - 客户重要度、匹配方式和判断依据。
  - 当前会话的询价、报价或订单信号。
- 本地结构化分析以下信息：
  - 项目名称 / Project。
  - 总体摘要 / Overall summary。
  - 清晰要点 / Clear key points。
  - 客户阀门问询品类 / Customer valve inquiry categories。
  - 规格与技术参数 / Specifications and technical parameters。
  - 报价与商务条款 / Quotation and commercial terms。
  - 文件、认证与质量要求 / Documents, certificates and quality requirements。
  - 成交与订单进展 / Deal and order progress。
  - 下一步动作 / Next actions。
- 摘要弹窗同时显示中文和英文。
- 在 Thunderbird 主工具栏和邮件正文右下角显示摘要入口。
- 支持从设置页导入 CSV/JSON 客户资料，显示客户背景抽屉。
- 支持只读打开已配置的钉钉客户或商机链接。
- 工具栏按钮只保留短标题，避免长摘要占用或挤压 Thunderbird 顶部按钮区。

## 本次更新重点

v0.5.2 提升翻译质量并拦截异常译文：

- `factory` 固定译为“工厂”，`quotation / quotation sheet` 固定译为“报价单”。
- 常用邮件短语使用受控译法，避免“引文表”“最好还是这样吧”等错误。
- 清除离线模型偶发产生的连续下划线。
- 转发邮件的 `From / Sent / To / Cc / Subject` 头部不再送入翻译。
- 重复汉字、异常长度、替换字符等乱码结果会被拦截，不写入邮件页面。

v0.5.1 修正 `Body` 的阀门语境：

- `Body`、`Body:`、`Body material`、`Body / Bonnet` 等规格行统一译为“阀体”。
- `human body`、`body of this email` 等普通语境不会误译为“阀体”。

v0.5.0 新增良固阀门行业术语保护：

- 翻译前把阀型、部件、连接方式、驱动方式、材质、压力等级和标准号替换为本地保护标记，避免离线模型随意改写。
- 翻译后按良固术语库恢复标准中文，例如 `Globe Valve → 截止阀`、`Bonnet → 阀盖`、`Trim → 内件`。
- `DN50`、`PN16`、`Class 150`、`API 600`、`ASME B16.5`、`WCB`、`PTFE` 等技术代号保持原写法。
- 术语库来源于销售操作系统中的阀门专业术语表、参数词典、标准化词典与型号命名规则。
- 普通语境中的 `ball`、`seat` 等词不会强制翻成阀门部件，只有命中阀门上下文才启用。

v0.4.1 优化逐行译文的长期阅读体验：

- 译文改为低饱和蓝灰色，与英文原文形成安静但清楚的层级。
- 增加细蓝色左边线和上下留白，连续多行更容易定位。
- 中文字号略小于原文，HTML 邮件与纯文本邮件保持一致。

v0.4.0 新增“正文逐行中英对照”：

- 英文原文保持不变，中文译文直接显示在下一行。
- 自动识别英文业务句，中文、网址、邮箱、纯 `DN/PN/WCB/RFQ` 型号行不会重复翻译。
- 默认不翻译引用历史和签名，避免长邮件重复展开；可在设置中开启。
- 使用 Thunderbird 官方 Native Messaging 通道连接本机 Argos Translate。
- 新增外贸术语修正：`quote` 按销售语境译为“报价”，`delivery time / lead time` 译为“交期”。
- 新增“检查离线翻译”设置项，以及逐行规则、浏览器布局、本机通信和译文质量回归。
- 仍为只读扩展：不发送、移动、删除或修改邮件源文件。

v0.3.1 新增“客户情报层”和 macOS 风格决策界面，并根据 10 封真实业务邮件完成规则回归：

- 摘要 schema 升级为 v3，同时保留 v0.2 的 `overview`、`projectNames`、`keyPointGroups`、`productCategories` 与 `orderStatus` 字段。
- 新增 `brief`、`inquiry`、`project`、`customer` 与 `quality` 数据层。
- 客户身份只按邮件头的唯一精确邮箱，或唯一非公共公司域名匹配；不按姓名、正文邮箱或模糊公司名自动关联。
- 未匹配或冲突时，客户重要度显示“待评估”，钉钉按钮禁用，不会把未知客户误判为 D 级。
- 钉钉仅允许已导入并通过白名单验证的官方 HTTPS 链接；`dingtalk:`、`javascript:`、`data:`、`file:` 和非官方域名全部阻断。点击只打开，不创建、不修改、不回填。
- 移除不必要的 `messagesModify` 权限。
- 修复 Manifest V3 兼容性：使用 `getDisplayedMessages`、`onMessagesDisplayed` 与 `scripting.messageDisplay.registerScripts`，真正覆盖 Thunderbird 128+。
- 新增客户匹配、URL 安全、schema v3、UI 响应式与焦点回归测试。
- 区分真实 RFQ、一般跟进、订单/技术跟进、已读回执和营销噪音。
- 支持节流阀、英寸分数口径、LB/压力单位，以及 `Q'ty / no's / PC` 数量写法。

v0.2.8 移除邮件头部操作区按钮，只保留主工具栏“摘要”和邮件正文右下角备用入口，避免占用回复、归档、删除等高频按钮区域。

v0.2.7 将邮件正文右下角“摘要”入口改为 `message_display_scripts` 清单式注入，适配当前 Thunderbird 152 的 Manifest V3 加载方式。

v0.2.6 新增邮件正文右下角“摘要”入口。即使 Thunderbird 把工具栏按钮折叠或隐藏，打开邮件正文时仍能看到入口；默认收起，不占“回复”“归档”等按钮区域。

v0.2.5 将可见入口标题缩短为“摘要”，避免长摘要文字占用 Thunderbird 顶部空间。

v0.2.4 恢复一个可见的邮件查看小图标入口，解决主工具栏按钮在部分 Thunderbird 布局中看不到的问题。按钮只作为小图标入口使用，不覆盖邮件列表或正文。

v0.2.3 调整插件入口位置：移除邮件头部操作区按钮，只保留 Thunderbird 主工具栏按钮，避免挡住或挤压“回复”“归档”等高频按钮。

v0.2.2 修正 PO 订单状态误判：邮箱地址或链接里的 `po` 不再被识别为成交/订单信号。只有 `PO#A12345`、`PO-MC-032-26`、`PO No. ...`、`attached PO`、`received PO`、`purchase order` 等明确订单语境才会触发成交状态。

v0.2.1 将要点提取改为更清晰的结构化双语结果。插件会按业务字段归类，例如数量、口径、压力、材质、交期、价格、付款条件、证书、订单状态和待确认事项。

本补丁重点修正：

- 保留带有报价、数量、口径、压力、材质等信息的问候句，避免误删客户第一句需求。
- 提取值分为中文值和英文值，例如“球阀 / ball valve”“交期 / lead time”“已付款 / paid”。
- 修正 PO、paid、certificate、lead time 等字段的提取边界，减少“PO and”“and lead time”这类混杂结果。
- 总体摘要优先展示客户需求、规格参数、成交状态，让悬浮提示更容易读。

示例输出结构：

```text
总体摘要 / Overall summary
中文：共 8 封相关邮件。项目：ABC Plant。客户主要问询品类：球阀、止回阀。重点：DN50；PN16；SS316。订单状态：未发现明确成交，已有询价或报价信号。
English: 8 related email(s). Project: ABC Plant. Main customer inquiry categories: Ball valve, Check valve. Key focus: DN50; PN16; SS316. Order status: Inquiry or quotation signal found, no confirmed deal detected.

清晰要点 / Clear key points
规格与技术参数 / Specifications and technical parameters
1. 口径或尺寸：DN50
   Size or dimension: DN50
2. 压力等级：PN16
   Pressure rating: PN16
3. 材质要求：SS316
   Material requirement: SS316
```

## 版本要求

建议使用 Thunderbird 128 或更高版本。扩展使用 Manifest V3，最低版本在 `manifest.json` 中配置为 `128.0`。

本机已针对 Thunderbird 153.0 做静态兼容核对。正文摘要按钮通过 Thunderbird 128+ 的 `scripting.messageDisplay` 注册，不再依赖 151 才新增的 manifest 字段。

## 安装到 Thunderbird 测试

### 1. 安装本机离线翻译组件（macOS）

```bash
zsh native-host/install_macos.sh
```

安装程序会：

- 在用户目录创建独立 Python 环境。
- 下载一次英文到中文 Argos Translate 模型。
- 把本机通信清单写入 Thunderbird 支持的用户级目录。
- 用两句脱敏业务样例做自检。

完成后，日常正文翻译不需要联网。

### 2. 安装扩展

1. 打开 Thunderbird。
2. 进入 Add-ons and Themes。
3. 点击齿轮菜单。
4. 选择 Debug Add-ons。
5. 点击 Load Temporary Add-on。
6. 选择本目录中的 `manifest.json`；正式安装可选择 `dist/game-mail-summary-v0.5.2.xpi`。

## 打包为 XPI

在项目目录执行：

```bash
zip -r game-mail-summary.xpi manifest.json src ui icons README.md docs
```

然后在 Thunderbird 的 Add-ons and Themes 中安装该 `.xpi` 文件。

## 交互说明

- 在邮件列表选中一封邮件，然后点击 Thunderbird 主工具栏中的扩展按钮。
- 在邮件阅读窗口中打开一封邮件，然后点击主工具栏“摘要”，或邮件正文右下角的“摘要”按钮。
- 邮件正文右下角“中英 ✓”表示译文已显示；点击可隐藏，显示为“中英”时再次点击恢复。
- “中英 !”表示本机翻译组件未就绪；将鼠标放在按钮上可查看原因。
- 弹窗中点击“重新分析 / Refresh”会绕过缓存重新读取会话。
- 点击“查看客户背景”会打开右侧只读抽屉。
- 点击“打开钉钉”只会打开已导入的目标链接，不会向钉钉写入数据。

## 导入客户资料

1. 打开扩展设置。
2. 先填写我方公司域名或邮箱，便于插件区分我方与客户。
3. 点击“下载 CSV 模板”。
4. 按模板填写客户资料，再选择 CSV、TSV 或 JSON 文件。
5. 点击“保存设置”。

支持字段：

```text
email
domain
company
contact
country
industry
grade
background_zh
background_en
order_count
active_opportunities
last_order_date
projects
tags
dingtalk_url
```

匹配顺序：

1. 唯一精确邮箱：高置信。
2. 唯一非公共公司域名：中置信。
3. 多条命中或邮箱/域名冲突：停止自动关联，提示人工确认。
4. 未匹配：客户重要度待评估，钉钉按钮禁用。

Gmail、Outlook、Yahoo、QQ、163 等公共邮箱域名不会用于域名级自动匹配。

## 规则分析说明

该版本没有调用外部 AI 或云翻译服务，所有分析、客户匹配和正文翻译都在本地完成。成交状态按关键词和上下文判断，例如 PO 编号、purchase order、order confirmed、contract signed、paid、invoice、已下单、订单已确认、已付款等。

需要注意：邮件中的 PO、付款或合同词，只代表“当前会话存在订单信号”，不能单独证明客户历史成交。历史订单数只来自用户主动导入的客户主数据。

## 回归测试

```bash
node tests/customer-intelligence-regression.js
node tests/manifest-placement-regression.js
node tests/order-status-regression.js
node tests/summary-schema-regression.js
```

UI 预览测试需要 Playwright；它会检查主弹窗、客户背景抽屉、Escape 关闭和 520px 无横向溢出。

```bash
npm install
npm run test:ui
```

## 标题悬浮提示说明

Thunderbird 标准 MailExtension API 没有公开的邮件列表标题行悬浮接口。当前版本通过 action title 与弹窗完成可安装 MVP。若要把提示直接挂到邮件列表 subject 行，需要使用 Experiment API 访问 Thunderbird 内部界面结构，详见 `docs/experiment-hover-plan.md`。
