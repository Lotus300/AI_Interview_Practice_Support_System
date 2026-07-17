import { readJson, sendBuffer, sendJson } from "../../http.mjs";
import { numberInRange, requireChoice, requireText } from "../../core/validation.mjs";
import { createVoiceService, speakerIds } from "./voice-service.mjs";
import { config } from "../../config.mjs";
import { readSpeechInput } from "./multipart.mjs";
import { createSpeechService } from "./speech-service.mjs";
import { findOwnedSession, sendResourceError } from "../../core/resources.mjs";

export function registerMediaRoutes(router, { voiceService = createVoiceService(), speechService = createSpeechService() } = {}) {
  router.add("POST", "/api/v1/speech/recognize", async (req, res, { user }) => {
    const input = await readSpeechInput(req, config.speech.maxAudioBytes);
    const sessionId = requireText(input.sessionId, "面接セッションID", 100);
    const found = await findOwnedSession(sessionId, user.id);
    if (found.error) return sendResourceError(res, sendJson, found.error);
    sendJson(res, 200, await speechService.recognize(input));
  });

  router.add("POST", "/api/v1/voice/synthesize", async (req, res, { user }) => {
    const body = await readJson(req);
    const result = await voiceService.synthesize({
      userId: user.id,
      text: requireText(body.text, "質問文", 1000),
      speaker: requireChoice(body.speaker ?? "青山龍星", "話者", Object.keys(speakerIds)),
      speedScale: numberInRange(body.speedScale, "話速", 0.5, 2, 1),
      volumeScale: numberInRange(body.volumeScale, "音量", 0, 2, 1),
      preview: body.preview === true
    });
    sendJson(res, 200, result);
  });

  router.add("GET", "/api/v1/voice/playback/:id", async (_req, res, { user }, { id }) => {
    const entry = voiceService.findPlayback(id, user.id);
    if (!entry) return sendJson(res, 404, { code: "NOT_FOUND", message: "Voice data not found or expired" });
    sendBuffer(res, 200, entry.audio, entry.contentType, {
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff"
    });
  });
}
