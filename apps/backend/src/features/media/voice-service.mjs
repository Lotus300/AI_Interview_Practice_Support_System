import crypto from "node:crypto";
import { config } from "../../config.mjs";
import { createVoiceCache } from "./voice-cache.mjs";
import { createSynthesisCache } from "./synthesis-cache.mjs";
import { createVoicevoxClient } from "./voicevox-client.mjs";
import { getDataStore, nowIso } from "../../store.mjs";

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

const maxPersistentPreviewBytes = 700000;

function persistentPreviewId({ speakerId, text, samplingRate }) {
  return crypto.createHash("sha256").update(`${speakerId}:${samplingRate}:${text}`).digest("hex");
}

export function createVoiceService({
  client = createVoicevoxClient(config.voicevox),
  cache = createVoiceCache({ ttlMs: config.voicevox.cacheTtlMs, maxEntries: config.voicevox.maxCacheEntries }),
  previewCache = createSynthesisCache({
    ttlMs: config.voicevox.previewCacheTtlMs,
    maxEntries: config.voicevox.previewCacheMaxEntries
  }),
  defaultSpeakerId = config.voicevox.defaultSpeakerId,
  logger = console,
  createErrorId = () => crypto.randomUUID()
} = {}) {
  return {
    async warmup() {
      if (!client.configured || !client.warmup) return;
      try {
        await client.warmup();
      } catch (error) {
        logger.warn?.("VOICEVOX warmup failed", { name: error.name, message: error.message });
      }
    },
    async synthesize({ userId, text, speaker, speedScale, volumeScale, preview = false }) {
      if (!client.configured) {
        return { aiResponseStatus: "text_only", text, voice: null, reason: "VOICEVOX_NOT_CONFIGURED", provider: "unavailable" };
      }
      let errorStage = "audio_query";
      try {
        const speakerId = speakerIds[speaker] ?? defaultSpeakerId;
        const createAudio = async () => {
          const audioQuery = await client.createAudioQuery({ text, speakerId });
          audioQuery.speedScale = preview ? 1 : speedScale;
          audioQuery.volumeScale = preview ? 1 : volumeScale;
          audioQuery.outputSamplingRate = config.voicevox.outputSamplingRate;
          audioQuery.outputStereo = false;
          errorStage = "synthesis";
          return client.synthesize({ audioQuery, speakerId });
        };
        // Reuse identical synthesis results for normal playback as well as previews.
        // This avoids repeating both VOICEVOX HTTP calls when a question is replayed.
        const synthesisKey = `${speakerId}:${preview ? 1 : speedScale}:${preview ? 1 : volumeScale}:${text}`;
        const createPersistentPreview = async () => {
          const id = persistentPreviewId({ speakerId, text, samplingRate: config.voicevox.outputSamplingRate });
          try {
            const stored = await (await getDataStore()).getVoicePreview(id);
            if (stored?.audioBase64) return Buffer.from(stored.audioBase64, "base64");
          } catch (error) {
            logger.warn?.("VOICEVOX preview cache read failed", { name: error.name, message: error.message });
          }

          const generated = await createAudio();
          if (generated.length <= maxPersistentPreviewBytes) {
            try {
              await (await getDataStore()).saveVoicePreview({
                id,
                speakerId,
                samplingRate: config.voicevox.outputSamplingRate,
                textHash: crypto.createHash("sha256").update(text).digest("hex"),
                audioBase64: generated.toString("base64"),
                contentType: "audio/wav",
                createdAt: nowIso()
              });
            } catch (error) {
              logger.warn?.("VOICEVOX preview cache write failed", { name: error.name, message: error.message });
            }
          }
          return generated;
        };
        const audio = await previewCache.getOrCreate(synthesisKey, preview ? createPersistentPreview : createAudio);
        const id = cache.put({ userId, audio });
        return {
          aiResponseStatus: "voice_ready",
          text,
          voice: { id, playbackUrl: `/api/v1/voice/playback/${id}`, durationMs: wavDurationMs(audio) },
          provider: "voicevox",
          playbackAdjustment: preview ? "client" : "synthesized"
        };
      } catch (error) {
        const errorId = createErrorId();
        logger.error("VOICEVOX synthesis failed", {
          errorId,
          errorStage,
          name: error.name,
          message: error.message,
          code: error.code,
          statusCode: error.statusCode || error.response?.status
        });
        return { aiResponseStatus: "text_only", text, voice: null, reason: "VOICEVOX_UNAVAILABLE", errorStage, errorId, provider: "voicevox" };
      }
    },
    findPlayback(id, userId) {
      return cache.get(id, userId);
    }
  };
}
