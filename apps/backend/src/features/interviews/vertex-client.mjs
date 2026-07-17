import { config } from "../../config.mjs";
import { createGoogleApiClient } from "../../core/google-api.mjs";

function responseText(data) {
  return (data.candidates?.[0]?.content?.parts || []).map(part => part.text || "").join("").trim();
}

export function createVertexClient({ googleApi = createGoogleApiClient(), settings = config.vertexAi } = {}) {
  return {
    async generateJson({ systemInstruction, prompt, responseSchema, maxOutputTokens = 2048 }) {
      const host = settings.location === "global" ? "aiplatform.googleapis.com" : `${settings.location}-aiplatform.googleapis.com`;
      const modelPath = `projects/${config.gcpProjectId}/locations/${settings.location}/publishers/google/models/${settings.model}`;
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
      if (!text) throw Object.assign(new Error("Gemini returned no content"), { code: "GEMINI_EMPTY_RESPONSE", statusCode: 503 });
      try {
        return JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
      } catch {
        throw Object.assign(new Error("Gemini output was not valid JSON"), { code: "GEMINI_SCHEMA_MISMATCH", statusCode: 503 });
      }
    }
  };
}
