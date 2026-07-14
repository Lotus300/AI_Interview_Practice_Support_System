export const voicePreviewTexts = Object.freeze({
  speaker: "これから面接を開始します。名前と経歴または学歴をお願いします。",
  speedScale: "話す速度を調整しています。",
  volumeScale: "音量の調整をしています。"
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
