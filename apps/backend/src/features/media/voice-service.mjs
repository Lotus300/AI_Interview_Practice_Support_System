import { config } from "../../config.mjs";
import { createVoiceCache } from "./voice-cache.mjs";
import { createSynthesisCache } from "./synthesis-cache.mjs";
import { createVoicevoxClient } from "./voicevox-client.mjs";

export const speakerIds = Object.freeze({
  "青山龍星": 13,
  "剣崎雌雄": 21,
  "No.7": 29,
  "東北イタコ": 109
});

function wavDurationMs(audio) {
  if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF") return null;
  const byteRate = audio.readUInt32LE(28);
  const dataSize = audio.readUInt32LE(40);
  return byteRate > 0 ? Math.round((dataSize / byteRate) * 1000) : null;
}

export function createVoiceService({
  client = createVoicevoxClient(config.voicevox),
  cache = createVoiceCache({ ttlMs: config.voicevox.cacheTtlMs, maxEntries: config.voicevox.maxCacheEntries }),
  previewCache = createSynthesisCache({
    ttlMs: config.voicevox.previewCacheTtlMs,
    maxEntries: config.voicevox.previewCacheMaxEntries
  }),
  defaultSpeakerId = config.voicevox.defaultSpeakerId,
  logger = console
} = {}) {
  return {
    async synthesize({ userId, text, speaker, speedScale, volumeScale, preview = false }) {
      if (!client.configured) {
        return { aiResponseStatus: "text_only", text, voice: null, reason: "VOICEVOX_NOT_CONFIGURED", provider: "local_mock" };
      }
      try {
        const speakerId = speakerIds[speaker] ?? defaultSpeakerId;
        const createAudio = async () => {
          const audioQuery = await client.createAudioQuery({ text, speakerId });
          audioQuery.speedScale = preview ? 1 : speedScale;
          audioQuery.volumeScale = preview ? 1 : volumeScale;
          return client.synthesize({ audioQuery, speakerId });
        };
        const audio = preview
          ? await previewCache.getOrCreate(`${speakerId}:${text}`, createAudio)
          : await createAudio();
        const id = cache.put({ userId, audio });
        return {
          aiResponseStatus: "voice_ready",
          text,
          voice: { id, playbackUrl: `/api/v1/voice/playback/${id}`, durationMs: wavDurationMs(audio) },
          provider: "voicevox",
          playbackAdjustment: preview ? "client" : "synthesized"
        };
      } catch (error) {
        logger.error("VOICEVOX synthesis failed", { name: error.name, message: error.message });
        return { aiResponseStatus: "text_only", text, voice: null, reason: "VOICEVOX_UNAVAILABLE", provider: "voicevox" };
      }
    },
    findPlayback(id, userId) {
      return cache.get(id, userId);
    }
  };
}
