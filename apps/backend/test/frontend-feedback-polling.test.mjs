import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("フィードバックはjob APIを3秒間隔で継続ポーリングする", async () => {
  const [app, api] = await Promise.all([
    readFile(new URL("../../frontend/src/app.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/src/core/api.mjs", import.meta.url), "utf8")
  ]);
  assert.match(api, /job:\s*\(id\)\s*=>\s*api\(`\/jobs\/\$\{id\}`\)/);
  assert.match(app, /feedbackPollingIntervalMs\s*=\s*3000/);
  assert.match(app, /setTimeout\(\(\)\s*=>\s*pollFeedbackJob/);
  assert.match(app, /job\.status\s*===\s*"succeeded"/);
  assert.match(app, /job\.status\s*===\s*"failed"/);
});

test("終了後はジョブ登録を待たずフィードバック画面へ遷移する", async () => {
  const app = await readFile(new URL("../../frontend/src/app.mjs", import.meta.url), "utf8");
  const start = app.indexOf("async function startFeedback()");
  const end = app.indexOf("async function finishInterview()", start);
  const implementation = app.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.ok(implementation.indexOf('state.screen = "feedback"') < implementation.indexOf("interviewApi.startFeedback"));
  assert.match(implementation, /state\.feedbackStatus\s*=\s*"failed"/);
  assert.match(app, /"retry-feedback":\s*startFeedback/);
});
