import crypto from "node:crypto";
import { defaultVoiceSettings, feedbackStatuses, sessionStatuses } from "../../../packages/shared/src/constants.mjs";

export const db = {
  users: new Map(),
  sessions: new Map(),
  authSessions: new Map(),
  profiles: new Map(),
  settings: new Map(),
  jobs: new Map(),
  feedbacks: new Map()
};

export function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
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

export function createSessionForUser(userId) {
  const sessionId = createId("auth");
  db.authSessions.set(sessionId, {
    id: sessionId,
    userId,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    revokedAt: null
  });
  return sessionId;
}

export function findUserBySession(sessionId) {
  if (!sessionId) return null;
  const session = db.authSessions.get(sessionId);
  if (!session || session.revokedAt) return null;
  if (Date.parse(session.expiresAt) < Date.now()) return null;
  return db.users.get(session.userId) ?? null;
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
