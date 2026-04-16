function normalizeWhitespace(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

export function extractPainPoint(message = "") {
  const cleaned = normalizeWhitespace(message);
  if (!cleaned) return "";

  const patterns = [
    /(need more sales[^.?!]*)/i,
    /(need more leads[^.?!]*)/i,
    /(low conversion[^.?!]*)/i,
    /(not converting[^.?!]*)/i,
    /(lost leads[^.?!]*)/i,
    /(poor follow[- ]?up[^.?!]*)/i,
    /(need automation[^.?!]*)/i,
    /(want a chatbot[^.?!]*)/i,
    /(my issue is[^.?!]*)/i,
    /(main issue[: ]+[^.?!]*)/i
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) {
      return normalizeWhitespace(match[1]);
    }
  }

  if (cleaned.length > 18) {
    return cleaned;
  }

  return "";
}

export function mergeLeadData(sessionLead, incomingLead = {}, message = "") {
  const nextLead = {
    ...sessionLead,
    firstName: incomingLead.firstName?.trim() || sessionLead.firstName || "",
    number: incomingLead.number?.trim() || sessionLead.number || "",
    painPoint: sessionLead.painPoint || ""
  };

  if (!nextLead.painPoint) {
    nextLead.painPoint = extractPainPoint(message);
  }

  return nextLead;
}

export function isLeadReady(lead) {
  return Boolean(lead.firstName && lead.number && lead.painPoint);
}