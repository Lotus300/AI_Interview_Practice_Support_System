import { randomUUID } from "node:crypto";

export function createVoiceCache({ ttlMs = 120000, maxEntries = 20, now = Date.now } = {}) {
  const entries = new Map();

  function purgeExpired() {
    const timestamp = now();
    for (const [id, entry] of entries) {
      if (entry.expiresAt <= timestamp) entries.delete(id);
    }
  }

  return {
    put({ userId, audio, contentType = "audio/wav" }) {
      purgeExpired();
      while (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
      const id = randomUUID();
      entries.set(id, { userId, audio, contentType, expiresAt: now() + ttlMs });
      return id;
    },
    get(id, userId) {
      purgeExpired();
      const entry = entries.get(id);
      return entry?.userId === userId ? entry : null;
    },
    get size() {
      purgeExpired();
      return entries.size;
    }
  };
}
