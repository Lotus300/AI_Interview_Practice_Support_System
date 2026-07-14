import test from "node:test";
import assert from "node:assert/strict";
import { createSynthesisCache } from "../src/features/media/synthesis-cache.mjs";

test("同じ定型音声の同時生成を1回にまとめる", async () => {
  const cache = createSynthesisCache();
  let calls = 0;
  let resolveAudio;
  const create = () => {
    calls += 1;
    return new Promise(resolve => { resolveAudio = resolve; });
  };

  const first = cache.getOrCreate("speaker-13", create);
  const second = cache.getOrCreate("speaker-13", create);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolveAudio(Buffer.from("wav"));
  assert.equal((await first).toString(), "wav");
  assert.equal((await second).toString(), "wav");
  assert.equal(cache.size, 1);
});

test("期限内の定型音声を再利用する", async () => {
  let timestamp = 1000;
  let calls = 0;
  const cache = createSynthesisCache({ ttlMs: 100, now: () => timestamp });
  const create = async () => Buffer.from(String(++calls));

  assert.equal((await cache.getOrCreate("key", create)).toString(), "1");
  assert.equal((await cache.getOrCreate("key", create)).toString(), "1");
  timestamp += 101;
  assert.equal((await cache.getOrCreate("key", create)).toString(), "2");
});
