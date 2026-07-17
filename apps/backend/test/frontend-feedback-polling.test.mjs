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
