import crypto from "node:crypto";
import { defaultVoiceSettings, feedbackStatuses, sessionStatuses } from "../../../packages/shared/src/constants.mjs";
import { config } from "./config.mjs";

export const db = {
  users: new Map(),
  sessions: new Map(),
  authSessions: new Map(),
  oauthStates: new Map(),
  profiles: new Map(),
  settings: new Map(),
  jobs: new Map(),
  feedbacks: new Map()
};

export function resetDb() {
  for (const collection of Object.values(db)) collection.clear();
}

export function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

export function hashSessionId(sessionId) {
  return crypto
    .createHmac("sha256", config.sessionSecret)
    .update(sessionId)
    .digest("hex");
}

export function nowIso() {
  return new Date().toISOString();
}

export function ensureDemoUser() {
  const userId = "usr_demo";
  if (!db.users.has(userId)) {
    db.users.set(userId, {
      id: userId,
      googleSub: "demo-google-sub",
      email: "demo@example.com",
      name: "デモユーザ",
      profileCompleted: false,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
    db.settings.set(userId, { ...defaultVoiceSettings, updatedAt: nowIso() });
  }
  return db.users.get(userId);
}

export function findOrCreateGoogleUser(googleProfile) {
  const existing = [...db.users.values()].find((user) => user.googleSub === googleProfile.googleSub);
  if (existing) {
    existing.email = googleProfile.email;
    existing.name = googleProfile.name;
    existing.updatedAt = nowIso();
    return existing;
  }

  const userId = createId("usr");
  const user = {
    id: userId,
    googleSub: googleProfile.googleSub,
    email: googleProfile.email,
    name: googleProfile.name,
    profileCompleted: false,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.users.set(userId, user);
  db.settings.set(userId, { ...defaultVoiceSettings, updatedAt: nowIso() });
  return user;
}

export function createSessionForUser(userId) {
  const sessionId = createId("auth");
  const sessionIdHash = hashSessionId(sessionId);
  db.authSessions.set(sessionIdHash, {
    id: createId("authdoc"),
    sessionIdHash,
    userId,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    revokedAt: null
  });
  return sessionId;
}

export function findUserBySession(sessionId) {
  if (!sessionId) return null;
  const session = db.authSessions.get(hashSessionId(sessionId));
  if (!session || session.revokedAt) return null;
  if (Date.parse(session.expiresAt) < Date.now()) return null;
  return db.users.get(session.userId) ?? null;
}

export function revokeSession(sessionId) {
  if (!sessionId) return;
  const session = db.authSessions.get(hashSessionId(sessionId));
  if (session) session.revokedAt = nowIso();
}

export function saveOAuthState(state) {
  db.oauthStates.set(state, {
    state,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    usedAt: null
  });
}

export function consumeOAuthState(state) {
  const item = db.oauthStates.get(state);
  if (!item || item.usedAt) return false;
  if (Date.parse(item.expiresAt) < Date.now()) return false;
  item.usedAt = nowIso();
  return true;
}

export function seedInterviewSession(userId, condition) {
  const sessionId = createId("ses");
  const session = {
    id: sessionId,
    userId,
    status: sessionStatuses.CREATED,
    condition,
    questions: [],
    answers: [],
    utterances: [],
    feedbackStatus: feedbackStatuses.NOT_STARTED,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    finishedAt: null,
    deletedAt: null
  };
  db.sessions.set(sessionId, session);
  return session;
}
