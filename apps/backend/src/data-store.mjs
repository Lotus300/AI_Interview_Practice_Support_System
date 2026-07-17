import { defaultVoiceSettings } from "../../../packages/shared/src/constants.mjs";

function clone(value) {
  return value == null ? value : structuredClone(value);
}

export class MemoryDataStore {
  constructor() {
    this.collections = {
      users: new Map(), authSessions: new Map(), oauthStates: new Map(), profiles: new Map(),
      settings: new Map(), sessions: new Map(), jobs: new Map(), feedbacks: new Map()
    };
  }

  reset() {
    for (const collection of Object.values(this.collections)) collection.clear();
  }

  async getUser(id) { return clone(this.collections.users.get(id) ?? null); }
  async findUserByGoogleSub(sub) { return clone([...this.collections.users.values()].find(user => user.googleSub === sub) ?? null); }
  async saveUser(user) { this.collections.users.set(user.id, clone(user)); return clone(user); }
  async getAuthSession(hash) { return clone(this.collections.authSessions.get(hash) ?? null); }
  async saveAuthSession(session) { this.collections.authSessions.set(session.sessionIdHash, clone(session)); }
  async revokeAuthSession(hash, revokedAt) {
    const item = this.collections.authSessions.get(hash);
    if (item) item.revokedAt = revokedAt;
  }
  async saveOAuthState(item) { this.collections.oauthStates.set(item.state, clone(item)); }
  async consumeOAuthState(state, usedAt) {
    const item = this.collections.oauthStates.get(state);
    if (!item || item.usedAt || Date.parse(item.expiresAt) < Date.now()) return null;
    item.usedAt = usedAt;
    return clone(item);
  }
  async getProfile(userId) { return clone(this.collections.profiles.get(userId) ?? null); }
  async saveProfile(profile) { this.collections.profiles.set(profile.userId, clone(profile)); return clone(profile); }
  async getSettings(userId) { return clone(this.collections.settings.get(userId) ?? null); }
  async saveSettings(settings) { this.collections.settings.set(settings.userId, clone(settings)); return clone(settings); }
  async getSession(id) { return clone(this.collections.sessions.get(id) ?? null); }
  async listSessions(userId) {
    return [...this.collections.sessions.values()]
      .filter(item => item.userId === userId && !item.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone);
  }
  async saveSession(session) { this.collections.sessions.set(session.id, clone(session)); return clone(session); }
  async getJob(id) { return clone(this.collections.jobs.get(id) ?? null); }
  async findActiveFeedbackJob(sessionId, statuses) {
    return clone([...this.collections.jobs.values()].find(job => job.sessionId === sessionId && statuses.includes(job.status)) ?? null);
  }
  async createFeedbackJobIfAbsent(job, statuses) {
    const existing = [...this.collections.jobs.values()].find(item => item.sessionId === job.sessionId && item.userId === job.userId && statuses.includes(item.status));
    if (existing) return { job: clone(existing), created: false };
    this.collections.jobs.set(job.id, clone(job));
    return { job: clone(job), created: true };
  }
  async saveJob(job) { this.collections.jobs.set(job.id, clone(job)); return clone(job); }
  async getFeedback(sessionId) { return clone(this.collections.feedbacks.get(sessionId) ?? null); }
  async saveFeedback(feedback) { this.collections.feedbacks.set(feedback.sessionId, clone(feedback)); return clone(feedback); }
}

function toIso(value) {
  if (value?.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

function fromFirestore(data) {
  if (!data) return data;
  if (Array.isArray(data)) return data.map(fromFirestore);
  if (typeof data !== "object") return data;
  if (data.toDate) return toIso(data);
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, fromFirestore(value)]));
}

function baseSession(session) {
  const { questions, answers, utterances, ...base } = session;
  return base;
}

export async function createFirestoreDataStore({ projectId, databaseId = "(default)" } = {}) {
  const { Firestore, Timestamp } = await import("@google-cloud/firestore");
  const firestore = new Firestore({ projectId: projectId || undefined, databaseId, ignoreUndefinedProperties: true });

  const toFirestore = (value, key = "") => {
    if (Array.isArray(value)) return value.map(item => toFirestore(item));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, toFirestore(child, childKey)]));
    if (typeof value === "string" && key.endsWith("At") && !Number.isNaN(Date.parse(value))) return Timestamp.fromDate(new Date(value));
    return value;
  };

  const document = async (collection, id) => {
    const snapshot = await firestore.collection(collection).doc(id).get();
    return snapshot.exists ? fromFirestore(snapshot.data()) : null;
  };
  const setDocument = async (collection, id, value) => {
    await firestore.collection(collection).doc(id).set(toFirestore(value), { merge: true });
    return value;
  };
  const hydrateSession = async session => {
    if (!session) return null;
    const ref = firestore.collection("interviewSessions").doc(session.id);
    const [questions, answers, utterances] = await Promise.all([
      ref.collection("questions").orderBy("createdAt").get(),
      ref.collection("answers").orderBy("createdAt").get(),
      ref.collection("utterances").orderBy("sequenceNo").get()
    ]);
    return {
      ...fromFirestore(session),
      questions: questions.docs.map(item => fromFirestore(item.data())),
      answers: answers.docs.map(item => fromFirestore(item.data())),
      utterances: utterances.docs.map(item => fromFirestore(item.data()))
    };
  };

  return {
    async reset() { throw new Error("Firestore cannot be reset by the application"); },
    async getUser(id) { return document("users", id); },
    async findUserByGoogleSub(sub) {
      const result = await firestore.collection("users").where("googleSub", "==", sub).limit(1).get();
      return result.empty ? null : fromFirestore(result.docs[0].data());
    },
    async saveUser(user) { await setDocument("users", user.id, user); return user; },
    async getAuthSession(hash) { return document("authSessions", hash); },
    async saveAuthSession(session) { await setDocument("authSessions", session.sessionIdHash, session); },
    async revokeAuthSession(hash, revokedAt) { await firestore.collection("authSessions").doc(hash).set({ revokedAt }, { merge: true }); },
    async saveOAuthState(item) { await setDocument("oauthStates", item.state, item); },
    async consumeOAuthState(state, usedAt) {
      const ref = firestore.collection("oauthStates").doc(state);
      return firestore.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        const item = snapshot.exists ? fromFirestore(snapshot.data()) : null;
        if (!item || item.usedAt || Date.parse(item.expiresAt) < Date.now()) return null;
        transaction.update(ref, { usedAt: toFirestore(usedAt, "usedAt") });
        return item;
      });
    },
    async getProfile(userId) { return document("profiles", userId); },
    async saveProfile(profile) { await setDocument("profiles", profile.userId, profile); return profile; },
    async getSettings(userId) { return document("settings", userId); },
    async saveSettings(settings) { await setDocument("settings", settings.userId, { ...defaultVoiceSettings, ...settings, saveAudio: false }); return settings; },
    async getSession(id) { return hydrateSession(await document("interviewSessions", id)); },
    async listSessions(userId) {
      const result = await firestore.collection("interviewSessions").where("userId", "==", userId).get();
      return Promise.all(result.docs.map(item => fromFirestore(item.data()))).then(items => items
        .filter(item => !item.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    },
    async saveSession(session) {
      const ref = firestore.collection("interviewSessions").doc(session.id);
      const batch = firestore.batch();
      batch.set(ref, toFirestore(baseSession(session)), { merge: true });
      for (const question of session.questions) batch.set(ref.collection("questions").doc(question.id), toFirestore({ ...question, sessionId: session.id, userId: session.userId }), { merge: true });
      for (const answer of session.answers) batch.set(ref.collection("answers").doc(answer.id), toFirestore({ ...answer, sessionId: session.id, userId: session.userId }), { merge: true });
      for (const utterance of session.utterances) batch.set(ref.collection("utterances").doc(utterance.id), toFirestore({ ...utterance, sessionId: session.id, userId: session.userId }), { merge: true });
      await batch.commit();
      return session;
    },
    async getJob(id) { return document("jobs", id); },
    async findActiveFeedbackJob(sessionId, statuses) {
      const result = await firestore.collection("jobs").where("sessionId", "==", sessionId).get();
      return fromFirestore(result.docs.map(item => item.data()).find(job => statuses.includes(job.status)) ?? null);
    },
    async createFeedbackJobIfAbsent(job, statuses) {
      const lockRef = firestore.collection("feedbackJobLocks").doc(job.sessionId);
      const jobRef = firestore.collection("jobs").doc(job.id);
      return firestore.runTransaction(async transaction => {
        const lockSnapshot = await transaction.get(lockRef);
        if (lockSnapshot.exists) {
          const lock = fromFirestore(lockSnapshot.data());
          const activeSnapshot = await transaction.get(firestore.collection("jobs").doc(lock.jobId));
          const active = activeSnapshot.exists ? fromFirestore(activeSnapshot.data()) : null;
          if (active && active.userId === job.userId && statuses.includes(active.status)) return { job: active, created: false };
        }
        transaction.set(jobRef, toFirestore(job));
        transaction.set(lockRef, toFirestore({ jobId: job.id, userId: job.userId, updatedAt: job.updatedAt }));
        return { job, created: true };
      });
    },
    async saveJob(job) { await setDocument("jobs", job.id, job); return job; },
    async getFeedback(sessionId) { return document("feedbacks", sessionId); },
    async saveFeedback(feedback) { await setDocument("feedbacks", feedback.sessionId, feedback); return feedback; }
  };
}
