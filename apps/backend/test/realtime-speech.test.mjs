import test from "node:test";
import assert from "node:assert/strict";
import { createRealtimeSpeechRecognition } from "../../frontend/src/features/realtime-speech.mjs";

class FakeRecognition {
  start() { this.started = true; }
  stop() { this.stopped = true; }
  abort() { this.aborted = true; }
}

test("暫定・確定音声認識結果を既存回答へ逐次反映する", () => {
  let transcript;
  const controller = createRealtimeSpeechRecognition({
    Recognition: FakeRecognition,
    initialText: "既存の回答",
    onTranscript: value => { transcript = value; }
  });

  controller.start();
  const finalResult = [{ transcript: "確定部分" }];
  finalResult.isFinal = true;
  const interimResult = [{ transcript: "認識途中" }];
  interimResult.isFinal = false;
  controller.recognition.onresult({ results: [finalResult, interimResult] });

  assert.equal(controller.recognition.lang, "ja-JP");
  assert.equal(controller.recognition.continuous, true);
  assert.equal(controller.recognition.interimResults, true);
  assert.equal(transcript, "既存の回答 確定部分 認識途中");
});

test("未対応ブラウザではリアルタイム認識を無効化する", () => {
  assert.equal(createRealtimeSpeechRecognition({ Recognition: null }), null);
});
