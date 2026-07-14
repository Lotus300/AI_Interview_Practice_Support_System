import test from "node:test";
import assert from "node:assert/strict";
import { state } from "../../frontend/src/core/state.mjs";
import { renderInterview } from "../../frontend/src/views/interview.mjs";

test("音声回答ボタンを回答見出しの横かつ入力欄より前へ配置する", () => {
  Object.assign(state, {
    session: { questions: [{}], answers: [], condition: { questionCount: 3, theme: "面接" } },
    question: { text: "自己紹介をしてください。" },
    settings: { speaker: "青山龍星" },
    answerDraft: "",
    speechStatus: "idle",
    busy: false
  });
  const html = renderInterview();
  const headingIndex = html.indexOf("回答を入力");
  const voiceButtonIndex = html.indexOf('data-action="start-recording"');
  const textareaIndex = html.indexOf('id="answerDraft"');
  assert.ok(headingIndex < voiceButtonIndex);
  assert.ok(voiceButtonIndex < textareaIndex);
  assert.equal(html.match(/data-action="start-recording"/g)?.length, 1);
  assert.match(html, /質問をもう一度読み上げる/);
});
