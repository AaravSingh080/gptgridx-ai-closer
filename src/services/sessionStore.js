const sessions = new Map();

const DEFAULT_SESSION = () => ({
  history: [],
  stage: "welcome",
  lead: {
    firstName: "",
    number: "",
    painPoint: "",
    captured: false
  },
  recommendedPlan: "",
  lastUpdatedAt: new Date().toISOString()
});

export function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, DEFAULT_SESSION());
  }

  return sessions.get(sessionId);
}

export function updateSession(sessionId, nextSession) {
  nextSession.lastUpdatedAt = new Date().toISOString();
  sessions.set(sessionId, nextSession);
  return nextSession;
}