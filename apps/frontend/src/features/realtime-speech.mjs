function joinText(...parts) {
  return parts.map(part => String(part || "").trim()).filter(Boolean).join(" ");
}

export function browserSpeechRecognition() {
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
}

export function createRealtimeSpeechRecognition({
  Recognition = browserSpeechRecognition(),
  initialText = "",
  languageCode = "ja-JP",
  onTranscript = () => {},
  onError = () => {}
} = {}) {
  if (!Recognition) return null;
  const recognition = new Recognition();
  recognition.lang = languageCode;
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = event => {
    const finalParts = [];
    const interimParts = [];
    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result[0]?.transcript || "";
      (result.isFinal ? finalParts : interimParts).push(transcript);
    }
    onTranscript(joinText(initialText, finalParts.join(" "), interimParts.join(" ")));
  };
  recognition.onerror = onError;

  return {
    start() { recognition.start(); },
    stop() { try { recognition.stop(); } catch {} },
    dispose() { try { recognition.abort(); } catch {} },
    recognition
  };
}
