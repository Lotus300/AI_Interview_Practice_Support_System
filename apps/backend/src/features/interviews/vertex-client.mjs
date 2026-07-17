import { config } from "../../config.mjs";
import { createGoogleApiClient } from "../../core/google-api.mjs";

function responseText(data) {
  return (data.candidates?.[0]?.content?.parts || []).map(part => part.text || "").join("").trim();
}

function responseError(data, text) {
  const finishReason = data.candidates?.[0]?.finishReason || "UNKNOWN";
  const code = text ? "GEMINI_SCHEMA_MISMATCH" : "GEMINI_EMPTY_RESPONSE";
  const message = text ? "Gemini output was not valid JSON" : "Gemini returned no content";
  return Object.assign(new Error(message), { code, statusCode: 503, finishReason, outputLength: text.length });
}

export function createVertexClient({ googleApi = createGoogleApiClient(), settings = config.vertexAi, logger = console } = {}) {
  return {
    async generateJson({ systemInstruction, prompt, responseSchema, maxOutputTokens = 2048 }) {
      const host = settings.location === "global" ? "aiplatform.googleapis.com" : `${settings.location}-aiplatform.googleapis.com`;
      const modelPath = `projects/${config.gcpProjectId}/locations/${settings.location}/publishers/google/models/${settings.model}`;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const data = await googleApi.request(`https://${host}/v1/${modelPath}:generateContent`, {
          method: "POST",
          signal: AbortSignal.timeout(settings.timeoutMs),
          body: {
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", responseSchema, temperature: 0.2, maxOutputTokens }
          }
        });
        const text = responseText(data);
        if (text) {
          try {
            return JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
          } catch {
            // Retry once because structured output can occasionally be truncated or malformed.
          }
        }

        const error = responseError(data, text);
        logger.warn?.("Gemini structured output failure", {
          attempt,
          finishReason: error.finishReason,
          inputLength: prompt.length,
          outputLength: error.outputLength
        });
        if (attempt === 2) throw error;
      }
    }
  };
}
