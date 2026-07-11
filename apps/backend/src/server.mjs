import http from "node:http";
import { URL } from "node:url";
import { config, isGoogleOAuthConfigured } from "./config.mjs";
import { buildGoogleAuthUrl, createOAuthState, exchangeGoogleCode, verifyGoogleIdToken } from "./oauth.mjs";
import { analyzeAnswer, appendUtterance, createInitialQuestion, createNextQuestion, finishFeedbackJob } from "./services.mjs";
import {
  clearOAuthStateCookie,
  clearSessionCookie,
  parseCookies,
  readJson,
  route,
  sendJson,
  sendNoContent,
  setOAuthStateCookie,
  setSessionCookie
} from "./http.mjs";
import {
  consumeOAuthState,
  createId,
  createSessionForUser,
  db,
  ensureDemoUser,
  findOrCreateGoogleUser,
  findUserBySession,
  nowIso,
  revokeSession,
  saveOAuthState,
  seedInterviewSession
} from "./store.mjs";
import { feedbackStatuses, sessionStatuses } from "../../../packages/shared/src/constants.mjs";

const routes = [];

function add(method, path, handler, auth = true) {
  routes.push({ method, path, handler, auth });
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    profileCompleted: user.profileCompleted
  };
}

function requireSessionForUser(sessionId, userId) {
  const session = db.sessions.get(sessionId);
  if (!session || session.deletedAt) return { error: [404, "NOT_FOUND", "Interview session not found"] };
  if (session.userId !== userId) return { error: [403, "FORBIDDEN", "Interview session does not belong to user"] };
  return { session };
}

function redirect(res, location, setCookie) {
  const headers = { location };
  if (setCookie) headers["set-cookie"] = setCookie;
  res.writeHead(302, headers);
  res.end();
}

add("GET", "/api/v1/health", async (_req, res) => {
  sendJson(res, 200, { status: "ok", service: "interview-backend-api", time: nowIso() });
}, false);

add("GET", "/api/v1/auth/google/start", async (_req, res) => {
  if (isGoogleOAuthConfigured()) {
    const state = createOAuthState();
    saveOAuthState(state);
    sendJson(
      res,
      200,
      { mode: "google_oauth", authUrl: buildGoogleAuthUrl(state) },
      { "set-cookie": setOAuthStateCookie(state) }
    );
    return;
  }

  const user = ensureDemoUser();
  const sessionId = createSessionForUser(user.id);
  sendJson(
    res,
    200,
    {
      mode: "demo_oauth",
      message: "Demo OAuth completed. Set Google OAuth env vars to use real OAuth.",
      user: publicUser(user)
    },
    { "set-cookie": setSessionCookie(sessionId) }
  );
}, false);

add("GET", "/api/v1/auth/google/callback", async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookies(req.headers.cookie);

  if (!code || !state || state !== cookies.interview_oauth_state || !consumeOAuthState(state)) {
    redirect(res, `${config.appOrigin}/?auth=failed`, clearOAuthStateCookie());
    return;
  }

  try {
    const token = await exchangeGoogleCode(code);
    const googleProfile = verifyGoogleIdToken(token.id_token);
    const user = findOrCreateGoogleUser(googleProfile);
    const sessionId = createSessionForUser(user.id);
    redirect(res, config.appOrigin, [setSessionCookie(sessionId), clearOAuthStateCookie()]);
  } catch {
    redirect(res, `${config.appOrigin}/?auth=failed`, clearOAuthStateCookie());
  }
}, false);

add("GET", "/api/v1/auth/me", async (_req, res, ctx) => {
  sendJson(res, 200, { user: publicUser(ctx.user) });
});

add("POST", "/api/v1/auth/logout", async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  revokeSession(cookies.interview_session);
  sendNoContent(res, { "set-cookie": clearSessionCookie() });
});

add("GET", "/api/v1/profile", async (_req, res, ctx) => {
  sendJson(res, 200, { profile: db.profiles.get(ctx.user.id) ?? null });
});

add("PUT", "/api/v1/profile", async (req, res, ctx) => {
  const body = await readJson(req);
  const profile = {
    userId: ctx.user.id,
    fullName: body.fullName ?? "",
    education: body.education ?? "",
    faculty: body.faculty ?? "",
    graduationStatus: body.graduationStatus ?? "",
    workHistory: body.workHistory ?? "",
    desiredRole: body.desiredRole ?? "",
    selfPr: body.selfPr ?? "",
    updatedAt: nowIso()
  };
  db.profiles.set(ctx.user.id, profile);
  ctx.user.profileCompleted = true;
  ctx.user.updatedAt = nowIso();
  sendJson(res, 200, { profile, user: publicUser(ctx.user) });
});

add("GET", "/api/v1/settings", async (_req, res, ctx) => {
  sendJson(res, 200, { settings: db.settings.get(ctx.user.id) });
});

add("PUT", "/api/v1/settings", async (req, res, ctx) => {
  const body = await readJson(req);
  const settings = {
    speaker: body.speaker ?? "青山龍星",
    speedScale: Number(body.speedScale ?? 1),
    volumeScale: Number(body.volumeScale ?? 1),
    updatedAt: nowIso()
  };
  db.settings.set(ctx.user.id, settings);
  sendJson(res, 200, { settings });
});

add("GET", "/api/v1/interview-sessions", async (_req, res, ctx) => {
  const sessions = [...db.sessions.values()]
    .filter((session) => session.userId === ctx.user.id && !session.deletedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  sendJson(res, 200, { sessions });
});

add("POST", "/api/v1/interview-sessions", async (req, res, ctx) => {
  const body = await readJson(req);
  const session = seedInterviewSession(ctx.user.id, {
    interviewType: body.interviewType ?? "転職活動",
    jobRole: body.jobRole ?? "Webエンジニア",
    industry: body.industry ?? "IT",
    companyName: body.companyName ?? "",
    theme: body.theme ?? "総合面接",
    questionCount: Number(body.questionCount ?? 10)
  });
  sendJson(res, 201, { session });
});

add("GET", "/api/v1/interview-sessions/:sessionId", async (_req, res, ctx, params) => {
  const found = requireSessionForUser(params.sessionId, ctx.user.id);
  if (found.error) return sendJson(res, found.error[0], { code: found.error[1], message: found.error[2] });
  sendJson(res, 200, { session: found.session });
});

add("POST", "/api/v1/interview-sessions/:sessionId/initial-question", async (_req, res, ctx, params) => {
  const found = requireSessionForUser(params.sessionId, ctx.user.id);
  if (found.error) return sendJson(res, found.error[0], { code: found.error[1], message: found.error[2] });
  const profile = db.profiles.get(ctx.user.id);
  const question = createInitialQuestion(profile, found.session);
  found.session.questions.push(question);
  appendUtterance(found.session, "ai", question.text, question.type);
  found.session.status = sessionStatuses.WAITING_ANSWER;
  found.session.updatedAt = nowIso();
  sendJson(res, 200, { question, sessionStatus: found.session.status });
});

add("POST", "/api/v1/speech/recognize", async (req, res) => {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data") && !contentType.includes("application/json")) {
    return sendJson(res, 400, { code: "VALIDATION_ERROR", message: "multipart/form-data or json is required" });
  }
  sendJson(res, 200, {
    speechInputStatus: "recognized",
    transcript: "私は前職で問い合わせ対応の集計を自動化し、月6時間の作業削減につなげました。",
    confidence: 0.91,
    alternatives: []
  });
});

add("POST", "/api/v1/voice/synthesize", async (req, res) => {
  const body = await readJson(req);
  sendJson(res, 200, {
    aiResponseStatus: "text_only",
    text: body.text ?? "",
    voice: null,
    reason: "VOICEVOX_BASE_URL is not connected in local MVP mock."
  });
});

add("POST", "/api/v1/interview-sessions/:sessionId/answers", async (req, res, ctx, params) => {
  const found = requireSessionForUser(params.sessionId, ctx.user.id);
  if (found.error) return sendJson(res, found.error[0], { code: found.error[1], message: found.error[2] });
  const body = await readJson(req);
  const text = body.answerText ?? body.transcript ?? "";
  const analysis = analyzeAnswer(db.profiles.get(ctx.user.id), found.session, text);
  const answer = {
    id: createId("ans"),
    questionId: body.questionId ?? found.session.questions.at(-1)?.id,
    text,
    inputType: body.inputType ?? "speech",
    speechTranscriptConfidence: body.confidence ?? null,
    analysis,
    createdAt: nowIso()
  };
  found.session.answers.push(answer);
  appendUtterance(found.session, "user", text, "answer");
  found.session.status = sessionStatuses.ANSWER_ANALYZING;
  found.session.updatedAt = nowIso();
  sendJson(res, 200, { answer, analysis, sessionStatus: found.session.status });
});

add("POST", "/api/v1/interview-sessions/:sessionId/next-question", async (_req, res, ctx, params) => {
  const found = requireSessionForUser(params.sessionId, ctx.user.id);
  if (found.error) return sendJson(res, found.error[0], { code: found.error[1], message: found.error[2] });
  const question = createNextQuestion(found.session.answers.at(-1)?.analysis, found.session);
  found.session.questions.push(question);
  appendUtterance(found.session, "ai", question.text, question.type);
  found.session.status = sessionStatuses.WAITING_ANSWER;
  found.session.updatedAt = nowIso();
  sendJson(res, 200, { question, sessionStatus: found.session.status });
});

add("POST", "/api/v1/interview-sessions/:sessionId/finish", async (_req, res, ctx, params) => {
  const found = requireSessionForUser(params.sessionId, ctx.user.id);
  if (found.error) return sendJson(res, found.error[0], { code: found.error[1], message: found.error[2] });
  found.session.status = sessionStatuses.FINISHED;
  found.session.finishedAt = nowIso();
  found.session.updatedAt = nowIso();
  sendJson(res, 200, { session: found.session });
});

add("POST", "/api/v1/interview-sessions/:sessionId/feedback", async (_req, res, ctx, params) => {
  const found = requireSessionForUser(params.sessionId, ctx.user.id);
  if (found.error) return sendJson(res, found.error[0], { code: found.error[1], message: found.error[2] });
  const job = {
    id: createId("job"),
    type: "feedback_generation",
    sessionId: found.session.id,
    userId: ctx.user.id,
    status: feedbackStatuses.QUEUED,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.jobs.set(job.id, job);
  found.session.feedbackStatus = feedbackStatuses.QUEUED;
  finishFeedbackJob(job.id);
  sendJson(res, 202, { job: db.jobs.get(job.id) });
});

add("GET", "/api/v1/interview-sessions/:sessionId/feedback", async (_req, res, ctx, params) => {
  const found = requireSessionForUser(params.sessionId, ctx.user.id);
  if (found.error) return sendJson(res, found.error[0], { code: found.error[1], message: found.error[2] });
  sendJson(res, 200, {
    feedbackStatus: found.session.feedbackStatus,
    feedback: db.feedbacks.get(found.session.id) ?? null
  });
});

const server = http.createServer(async (req, res) => {
  try {
    const origin = req.headers.origin || config.appOrigin;
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const matched = routes
      .map((entry) => ({ entry, params: route(req.method, url.pathname, entry) }))
      .find((candidate) => candidate.params);

    if (!matched) return sendJson(res, 404, { code: "NOT_FOUND", message: "Route not found" });

    const cookies = parseCookies(req.headers.cookie);
    const user = matched.entry.auth ? findUserBySession(cookies.interview_session) : null;
    if (matched.entry.auth && !user) {
      return sendJson(res, 401, { code: "UNAUTHORIZED", message: "Login required" });
    }
    await matched.entry.handler(req, res, { user }, matched.params);
  } catch (error) {
    sendJson(res, 500, { code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});

server.listen(config.port, () => {
  console.log(`interview-backend-api listening on http://localhost:${config.port}`);
});
