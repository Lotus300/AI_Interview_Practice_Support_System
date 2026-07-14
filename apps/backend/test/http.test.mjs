import test from "node:test";
import assert from "node:assert/strict";
import { parseCookies, route } from "../src/http.mjs";

test("Cookie文字列を安全に解析する", () => {
  assert.deepEqual(parseCookies("interview_session=abc%20123; theme=light"), {
    interview_session: "abc 123",
    theme: "light"
  });
  assert.deepEqual(parseCookies("malformed"), { malformed: "" });
});

test("動的ルートのパラメータを抽出する", () => {
  assert.deepEqual(
    route("GET", "/api/v1/interview-sessions/ses_1", { method: "GET", path: "/api/v1/interview-sessions/:sessionId" }),
    { sessionId: "ses_1" }
  );
  assert.equal(route("POST", "/api/v1/interview-sessions/ses_1", { method: "GET", path: "/api/v1/interview-sessions/:sessionId" }), null);
});
