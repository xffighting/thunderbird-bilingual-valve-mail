# 销售邮件速览 / Sales Mail Brief for Thunderbird

Thunderbird 本地邮件助手。查看或选中邮件时，生成阀门业务双语简述；写回复时，把简短中文草稿优化成中文、英语、俄语和阿拉伯语四个可选版本。

开源地址：[xffighting/thunderbird-bilingual-valve-mail](https://github.com/xffighting/thunderbird-bilingual-valve-mail)

许可证：MIT。版本采用 Semantic Versioning，每次发布同步更新
[`CHANGELOG.md`](CHANGELOG.md) 并创建对应 Git 标签。

## 当前能力

- 新邮件到达后，可在后台准备客户背调；打开邮件时，右下角悬浮按钮直接显示“客户匹配度 · 询盘质量”。
- 已建档客户优先按唯一精确邮箱或唯一非公共公司域名读取钉钉资料；资料不完整或距上次核验超过 90 天时自动补强。
- 每次背调保存不可变版本、内容更新时间和最近核验时间；内容没有变化时只更新核验日期，不制造重复版本。
- 钉钉自动更新只维护独立的 `AI客户背调` 备注区块，并可补空白官网；不覆盖客户等级、负责人、跟进人及销售人工字段。
- 匹配歧义、公开证据不足或新客户未建档时只保存本地版本，停在人工确认，不自动建客户。
- 当前邮件可点击“一键建立商机”，复用良固销售操作系统的客户查重、钉钉待审核商机、附件、审核待办、正式 SJ 号回读和本地同号归档。
- 商机按钮执行前显示授权确认卡；客户/商机有歧义时自动停止，不强行合并。
- 重复点击按 Message-ID/内容指纹返回既有结果，不重复建立客户、商机、待办或本地目录。
- 在回复框输入简短中文并停顿约 0.5 秒，自动打开或实时刷新多语回复助手；继续打字时不会抢走光标。
- 如暂时不需要，可在“设置 → 翻译与回复”关闭自动弹出。
- 同时提供中文、英语、俄语和阿拉伯语版本；选择一个语种即可写回当前邮件。
- 富文本邮件用加粗字段突出报价、交期、技术参数和附件；纯文本邮件使用清楚的字段标签。
- 付款、报价、交期、检验和技术承诺等高风险模板，必须先勾选人工复核确认才能插入邮件。
- 只替换签名和历史邮件上方的短草稿，不发送邮件，也不改动原始往来。
- 中文优化、四语翻译、阀门术语和标准号保护全部在本机完成。
- 打开英文、俄文或阿拉伯文邮件时，自动识别语言并在原文下一行显示中文译文。
- 正文译文只显示安静的中文对照，不再在每行追加“纠错”按钮；术语调整统一在设置页管理。
- 设置页可直接添加、停用或删除自定义阀门与外贸术语。
- 内置 6 条脱敏样本的本机模型质量评测；发现多个已安装模型时自动择优。
- 逐行翻译默认跳过中文、网址、纯型号参数和引用的历史邮件。
- 邮件阅读页提供“中译”按钮，可随时隐藏或重新显示译文。
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

v0.12.4 更新四语阀门与无损检测术语：

- 四语正式词库升级为 315 条完整词条，内置离线兜底版本为 `1.2.0`。
- 新增阀门行程、通用涡流检测、相控阵超声检测（PAUT）、衍射时差法超声检测（TOFD）和声发射检测。
- 通用涡流检测与脉冲涡流（PEC）严格分开；PAUT、TOFD、AE 等缩写只在检验语境中触发。
- 俄语与阿拉伯语使用行业惯用输出，不采用逐字直译；未通过三组共同门禁的词仍留在候选区。

v0.12.3 更新正式词库和俄语阀门句式：

- 四语正式词库升级为 310 条完整词条；32 条已批准外贸意图保持独立版本。
- 新增 `Graphite / графит / الجرافيت / 石墨`，并补齐阀座、阀杆、阀杆填料的俄语常见变格。
- 典型俄语技术句可稳定生成“阀座材料为 PEEK，阀杆填料为石墨”，不再保留生硬的枢轴翻译语序。
- 词库已拆分到 [xffighting/open-valve-glossary](https://github.com/xffighting/open-valve-glossary)，代码 MIT，原创数据 CC BY 4.0。
- Thunderbird 启动后每 24 小时最多检查一次；只访问固定版本清单和数据包，不上传邮件正文、客户资料、邮箱地址或查询词。
- 启用前验证 RSA-PSS 签名、SHA-256、Schema、版本递增、四语完整性、别名冲突、占位符和高风险人工复核标识。
- 保留当前版和前两版；加载或自检失败自动回滚，设置页也可手动检查和回滚。
- 插件内置 `1.1.0` 离线兜底；断网或更新失败不会影响现有翻译。

v0.11.0 完成“实时四语回复 + 专家词库第二轮”：

- 阀门专家和招投标专家共整理 120 条候选术语，独立质检仅放行 89 条；生产词库现有 297 条完整中英俄阿词条、309 个运行时检索词。
- 外贸总监整理 42 条场景化表达，独立质检放行 32 条，覆盖询价、报价、付款、交期、出货、检验、投标、样品、售后、采购订单和排产。
- 7 条可能误解否定句的宽泛模板没有上线；`Soft reminder` 在所有对外英语模板中强制为 0。
- 输入短中文后约 500 毫秒刷新；旧翻译不会覆盖新草稿，弹窗不会抢走输入焦点，多显示器负坐标也能跟随当前写信窗口。
- 22 条高风险表达必须先确认编号、金额、日期、范围和书面确认条件，才可插入当前邮件。
- 仍保持本机离线：不会上传邮件内容，不会自动发送，也不会改动签名和历史往来。

v0.10.1 提升专业词库和商务短语质量：

- 中英、俄语、阿拉伯语三个词库小组完成候选整理，再由独立质检筛选；首批 60 条四语完整候选中，53 条上线，6 条暂缓，1 条拒绝。
- 生产词库现有 208 条完整中英俄阿术语与商务短语，运行时可检索 220 个标准词条。
- `Soft Reminder` 来信统一显示为自然的“友情提醒”，不再出现“软提醒”等机器直译。
- 写中文回复时，“友情提醒”统一生成 `Just a reminder`，“温馨提醒”生成 `This is a gentle reminder`，不再主动写生硬的 `Soft Reminder`。
- 新增付款、报价、交期和跟进提醒等受控表达，仍全部在本机离线翻译。
- 词库基线继续参考 [GB/T 21465-2008](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=9902AC4B3E7FDC9B920211A31A6DF48B)、
  [ГОСТ 24856-2014](https://protect.gost.ru/gost/details/3e0903e6-d31b-48c6-8abe-e1e617d193a3)、
  [ASME B16.34](https://www.asme.org/codes-standards/find-codes-standards/b16-34-valves-flanged-threaded-welding-end/2017/pdf)、
  [API 6D](https://www.api.org/products-and-services/standards/important-standards-announcements/spec6d)
  及 SASO 官方阿拉伯语标准资料。

v0.10.0 新增“中英俄阿阀门专业词库 + 阿语来信翻译”：

- 内置 149 条中英俄阿四语核心术语，覆盖阀型、执行器、连接、部件、结构、检验、证书和外贸单据。
- 俄文与阿拉伯文来信都先保护阀门术语、型号、材质、口径、压力等级和标准号，再走本机离线模型。
- 俄语和阿拉伯语回复不再依赖少量硬编码术语，统一从四语词库恢复专业译法。
- 设置页可添加英语、俄语或阿拉伯语到中文的客户专用术语；客户或项目指定译法优先。
- 词库基线参考 [GB/T 21465-2008](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=9902AC4B3E7FDC9B920211A31A6DF48B)、
  [ГОСТ 24856-2014](https://protect.gost.ru/gost/details/3e0903e6-d31b-48c6-8abe-e1e617d193a3)、
  [ASME B16.34](https://www.asme.org/codes-standards/find-codes-standards/b16-34-valves-flanged-threaded-welding-end/2017/pdf)、
  [API 6D](https://www.api.org/products-and-services/api-monogram-and-apiqr/latest-updates)
  及 SASO 官方阿拉伯语标准资料。

v0.9.0 新增“后台客户背调 + 打开邮件即看评分”：

- 新邮件后台排队处理；打开邮件时，悬浮按钮与弹窗显示客户匹配度和询盘质量两个 0–100 分。
- 已建档客户复用钉钉背调；资料不完整或超过 90 天未核验时，结合公开网站证据进行补强。
- 背调按客户保存 `v0001 / v0002` 不可变版本，并分别记录“内容更新日期”和“最近核验日期”。
- 公开证据质量达到门槛后，只更新钉钉中的 AI 管理备注区块及空白官网；匹配冲突、低质量证据和新客户均不自动写入。
- 设置页可分别关闭“后台准备背调”和“自动补全钉钉背调”。

v0.8.0 新增“当前邮件 → 完整商机”：

- 弹窗第一屏和邮件正文右下角都提供“一键建立商机”。
- 用户确认后，先查询钉钉现状，再复用客户/商机或创建 `AI 提取待审核` 候选。
- 上传邮件附件、创建审核待办，回读正式 `SJ` 号后才建立本地同号目录。
- 邮件原文只通过固定 Native Messaging 主机留在本机；不会发送、移动或删除 Thunderbird 邮件。

v0.7.1 新增俄语来信翻译，并修复纠错闭环：

- 俄文业务句自动走“俄语 → 英语 → 中文”本机离线模型链路，阿拉伯文走“阿拉伯语 → 英语 → 中文”，英文仍走英译中模型。
- 增加 26 条俄语阀门与外贸术语规则，包括球阀、阀体、阀体材质、交期和报价单。
- 纠错保存成功后弹窗自动关闭并显示“✓”；保存失败时保留弹窗，可直接重试。
- 同一原文的待审核纠错只保留一条；设置页批准后，按英语、俄语或阿拉伯语方向加入长期术语。

v0.7.0 新增“短中文 → 四语种专业回复”：

- 回复框中的短中文在停顿后自动触发，不需要复制到其他翻译工具。
- 先经过阀门技术信息保护和外贸商务表达整理，再生成中、英、俄、阿四个版本。
- `DN/PN/NPS/Class`、阀门型号、材质、API/ASME/ASTM 标准号不会被模型随意改写。
- 俄语与阿拉伯语版本保留关键英文阀门术语作为人工校对锚点。
- 插入时保留清晰段落和重点加粗；签名、引用历史与客户原文不变。
- 新增中译英、英译俄、英译阿三个本机模型，邮件草稿不上传云端。

v0.6.0 建立可持续提高译文质量的本机闭环：

- 良固基础术语由 54 条扩充至 153 条，覆盖阀型、阀体部件、结构、连接、执行器、检验、证书、外贸单据和报价表达。
- 设置页新增“专业术语库”，自定义译法优先于基础模型，可限制为阀门语境。
- 邮件逐行译文新增“纠错”；记录只保存在本机，进入“纠错待确认”，批准后才长期生效。
- 新增本机模型质量评测，用 6 条内置脱敏样本比较已安装模型，并自动保存最佳选择。
- 设置页升级为 macOS 风格侧边导航，支持搜索和 320–1440px 响应式显示。

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
- 下载英文到中文、俄文到英文、阿拉伯文到英文、中文到英文、英文到俄语和英文到阿拉伯语 Argos Translate 模型。
- 把本机通信清单写入 Thunderbird 支持的用户级目录。
- 用两句脱敏业务样例做自检。

完成后，日常正文翻译不需要联网。

### 2. 安装扩展

1. 打开 Thunderbird。
2. 进入 Add-ons and Themes。
3. 点击齿轮菜单。
4. 选择 Debug Add-ons。
5. 点击 Load Temporary Add-on。
6. 选择本目录中的 `manifest.json`；正式安装请选择对应 Release 中的
   `game-mail-summary-vX.Y.Z.xpi`。

## 打包为 XPI

在项目目录执行：

```bash
zip -r game-mail-summary.xpi manifest.json src ui icons README.md docs
```

然后在 Thunderbird 的 Add-ons and Themes 中安装该 `.xpi` 文件。

## 交互说明

- 在邮件列表选中一封邮件，然后点击 Thunderbird 主工具栏中的扩展按钮。
- 在邮件阅读窗口中打开一封邮件，右下角悬浮按钮会显示客户匹配度和询盘质量；点击后展开完整客户与询盘情报。
- 点击情报面板中的“更新背调”可强制重新核验；“打开钉钉客户”只在唯一匹配成功时可用。
- 点击邮件正文右下角“建商机”或弹窗中的“一键建立商机”，核对授权卡后确认；完成时界面会回显正式 `SJ` 号。
- 邮件正文右下角“中译 ✓”表示译文已显示；点击可隐藏，显示为“中译”时再次点击恢复。
- 逐行译文不再显示纠错按钮；需要调整专业译法时，进入插件设置中的术语管理统一处理。
- “中译 !”表示本机翻译组件未就绪；将鼠标放在按钮上可查看原因。
- 写回复时，先输入简短中文，停顿约 1 秒；在弹出的窗口中切换中文、英语、俄语或阿拉伯语。
- 点击“插入当前语种”后，插件只替换签名上方的短中文草稿；仍由你最后检查并点击 Thunderbird 的发送按钮。
- 弹窗中点击“重新分析 / Refresh”会绕过缓存重新读取会话。
- 点击“查看客户背景”会打开右侧只读抽屉。
- 点击“打开钉钉”本身只打开唯一匹配的客户表。后台自动补全仅在设置开启、匹配唯一且证据质量达标时写入 AI 管理备注区块或空白官网。
- 设置页“后台背调”可关闭新邮件后台准备，或保留准备但关闭钉钉自动补全。
- 设置页“专业术语库”中的自定义译法优先于基础术语和离线模型。
- 设置页“运行质量评测”只使用内置脱敏样本，不读取当前邮件。

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

邮件内容解析、询盘评分、客户匹配和正文翻译都在本机完成，且不调用云翻译服务。客户资料不完整或过期时，后台背调会按公司名、公司域名和官网访问公开网页，并通过已授权的钉钉接口读取或补全客户资料；邮件正文不会作为公开搜索查询发送。成交状态按关键词和上下文判断，例如 PO 编号、purchase order、order confirmed、contract signed、paid、invoice、已下单、订单已确认、已付款等。

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
