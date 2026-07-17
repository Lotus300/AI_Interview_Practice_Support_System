import { ApiError } from "../../core/errors.mjs";
import { createSpeechClient } from "./speech-client.mjs";

export function createSpeechService({ client = createSpeechClient() } = {}) {
  return {
    async recognize(input) {
      const result = await client.recognize(input.audio, input.mimeType);
      if (!result.transcript) throw new ApiError(422, "SPEECH_NOT_RECOGNIZED", "音声を認識できませんでした");
      return { speechInputStatus: "recognized", ...result, provider: "google_speech_v2" };
    }
  };
}
