import test from "node:test";
import assert from "node:assert/strict";
import { createCommandGate, hasClickCommand } from "../../frontend/src/core/events.mjs";
import { state } from "../../frontend/src/core/state.mjs";
import { renderHome, renderProfile } from "../../frontend/src/views/account.mjs";

test("通常のsubmitボタンをグローバルclick処理で再描画しない", () => {
  const handlers = { login: () => {} };
  assert.equal(hasClickCommand({ dataset: {} }, handlers), false);
  assert.equal(hasClickCommand({ dataset: { screen: "home" } }, handlers), true);
  assert.equal(hasClickCommand({ dataset: { action: "login" } }, handlers), true);
});

test("同じ画面コマンドの二重実行を全体ゲートで防止する", async () => {
  const runOnce = createCommandGate();
  let executions = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const first = runOnce("form:condition", async () => {
    executions += 1;
    await pending;
  });
  const duplicate = runOnce("form:condition", async () => { executions += 1; });
  await duplicate;
  assert.equal(executions, 1);
  release();
  await first;
  await runOnce("form:condition", async () => { executions += 1; });
  assert.equal(executions, 2);
});

test("初期プロフィールで卒業状況を選択できる", () => {
  Object.assign(state, { user: { name: "テストユーザー", profileCompleted: false }, profile: null, busy: false });
  const html = renderProfile();
  assert.match(html, /select name="graduationStatus" required/);
  assert.match(html, /value="卒業"/);
  assert.match(html, /value="卒業見込み"/);
  assert.match(html, /保存してホームへ/);
});

test("保存済みプロフィールを入力欄の初期値として表示する", () => {
  Object.assign(state, {
    user: { name: "テストユーザー", profileCompleted: false },
    profile: {
      fullName: "山田 & 花子",
      desiredRole: "バックエンドエンジニア",
      education: "テスト大学",
      faculty: "情報学部",
      graduationStatus: "卒業見込み",
      workHistory: "開発 <運用> 経験",
      selfPr: "改善を継続できます"
    },
    busy: false
  });

  const html = renderProfile();

  assert.match(html, /プロフィール設定/);
  assert.match(html, /value="山田 &amp; 花子"/);
  assert.match(html, /value="バックエンドエンジニア"/);
  assert.match(html, /value="テスト大学"/);
  assert.match(html, /value="情報学部"/);
  assert.match(html, /value="卒業見込み" selected/);
  assert.match(html, />開発 &lt;運用&gt; 経験<\/textarea>/);
  assert.match(html, />改善を継続できます<\/textarea>/);
  assert.match(html, /変更を保存/);
});

test("ホームではGoogleアカウント名よりプロフィール氏名を優先する", () => {
  Object.assign(state, {
    user: { name: "Google アカウント名", profileCompleted: true },
    profile: { fullName: "登録プロフィール名" },
    sessions: []
  });

  const html = renderHome();

  assert.match(html, /登録プロフィール名さん/);
  assert.doesNotMatch(html, /Google アカウント名さん/);
  assert.match(html, /class="brand" data-screen="home" aria-label="ホームへ移動"/);
});
