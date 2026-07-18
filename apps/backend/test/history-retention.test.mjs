import test from "node:test";
import assert from "node:assert/strict";
import { historyExpiresAt, isHistoryExpired } from "../src/features/interviews/retention.mjs";
import { state } from "../../frontend/src/core/state.mjs";
import { renderHistory } from "../../frontend/src/views/history.mjs";

test("履歴の保存期限は作成日時から30日後になる", () => {
  const createdAt = "2026-07-01T00:00:00.000Z";
  assert.equal(historyExpiresAt(createdAt), "2026-07-31T00:00:00.000Z");
  assert.equal(isHistoryExpired({ createdAt }, Date.parse("2026-07-30T23:59:59.999Z")), false);
  assert.equal(isHistoryExpired({ createdAt }, Date.parse("2026-07-31T00:00:00.000Z")), true);
});

test("履歴画面上部に1か月の保存期間と自動削除を表示する", () => {
  state.sessions = [];
  const html = renderHistory();
  const noticeIndex = html.indexOf("履歴の保存期間について");
  const listIndex = html.indexOf("PAST INTERVIEWS");
  assert.ok(noticeIndex >= 0 && noticeIndex < listIndex);
  assert.match(html, /1か月間（30日間）保存/);
  assert.match(html, /自動的に削除/);
});

test("次ページがある場合だけさらに20件表示ボタンを出す", () => {
  state.sessions = [{ id: "session_1", status: "finished", condition: {}, createdAt: new Date().toISOString() }];
  state.historyNextCursor = "next-page";
  assert.match(renderHistory(), /さらに20件表示/);
  state.historyNextCursor = null;
  assert.doesNotMatch(renderHistory(), /さらに20件表示/);
});

test("履歴詳細で完全削除であることを明示する", async () => {
  state.session = { id: "session_1", status: "finished", condition: {}, utterances: [] };
  state.feedback = null;
  const { renderHistoryDetail } = await import("../../frontend/src/views/history.mjs");
  assert.match(renderHistoryDetail(), /この履歴を完全に削除/);
});
