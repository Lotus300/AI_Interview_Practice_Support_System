import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/server.mjs";
import { resetDb } from "../src/store.mjs";

async function withServer(run) {
  resetDb();
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}/api/v1`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test("ログインからフィードバック取得まで完走できる", () => withServer(async base => {
  const loginResponse = await fetch(`${base}/auth/google/start`);
  const login = await loginResponse.json();
  const cookie = loginResponse.headers.get("set-cookie").split(";")[0];
  assert.equal(login.mode, "demo_oauth");

  const request = async (path, options = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: { cookie, ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) }
    });
    assert.ok(response.ok, `${options.method || "GET"} ${path}: ${response.status}`);
    return response.status === 204 ? null : response.json();
  };

  await request("/profile", { method: "PUT", body: JSON.stringify({ fullName: "テスト 太郎", education: "テスト大学", desiredRole: "Webエンジニア" }) });
  const { session } = await request("/interview-sessions", { method: "POST", body: JSON.stringify({ jobRole: "Webエンジニア", industry: "IT", questionCount: 2 }) });
  const { question } = await request(`/interview-sessions/${session.id}/initial-question`, { method: "POST", body: "{}" });
  const answer = await request(`/interview-sessions/${session.id}/answers`, { method: "POST", body: JSON.stringify({ questionId: question.id, answerText: "集計を自動化し、月6時間の作業を削減しました。" }) });
  assert.equal(answer.analysis.needsDeepDive, true);
  const next = await request(`/interview-sessions/${session.id}/next-question`, { method: "POST", body: "{}" });
  assert.equal(next.question.type, "deep_dive");
  await request(`/interview-sessions/${session.id}/finish`, { method: "POST", body: "{}" });
  const { job } = await request(`/interview-sessions/${session.id}/feedback`, { method: "POST", body: "{}" });
  assert.equal(job.status, "succeeded");
  const result = await request(`/interview-sessions/${session.id}/feedback`);
  assert.equal(result.feedbackStatus, "succeeded");
  assert.ok(result.feedback.summary);
}));

test("未許可Originと不正入力を拒否する", () => withServer(async base => {
  const forbidden = await fetch(`${base}/auth/logout`, { method: "POST", headers: { origin: "https://evil.example" } });
  assert.equal(forbidden.status, 403);

  const loginResponse = await fetch(`${base}/auth/google/start`);
  const cookie = loginResponse.headers.get("set-cookie").split(";")[0];
  const invalid = await fetch(`${base}/profile`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ fullName: "", education: "" })
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, "VALIDATION_ERROR");
}));
