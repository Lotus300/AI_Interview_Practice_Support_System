import { config } from "../../config.mjs";
import { createGoogleApiClient } from "../../core/google-api.mjs";

export function createSpeechClient({ googleApi = createGoogleApiClient(), settings = config.speech } = {}) {
  return {
    async recognize(audio, mimeType) {
      const recognizer = `projects/${config.gcpProjectId}/locations/${settings.location}/recognizers/${settings.recognizer}`;
      const data = await googleApi.request(`https://speech.googleapis.com/v2/${recognizer}:recognize`, {
        method: "POST",
        signal: AbortSignal.timeout(settings.timeoutMs),
        body: {
          config: {
            autoDecodingConfig: {},
            languageCodes: [settings.languageCode],
            model: settings.model,
            features: { enableAutomaticPunctuation: true }
          },
          content: audio.toString("base64")
        }
      });
      const alternatives = (data.results || []).flatMap(result => result.alternatives || []);
      const transcript = (data.results || []).map(result => result.alternatives?.[0]?.transcript || "").join("").trim();
      return {
        transcript,
        confidence: alternatives.length ? Math.min(...alternatives.map(item => Number(item.confidence || 0))) : null,
        alternatives: alternatives.slice(1, 4).map(item => item.transcript),
        mimeType
      };
    }
  };
}
