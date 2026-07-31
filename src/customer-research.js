(function initCustomerResearch(global) {
  "use strict";

  function countValues(value) {
    return Array.isArray(value) ? value.filter(Boolean).length : value ? 1 : 0;
  }

  function scoreInquiry(summary) {
    const triage = summary?.messageTriage || {};
    const inquiry = summary?.inquiry || {};
    const project = summary?.project || {};
    const specifications = inquiry.specifications || {};
    const commercial = inquiry.commercial || {};

    if (triage.category === "noise") {
      return {
        score: 0,
        band: "not-inquiry",
        labelZh: "非询盘",
        labelEn: "Not an inquiry",
        reasons: ["营销或非 RFQ 邮件"],
        missing: []
      };
    }
    if (triage.category === "receipt") {
      return {
        score: 0,
        band: "not-inquiry",
        labelZh: "回执",
        labelEn: "Receipt",
        reasons: ["已读回执，无新增询价信息"],
        missing: []
      };
    }

    let score = triage.actionableInquiry ? 16 : 4;
    const reasons = [];
    if (triage.category === "rfq") {
      score += 20;
      reasons.push("明确 RFQ");
    } else if (triage.category === "inquiry_follow_up") {
      score += 14;
      reasons.push("询价跟进");
    } else if (triage.category === "order_follow_up") {
      score += 18;
      reasons.push("订单/技术跟进");
    }

    const categories = countValues(inquiry.categories || summary?.productCategories);
    const quantity = countValues(inquiry.quantity);
    const sizes = countValues(specifications.sizes);
    const pressures = countValues(specifications.pressureRatings);
    const materials = countValues(specifications.materials);
    const standards = countValues(specifications.standards);
    const commercialFacts =
      countValues(commercial.leadTimes)
      + countValues(commercial.deliveryTerms)
      + countValues(commercial.paymentTerms);
    const documents = countValues(inquiry.requestedDocuments);

    if (categories) {
      score += 14;
      reasons.push("品类明确");
    }
    if (quantity) {
      score += 9;
      reasons.push("数量明确");
    }
    if (sizes) {
      score += 8;
      reasons.push("口径明确");
    }
    if (pressures) {
      score += 8;
      reasons.push("压力明确");
    }
    if (materials) {
      score += 8;
      reasons.push("材质明确");
    }
    if (standards) score += 4;
    if (project.status === "inferred" || project.confirmedName) {
      score += project.confidence === "high" ? 8 : 5;
      reasons.push("项目可识别");
    }
    if (commercialFacts) {
      score += Math.min(5, commercialFacts * 2);
      reasons.push("商务条件有信息");
    }
    if (documents) score += Math.min(3, documents);

    const missing = (inquiry.missingCriticalFields || []).map(item => item.labelZh || item.field);
    score -= Math.min(20, missing.length * 4);
    if (project.status === "multiple") score -= 8;
    score = Math.max(0, Math.min(100, Math.round(score)));

    let band = "low";
    let labelZh = "信息不足";
    let labelEn = "Low information";
    if (score >= 80) {
      band = "high";
      labelZh = "高质量";
      labelEn = "High quality";
    } else if (score >= 60) {
      band = "medium-high";
      labelZh = "较高质量";
      labelEn = "Good quality";
    } else if (score >= 40) {
      band = "medium";
      labelZh = "中等质量";
      labelEn = "Medium quality";
    }
    return { score, band, labelZh, labelEn, reasons: reasons.slice(0, 6), missing };
  }

  function customerMatch(research) {
    const score = Number(research?.research?.matchScore || 0);
    const dingtalkStatus = research?.dingtalk?.status || "unavailable";
    if (dingtalkStatus === "review_required") {
      return {
        score,
        band: "review",
        labelZh: "匹配冲突",
        labelEn: "Review match"
      };
    }
    if (dingtalkStatus === "unavailable" && !score) {
      return {
        score: 0,
        band: "pending",
        labelZh: "待连接",
        labelEn: "Pending"
      };
    }
    const labelZh = research?.research?.matchLabelZh || (score ? "已评估" : "待评估");
    return {
      score,
      band: score >= 75 ? "high" : score >= 55 ? "medium-high" : score >= 35 ? "medium" : "low",
      labelZh,
      labelEn: score >= 75
        ? "Strong fit"
        : score >= 55
          ? "Moderate fit"
          : score >= 35
            ? "Needs review"
            : "Weak evidence"
    };
  }

  global.CustomerResearch = {
    scoreInquiry,
    customerMatch
  };
})(globalThis);
