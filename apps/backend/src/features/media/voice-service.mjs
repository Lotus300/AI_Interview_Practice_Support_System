import { config } from "../../config.mjs";
import { createVoiceCache } from "./voice-cache.mjs";
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
  defaultSpeakerId = config.voicevox.defaultSpeakerId,
  logger = console
} = {}) {
  return {
    async synthesize({ userId, text, speaker, speedScale, volumeScale }) {
      if (!client.configured) {
        return { aiResponseStatus: "text_only", text, voice: null, reason: "VOICEVOX_NOT_CONFIGURED", provider: "local_mock" };
      }
      try {
        const speakerId = speakerIds[speaker] ?? defaultSpeakerId;
        const audioQuery = await client.createAudioQuery({ text, speakerId });
        audioQuery.speedScale = speedScale;
        audioQuery.volumeScale = volumeScale;
        const audio = await client.synthesize({ audioQuery, speakerId });
        const id = cache.put({ userId, audio });
        return {
          aiResponseStatus: "voice_ready",
          text,
          voice: { id, playbackUrl: `/api/v1/voice/playback/${id}`, durationMs: wavDurationMs(audio) },
          provider: "voicevox"
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
