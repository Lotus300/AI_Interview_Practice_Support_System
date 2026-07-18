import test from "node:test";
import assert from "node:assert/strict";
import { buildRouter, createServer } from "../src/server.mjs";
import { resetDb } from "../src/store.mjs";
import { createDeterministicInterviewAiService } from "../src/features/interviews/service.mjs";
import { createFeedback, finishFeedbackJob } from "../src/features/feedback/service.mjs";

let queuedJobId;
const dispatcher = { async enqueue(job) { queuedJobId = job.id; return { pollingUrl: `/api/v1/jobs/${job.id}` }; } };

async function withServer(run) {
  resetDb();
  queuedJobId = null;
  const server = createServer({ router: buildRouter({ aiService: createDeterministicInterviewAiService(), feedbackDispatcher: dispatcher }) });
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

  await request("/profile", { method: "PUT", body: JSON.stringify({ fullName: "テスト 太郎", education: "テスト大学", graduationStatus: "卒業", desiredRole: "Webエンジニア" }) });
  const { session } = await request("/interview-sessions", { method: "POST", body: JSON.stringify({ jobRole: "Webエンジニア", industry: "IT", questionCount: 2 }) });
  const { question } = await request(`/interview-sessions/${session.id}/initial-question`, { method: "POST", body: "{}" });
  const answerInput = { questionId: question.id, answerText: "集計を自動化し、月6時間の作業を削減しました。", clientRequestId: "request_answer_1" };
  const answer = await request(`/interview-sessions/${session.id}/answers`, { method: "POST", body: JSON.stringify(answerInput) });
  const replay = await request(`/interview-sessions/${session.id}/answers`, { method: "POST", body: JSON.stringify(answerInput) });
  assert.equal(answer.analysis.needsDeepDive, true);
  assert.equal(answer.nextQuestion.type, "deep_dive");
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.answer.id, answer.answer.id);
  const next = await request(`/interview-sessions/${session.id}/next-question`, { method: "POST", body: "{}" });
  assert.equal(next.question.type, "deep_dive");
  await request(`/interview-sessions/${session.id}/finish`, { method: "POST", body: "{}" });
  const { job } = await request(`/interview-sessions/${session.id}/feedback`, { method: "POST", body: "{}" });
  assert.equal(job.status, "queued");
  assert.equal(queuedJobId, job.id);
  await finishFeedbackJob(job.id, { generateFeedback: async current => createFeedback(current) });
  assert.equal((await request(`/jobs/${job.id}`)).job.status, "succeeded");
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

  const invalidChoice = await fetch(`${base}/profile`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ fullName: "テスト 太郎", education: "テスト大学", graduationStatus: "その他" })
  });
  assert.equal(invalidChoice.status, 400);
  assert.equal((await invalidChoice.json()).code, "VALIDATION_ERROR");
}));

test("設定した質問数を超えて次の質問を生成しない", () => withServer(async base => {
  const loginResponse = await fetch(`${base}/auth/google/start`);
  const cookie = loginResponse.headers.get("set-cookie").split(";")[0];
  const request = async (path, options = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: { cookie, ...(options.body ? { "content-type": "application/json" } : {}) }
    });
    assert.ok(response.ok, `${options.method || "GET"} ${path}: ${response.status}`);
    return response.json();
  };

  const { session } = await request("/interview-sessions", {
    method: "POST",
    body: JSON.stringify({ jobRole: "Webエンジニア", industry: "IT", questionCount: 1 })
  });
  const { question } = await request(`/interview-sessions/${session.id}/initial-question`, { method: "POST", body: "{}" });
  const answerResult = await request(`/interview-sessions/${session.id}/answers`, {
    method: "POST",
    body: JSON.stringify({ questionId: question.id, answerText: "回答しました。" })
  });
  assert.equal(answerResult.limitReached, true);

  const next = await request(`/interview-sessions/${session.id}/next-question`, { method: "POST", body: "{}" });
  assert.equal(next.limitReached, true);
  assert.equal(next.question, null);

  const saved = await request(`/interview-sessions/${session.id}`);
  assert.equal(saved.session.questions.length, 1);
  assert.equal(saved.session.answers.length, 1);
}));

test("フロントエンドを配信しAPIの404はJSONで返す", () => withServer(async base => {
  const appOrigin = base.replace(/\/api\/v1$/, "");

  const indexResponse = await fetch(appOrigin);
  assert.equal(indexResponse.status, 200);
  assert.match(indexResponse.headers.get("content-type"), /^text\/html/);
  assert.match(await indexResponse.text(), /<div id="app"><\/div>/);

  const moduleResponse = await fetch(`${appOrigin}/src/app.mjs`);
  assert.equal(moduleResponse.status, 200);
  assert.match(moduleResponse.headers.get("content-type"), /^text\/javascript/);

  const apiNotFound = await fetch(`${base}/missing`);
  assert.equal(apiNotFound.status, 404);
  assert.equal((await apiNotFound.json()).code, "NOT_FOUND");

  const loginResponse = await fetch(`${base}/auth/google/start`);
  const cookie = loginResponse.headers.get("set-cookie").split(";")[0];
  const sameOriginLogout = await fetch(`${base}/auth/logout`, {
    method: "POST",
    headers: { cookie, origin: appOrigin }
  });
  assert.equal(sameOriginLogout.status, 204);
}));
