export function shouldPrepareNextQuestion(session) {
  const answered = session?.answers?.length || 0;
  const total = Number(session?.condition?.questionCount || 0);
  return total > 0 && answered + 1 < total;
}

function questionVoiceKey(text, settings) {
  return JSON.stringify([text, settings?.speaker, Number(settings?.speedScale ?? 1), Number(settings?.volumeScale ?? 1)]);
}

export function createQuestionVoicePreloader({ request, now = () => performance.now(), ttlMs = 90000 } = {}) {
  const entries = new Map();
  return {
    prepare(text, settings) {
      if (!text || !settings) return null;
      const key = questionVoiceKey(text, settings);
      const existing = entries.get(key);
      if (existing && now() - existing.startedAt < ttlMs) return existing;
      const entry = { key, startedAt: now() };
      entry.promise = Promise.resolve().then(() => request(text, settings)).catch(error => {
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      });
      entries.set(key, entry);
      return entry;
    },
    matches(entry, text, settings) {
      return Boolean(entry && entry.key === questionVoiceKey(text, settings));
    },
    elapsedMs(entry) {
      return entry ? Math.max(0, Math.round(now() - entry.startedAt)) : null;
    }
  };
}

export async function readQuestionAutomatically({ question, settings, preparedPlayback, preparedVoice, synthesize, onFailure }) {
  if (!question?.text) return false;
  try {
    await synthesize(question.text, settings, { preparedPlayback, preparedVoice });
    return true;
  } catch (error) {
    onFailure?.(error);
    return false;
  }
}
