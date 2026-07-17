import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.mjs";
import { createSpeechClient } from "../src/features/media/speech-client.mjs";
import { createVertexClient } from "../src/features/interviews/vertex-client.mjs";
import { createCloudTasksDispatcher } from "../src/features/feedback/dispatcher.mjs";
import { createTaskAuthorizer } from "../src/features/feedback/task-auth.mjs";

test("Speech-to-Text V2へ音声とChirp 3設定を送る", async () => {
  let request;
  const client = createSpeechClient({
    settings: { location: "asia-northeast1", recognizer: "_", model: "chirp_3", languageCode: "ja-JP", timeoutMs: 1000 },
    googleApi: { async request(url, options) { request = { url, options }; return { results: [{ alternatives: [{ transcript: "回答です。", confidence: 0.9 }] }] }; } }
  });
  const result = await client.recognize(Buffer.from("audio"), "audio/webm");
  assert.match(request.url, /speech\.googleapis\.com\/v2\/projects\//);
  assert.equal(request.options.body.config.model, "chirp_3");
  assert.equal(request.options.body.config.languageCodes[0], "ja-JP");
  assert.equal(result.transcript, "回答です。");
});

test("Vertex AI GeminiのStructured OutputをJSONとして取得する", async () => {
  let request;
  const client = createVertexClient({
    settings: { location: "asia-northeast1", model: "gemini-test", timeoutMs: 1000 },
    googleApi: { async request(url, options) { request = { url, options }; return { candidates: [{ content: { parts: [{ text: '{"text":"質問です","type":"normal"}' }] } }] }; } }
  });
  const result = await client.generateJson({ systemInstruction: "system", prompt: "prompt", responseSchema: { type: "OBJECT" } });
  assert.match(request.url, /aiplatform\.googleapis\.com/);
  assert.equal(request.options.body.generationConfig.responseMimeType, "application/json");
  assert.equal(result.text, "質問です");
});

test("Geminiの空応答を一度だけ再試行し終了理由を記録する", async () => {
  let calls = 0;
  const warnings = [];
  const client = createVertexClient({
    settings: { location: "asia-northeast1", model: "gemini-test", timeoutMs: 1000 },
    logger: { warn(message, details) { warnings.push({ message, details }); } },
    googleApi: {
      async request() {
        calls += 1;
        if (calls === 1) return { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }] };
        return { candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"text":"再試行成功","type":"normal"}' }] } }] };
      }
    }
  });

  const result = await client.generateJson({ systemInstruction: "system", prompt: "long prompt", responseSchema: { type: "OBJECT" } });

  assert.equal(calls, 2);
  assert.equal(result.text, "再試行成功");
  assert.equal(warnings[0].details.finishReason, "MAX_TOKENS");
  assert.equal(warnings[0].details.inputLength, 11);
});

test("Cloud TasksへOIDC付きフィードバックジョブを登録する", async () => {
  const originalProject = config.gcpProjectId;
  config.gcpProjectId = "project-test";
  let request;
  let warmedUp = false;
  try {
    const dispatcher = createCloudTasksDispatcher({
      settings: { enabled: true, location: "asia-northeast1", queue: "feedback-generation", serviceUrl: "https://service.example", serviceAccountEmail: "tasks@example.iam.gserviceaccount.com" },
      logger: { info() {}, warn() {} },
      googleApi: {
        async warmup() { warmedUp = true; },
        async request(url, options) { assert.equal(warmedUp, true); request = { url, options }; return { name: "task-name" }; }
      }
    });
    const result = await dispatcher.enqueue({ id: "job_test" });
    assert.match(request.url, /cloudtasks\.googleapis\.com/);
    assert.equal(request.options.body.task.httpRequest.oidcToken.audience, "https://service.example");
    assert.equal(result.pollingUrl, "/api/v1/jobs/job_test");
    assert.equal(typeof result.registrationMs, "number");
  } finally {
    config.gcpProjectId = originalProject;
  }
});

test("Cloud Tasks OIDCのemailが一致する場合だけ内部実行を許可する", async () => {
  const authorizer = createTaskAuthorizer({
    settings: { serviceUrl: "https://service.example", serviceAccountEmail: "tasks@example.iam.gserviceaccount.com" },
    client: { async verifyIdToken({ audience }) { assert.equal(audience, "https://service.example"); return { getPayload: () => ({ email: "tasks@example.iam.gserviceaccount.com", email_verified: true }) }; } }
  });
  await authorizer.verify({ headers: { authorization: "Bearer token" } });
  await assert.rejects(() => createTaskAuthorizer({
    settings: { serviceUrl: "https://service.example", serviceAccountEmail: "tasks@example.iam.gserviceaccount.com" },
    client: { async verifyIdToken() { return { getPayload: () => ({ email: "other@example.com" }) }; } }
  }).verify({ headers: { authorization: "Bearer token" } }), /許可されていません/);
});
