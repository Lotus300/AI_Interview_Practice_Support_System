import test from "node:test";
import assert from "node:assert/strict";
import { previewTextForControl, readVoiceSettings, voicePreviewTexts } from "../../frontend/src/features/voice-preview.mjs";

test("音声設定ごとに適切な試聴文を返す", () => {
  assert.equal(previewTextForControl("speaker"), "これから面接を開始します。名前と経歴または学歴をお願いします。");
  assert.equal(previewTextForControl("speedScale"), "話す速度を調整しています。");
  assert.equal(previewTextForControl("volumeScale"), "音量の調整をしています。");
  assert.equal(previewTextForControl("unknown"), null);
  assert.equal(voicePreviewTexts.speaker.includes("面接を開始"), true);
});

test("設定フォームから話者・速度・音量を数値として取得する", () => {
  const values = { speaker: "No.7", speedScale: "1.4", volumeScale: "0.8" };
  const form = { elements: { namedItem: name => ({ value: values[name] }) } };
  assert.deepEqual(readVoiceSettings(form), { speaker: "No.7", speedScale: 1.4, volumeScale: 0.8 });
});
