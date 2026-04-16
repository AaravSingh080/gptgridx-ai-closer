import twilio from "twilio";

export async function sendLeadAlert({ firstName, number, painPoint, recommendedPlan }) {
  const {
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER,
    ALERT_TO_PHONE
  } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || !ALERT_TO_PHONE) {
    return { ok: false, skipped: true, reason: "missing_twilio_env" };
  }

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

  const body = [
    "New GRIDX lead",
    `Name: ${firstName}`,
    `Phone: ${number}`,
    `Pain point: ${painPoint}`,
    `Recommended: ${recommendedPlan || "TBD"}`
  ].join("\n");

  const message = await client.messages.create({
    body,
    from: TWILIO_FROM_NUMBER,
    to: ALERT_TO_PHONE
  });

  return {
    ok: true,
    skipped: false,
    sid: message.sid
  };
}