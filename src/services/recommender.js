function includesAny(text, keywords) {
  const haystack = (text || "").toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

export function recommendPlan({ painPoint = "", message = "" }) {
  const sourceText = `${painPoint} ${message}`.toLowerCase();

  if (!sourceText.trim()) {
    return "";
  }

  const zorionSignals = [
    "advanced",
    "automation",
    "qualif",
    "follow-up",
    "follow up",
    "sms",
    "smarter",
    "routing",
    "multi-stage",
    "deeper"
  ];

  if (includesAny(sourceText, zorionSignals)) {
    return "Zorion";
  }

  const nexoSignals = [
    "starter",
    "simple",
    "shopify",
    "chatbot",
    "leads",
    "sales",
    "conversion",
    "website"
  ];

  if (includesAny(sourceText, nexoSignals)) {
    return "Nexo";
  }

  return "";
}

export function getStage({ leadReady, recommendedPlan }) {
  if (leadReady) return "lead_ready";
  if (recommendedPlan) return "recommendation";
  return "qualifying";
}
