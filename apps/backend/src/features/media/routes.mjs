import { readJson, sendJson } from "../../http.mjs";
import { requireText } from "../../core/validation.mjs";

export function registerMediaRoutes(router) {
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

  router.add("POST", "/api/v1/voice/synthesize", async (req, res) => {
    const body = await readJson(req);
    const text = requireText(body.text, "質問文", 1000);
    sendJson(res, 200, {
      aiResponseStatus: "text_only",
      text,
      voice: null,
      reason: "VOICEVOX is not connected in local MVP mode.",
      provider: "local_mock"
    });
  });
}
