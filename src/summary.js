/* global browser, messenger */
(function initGameMailSummary(global) {
  const SUMMARY_SCHEMA_VERSION = 3;
  const ANALYSIS_ENGINE_VERSION = "0.6.0";

  const DEFAULT_OPTIONS = {
    maxMessages: 40,
    includeSubFolders: false,
    cacheTtlMs: 12 * 60 * 60 * 1000,
    bodyLimitPerMessage: 12000,
    keyPointLimit: 12,
    ownDomains: [],
    ownEmails: [],
    customerRecords: [],
    registryUpdatedAt: "",
    autoCustomerResearchEnabled: true,
    autoUpdateDingTalkResearch: true,
    customerResearchCacheTtlMs: 30 * 24 * 60 * 60 * 1000,
    inlineTranslationEnabled: true,
    inlineTranslationIncludeQuoted: false,
    composeAssistantEnabled: true,
    customTerms: [],
    translationFeedback: [],
    cacheEpoch: 0
  };

  const PRODUCT_PATTERNS = [
    { label: "球阀 / Ball valve", zh: "球阀", en: "Ball valve", pattern: /\b(ball\s*valve|ballvalve)\b|球阀/iu },
    { label: "闸阀 / Gate valve", zh: "闸阀", en: "Gate valve", pattern: /\b(gate\s*valve|gatevalve)\b|闸阀/iu },
    { label: "截止阀 / Globe valve", zh: "截止阀", en: "Globe valve", pattern: /\b(globe\s*valve|globevalve)\b|截止阀/iu },
    { label: "止回阀 / Check valve", zh: "止回阀", en: "Check valve", pattern: /\b(check\s*valve|non\s*return\s*valve|nrv)\b|止回阀|单向阀/iu },
    { label: "蝶阀 / Butterfly valve", zh: "蝶阀", en: "Butterfly valve", pattern: /\b(butterfly\s*valve|butterfly)\b|蝶阀/iu },
    { label: "调节阀 / Control valve", zh: "调节阀", en: "Control valve", pattern: /\b(control\s*valve|regulating\s*valve)\b|调节阀|控制阀/iu },
    { label: "电动阀 / Motor-operated valve", zh: "电动阀", en: "Motor-operated valve", pattern: /\b(?:motor[\s-]*operated\s*valve|MOV)\b|电动阀/iu },
    { label: "电磁阀 / Solenoid valve", zh: "电磁阀", en: "Solenoid valve", pattern: /\b(solenoid\s*valve)\b|电磁阀/iu },
    { label: "安全阀 / Safety relief valve", zh: "安全阀", en: "Safety relief valve", pattern: /\b(safety\s*valve|relief\s*valve|pressure\s*relief)\b|安全阀|泄压阀/iu },
    { label: "节流阀 / Choke valve", zh: "节流阀", en: "Choke valve", pattern: /\b(?:adjustable\s+)?(?:angle\s+)?choke\s*valve\b|节流阀/iu },
    { label: "旋塞阀 / Plug valve", zh: "旋塞阀", en: "Plug valve", pattern: /\b(plug\s*valve)\b|旋塞阀/iu },
    { label: "过滤器 / Strainer", zh: "过滤器", en: "Strainer", pattern: /\b(y\s*strainer|strainer|filter)\b|过滤器|滤器/iu },
    { label: "执行器 / Actuator", zh: "执行器", en: "Actuator", pattern: /\b(pneumatic\s*actuator|electric\s*actuator|actuator)\b|执行器/iu },
    { label: "法兰与连接件 / Flange and fittings", zh: "法兰与连接件", en: "Flange and fittings", pattern: /\b(?:flanges|blind\s+flange|weld\s+neck\s+flange|slip[\s-]*on\s+flange|fittings?|elbows?|tees?|reducers?)\b|法兰盘|盲法兰|对焊法兰|管件|弯头|三通|大小头/iu }
  ];

  const EMAIL_ADDRESS_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
  const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+\b/giu;

  const ORDER_DONE_PATTERNS = [
    /\b(?:p\.?\s*o\.?|purchase\s*order)\s*(?:(?:#|no\.?|number|[:：-])\s*)?(?=[A-Z0-9./-]*\d)[A-Z0-9][A-Z0-9./-]{2,}\b/iu,
    /\b(?:attached|send|sent|received|issue[sd]?|release[sd]?|confirm(?:ed)?|approve[sd]?|provide[sd]?|submit(?:ted)?|copy\s+of)\s+(?:the\s+)?(?:p\.?\s*o\.?|purchase\s*order)\b|\b(?:p\.?\s*o\.?|purchase\s*order)\s+(?:attached|received|issued|released|confirmed|approved|copy)\b/iu,
    /\b(purchase\s*order|sales\s*order|order\s*confirmed|contract\s*signed)\b/iu,
    /\b(payment\s*received|deposit\s*received|paid|invoice\s*(issued|sent)|proforma\s*invoice\s*accepted)\b/iu,
    /已成交|已下单|订单已确认|采购订单|合同已签|已付款|收到定金|发票已开|付款水单/iu
  ];

  const ORDER_POSSIBLE_PATTERNS = [
    /\b(rfq|inquiry|enquiry|quotation|quote|offer|price\s*list|proforma\s*invoice|\bpi\b)\b/iu,
    /询价|报价|报盘|形式发票|价格|交期|样品|议价|还价/iu
  ];

  const NEGATED_ORDER_PATTERNS = [
    /\b(?:not|never|no)\s+(?:yet\s+)?(?:paid|confirmed|approved|received|ordered)\b/iu,
    /\b(?:payment|deposit|order|p\.?\s*o\.?|purchase\s*order)\s+(?:is\s+|has\s+)?not\s+(?:yet\s+)?(?:paid|confirmed|approved|received|issued|released)\b/iu,
    /\bdo\s+not\s+(?:issue|send|release|confirm|approve|process)\s+(?:the\s+)?(?:p\.?\s*o\.?|purchase\s*order|order)\b/iu,
    /\b(?:p\.?\s*o\.?|purchase\s*order)\s+(?:not\s+confirmed|not\s+issued|not\s+approved|not\s+received|pending\s+approval)\b/iu,
    /未付款|尚未付款|未收到付款|未收到定金|订单未确认|尚未下单|未下单|不要开(?:具)?(?:采购订单|PO)|请勿(?:开具|确认|处理)(?:采购订单|PO|订单)/iu
  ];

  const GROUP_DEFINITIONS = [
    { id: "customerNeeds", zhTitle: "客户需求", enTitle: "Customer needs" },
    { id: "specifications", zhTitle: "规格与技术参数", enTitle: "Specifications and technical parameters" },
    { id: "commercialTerms", zhTitle: "报价与商务条款", enTitle: "Quotation and commercial terms" },
    { id: "documentsAndQuality", zhTitle: "文件、认证与质量要求", enTitle: "Documents, certificates and quality requirements" },
    { id: "orderProgress", zhTitle: "成交与订单进展", enTitle: "Deal and order progress" },
    { id: "nextActions", zhTitle: "下一步动作", enTitle: "Next actions" },
    { id: "other", zhTitle: "其他重要要点", enTitle: "Other important points" }
  ];

  const PRODUCT_VALUE_PATTERN = /\b(ball\s*valve|gate\s*valve|globe\s*valve|check\s*valve|non\s*return\s*valve|butterfly\s*valve|control\s*valve|motor[\s-]*operated\s*valve|MOV|solenoid\s*valve|safety\s*valve|relief\s*valve|(?:adjustable\s+)?(?:angle\s+)?choke\s*valve|plug\s*valve|y\s*strainer|strainer|actuator|flanges|blind\s+flange|weld\s+neck\s+flange|slip[\s-]*on\s+flange|fittings?|elbows?|tees?|reducers?)\b|球阀|闸阀|截止阀|止回阀|单向阀|蝶阀|调节阀|控制阀|电动阀|电磁阀|安全阀|泄压阀|节流阀|旋塞阀|过滤器|滤器|执行器|法兰盘|盲法兰|对焊法兰|管件|弯头|三通|大小头/giu;

  const KEY_POINT_RULES = [
    {
      id: "valveCategory",
      group: "customerNeeds",
      titleZh: "阀门或相关品类",
      titleEn: "Valve or related category",
      pattern: PRODUCT_VALUE_PATTERN,
      valuePatterns: [PRODUCT_VALUE_PATTERN]
    },
    {
      id: "quantity",
      group: "customerNeeds",
      titleZh: "数量需求",
      titleEn: "Quantity requirement",
      pattern: /\b(q['’]?\s*ty|qty|quantity|pcs?|pieces|sets?|units?|no['’]?s?)\b|(?:数量|采购量|需求量)\s*[:：#-]?\s*\d|\d[\d,]*\s*(?:套|台|件|个|只)/iu,
      valuePatterns: [
        /\b(?:q['’]?\s*ty|qty|quantity)\s*[:：#-]?\s*([0-9][0-9,]*(?:\s*(?:pcs?|pieces|sets?|units?|no['’]?s?))?)/giu,
        /([0-9][0-9,]*\s*(?:pcs?|pieces|sets?|units?|no['’]?s?))\b/giu,
        /(?:数量|采购量|需求量)\s*[:：#-]?\s*([0-9][0-9,]*(?:\s*(?:套|台|件|个|只))?)/giu,
        /([0-9][0-9,]*\s*(?:套|台|件|个|只))/giu
      ],
      skipWhenNoValue: true
    },
    {
      id: "size",
      group: "specifications",
      titleZh: "口径或尺寸",
      titleEn: "Size or dimension",
      pattern: /\b(dn\s*\d+|nps\s*\d+|\d+(?:-\d+\/\d+)?\s*(?:inch|in\.|"))|口径|尺寸|规格|公称通径/iu,
      valuePatterns: [
        /\b(DN\s*\d+(?:\s*[x×]\s*\d+)?)/giu,
        /\b(NPS\s*\d+(?:\s*[x×]\s*\d+)?)/giu,
        /\b(\d+(?:-\d+\/\d+)?(?:\.\d+)?\s*(?:inch|in\.|"))/giu,
        /(?:口径|尺寸|规格|公称通径)\s*[:：#-]?\s*([^,，;；。\n]{2,60})/giu
      ],
      skipWhenNoValue: true
    },
    {
      id: "pressure",
      group: "specifications",
      titleZh: "压力等级",
      titleEn: "Pressure rating",
      pattern: /\b(pn\s*\d+|class\s*\d+|cl\s*\d+|ansi\s*\d+|\d+\s*(?:lb|bar|psi|mpa|kpa|kg\/cm2|m\/c²)|pressure)\b|压力|压力等级|磅级/iu,
      valuePatterns: [
        /\b(PN\s*\d+(?:\.\d+)?)/giu,
        /\b(Class\s*\d+|CL\s*\d+|ANSI\s*\d+)\b/giu,
        /\b(\d+(?:\.\d+)?\s*(?:LB|bar|psi|MPa|kPa|kg\/cm2|m\/c²))(?=\s|[.,;*]|$)/giu,
        /(?:压力|压力等级|磅级)\s*[:：#-]?\s*([^,，;；。\n]{2,60})/giu
      ],
      skipWhenNoValue: true
    },
    {
      id: "material",
      group: "specifications",
      titleZh: "材质要求",
      titleEn: "Material requirement",
      pattern: /\b(material|ss304|ss316|ss316l|cf8|cf8m|wcb|wc6|wc9|duplex|brass|bronze|body|seat|seal|stem)\b|材质|阀体|阀座|密封|阀杆|不锈钢|碳钢|铸钢|黄铜/iu,
      valuePatterns: [
        /\b(SS\s*304|SS\s*316L?|CF8M?|WCB|WC6|WC9|duplex|brass|bronze|carbon\s*steel|stainless\s*steel)\b/giu,
        /\b(?:material|body|seat|seal|stem)\s*[:：#-]\s*([^,，;；。\n]{2,80})/giu,
        /(?:材质|阀体|阀座|密封|阀杆)\s*[:：#-]?\s*([^,，;；。\n]{2,80})/giu,
        /(不锈钢|碳钢|铸钢|黄铜|双相钢|硬密封|软密封)/giu
      ],
      skipWhenNoValue: true
    },
    {
      id: "standard",
      group: "specifications",
      titleZh: "标准或设计要求",
      titleEn: "Standard or design requirement",
      pattern: /\b(api\s*6d|api\s*607|api\s*598|asme|ansi|din|jis|bs|iso|en\s*\d+|design|face\s*to\s*face)\b|标准|设计|结构长度/iu,
      valuePatterns: [
        /\b(API\s*6D|API\s*607|API\s*598|ASME\s*B?\d+(?:\.\d+)?|ANSI\s*\d+|DIN\s*\d+|JIS\s*\d+|BS\s*\d+|ISO\s*\d+|EN\s*\d+)\b/giu,
        /(?:标准|设计|结构长度)\s*[:：#-]?\s*([^,，;；。\n]{2,80})/giu
      ]
    },
    {
      id: "connection",
      group: "specifications",
      titleZh: "连接方式",
      titleEn: "Connection type",
      pattern: /\b(flanged|flange|threaded|screwed|npt|bsp|butt\s*weld|socket\s*weld|wafer|lug|clamp|tri\s*clamp)\b|法兰|螺纹|焊接|对焊|承插焊|对夹|凸耳|卡箍/iu,
      valuePatterns: [
        /\b(flanged|threaded|screwed|NPT|BSP|butt\s*weld|socket\s*weld|wafer|lug|clamp|tri\s*clamp)\b/giu,
        /(法兰|螺纹|焊接|对焊|承插焊|对夹|凸耳|卡箍)/giu,
        /(?:连接方式|连接)\s*[:：#-]?\s*([^,，;；。\n]{2,60})/giu
      ]
    },
    {
      id: "actuation",
      group: "specifications",
      titleZh: "驱动或执行方式",
      titleEn: "Actuation method",
      pattern: /\b(manual|gear\s*operator|lever|handwheel|pneumatic|electric|hydraulic|actuator)\b|手动|蜗轮|手柄|手轮|气动|电动|液动|执行器/iu,
      valuePatterns: [
        /\b(manual|gear\s*operator|lever|handwheel|pneumatic|electric|hydraulic|actuator)\b/giu,
        /(手动|蜗轮|手柄|手轮|气动|电动|液动|执行器)/giu,
        /(?:驱动|执行方式|操作方式)\s*[:：#-]?\s*([^,，;；。\n]{2,60})/giu
      ]
    },
    {
      id: "mediumApplication",
      group: "specifications",
      titleZh: "介质或应用工况",
      titleEn: "Medium or application condition",
      pattern: /\b(medium|media|water|steam|oil|gas|chemical|temperature|temp\.?|working\s*condition|application)\b|介质|工况|温度|水|蒸汽|油|气体|化工/iu,
      valuePatterns: [
        /(?:medium|media|application|working\s*condition|temperature|temp\.?)\s*[:：#-]?\s*([^,，;；。\n]{2,90})/giu,
        /(?:介质|工况|温度|应用)\s*[:：#-]?\s*([^,，;；。\n]{2,90})/giu,
        /(water|steam|oil|gas|chemical|水|蒸汽|油|气体|化工)/giu
      ]
    },
    {
      id: "price",
      group: "commercialTerms",
      titleZh: "价格或报价",
      titleEn: "Price or quotation",
      fallbackZh: "客户要求报价或讨论价格",
      fallbackEn: "Customer requested a quotation or discussed price",
      pattern: /\b(price|unit\s*price|total|amount|discount|usd|eur|rmb|cny|us\$|\$)\b|价格|单价|总价|金额|折扣|美金|美元|人民币/iu,
      valuePatterns: [
        /(?:USD|EUR|RMB|CNY|US\$|\$)\s*[0-9][0-9,.]*/giu,
        /[0-9][0-9,.]*\s*(?:USD|EUR|RMB|CNY)/giu,
        /(?:价格|单价|总价|报价|报盘|折扣)\s*[:：#-]?\s*([^,，;；。\n]{2,80})/giu,
        /(?:price|unit\s*price|total|amount|discount)\s*[:：#-]?\s*([^,，;；。\n]{2,80})/giu
      ]
    },
    {
      id: "delivery",
      group: "commercialTerms",
      titleZh: "交期或发货",
      titleEn: "Delivery or shipment",
      skipWhenNoValue: true,
      pattern: /\b(delivery|lead\s*time|shipment|shipping|dispatch|ready\s*date|stock|ex\s*stock)\b|交期|货期|发货|出货|运输|库存|现货/iu,
      valuePatterns: [
        /(?:delivery|lead\s*time|shipment|shipping|ready\s*date)\s*[:：#-]\s*([^,，;；。\n]{2,90})/giu,
        /(?:交期|货期|发货|出货|运输|库存|现货)\s*[:：#-]?\s*([^,，;；。\n]{2,90})/giu,
        /\b([0-9]+\s*(?:days?|weeks?|months?))\b/giu,
        /([0-9]+\s*(?:天|周|星期|个月))/giu
      ]
    },
    {
      id: "tradeTerm",
      group: "commercialTerms",
      titleZh: "贸易条款或目的地",
      titleEn: "Trade term or destination",
      pattern: /\b(exw|fob|cif|cfr|dap|ddp|ddu|port|destination|freight|air|sea)\b|贸易条款|港口|目的港|空运|海运|运费/iu,
      valuePatterns: [
        /\b(EXW|FOB|CIF|CFR|DAP|DDP|DDU)\b(?:\s+[^,，;；。\n]{2,40})?/giu,
        /(?:port|destination|freight)\s*[:：#-]?\s*([^,，;；。\n]{2,80})/giu,
        /(?:贸易条款|港口|目的港|运费)\s*[:：#-]?\s*([^,，;；。\n]{2,80})/giu
      ]
    },
    {
      id: "payment",
      group: "commercialTerms",
      titleZh: "付款条件",
      titleEn: "Payment term",
      skipWhenNoValue: true,
      pattern: /\b(payment\s*term|payment|tt|t\/t|lc|l\/c|advance)\b|付款条件|付款方式|电汇|信用证/iu,
      valuePatterns: [
        /(?:payment\s*term|payment)\s*[:：#-]?\s*([^,，;；。\n]{2,90})/giu,
        /(?:付款条件|付款方式)\s*[:：#-]?\s*([^,，;；。\n]{2,90})/giu,
        /\b(T\/T|TT|L\/C|LC|[0-9]+%\s*(?:deposit|balance|advance))\b/giu,
        /([0-9]+%\s*(?:定金|尾款|预付))/giu
      ]
    },
    {
      id: "documents",
      group: "documentsAndQuality",
      titleZh: "文件或证书",
      titleEn: "Documents or certificates",
      pattern: /\b(certificate|cert|test\s*report|drawing|datasheet|data\s*sheet|catalog|manual|inspection|mtr|mtc|mill\s*certificate|ce|iso|en\s*10204)\b|认证|证书|测试报告|图纸|数据表|样本|说明书|检验|材质书/iu,
      valuePatterns: [
        /\b(CE|ISO\s*\d+|MTR|MTC|EN\s*10204\s*3\.1|mill\s*certificate|test\s*report|drawing|datasheet|catalog|manual)\b/giu,
        /(认证|证书|测试报告|图纸|数据表|样本|说明书|检验|材质书)/giu,
        /(?:documents?|certificates?|drawing|datasheet|test\s*report)\s*[:：#-]\s*([^,，;；。\n]{2,90})/giu,
        /\b(certificate|certificates?|test\s*report|drawing|datasheet|catalog|manual)\b/giu,
        /(?:文件|证书|图纸|数据表|测试报告)\s*[:：#-]?\s*([^,，;；。\n]{2,90})/giu
      ]
    },
    {
      id: "quality",
      group: "documentsAndQuality",
      titleZh: "质保、包装或铭牌",
      titleEn: "Warranty, packing or marking",
      pattern: /\b(warranty|guarantee|packing|package|marking|nameplate|label|tag)\b|质保|保修|包装|铭牌|唛头|标签/iu,
      valuePatterns: [
        /(?:warranty|guarantee|packing|package|marking|nameplate|label)\s*[:：#-]?\s*([^,，;；。\n]{2,90})/giu,
        /(?:质保|保修|包装|铭牌|唛头|标签)\s*[:：#-]?\s*([^,，;；。\n]{2,90})/giu
      ]
    },
    {
      id: "orderConfirmed",
      group: "orderProgress",
      titleZh: "订单或成交信号",
      titleEn: "Order or deal signal",
      pattern: /\b(?:p\.?\s*o\.?|purchase\s*order)\s*(?:(?:#|no\.?|number|[:：-])\s*)?(?=[A-Z0-9./-]*\d)[A-Z0-9][A-Z0-9./-]{2,}\b|\b(?:attached|send|sent|received|issue[sd]?|release[sd]?|confirm(?:ed)?|approve[sd]?|provide[sd]?|submit(?:ted)?|copy\s+of)\s+(?:the\s+)?(?:p\.?\s*o\.?|purchase\s*order)\b|\b(?:p\.?\s*o\.?|purchase\s*order)\s+(?:attached|received|issued|released|confirmed|approved|copy)\b|\b(purchase\s*order|sales\s*order|order\s*confirmed|contract\s*signed|payment\s*received|deposit\s*received|paid|invoice\s*(?:issued|sent))\b|已成交|已下单|订单已确认|采购订单|合同已签|已付款|收到定金|发票已开|付款水单/iu,
      valuePatterns: [
        /\b(?:P\.?\s*O\.?|purchase\s*order)\s*(?:(?:#|No\.?|number|[:：-])\s*)?(?=[A-Z0-9./-]*\d)[A-Z0-9][A-Z0-9./-]{2,}\b/giu,
        /\b(?:attached|send|sent|received|issue[sd]?|release[sd]?|confirm(?:ed)?|approve[sd]?|provide[sd]?|submit(?:ted)?|copy\s+of)\s+(?:the\s+)?(?:P\.?\s*O\.?|purchase\s*order)\b|\b(?:P\.?\s*O\.?|purchase\s*order)\s+(?:attached|received|issued|released|confirmed|approved|copy)\b/giu,
        /\b(purchase\s*order|sales\s*order|order\s*confirmed|contract\s*signed|payment\s*received|deposit\s*received|paid|invoice\s*(?:issued|sent))\b/giu,
        /(已成交|已下单|订单已确认|采购订单|合同已签|已付款|收到定金|发票已开|付款水单)/giu
      ]
    },
    {
      id: "rfqProgress",
      group: "orderProgress",
      titleZh: "询价或报价阶段",
      titleEn: "Inquiry or quotation stage",
      fallbackZh: "已进入询价或报价阶段",
      fallbackEn: "The conversation is at inquiry or quotation stage",
      pattern: /\b(rfq|inquiry|enquiry|quotation|quote|offer|price\s*list|proforma\s*invoice|\bpi\b|sample)\b|询价|报价|报盘|形式发票|价格表|样品|议价|还价/iu,
      valuePatterns: [
        /\b(RFQ|inquiry|enquiry|quotation|quote|offer|price\s*list|proforma\s*invoice|PI|sample)\b/giu,
        /(询价|报价|报盘|形式发票|价格表|样品|议价|还价)/giu
      ]
    },
    {
      id: "customerQuestion",
      group: "nextActions",
      titleZh: "客户问题或待确认事项",
      titleEn: "Customer question or pending confirmation",
      fallbackZh: "客户提出需要回复或确认的事项",
      fallbackEn: "Customer raised an item that needs reply or confirmation",
      pattern: /\b(please|kindly|could\s*you|can\s*you|advise|confirm|check|revise|send|provide|waiting\s*for|need\s*your)\b|请|烦请|麻烦|能否|是否|确认|核实|提供|发送|修改|回复|待确认|请问/iu,
      valuePatterns: []
    },
    {
      id: "internalAction",
      group: "nextActions",
      titleZh: "内部跟进动作",
      titleEn: "Internal follow-up action",
      fallbackZh: "内部需要继续跟进",
      fallbackEn: "Internal follow-up is needed",
      pattern: /\b(follow\s*up|reply|update|prepare|arrange|check\s*with|confirm\s*with)\b|跟进|回复|更新|准备|安排|确认供应|确认工厂|催/iu,
      valuePatterns: []
    }
  ];

  const RULE_PRIORITIES = {
    orderConfirmed: 1,
    valveCategory: 5,
    quantity: 10,
    size: 10,
    pressure: 11,
    material: 12,
    connection: 13,
    actuation: 14,
    mediumApplication: 15,
    standard: 16,
    delivery: 10,
    payment: 11,
    tradeTerm: 12,
    documents: 10,
    quality: 11,
    price: 20,
    customerQuestion: 20,
    internalAction: 25,
    rfqProgress: 30,
    fallback: 90
  };

  const FALLBACK_KEY_POINT_PATTERNS = [
    /\b(qty|quantity|pcs|sets?|units?|数量)\b/iu,
    /\b(dn\s*\d+|nps\s*\d+|inch|size|口径|尺寸|规格)\b/iu,
    /\b(pn\s*\d+|class\s*\d+|pressure|rating|压力|等级)\b/iu,
    /\b(material|ss304|ss316|cf8|cf8m|wcb|body|seat|seal|stem|材质|阀体|阀座|密封)\b/iu,
    /\b(delivery|lead\s*time|shipment|shipping|exw|fob|cif|dap|交期|发货|运输|港口)\b/iu,
    /\b(price|unit\s*price|total|discount|payment\s*term|价格|单价|总价|折扣|付款条件)\b/iu,
    /\b(certificate|test\s*report|drawing|datasheet|iso|api\s*6d|ce|认证|证书|测试报告|图纸)\b/iu,
    /\b(warranty|packing|marking|nameplate|质保|包装|铭牌|唛头)\b/iu
  ];

  const VALUE_TRANSLATIONS_TO_ZH = [
    [/\bball\s*valve\b/giu, "球阀"], [/\bgate\s*valve\b/giu, "闸阀"], [/\bglobe\s*valve\b/giu, "截止阀"], [/\bcheck\s*valve\b/giu, "止回阀"],
    [/\bbutterfly\s*valve\b/giu, "蝶阀"], [/\bcontrol\s*valve\b/giu, "调节阀"], [/\bsolenoid\s*valve\b/giu, "电磁阀"], [/\bsafety\s*valve\b/giu, "安全阀"],
    [/\brelief\s*valve\b/giu, "泄压阀"], [/\bplug\s*valve\b/giu, "旋塞阀"], [/\bstrainer\b/giu, "过滤器"], [/\bactuator\b/giu, "执行器"],
    [/\bflanged\b/giu, "法兰连接"], [/\bflange\b/giu, "法兰"], [/\bfitting\b/giu, "管件"], [/\bbody\b/giu, "阀体"], [/\bseat\b/giu, "阀座"], [/\bseal\b/giu, "密封"], [/\bstem\b/giu, "阀杆"],
    [/\bquantity\b/giu, "数量"], [/\bqty\b/giu, "数量"], [/\bsize\b/giu, "尺寸"], [/\bpressure\s*rating\b/giu, "压力等级"], [/\bpressure\b/giu, "压力"],
    [/\bmaterial\b/giu, "材质"], [/\bcertificate\b/giu, "证书"], [/\bdrawing\b/giu, "图纸"], [/\btest\s*report\b/giu, "测试报告"],
    [/\blead\s*time\b/giu, "交期"], [/\bdelivery\b/giu, "交付"], [/\bshipment\b/giu, "发货"], [/\bshipping\b/giu, "运输"], [/\bport\b/giu, "港口"],
    [/\bpayment\s*received\b/giu, "收到付款"], [/\bdeposit\s*received\b/giu, "收到定金"], [/\bpayment\s*term\b/giu, "付款条件"], [/\bpayment\b/giu, "付款"], [/\bdeposit\b/giu, "定金"], [/\breceived\b/giu, "已收到"], [/\bpaid\b/giu, "已付款"],
    [/\bpurchase\s*order\b/giu, "采购订单"], [/\border\s*confirmed\b/giu, "订单已确认"], [/\bcontract\s*signed\b/giu, "合同已签"],
    [/\bplease\s*quote\b/giu, "请报价"], [/\bquote\b/giu, "报价"], [/\bquotation\b/giu, "报价"], [/\binquiry\b/giu, "询价"], [/\bcustomer\b/giu, "客户"],
    [/\bneed\b/giu, "需要"], [/\brequire\b/giu, "要求"], [/\bplease\s*arrange\b/giu, "请安排"], [/\bdays?\b/giu, "天"], [/\bweeks?\b/giu, "周"]
  ];

  const VALUE_TRANSLATIONS_TO_EN = [
    [/海水淡化/g, "seawater desalination"], [/污水处理/g, "wastewater treatment"], [/水处理/g, "water treatment"], [/石油和天然气|油气/g, "oil and gas"], [/炼油厂/g, "refinery"], [/发电厂/g, "power plant"],
    [/扩建/g, " expansion"], [/改造/g, " revamp"], [/新建/g, " new-build"], [/维修/g, " maintenance"], [/项目|工程/g, " project"],
    [/球阀/g, "ball valve"], [/闸阀/g, "gate valve"], [/截止阀/g, "globe valve"], [/止回阀|单向阀/g, "check valve"], [/蝶阀/g, "butterfly valve"],
    [/调节阀|控制阀/g, "control valve"], [/电磁阀/g, "solenoid valve"], [/安全阀/g, "safety valve"], [/泄压阀/g, "relief valve"], [/旋塞阀/g, "plug valve"],
    [/过滤器|滤器/g, "strainer"], [/执行器/g, "actuator"], [/法兰连接/g, "flanged"], [/法兰/g, "flange"], [/管件/g, "fitting"], [/阀体/g, "body"], [/阀座/g, "seat"], [/密封/g, "seal"], [/阀杆/g, "stem"],
    [/数量/g, "quantity"], [/口径|尺寸|规格/g, "size"], [/压力等级/g, "pressure rating"], [/压力/g, "pressure"], [/材质/g, "material"],
    [/不锈钢/g, "stainless steel"], [/碳钢/g, "carbon steel"], [/铸钢/g, "cast steel"], [/黄铜/g, "brass"], [/双相钢/g, "duplex stainless steel"], [/硬密封/g, "metal seated"], [/软密封/g, "soft seated"],
    [/证书/g, "certificate"], [/图纸/g, "drawing"], [/测试报告/g, "test report"], [/交期|货期/g, "lead time"], [/交付/g, "delivery"], [/发货|出货/g, "shipment"], [/运输/g, "shipping"], [/港口/g, "port"],
    [/收到付款/g, "payment received"], [/收到定金/g, "deposit received"], [/预付款/g, "advance payment"], [/付款条件/g, "payment term"], [/付款/g, "payment"], [/定金/g, "deposit"], [/已收到/g, "received"], [/已付款/g, "paid"], [/采购订单/g, "purchase order"], [/订单已确认/g, "order confirmed"], [/合同已签/g, "contract signed"],
    [/请报价/g, "please quote"], [/报价/g, "quotation"], [/询价/g, "inquiry"], [/客户/g, "customer"], [/需要/g, "need"], [/要求/g, "require"], [/请安排/g, "please arrange"],
    [/([0-9]+)\s*台/g, "$1 units"], [/([0-9]+)\s*套/g, "$1 sets"], [/([0-9]+)\s*件/g, "$1 pieces"], [/([0-9]+)\s*个/g, "$1 units"],
    [/十/g, "10"], [/九/g, "9"], [/八/g, "8"], [/七/g, "7"], [/六/g, "6"], [/五/g, "5"], [/四/g, "4"], [/三/g, "3"], [/二/g, "2"], [/一/g, "1"],
    [/天内/g, " days"], [/周内/g, " weeks"], [/个月内/g, " months"], [/天/g, " days"], [/周/g, " weeks"], [/月/g, " months"], [/，/g, ", "], [/；/g, "; "], [/。/g, ". "]
  ];

  function api() {
    return global.messenger || global.browser;
  }

  function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function stripContactArtifacts(value) {
    return normalizeWhitespace(value)
      .replace(EMAIL_ADDRESS_PATTERN, " ")
      .replace(URL_PATTERN, " ")
      .trim();
  }

  function stripSubjectPrefixes(subject) {
    let value = normalizeWhitespace(subject);
    let previous = "";
    while (value && value !== previous) {
      previous = value;
      value = value
        .replace(/^\s*(re|fw|fwd|答复|回复|转发)\s*[:：]\s*/iu, "")
        .replace(/^\s*\[(external|外部|spam|bulk)\]\s*/iu, "")
        .trim();
    }
    return value;
  }

  function normalizeSubject(subject) {
    return stripSubjectPrefixes(subject)
      .replace(/[\[\]【】()（）]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function getSubjectSearchKey(subject) {
    const normalized = normalizeSubject(subject);
    if (!normalized) {
      return "";
    }
    const parts = normalized.split(/[-_|]/).map(part => part.trim()).filter(Boolean);
    const chosen = parts.sort((a, b) => b.length - a.length)[0] || normalized;
    return chosen.slice(0, 80);
  }

  function dateToNumber(dateValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue || 0);
    const time = date.getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function formatDate(dateValue) {
    const time = dateToNumber(dateValue);
    if (!time) return "未知日期";
    const date = new Date(time);
    return date.toISOString().slice(0, 10);
  }

  async function getStoredOptions() {
    const runtime = api();
    const stored = await runtime.storage.local.get("options");
    return { ...DEFAULT_OPTIONS, ...(stored.options || {}) };
  }

  async function withDetectedOwnIdentities(options) {
    const runtime = api();
    const ownEmails = [...(options.ownEmails || [])];
    if (!runtime.accounts?.list) return { ...options, ownEmails: dedupe(ownEmails) };
    try {
      const accounts = await runtime.accounts.list();
      for (const account of accounts || []) {
        for (const identity of account.identities || []) {
          if (identity?.email) ownEmails.push(identity.email);
        }
      }
    } catch (error) {
      // User-configured identities remain available if account discovery fails.
    }
    return { ...options, ownEmails: dedupe(ownEmails) };
  }

  async function getCache(key) {
    const runtime = api();
    const result = await runtime.storage.local.get(key);
    return result[key] || null;
  }

  async function setCache(key, value) {
    const runtime = api();
    await runtime.storage.local.set({ [key]: value });
  }

  function cacheKeyFor(header, options) {
    const stableId = header.headerMessageId || `${header.folder?.accountId || ""}:${header.folder?.path || ""}:${header.subject || ""}`;
    return `summary:v${SUMMARY_SCHEMA_VERSION}:${ANALYSIS_ENGINE_VERSION}:${options?.cacheEpoch || 0}:${stableId}`;
  }

  function conversationFingerprint(headers) {
    const sorted = [...(headers || [])].sort((a, b) => dateToNumber(a.date) - dateToNumber(b.date));
    const latest = sorted[sorted.length - 1] || {};
    return [
      sorted.length,
      latest.headerMessageId || latest.id || "",
      dateToNumber(latest.date)
    ].join(":");
  }

  async function queryRelatedHeaders(header, options) {
    const runtime = api();
    const subjectKey = getSubjectSearchKey(header.subject);
    if (!subjectKey) {
      return [header];
    }

    const queryInfo = {
      subject: subjectKey,
      messagesPerPage: Math.max(10, Math.min(100, options.maxMessages || DEFAULT_OPTIONS.maxMessages)),
      autoPaginationTimeout: 300
    };

    if (header.folder?.id) {
      queryInfo.folderId = header.folder.id;
      queryInfo.includeSubFolders = Boolean(options.includeSubFolders);
    }

    let list;
    try {
      list = await runtime.messages.query(queryInfo);
    } catch (error) {
      list = await runtime.messages.query({
        subject: subjectKey,
        messagesPerPage: Math.max(10, Math.min(100, options.maxMessages || DEFAULT_OPTIONS.maxMessages)),
        autoPaginationTimeout: 300
      });
    }

    const all = [];
    let cursor = list;
    while (cursor && all.length < options.maxMessages) {
      for (const message of cursor.messages || []) {
        all.push(message);
        if (all.length >= options.maxMessages) break;
      }
      if (!cursor.id || all.length >= options.maxMessages) break;
      try {
        cursor = await runtime.messages.continueList(cursor.id);
      } catch (error) {
        break;
      }
    }

    const normalizedMain = normalizeSubject(header.subject);
    const mainPartyKeys = getExternalPartyKeys(header, options);
    const filtered = all.filter(message => {
      const subject = normalizeSubject(message.subject);
      const subjectMatches = subject === normalizedMain || subject.includes(subjectKey) || normalizedMain.includes(subject);
      if (!subjectMatches) return false;
      const candidatePartyKeys = getExternalPartyKeys(message, options);
      if (!mainPartyKeys.size || !candidatePartyKeys.size) return message.id === header.id;
      return [...candidatePartyKeys].some(key => mainPartyKeys.has(key));
    });

    const uniqueById = new Map();
    for (const message of [header, ...filtered]) {
      uniqueById.set(message.id, message);
    }

    return [...uniqueById.values()].sort((a, b) => dateToNumber(a.date) - dateToNumber(b.date));
  }

  function getExternalPartyKeys(message, options) {
    if (!global.CustomerIntelligence?.parseMailbox) return new Set();
    const ownDomains = new Set((options.ownDomains || []).map(value => String(value).toLowerCase().replace(/^@/u, "")));
    const ownEmails = new Set((options.ownEmails || []).map(value => String(value).toLowerCase()));
    const publicDomains = global.CustomerIntelligence.PUBLIC_EMAIL_DOMAINS || new Set();
    const author = global.CustomerIntelligence.parseMailbox(message.author || "");
    const recipients = [
      ...(message.recipients || []),
      ...(message.ccList || [])
    ].map(global.CustomerIntelligence.parseMailbox);
    const isOwn = mailbox => ownEmails.has(mailbox.email) || ownDomains.has(mailbox.domain);
    const candidates = author.email && !isOwn(author)
      ? [author]
      : recipients.filter(mailbox => mailbox.email && !isOwn(mailbox));
    const keys = new Set();
    for (const mailbox of candidates) {
      if (mailbox.email) keys.add(`email:${mailbox.email}`);
      if (mailbox.domain && !publicDomains.has(mailbox.domain)) keys.add(`domain:${mailbox.domain}`);
    }
    return keys;
  }

  function htmlToText(html) {
    return String(html || "")
      .replace(/<style[\s\S]*?<\/style>/giu, " ")
      .replace(/<script[\s\S]*?<\/script>/giu, " ")
      .replace(/<br\s*\/?\s*>/giu, "\n")
      .replace(/<\/p>/giu, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  function walkMessageParts(part, output) {
    if (!part) return;
    const contentType = String(part.contentType || "").toLowerCase();
    if (part.body && contentType.startsWith("text/")) {
      output.push(contentType.includes("html") ? htmlToText(part.body) : part.body);
    }
    if (Array.isArray(part.parts)) {
      for (const child of part.parts) {
        walkMessageParts(child, output);
      }
    }
  }

  async function readMessageText(messageId, options) {
    const runtime = api();
    try {
      if (runtime.messages.listInlineTextParts) {
        const parts = await runtime.messages.listInlineTextParts(messageId);
        const textParts = [];
        for (const part of parts || []) {
          if (!part?.content) continue;
          const contentType = String(part.contentType || "").toLowerCase();
          textParts.push(contentType.includes("html") ? htmlToText(part.content) : part.content);
        }
        const text = normalizeBody(textParts.join("\n"));
        if (text) return text.slice(0, options.bodyLimitPerMessage);
      }
    } catch (error) {
      // Fall back to getFull below.
    }

    try {
      const full = await runtime.messages.getFull(messageId, { decrypt: true });
      const output = [];
      walkMessageParts(full, output);
      return normalizeBody(output.join("\n")).slice(0, options.bodyLimitPerMessage);
    } catch (error) {
      return "";
    }
  }

  function normalizeBody(value) {
    return String(value || "")
      .replace(/\r/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/[\u00a0\u200b]/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function splitSentences(text) {
    return String(text || "")
      .split(/(?<=[。！？.!?;；])\s+|\n+/u)
      .map(sentence => normalizeWhitespace(sentence))
      .filter(sentence => sentence.length >= 6 && sentence.length <= 320);
  }

  function splitBusinessChunks(text) {
    const lines = String(text || "")
      .replace(/\r/g, "\n")
      .split(/\n+/u)
      .flatMap(line => {
        const cleaned = normalizeWhitespace(line.replace(/^[>\-•*\d.)）\s]+/u, ""));
        if (!cleaned) return [];
        const sentenceLikeParts = cleaned.split(/(?<=[。！？!?;；])\s*|(?<=\.)\s+(?=[A-Z0-9一-龥])/u).filter(Boolean);
        if (sentenceLikeParts.length > 1) return sentenceLikeParts;
        if (cleaned.length <= 220) return [cleaned];
        return cleaned.match(/.{1,180}(?:\s|$)/gu) || [cleaned.slice(0, 220)];
      })
      .map(cleanEvidence)
      .filter(isBusinessChunk);

    return dedupe(lines).slice(0, 600);
  }

  function isBusinessChunk(value) {
    const text = normalizeWhitespace(value);
    if (text.length < 4 || text.length > 360) return false;
    if (/^(from|sent|to|cc|bcc|subject|date|发件人|发送时间|收件人|抄送|主题|日期)\s*[:：]/iu.test(text)) return false;

    const searchableText = stripContactArtifacts(text);
    const hasBusinessSignal = /\b(quote|quotation|rfq|inquiry|qty|quantity|pcs|sets?|dn\s*\d+|nps\s*\d+|pn\s*\d+|class\s*\d+|valve|price|delivery|lead\s*time|certificate|drawing|po|paid|deposit|flange|body)\b|询价|报价|数量|口径|压力|阀|价格|交期|证书|图纸|订单|付款|定金|法兰|阀体/iu.test(searchableText);
    if (/^(hi|hello|dear|thanks|thank you|best regards|regards|您好|你好|谢谢|致敬|顺祝)/iu.test(text) && text.length < 80 && !hasBusinessSignal) return false;

    if (/unsubscribe|confidentiality|virus-free|disclaimer|保密|免责声明|退订/iu.test(text)) return false;
    return true;
  }

  function cleanEvidence(value) {
    return normalizeWhitespace(value)
      .replace(/^[-–—:：,，;；\s]+/u, "")
      .replace(/^(dear|hi|hello)\s+(?:sir|madam|team|all|[a-z .]{1,40})[,，:：]\s*/iu, "")
      .replace(/\s*[-–—]\s*$/u, "")
      .trim();
  }

  function extractProjectNames(messages, bodyText) {
    const candidates = [];
    const source = `${messages.map(message => message.subject || "").join("\n")}\n${bodyText}`;
    const patterns = [
      /\bproject\s*(?:name|no\.?|number)?\s*[:：#-]\s*([^\n;,]{2,80})/giu,
      /\bjob\s*(?:name|no\.?|number)?\s*[:：#-]\s*([^\n;,]{2,80})/giu,
      /项目(?:名称|编号)\s*[:：#-]?\s*([^\n，。；;]{2,80})/gu,
      /项目\s*[:：#-]\s*([^\n，。；;]{2,80})/gu,
      /工程(?:名称|编号)\s*[:：#-]?\s*([^\n，。；;]{2,80})/gu,
      /工程\s*[:：#-]\s*([^\n，。；;]{2,80})/gu
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(source))) {
        candidates.push(cleanCandidate(match[1]));
      }
    }

    const hasExplicitCandidate = candidates.some(value => value && !isWeakProjectName(value));
    for (const message of messages) {
      if (hasExplicitCandidate) break;
      const subject = stripSubjectPrefixes(message.subject || "");
      const hasProjectSignal = /\b(project|job|tender|epc|package|contract|terminal|plant|expansion)\b|项目|工程/iu.test(subject);
      if (!hasProjectSignal) continue;
      const subjectParts = subject
        .split(/\s[-_|]\s|[_|]{2,}|\s{2,}/u)
        .map(cleanCandidate)
        .filter(Boolean);
      for (const part of subjectParts) {
        if (part.length >= 3 && part.length <= 80) candidates.push(part);
      }
    }

    const unique = dedupe(candidates).filter(value => value && !isWeakProjectName(value));
    return unique.slice(0, 3);
  }

  function isWeakProjectName(value) {
    const text = normalizeWhitespace(value).toLowerCase();
    if (!text) return true;
    if (/^(quotation|quote|inquiry|enquiry|rfq|offer|price|valve|order|project|project name|name|mail|email|fwd|re|urgent|details|reference details|project details|scope and|requirements|data sheet and|closely|except for us)$/iu.test(text)) return true;
    if (/^(rfq|quotation|quote|inquiry|enquiry|offer)\b/iu.test(text)) return true;
    if (/^(报价|询价|邮件|阀门|订单|项目|价格|紧急)$/u.test(text)) return true;
    if (/^(?:scope|details|requirements|reference|data sheet)\b/iu.test(text) && text.split(/\s+/u).length <= 4) return true;
    if (/^\d+$/.test(text)) return true;
    return false;
  }

  function cleanCandidate(value) {
    return normalizeWhitespace(value)
      .replace(/^["'“”‘’\[\]【】()（）]+|["'“”‘’\[\]【】()（）.。,:：;；]+$/gu, "")
      .slice(0, 90)
      .trim();
  }

  function localizeValue(value, language) {
    let text = normalizeWhitespace(value);
    const replacements = language === "zh" ? VALUE_TRANSLATIONS_TO_ZH : VALUE_TRANSLATIONS_TO_EN;
    for (const [pattern, replacement] of replacements) {
      text = text.replace(pattern, replacement);
    }
    if (language === "en") {
      text = text
        .replace(/([0-9])([A-Za-z])/gu, "$1 $2")
        .replace(/([A-Za-z])([0-9])/gu, "$1 $2")
        .replace(/([a-z])([A-Z])/gu, "$1 $2")
        .replace(/[\u3400-\u9fff]+/gu, " ");
    }
    const normalized = normalizeWhitespace(text).replace(/\s+([,.;:])/g, "$1");
    return language === "en" && !normalized ? "See original-language evidence" : normalized;
  }

  function extractProductCategories(text) {
    const found = [];
    for (const item of PRODUCT_PATTERNS) {
      if (item.pattern.test(text)) {
        found.push(item.label);
      }
    }
    return found.slice(0, 8);
  }

  function extractOrderStatus(text) {
    const searchableText = stripContactArtifacts(text);
    const evidence = pickEvidence(
      text,
      ORDER_DONE_PATTERNS,
      stripContactArtifacts,
      sentence => NEGATED_ORDER_PATTERNS.some(pattern => patternMatches(pattern, sentence))
    );
    if (evidence) {
      return {
        label: "已发现成交或订单信号 / Order or deal signal found",
        labelZh: "已发现成交或订单信号",
        labelEn: "Order or deal signal found",
        level: "done",
        evidence,
        evidenceZh: evidence ? `依据：${evidence}` : "",
        evidenceEn: evidence ? `Evidence: ${evidence}` : ""
      };
    }

    const possible = ORDER_POSSIBLE_PATTERNS.some(pattern => patternMatches(pattern, searchableText));
    if (possible) {
      const evidence = pickEvidence(text, ORDER_POSSIBLE_PATTERNS, stripContactArtifacts);
      return {
        label: "未发现明确成交，已有询价或报价信号 / Inquiry or quotation signal found, no confirmed deal detected",
        labelZh: "未发现明确成交，已有询价或报价信号",
        labelEn: "Inquiry or quotation signal found, no confirmed deal detected",
        level: "possible",
        evidence,
        evidenceZh: evidence ? `依据：${evidence}` : "",
        evidenceEn: evidence ? `Evidence: ${evidence}` : ""
      };
    }

    return {
      label: "未发现成交信息 / No deal information detected",
      labelZh: "未发现成交信息",
      labelEn: "No deal information detected",
      level: "none",
      evidence: "",
      evidenceZh: "",
      evidenceEn: ""
    };
  }

  function pickEvidence(text, patterns, normalizeForMatch, rejectSentence) {
    const sentences = splitBusinessChunks(text).concat(splitSentences(text));
    for (const sentence of sentences) {
      const searchableSentence = normalizeForMatch ? normalizeForMatch(sentence) : sentence;
      if (rejectSentence?.(searchableSentence)) continue;
      if (patterns.some(pattern => patternMatches(pattern, searchableSentence))) {
        return sentence.slice(0, 180);
      }
    }
    return "";
  }

  function patternMatches(pattern, text) {
    if (pattern.global || pattern.sticky) pattern.lastIndex = 0;
    return pattern.test(text);
  }

  function cloneGlobalPattern(pattern) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    return new RegExp(pattern.source, flags);
  }

  function extractValues(sentence, valuePatterns) {
    const values = [];
    for (const pattern of valuePatterns || []) {
      const regex = cloneGlobalPattern(pattern);
      let match;
      while ((match = regex.exec(sentence))) {
        let value = cleanCandidate(match[1] || match[0]);
        if (/"\s*$/u.test(match[0]) && /^\d/u.test(value) && !/\b(?:in|inch)\b/iu.test(value)) {
          value = `${value} in`;
        }
        if (value && value.length <= 100) values.push(value);
        if (match[0] === "") break;
      }
    }
    return removeContainedValues(dedupe(values)).slice(0, 5);
  }

  function removeContainedValues(values) {
    return values.filter((value, index) => {
      if (/^[A-Z0-9]{1,4}$/u.test(value)) return true;
      const current = value.toLowerCase();
      return !values.some((other, otherIndex) => {
        if (index === otherIndex) return false;
        const candidate = other.toLowerCase();
        return candidate.length > current.length + 2 && candidate.includes(current);
      });
    });
  }

  function compactEvidence(sentence) {
    return cleanEvidence(sentence).slice(0, 180);
  }

  function summarizeValue(sentence, values) {
    if (values.length) return values.join("；");
    return compactEvidence(sentence);
  }

  function buildStructuredItem(rule, sentence) {
    const values = extractValues(sentence, rule.valuePatterns);
    const evidence = compactEvidence(sentence);
    if (!values.length && rule.skipWhenNoValue) return null;

    const rawValue = values.length ? summarizeValue(sentence, values) : evidence;
    const evidenceZh = localizeValue(evidence, "zh");
    const evidenceEn = localizeValue(evidence, "en");
    const valueZh = values.length ? localizeValue(rawValue, "zh") : (rule.fallbackZh ? `${rule.fallbackZh}：${evidenceZh}` : evidenceZh);
    const valueEn = values.length ? localizeValue(rawValue, "en") : (rule.fallbackEn ? `${rule.fallbackEn}: ${evidenceEn}` : evidenceEn);

    return {
      id: rule.id,
      zh: `${rule.titleZh}：${valueZh}`,
      en: `${rule.titleEn}: ${valueEn}`,
      value: valueZh,
      valueZh,
      valueEn,
      rawValue,
      evidence,
      priority: RULE_PRIORITIES[rule.id] || 50
    };
  }


  function addItemToGroup(groupsById, added, groupId, item) {
    const group = groupsById.get(groupId);
    if (!group) return false;
    const key = `${groupId}|${normalizeWhitespace(item.value || item.evidence).toLowerCase()}`.slice(0, 240);
    if (!item.value || added.has(key)) return false;
    added.add(key);
    group.items.push(item);
    return true;
  }

  function extractFallbackPoints(text, limit) {
    const sentences = splitBusinessChunks(text).concat(splitSentences(text));
    const scored = [];
    for (const sentence of sentences) {
      const searchableSentence = stripContactArtifacts(sentence);
      let score = 0;
      for (const pattern of FALLBACK_KEY_POINT_PATTERNS) {
        if (patternMatches(pattern, searchableSentence)) score += 2;
      }
      if (/\b\d+[.,]?\d*\b/u.test(searchableSentence)) score += 1;
      if (/\b(valve|project|order|quotation|delivery|material)\b|阀|项目|订单|报价|交期|材质/iu.test(searchableSentence)) score += 1;
      if (score > 0) scored.push({ sentence, score });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .map(item => compactEvidence(item.sentence))
      .filter(sentence => !/^(from|sent|to|subject)\s*:/iu.test(sentence))
      .filter(Boolean)
      .reduce((output, sentence) => {
        if (output.length >= limit) return output;
        if (!output.some(existing => existing.toLowerCase() === sentence.toLowerCase())) output.push(sentence);
        return output;
      }, []);
  }

  function trimGroupsByTotal(groups, maxItems) {
    const output = groups.map(group => ({ ...group, items: [] }));
    const outputById = new Map(output.map(group => [group.id, group]));
    let remaining = Math.max(1, maxItems);

    for (const group of groups) {
      if (!remaining) break;
      if (group.items.length) {
        outputById.get(group.id).items.push(group.items[0]);
        remaining -= 1;
      }
    }

    let index = 1;
    while (remaining > 0) {
      let addedAny = false;
      for (const group of groups) {
        if (!remaining) break;
        const item = group.items[index];
        if (!item) continue;
        outputById.get(group.id).items.push(item);
        remaining -= 1;
        addedAny = true;
      }
      if (!addedAny) break;
      index += 1;
    }

    return output.filter(group => group.items.length);
  }

  function shouldSkipRuleSentence(rule, sentence) {
    if (rule.id === "mediumApplication" && /\bproject\s*(?:name|no\.?|number)?\b|项目(?:名称|编号)?|工程(?:名称|编号)?/iu.test(sentence)) return true;
    if (rule.id === "orderConfirmed" && NEGATED_ORDER_PATTERNS.some(pattern => patternMatches(pattern, sentence))) return true;
    if (rule.id === "delivery" && /\b(?:shipping|gross|net)\s+weight\b|\bweight\s+with\s+dimension\b/iu.test(sentence)) return true;
    return false;
  }

  function extractStructuredKeyPointGroups(text, limit) {
    const groups = GROUP_DEFINITIONS.map(group => ({ ...group, items: [] }));
    const groupsById = new Map(groups.map(group => [group.id, group]));
    const added = new Set();
    const chunks = splitBusinessChunks(text);
    const maxItems = Math.max(4, limit || DEFAULT_OPTIONS.keyPointLimit);
    const maxPerGroup = Math.max(2, Math.min(12, Math.ceil(maxItems / 3)));

    for (const sentence of chunks) {
      const searchableSentence = stripContactArtifacts(sentence);
      if (!searchableSentence) continue;
      for (const rule of KEY_POINT_RULES) {
        if (!patternMatches(rule.pattern, searchableSentence)) continue;
        if (shouldSkipRuleSentence(rule, sentence)) continue;
        const group = groupsById.get(rule.group);
        if (!group || group.items.length >= maxPerGroup) continue;
        const item = buildStructuredItem(rule, sentence);
        if (!item) continue;
        addItemToGroup(groupsById, added, rule.group, item);
      }
    }

    const currentCount = groups.reduce((sum, group) => sum + group.items.length, 0);
    if (currentCount < Math.min(3, maxItems)) {
      const fallback = extractFallbackPoints(text, maxItems - currentCount);
      for (const sentence of fallback) {
        addItemToGroup(groupsById, added, "other", {
          id: "fallback",
          zh: `原文要点：${sentence}`,
          en: `Original key point: ${sentence}`,
          value: sentence,
          evidence: sentence,
          priority: RULE_PRIORITIES.fallback
        });
      }
    }

    const sortedGroups = groups.map(group => ({
      ...group,
      items: group.items
        .sort((a, b) => (a.priority || 50) - (b.priority || 50))
        .slice(0, maxPerGroup)
    }));

    return trimGroupsByTotal(sortedGroups, maxItems);
  }

  function flattenKeyPoints(groups, limit) {
    const points = [];
    for (const group of groups || []) {
      for (const item of group.items || []) {
        points.push(`${group.zhTitle} / ${group.enTitle}：${item.zh} / ${item.en}`);
      }
    }
    return points.slice(0, limit || DEFAULT_OPTIONS.keyPointLimit);
  }

  function dedupe(values) {
    const seen = new Set();
    const output = [];
    for (const value of values) {
      const clean = normalizeWhitespace(value);
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      output.push(clean);
    }
    return output;
  }

  function toParticipantList(message) {
    const values = [message.author, ...(message.recipients || []), ...(message.ccList || [])]
      .filter(Boolean)
      .map(value => normalizeWhitespace(value));
    return dedupe(values).slice(0, 8);
  }

  async function buildConversationText(headers, options) {
    const entries = [];
    for (const header of headers) {
      const body = await readMessageText(header.id, options);
      entries.push({ header, body });
    }
    return entries;
  }

  function splitBilingualLabel(label, language) {
    const parts = String(label || "").split(/\s*\/\s*/u);
    if (language === "en") return parts[1] || parts[0] || "Not identified";
    return parts[0] || "未识别";
  }

  function getTopValuesFromGroups(groups, maxCount) {
    const values = [];
    for (const group of groups || []) {
      for (const item of group.items || []) {
        if (values.length >= maxCount) return values;
        values.push({
          zh: item.valueZh || item.value || item.evidence || item.zh || item.en,
          en: item.valueEn || item.rawValue || item.value || item.evidence || item.en || item.zh
        });
      }
    }
    return values;
  }


  function buildOverview(conversation, projectNames, products, orderStatus, groups) {
    const projectZh = projectNames.length ? projectNames.join("；") : "未识别";
    const projectEn = projectNames.length ? projectNames.map(value => localizeValue(value, "en")).join("; ") : "Not identified";
    const productsZh = products.length ? products.map(label => splitBilingualLabel(label, "zh")).join("、") : "未识别";
    const productsEn = products.length ? products.map(label => splitBilingualLabel(label, "en")).join(", ") : "Not identified";
    const topValues = getTopValuesFromGroups(groups, 3);
    const focusZh = topValues.length ? topValues.map(item => item.zh).join("；") : "未提取到明确参数";
    const focusEn = topValues.length ? topValues.map(item => item.en).join("; ") : "No clear parameters extracted";
    const messageCount = conversation.messageCount || 0;

    return {
      zh: `共 ${messageCount} 封相关邮件。项目：${projectZh}。客户主要问询品类：${productsZh}。重点：${focusZh}。订单状态：${orderStatus.labelZh || "未知"}。`,
      en: `${messageCount} related email(s). Project: ${projectEn}. Main customer inquiry categories: ${productsEn}. Key focus: ${focusEn}. Order status: ${orderStatus.labelEn || "Unknown"}.`
    };
  }

  function groupValuesByIds(groups, ids, language, limit) {
    const values = [];
    for (const group of groups || []) {
      for (const item of group.items || []) {
        if (!ids.includes(item.id)) continue;
        const value = language === "en"
          ? item.valueEn || item.en || item.rawValue || item.value
          : item.valueZh || item.zh || item.value;
        const normalized = normalizeWhitespace(value);
        if (normalized && !values.includes(normalized)) values.push(normalized);
        if (values.length >= limit) return values;
      }
    }
    return values;
  }

  function buildInquiryInfo(products, groups, orderStatus, triage) {
    const quantities = groupValuesByIds(groups, ["quantity"], "zh", 5);
    const sizes = groupValuesByIds(groups, ["size"], "zh", 8);
    const pressureRatings = groupValuesByIds(groups, ["pressure"], "zh", 8);
    const materials = groupValuesByIds(groups, ["material"], "zh", 8);
    const connections = groupValuesByIds(groups, ["connection"], "zh", 6);
    const actuations = groupValuesByIds(groups, ["actuation"], "zh", 6);
    const standards = groupValuesByIds(groups, ["standard"], "zh", 6);
    const leadTimes = groupValuesByIds(groups, ["delivery"], "zh", 5);
    const deliveryTerms = groupValuesByIds(groups, ["tradeTerm"], "zh", 5);
    const paymentTerms = groupValuesByIds(groups, ["payment"], "zh", 5);
    const requestedDocuments = groupValuesByIds(groups, ["documents", "quality"], "zh", 8);
    const missingCriticalFields = [];

    if (triage?.actionableInquiry) {
      if (!products.length) missingCriticalFields.push({ field: "categories", labelZh: "阀门品类", labelEn: "Valve category" });
      if (!quantities.length) missingCriticalFields.push({ field: "quantity", labelZh: "数量", labelEn: "Quantity" });
      if (!sizes.length) missingCriticalFields.push({ field: "size", labelZh: "口径/尺寸", labelEn: "Size" });
      if (!pressureRatings.length) missingCriticalFields.push({ field: "pressure", labelZh: "压力等级", labelEn: "Pressure rating" });
      if (!materials.length) missingCriticalFields.push({ field: "material", labelZh: "材质", labelEn: "Material" });
    }

    return {
      status: triage?.category === "rfq"
        ? "rfq"
        : triage?.category === "inquiry_follow_up"
          ? "follow_up"
          : triage?.category === "order_follow_up"
            ? "ordered"
            : triage?.actionableInquiry
              ? "product_related"
              : "not_inquiry",
      categories: products,
      quantity: quantities,
      specifications: {
        sizes,
        pressureRatings,
        materials,
        connections,
        actuations,
        standards
      },
      commercial: {
        leadTimes,
        deliveryTerms,
        paymentTerms
      },
      requestedDocuments,
      missingCriticalFields,
      confidence: products.length && (sizes.length || pressureRatings.length || materials.length)
        ? "high"
        : products.length
          ? "medium"
          : "low"
    };
  }

  function classifyMessageTriage(header, fullText, products, orderStatus) {
    const subject = normalizeWhitespace(header?.subject || "");
    const searchable = `${subject}\n${stripContactArtifacts(fullText)}`;

    if (
      /^(?:已读|read|read receipt|disposition notification)\s*[:：]/iu.test(subject)
      || /阅读了您发送的主题|read receipt|was read on|return receipt/iu.test(searchable)
    ) {
      return {
        category: "receipt",
        labelZh: "已读回执",
        labelEn: "Read receipt",
        actionableInquiry: false,
        confidence: "high"
      };
    }

    if (
      /\b(market study|market research|sample report|business information platform|data services|annual inquiry volume|enterprise data support|subscribe|unsubscribe)\b|市场研究|市场报告|数据服务|企业数据/iu.test(searchable)
    ) {
      return {
        category: "noise",
        labelZh: "营销或非业务询价",
        labelEn: "Marketing or non-RFQ message",
        actionableInquiry: false,
        confidence: "high"
      };
    }

    if (
      orderStatus.level === "done"
      && /\b(itp|compliance|resubmission|witness point|inspection|review point|purchase order|p\.?\s*o\.?)\b|订单|检验|见证点|符合性/iu.test(searchable)
    ) {
      return {
        category: "order_follow_up",
        labelZh: "订单或技术跟进",
        labelEn: "Order or technical follow-up",
        actionableInquiry: false,
        confidence: "high"
      };
    }

    if (
      products.length
      && /\b(rfq|inquiry|enquiry|quotation|quote|techno commercial offer|please\s+(?:kindly\s+)?(?:check\s+and\s+)?quote)\b|询价|报价|请报价/iu.test(searchable)
    ) {
      return {
        category: "rfq",
        labelZh: "阀门询价",
        labelEn: "Valve RFQ",
        actionableInquiry: true,
        confidence: "high"
      };
    }

    if (
      /\b(awaiting offer|kindly update|follow[- ]?up|reminder|please confirm|compliance confirmation)\b|催复|跟进|请确认/iu.test(searchable)
    ) {
      return {
        category: products.length ? "inquiry_follow_up" : "general_follow_up",
        labelZh: products.length ? "询价跟进" : "一般跟进",
        labelEn: products.length ? "Inquiry follow-up" : "General follow-up",
        actionableInquiry: Boolean(products.length),
        confidence: "medium"
      };
    }

    return {
      category: products.length ? "product_related" : "general",
      labelZh: products.length ? "产品相关邮件" : "一般业务邮件",
      labelEn: products.length ? "Product-related message" : "General business message",
      actionableInquiry: Boolean(products.length),
      confidence: products.length ? "medium" : "low"
    };
  }

  function buildProjectInfo(projectNames, fullText) {
    const hasExplicitField = /\bproject\s*(?:name|no\.?|number)?\s*[:：#-]|项目(?:名称|编号)?\s*[:：#-]?/iu.test(fullText);
    const status = projectNames.length > 1 ? "multiple" : projectNames.length === 1 ? "inferred" : "missing";
    const confidence = !projectNames.length ? "low" : hasExplicitField && projectNames.length === 1 ? "high" : "medium";
    return {
      status,
      confirmedName: status === "inferred" && confidence === "high" ? projectNames[0] : null,
      nameCandidates: projectNames.map(value => ({ value, valueEn: localizeValue(value, "en"), confidence })),
      confidence
    };
  }

  function summarizeEntries(header, entries, options) {
    const headers = entries.map(entry => entry.header);
    const bodyText = entries.map(entry => {
      return [
        `Subject: ${entry.header.subject || ""}`,
        `From: ${entry.header.author || ""}`,
        `Date: ${formatDate(entry.header.date)}`,
        entry.body || ""
      ].join("\n");
    }).join("\n\n");

    const fullText = normalizeBody(bodyText);
    const products = extractProductCategories(fullText);
    const orderStatus = extractOrderStatus(fullText);
    const projectNames = extractProjectNames(headers, fullText);
    const participants = dedupe(headers.flatMap(toParticipantList)).slice(0, 10);
    const sortedDates = headers.map(message => dateToNumber(message.date)).filter(Boolean).sort((a, b) => a - b);
    const conversation = {
      messageCount: headers.length,
      fromDate: sortedDates.length ? formatDate(sortedDates[0]) : "未知日期",
      toDate: sortedDates.length ? formatDate(sortedDates[sortedDates.length - 1]) : "未知日期",
      participants
    };
    const analysisKeyPointGroups = extractStructuredKeyPointGroups(
      fullText,
      Math.max(32, options.keyPointLimit || DEFAULT_OPTIONS.keyPointLimit)
    );
    const keyPointGroups = trimGroupsByTotal(
      analysisKeyPointGroups,
      options.keyPointLimit || DEFAULT_OPTIONS.keyPointLimit
    );
    const keyPoints = flattenKeyPoints(keyPointGroups, options.keyPointLimit);
    const messageTriage = classifyMessageTriage(header, fullText, products, orderStatus);
    const overview = buildOverview(conversation, projectNames, products, orderStatus, keyPointGroups);
    const inquiry = buildInquiryInfo(products, analysisKeyPointGroups, orderStatus, messageTriage);
    const project = buildProjectInfo(projectNames, fullText);
    const baseSummary = {
      schemaVersion: SUMMARY_SCHEMA_VERSION,
      messageId: header.id,
      subject: header.subject || "",
      generatedAt: new Date().toISOString(),
      conversation,
      overview,
      projectNames,
      keyPointGroups,
      analysisKeyPointGroups,
      keyPoints,
      productCategories: products,
      messageTriage,
      inquiry,
      project,
      orderStatus,
      source: {
        method: "local-structured-bilingual-rule-analysis-with-customer-registry",
        note: "本地结构化双语规则分析；客户资料只按已导入主数据匹配，建议人工复核。",
        noteEn: "Local structured bilingual analysis. Customer context is matched only from imported master data; manual review is recommended."
      }
    };
    const customer = global.CustomerIntelligence?.buildCustomerInsight
      ? global.CustomerIntelligence.buildCustomerInsight(header, entries, baseSummary, options)
      : null;
    const brief = customer && global.CustomerIntelligence?.buildBusinessBrief
      ? global.CustomerIntelligence.buildBusinessBrief({ ...baseSummary, _analysisText: fullText }, customer)
      : {
          inquiry: { zh: overview.zh, en: overview.en, confidence: inquiry.confidence },
          project: {
            zh: projectNames.length ? `项目：${projectNames.join("；")}。` : "项目名称尚未识别。",
            en: projectNames.length ? `Project: ${projectNames.join("; ")}.` : "Project name has not been identified.",
            confidence: project.confidence
          }
        };

    return {
      ...baseSummary,
      customer,
      brief,
      quality: {
        overallConfidence: customer?.identity?.ambiguous || project.status === "multiple" ? "low" : inquiry.confidence,
        reviewRequired: Boolean(
          customer?.identity?.ambiguous
          || (messageTriage.actionableInquiry && project.status === "multiple")
          || inquiry.missingCriticalFields.length
        ),
        warnings: [
          ...(customer?.identity?.ambiguous ? ["customer-match-conflict"] : []),
          ...(messageTriage.actionableInquiry && project.status === "multiple" ? ["multiple-project-candidates"] : []),
          ...(inquiry.missingCriticalFields.length ? ["missing-critical-inquiry-fields"] : []),
          ...(!messageTriage.actionableInquiry ? [`message-triage-${messageTriage.category}`] : [])
        ]
      }
    };
  }

  async function getConversationSummary(messageId, runtimeOptions) {
    const options = await withDetectedOwnIdentities({ ...(await getStoredOptions()), ...(runtimeOptions || {}) });
    const runtime = api();
    const header = await runtime.messages.get(messageId);
    const headers = await queryRelatedHeaders(header, options);
    const fingerprint = conversationFingerprint(headers);
    const key = cacheKeyFor(header, options);
    const cached = await getCache(key);

    if (
      !options.force
      && cached?.generatedAt
      && cached.fingerprint === fingerprint
      && Date.now() - Date.parse(cached.generatedAt) < options.cacheTtlMs
    ) {
      return cached.summary;
    }

    const entries = await buildConversationText(headers, options);
    const summary = summarizeEntries(header, entries, options);
    await setCache(key, { generatedAt: new Date().toISOString(), fingerprint, summary });
    return summary;
  }

  function getTooltipPointLines(summary) {
    const groups = summary.keyPointGroups || [];
    const output = [];
    for (const group of groups) {
      for (const item of group.items || []) {
        output.push(`${group.zhTitle}: ${item.valueZh || item.value}`);
        if (output.length >= 3) return output;
      }
    }
    return (summary.keyPoints || []).slice(0, 3);
  }

  function formatTooltip(summary) {
    const project = summary.projectNames?.length ? summary.projectNames.join("；") : "未识别 / Not identified";
    const products = summary.productCategories?.length ? summary.productCategories.join("；") : "未识别 / Not identified";
    const points = getTooltipPointLines(summary).length ? getTooltipPointLines(summary).join("；") : "暂无要点 / No key points";
    const orderZh = summary.orderStatus?.labelZh || summary.orderStatus?.label || "未知";
    const orderEn = summary.orderStatus?.labelEn || "Unknown";
    const customer = summary.customer?.identity?.company || "未匹配 / Not matched";
    const importance = summary.customer?.importance?.labelZh || "待评估";
    return [
      `客户 / Customer: ${customer}`,
      `重要度 / Importance: ${importance}`,
      `项目 / Project: ${project}`,
      `摘要 / Summary: ${summary.overview?.zh || points}`,
      `品类 / Categories: ${products}`,
      `订单 / Order: ${orderZh} / ${orderEn}`,
      `往来 / Conversation: ${summary.conversation?.messageCount || 0} 封，${summary.conversation?.fromDate || "未知"} 至 ${summary.conversation?.toDate || "未知"}`
    ].join("\n");
  }

  global.GameMailSummary = {
    DEFAULT_OPTIONS,
    getConversationSummary,
    formatTooltip,
    normalizeSubject
  };
})(globalThis);
