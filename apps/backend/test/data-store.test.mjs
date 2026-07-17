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
  await store.saveSession({ id: "old", userId: "usr_1", status: sessionStatuses.FINISHED, createdAt: "2026-01-01T00:00:00.000Z", deletedAt: null });
  await store.saveSession({ id: "new", userId: "usr_1", status: sessionStatuses.FINISHED, createdAt: "2026-02-01T00:00:00.000Z", deletedAt: null });
  await store.saveSession({ id: "unfinished", userId: "usr_1", status: sessionStatuses.WAITING_ANSWER, createdAt: "2026-02-15T00:00:00.000Z", deletedAt: null });
  await store.saveSession({ id: "deleted", userId: "usr_1", status: sessionStatuses.FINISHED, createdAt: "2026-03-01T00:00:00.000Z", deletedAt: "2026-03-02T00:00:00.000Z" });
  await store.saveSession({ id: "other", userId: "usr_2", status: sessionStatuses.FINISHED, createdAt: "2026-04-01T00:00:00.000Z", deletedAt: null });
  assert.deepEqual((await store.listSessions("usr_1")).map(item => item.id), ["new", "old"]);
});
