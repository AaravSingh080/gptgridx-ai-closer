export async function logLead(leadPayload) {
  const webhookUrl = process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL;

  if (!webhookUrl) {
    return { ok: false, skipped: true, reason: "missing_webhook_url" };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(leadPayload)
  });

  const raw = await response.text();

  return {
    ok: response.ok,
    skipped: false,
    status: response.status,
    raw
  };
}