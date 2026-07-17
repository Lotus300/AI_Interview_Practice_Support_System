import crypto from "node:crypto";
import { defaultVoiceSettings, feedbackStatuses, sessionStatuses } from "../../../packages/shared/src/constants.mjs";
import { config } from "./config.mjs";
import { createFirestoreDataStore, MemoryDataStore } from "./data-store.mjs";
import { historyExpiresAt } from "./features/interviews/retention.mjs";

const memoryStore = new MemoryDataStore();
let storePromise;

export const db = memoryStore.collections;

export function getDataStore() {
  if (!storePromise) {
    storePromise = config.dataStore === "firestore"
      ? createFirestoreDataStore({ projectId: config.gcpProjectId, databaseId: config.firestoreDatabaseId })
      : Promise.resolve(memoryStore);
  }
  return storePromise;
}

export function resetDb() {
  memoryStore.reset();
  if (config.dataStore !== "firestore") storePromise = Promise.resolve(memoryStore);
}

export function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

export function hashSessionId(sessionId) {
  return crypto.createHmac("sha256", config.sessionSecret).update(sessionId).digest("hex");
}

export function nowIso() { return new Date().toISOString(); }

export async function ensureDemoUser() {
  const store = await getDataStore();
  const userId = "usr_demo";
  const existing = await store.getUser(userId);
  if (existing) return existing;
  const timestamp = nowIso();
  const user = { id: userId, googleSub: "demo-google-sub", email: "demo@example.com", name: "デモユーザ", profileCompleted: false, createdAt: timestamp, updatedAt: timestamp };
  await Promise.all([
    store.saveUser(user),
    store.saveSettings({ userId, ...defaultVoiceSettings, saveAudio: false, updatedAt: timestamp })
  ]);
  return user;
}

export async function findOrCreateGoogleUser(googleProfile) {
  const store = await getDataStore();
  const existing = await store.findUserByGoogleSub(googleProfile.googleSub);
  if (existing) {
    const updated = { ...existing, email: googleProfile.email, name: googleProfile.name, lastLoginAt: nowIso(), updatedAt: nowIso() };
    return store.saveUser(updated);
  }
  const timestamp = nowIso();
  const user = { id: createId("usr"), ...googleProfile, profileCompleted: false, lastLoginAt: timestamp, createdAt: timestamp, updatedAt: timestamp };
  await Promise.all([
    store.saveUser(user),
    store.saveSettings({ userId: user.id, ...defaultVoiceSettings, saveAudio: false, updatedAt: timestamp })
  ]);
  return user;
}

export async function createSessionForUser(userId) {
  const store = await getDataStore();
  const sessionId = createId("auth");
  const sessionIdHash = hashSessionId(sessionId);
  await store.saveAuthSession({
    id: sessionIdHash, sessionIdHash, userId, createdAt: nowIso(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), revokedAt: null
  });
  return sessionId;
}

export async function findUserBySession(sessionId) {
  if (!sessionId) return null;
  const store = await getDataStore();
  const session = await store.getAuthSession(hashSessionId(sessionId));
  if (!session || session.revokedAt || Date.parse(session.expiresAt) < Date.now()) return null;
  return store.getUser(session.userId);
}

export async function revokeSession(sessionId) {
  if (!sessionId) return;
  const store = await getDataStore();
  await store.revokeAuthSession(hashSessionId(sessionId), nowIso());
}

export async function saveOAuthState(state, nonce) {
  const store = await getDataStore();
  await store.saveOAuthState({ state, nonce, createdAt: nowIso(), expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), usedAt: null });
}

export async function consumeOAuthState(state) {
  return (await getDataStore()).consumeOAuthState(state, nowIso());
}

export async function seedInterviewSession(userId, condition) {
  const timestamp = nowIso();
  const session = {
    id: createId("ses"), userId, status: sessionStatuses.CREATED, condition,
    questions: [], answers: [], utterances: [], feedbackStatus: feedbackStatuses.NOT_STARTED,
    createdAt: timestamp, updatedAt: timestamp, finishedAt: null, deletedAt: null,
    expiresAt: historyExpiresAt(timestamp)
  };
  return (await getDataStore()).saveSession(session);
}
