import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("../../frontend/src/app.mjs", import.meta.url), "utf8");

test("音声設定画面を開いた時点で試聴音声をバックグラウンド生成する", () => {
  assert.match(appSource, /prepareVoicePreview\(voicePreviewTexts\.speaker, state\.settings\)/);
  assert.match(appSource, /preparedVoicePreviewTtlMs = 90000/);
  assert.match(appSource, /return prepared\.promise/);
});
