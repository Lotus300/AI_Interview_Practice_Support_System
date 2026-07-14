import test from "node:test";
import assert from "node:assert/strict";
import { hasClickCommand } from "../../frontend/src/core/events.mjs";
import { state } from "../../frontend/src/core/state.mjs";
import { renderProfile } from "../../frontend/src/views/account.mjs";

test("通常のsubmitボタンをグローバルclick処理で再描画しない", () => {
  const handlers = { login: () => {} };
  assert.equal(hasClickCommand({ dataset: {} }, handlers), false);
  assert.equal(hasClickCommand({ dataset: { screen: "home" } }, handlers), true);
  assert.equal(hasClickCommand({ dataset: { action: "login" } }, handlers), true);
});

test("初期プロフィールで卒業状況を選択できる", () => {
  Object.assign(state, { user: { name: "テストユーザー", profileCompleted: false }, profile: null, busy: false });
  const html = renderProfile();
  assert.match(html, /select name="graduationStatus" required/);
  assert.match(html, /value="卒業"/);
  assert.match(html, /value="卒業見込み"/);
  assert.match(html, /保存してホームへ/);
});
