export const voicePreviewText = "これから面接を開始します。名前と経歴または学歴をお願いします。";

export const voicePreviewTexts = Object.freeze({
  speaker: voicePreviewText,
  speedScale: voicePreviewText,
  volumeScale: voicePreviewText
});

export function previewTextForControl(controlName) {
  return voicePreviewTexts[controlName] ?? null;
}

export function readVoiceSettings(form, fallback = {}) {
  if (!form) return fallback;
  return {
    speaker: form.elements.namedItem("speaker")?.value || fallback.speaker,
    speedScale: Number(form.elements.namedItem("speedScale")?.value ?? fallback.speedScale ?? 1),
    volumeScale: Number(form.elements.namedItem("volumeScale")?.value ?? fallback.volumeScale ?? 1)
  };
}
