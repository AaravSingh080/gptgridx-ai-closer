import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { google } from 'googleapis';

const app = express();
const allowedOrigins = (process.env.CORS_ALLOW_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000').split(',').map((v) => v.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: false
}));

app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 3000);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const sessions = new Map();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KNOWLEDGE_FILE_PATH = process.env.KNOWLEDGE_FILE_PATH || path.join(__dirname, '..', 'knowledge', 'brand-knowledge.md');

const PACKAGES = [
  {
    name: 'Launch',
    price: '$1,500',
    features: ['Branded website AI chat', 'Smart FAQ responses', 'Lead capture + sheet logging', '14 days support']
  },
  {
    name: 'Ascend',
    price: '$2,250',
    features: ['Everything in Launch', 'Advanced qualification', 'Lead scoring', '30 days priority support']
  },
  {
    name: 'Closer Elite',
    price: '$4,100',
    features: ['Everything in Ascend', 'Objection-aware conversion flow', 'Booking optimization', '45-60 days optimization support']
  }
];

let cachedKnowledge = '';

async function loadKnowledge() {
  try {
    cachedKnowledge = await readFile(KNOWLEDGE_FILE_PATH, 'utf8');
  } catch {
    cachedKnowledge = '';
  }
}

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      stage: 'discovery',
      greeted: false,
      lead: {
        name: null,
        phone: null,
        painPoint: null,
        smsSent: false
      },
      transcript: []
    });
  }
  return sessions.get(sessionId);
}

function extractName(message) {
  const match = message.match(/(?:i am|i'm|my name is)\s+([A-Za-z][A-Za-z\s'-]{1,40})/i);
  return match ? match[1].trim() : null;
}

function extractPhone(message) {
  const match = message.match(/(\+?\d[\d\s()-]{8,}\d)/);
  return match ? match[1].replace(/[^+\d]/g, '') : null;
}

function looksLikePainPoint(message) {
  const m = message.toLowerCase();
  return /lead|reply|response|convert|booking|sales|follow up|follow-up|inquiry|no leads|slow|website/.test(m) && message.length >= 20;
}

function inferStage(message, session) {
  const m = message.toLowerCase();
  if (/price|pricing|cost|package|plan/.test(m)) return 'interest';
  if (/expensive|costly|not now|later|hmm|not sure/.test(m)) return 'objection';
  if (/book|call|start|let's do|lets do|go ahead/.test(m)) return 'conversion';
  if (session.lead.name && session.lead.phone && session.lead.painPoint) return 'conversion';
  return session.stage;
}

function dynamicButtons(stage) {
  const map = {
    discovery: [
      'What does GPTGRIDX do?',
      'Will this work for my business?',
      'How fast can you launch?',
      'Show pricing'
    ],
    interest: [
      'Compare all packages',
      'What is included in Closer Elite?',
      'How does lead capture work?',
      'Book strategy call'
    ],
    objection: [
      'Why is this important now?',
      'What if I am not ready yet?',
      'How do I start safely?',
      'Book strategy call'
    ],
    conversion: [
      'Book strategy call',
      'Send setup checklist',
      'I want to start this week',
      'What do you need from me?'
    ]
  };

  return map[stage] || map.discovery;
}

function packageSummaryText() {
  return PACKAGES.map((p) => `${p.name} (${p.price}): ${p.features.join(', ')}`).join('\n');
}

function maybeSetLeadFields(message, visitorName, lead) {
  const foundName = extractName(message);
  const foundPhone = extractPhone(message);

  if (visitorName && !lead.name) lead.name = visitorName;
  if (foundName && !lead.name) lead.name = foundName;
  if (foundPhone && !lead.phone) lead.phone = foundPhone;
  if (!lead.painPoint && looksLikePainPoint(message)) lead.painPoint = message.trim();
}

async function sendSmsAlert(lead, sessionId) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const to = process.env.ALERT_TO_PHONE;

  if (!sid || !token || !from || !to) return { skipped: true };

  const body = [
    `New GPTGRIDX lead`,
    `Session: ${sessionId}`,
    `Name: ${lead.name || '-'}`,
    `Phone: ${lead.phone || '-'}`,
    `Pain Point: ${lead.painPoint || '-'}`
  ].join('\n');

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const payload = new URLSearchParams({ From: from, To: to, Body: body });

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: payload
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Twilio send failed: ${response.status} ${errText}`);
  }

  return { skipped: false };
}

async function logToGoogleSheets(lead, sessionId, stage) {
  if (!process.env.GOOGLE_SHEETS_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) return;

  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: 'Sheet1!A:F',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        new Date().toISOString(),
        sessionId,
        lead.name || '',
        lead.phone || '',
        lead.painPoint || '',
        stage
      ]]
    }
  });
}

function buildSystemPrompt(session) {
  const packageKnowledge = packageSummaryText();
  const knowledgeSection = cachedKnowledge ? `\nKnowledge file:\n${cachedKnowledge}` : '';

  return `
You are GPTGRIDX Closer, the luxury sales AI for GPTGRIDX.
You are team voice, concise, confident, and high-end.

Critical rules:
- Never greet twice.
- Never restart the conversation.
- Ask less, tell more.
- Reply in 1-2 short lines in most turns.
- Never give legal advice.
- Never provide 100% guarantees.
- Use phrases like "high probability", "mostly", or "typically" when discussing outcomes.
- Do not show business phone inside chatbot messages.
- Mention Instagram only if user asks OR when it naturally helps next step.
- Only share package pricing when user asks or shows purchase intent.
- When user asks about packages, list all 3 with concise feature bullets.

Offer catalog:
${packageKnowledge}

Calendly booking URL:
${process.env.BOOKING_URL || 'Not configured'}

Launch timeline to mention: 7-10 days.
Preferred flow: identify business -> diagnose problem -> position solution -> capture name+phone+pain point -> nurture or book.
Current session stage: ${session.stage}
Lead capture snapshot: ${JSON.stringify(session.lead)}
${knowledgeSection}
`;
}

app.get('/health', (_, res) => {
  res.json({ ok: true, service: 'gptgridx-closer-api' });
});

app.get('/api/faq-buttons', (req, res) => {
  const stage = typeof req.query.stage === 'string' ? req.query.stage : 'discovery';
  res.json({ buttons: dynamicButtons(stage) });
});

app.post('/api/reload-knowledge', async (_, res) => {
  await loadKnowledge();
  res.json({ ok: true, knowledgeFile: KNOWLEDGE_FILE_PATH });
});

app.post('/api/chat', async (req, res) => {
  const { sessionId, message, visitorName } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: 'sessionId and message are required' });
  }

  const session = getSession(sessionId);
  maybeSetLeadFields(message, visitorName, session.lead);

  session.stage = inferStage(message, session);

  const userMessage = session.greeted ? message : `First visitor message: ${message}`;
  session.greeted = true;
  session.transcript.push({ role: 'user', content: userMessage });

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    temperature: 0.45,
    messages: [
      { role: 'system', content: buildSystemPrompt(session) },
      ...session.transcript.slice(-14)
    ]
  });

  let reply = completion.choices[0]?.message?.content?.trim() || 'Share your current lead problem and I will map the best path fast.';

  const readyLead = session.lead.name && session.lead.phone && session.lead.painPoint;
  if (readyLead && !session.lead.smsSent) {
    await Promise.allSettled([
      sendSmsAlert(session.lead, sessionId),
      logToGoogleSheets(session.lead, sessionId, session.stage)
    ]);
    session.lead.smsSent = true;
  }

  const userAskedBooking = /book|call|calendar|calendly/.test(message.toLowerCase());
  if (userAskedBooking && process.env.BOOKING_URL && !reply.includes(process.env.BOOKING_URL)) {
    reply = `${reply}\n\nBook your strategy call: ${process.env.BOOKING_URL}`;
  }

  session.transcript.push({ role: 'assistant', content: reply });

  return res.json({
    reply,
    stage: session.stage,
    lead: session.lead,
    buttons: dynamicButtons(session.stage),
    packages: PACKAGES
  });
});

async function start() {
  await loadKnowledge();
  app.listen(PORT, () => {
    console.log(`GPTGRIDX Closer API running on http://localhost:${PORT}`);
    console.log(`Knowledge file loaded from: ${KNOWLEDGE_FILE_PATH}`);
  });
}

start();
