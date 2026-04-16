import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";

import { loadKnowledge } from "./services/knowledgeLoader.js";
import { getSession, updateSession } from "./services/sessionStore.js";
import { mergeLeadData, isLeadReady } from "./services/extractors.js";
import { recommendPlan, getStage } from "./services/recommender.js";
import { logLead } from "./services/leadLogger.js";
import { sendLeadAlert } from "./services/smsAlert.js";
import { buildSystemPrompt } from "./services/promptBuilder.js";

const app = express();

const port = Number(process.env.PORT || 10000);
const bookingUrl = process.env.BOOKING_URL || "https://calendly.com/gptgridx/30min";
const knowledgeFilePath = process.env.KNOWLEDGE_FILE_PATH || "src/knowledge.md";
const openAiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
const allowedOrigins = (process.env.CORS_ALLOW_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

console.log("CORS_ALLOW_ORIGINS:", allowedOrigins);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log("Blocked by CORS:", origin);
    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false
};

const knowledge = loadKnowledge(knowledgeFilePath);
const systemPrompt = buildSystemPrompt({ knowledge, bookingUrl });

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "GRIDX backend",
    model: openAiModel
  });
});

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "GRIDX backend live"
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const {
      message = "",
      sessionId = `session_${Date.now()}`,
      history = [],
      lead = {}
    } = req.body || {};

    if (!message.trim()) {
      return res.status(400).json({ error: "Message is required." });
    }

    if (!openai) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not configured." });
    }

    const session = getSession(sessionId);
    const nextLead = mergeLeadData(session.lead, lead, message);
    const detectedPlan = recommendPlan({
      painPoint: nextLead.painPoint,
      message
    });
    const recommendedPlan = session.recommendedPlan || detectedPlan;
    const leadReady = isLeadReady(nextLead);
    const stage = getStage({ leadReady, recommendedPlan });
    const recentHistory = Array.isArray(history) && history.length > 0 ? history : session.history;

    const messages = [
      { role: "system", content: systemPrompt },
      ...recentHistory.slice(-8),
      {
        role: "system",
        content: `Current visitor state:
- firstName: ${nextLead.firstName || "unknown"}
- number: ${nextLead.number || "unknown"}
- painPoint: ${nextLead.painPoint || "unknown"}
- recommendedPlan: ${recommendedPlan || "unknown"}
- stage: ${stage}
- bookingUrl: ${bookingUrl}

Reply in under 120 words. Ask for the pain point if still missing. Only recommend a plan once the need is clear. If the need is clear, explain why the recommended plan fits.`
      },
      { role: "user", content: message }
    ];

    const completion = await openai.chat.completions.create({
      model: openAiModel,
      temperature: 0.5,
      messages
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      `I want to keep this accurate. The best next step is a quick call here: ${bookingUrl}`;

    const leadPayload = {
      firstName: nextLead.firstName,
      number: nextLead.number,
      painPoint: nextLead.painPoint,
      recommendedPlan,
      source: "shopify-gridx",
      timestamp: new Date().toISOString()
    };

    let leadLogged = false;
    let smsSent = false;

    if (leadReady && !session.lead.captured) {
      const logResult = await logLead(leadPayload);
      const smsResult = await sendLeadAlert(leadPayload);
      leadLogged = Boolean(logResult.ok);
      smsSent = Boolean(smsResult.ok);
      nextLead.captured = leadLogged || smsSent;
    }

    updateSession(sessionId, {
      ...session,
      history: [
        ...session.history,
        { role: "user", content: message },
        { role: "assistant", content: reply }
      ].slice(-12),
      stage,
      lead: nextLead,
      recommendedPlan: recommendedPlan || session.recommendedPlan
    });

    const buttons = leadReady
      ? ["Book Call", "Compare Plans", "Instagram"]
      : recommendedPlan
        ? ["Why Nexo", "Why Zorion", "Book Call"]
        : ["See Plans", "How It Works", "Book Call"];

    return res.json({
      reply,
      buttons,
      stage,
      recommendedPlan,
      leadCaptured: nextLead.captured,
      leadLogged,
      smsSent
    });
  } catch (error) {
    console.error("[/api/chat] error", error);
    return res.status(500).json({
      error: "Failed to process chat request."
    });
  }
});

app.listen(port, () => {
  console.log(`GRIDX backend running on port ${port}`);
});
