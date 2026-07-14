export function createSynthesisCache({ ttlMs = 3600000, maxEntries = 20, now = Date.now } = {}) {
  const entries = new Map();
  const inFlight = new Map();

  function purgeExpired() {
    const timestamp = now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= timestamp) entries.delete(key);
    }
  }

  return {
    async getOrCreate(key, create) {
      purgeExpired();
      const cached = entries.get(key);
      if (cached) return cached.audio;
      if (inFlight.has(key)) return inFlight.get(key);

      const pending = Promise.resolve()
        .then(create)
        .then(audio => {
          while (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
          entries.set(key, { audio, expiresAt: now() + ttlMs });
          return audio;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
      return pending;
    },
    get size() {
      purgeExpired();
      return entries.size;
    }
  };
}
