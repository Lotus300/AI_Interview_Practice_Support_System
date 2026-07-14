import { readJson, sendBuffer, sendJson } from "../../http.mjs";
import { numberInRange, requireChoice, requireText } from "../../core/validation.mjs";
import { createVoiceService, speakerIds } from "./voice-service.mjs";

export function registerMediaRoutes(router, { voiceService = createVoiceService() } = {}) {
  router.add("POST", "/api/v1/speech/recognize", async (req, res) => {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data") && !contentType.includes("application/json")) {
      return sendJson(res, 400, { code: "VALIDATION_ERROR", message: "multipart/form-data or json is required" });
    }
    sendJson(res, 200, {
      speechInputStatus: "recognized",
      transcript: "私は前職で問い合わせ対応の集計を自動化し、月6時間の作業削減につなげました。",
      confidence: 0.91,
      alternatives: [],
      provider: "local_mock"
    });
  });

  router.add("POST", "/api/v1/voice/synthesize", async (req, res, { user }) => {
    const body = await readJson(req);
    const result = await voiceService.synthesize({
      userId: user.id,
      text: requireText(body.text, "質問文", 1000),
      speaker: requireChoice(body.speaker ?? "青山龍星", "話者", Object.keys(speakerIds)),
      speedScale: numberInRange(body.speedScale, "話速", 0.5, 2, 1),
      volumeScale: numberInRange(body.volumeScale, "音量", 0, 2, 1)
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
