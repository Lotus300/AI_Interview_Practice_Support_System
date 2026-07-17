import test from "node:test";
import assert from "node:assert/strict";
import { MemoryDataStore } from "../src/data-store.mjs";
import { sessionStatuses } from "../../../packages/shared/src/constants.mjs";

test("メモリRepositoryは保存値を外部変更から分離する", async () => {
  const store = new MemoryDataStore();
  const user = { id: "usr_1", googleSub: "sub_1", name: "保存前" };
  await store.saveUser(user);
  user.name = "変更後";
  assert.equal((await store.getUser("usr_1")).name, "保存前");
  assert.equal((await store.findUserByGoogleSub("sub_1")).id, "usr_1");
});

test("OAuth stateは期限内でも一度だけ消費できる", async () => {
  const store = new MemoryDataStore();
  await store.saveOAuthState({ state: "state_1", expiresAt: new Date(Date.now() + 60_000).toISOString(), usedAt: null });
  assert.equal((await store.consumeOAuthState("state_1", new Date().toISOString())).state, "state_1");
  assert.equal(await store.consumeOAuthState("state_1", new Date().toISOString()), null);
});

test("面接一覧は終了済み・所有者・論理削除・作成日時を反映する", async () => {
  const store = new MemoryDataStore();
  const recent = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const newer = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  await store.saveSession({ id: "old", userId: "usr_1", status: sessionStatuses.FINISHED, createdAt: recent, deletedAt: null });
  await store.saveSession({ id: "new", userId: "usr_1", status: sessionStatuses.FINISHED, createdAt: newer, deletedAt: null });
  await store.saveSession({ id: "unfinished", userId: "usr_1", status: sessionStatuses.WAITING_ANSWER, createdAt: newer, deletedAt: null });
  await store.saveSession({ id: "deleted", userId: "usr_1", status: sessionStatuses.FINISHED, createdAt: newer, deletedAt: new Date().toISOString() });
  await store.saveSession({ id: "other", userId: "usr_2", status: sessionStatuses.FINISHED, createdAt: newer, deletedAt: null });
  assert.deepEqual((await store.listSessions("usr_1")).map(item => item.id), ["new", "old"]);
});

test("作成から30日を過ぎた履歴と関連データを削除する", async () => {
  const store = new MemoryDataStore();
  const expiredAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  await store.saveSession({ id: "expired", userId: "usr_1", status: sessionStatuses.FINISHED, createdAt: expiredAt, deletedAt: null });
  await store.saveFeedback({ sessionId: "expired", summary: "期限切れ" });
  await store.saveJob({ id: "job_expired", sessionId: "expired", userId: "usr_1" });

  assert.equal(await store.purgeExpiredSessions("usr_1"), 1);
  assert.equal(await store.getSession("expired"), null);
  assert.equal(await store.getFeedback("expired"), null);
  assert.equal(await store.getJob("job_expired"), null);
});
