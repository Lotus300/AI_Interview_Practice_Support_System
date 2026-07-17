import test from "node:test";
import assert from "node:assert/strict";
import { buildRouter, createServer } from "../src/server.mjs";
import { resetDb } from "../src/store.mjs";
import { createDeterministicInterviewAiService } from "../src/features/interviews/service.mjs";
import { createFeedback, finishFeedbackJob } from "../src/features/feedback/service.mjs";

test("無回答で終了した面接は評価不能フィードバックを返す", async () => {
  resetDb();
  let queuedJobId;
  const dispatcher = { async enqueue(job) { queuedJobId = job.id; return { pollingUrl: `/api/v1/jobs/${job.id}` }; } };
  const server = createServer({ router: buildRouter({ aiService: createDeterministicInterviewAiService(), feedbackDispatcher: dispatcher }) });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    const loginResponse = await fetch(`${base}/auth/google/start`);
    const cookie = loginResponse.headers.get("set-cookie").split(";")[0];
    const request = async (path, options = {}) => {
      const response = await fetch(`${base}${path}`, {
        ...options,
        headers: { cookie, ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) }
      });
      assert.ok(response.ok, `${options.method || "GET"} ${path}: ${response.status}`);
      return response.status === 204 ? null : response.json();
    };

    const { session } = await request("/interview-sessions", {
      method: "POST",
      body: JSON.stringify({ jobRole: "Webエンジニア", industry: "IT", questionCount: 3 })
    });
    await request(`/interview-sessions/${session.id}/initial-question`, { method: "POST", body: "{}" });
    await request(`/interview-sessions/${session.id}/finish`, { method: "POST", body: "{}" });
    const { job } = await request(`/interview-sessions/${session.id}/feedback`, { method: "POST", body: "{}" });
    assert.equal(queuedJobId, job.id);
    await finishFeedbackJob(job.id, { generateFeedback: async current => createFeedback(current) });
    const result = await request(`/interview-sessions/${session.id}/feedback`);

    assert.equal(result.feedback.assessmentStatus, "not_assessable");
    assert.equal(result.feedback.evaluatedAnswerCount, 0);
    assert.deepEqual(result.feedback.goodPoints, []);
    assert.deepEqual(result.feedback.evidence, []);
    assert.match(result.feedback.summary, /評価はできません/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
