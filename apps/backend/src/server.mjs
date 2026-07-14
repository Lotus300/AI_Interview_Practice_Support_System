import http from "node:http";
import { fileURLToPath } from "node:url";
import { config } from "./config.mjs";
import { parseCookies, sendJson } from "./http.mjs";
import { findUserBySession, nowIso } from "./store.mjs";
import { createRouter } from "./core/router.mjs";
import { toErrorResponse } from "./core/errors.mjs";
import { registerAuthRoutes } from "./features/auth/routes.mjs";
import { registerProfileRoutes } from "./features/profile/routes.mjs";
import { registerSettingsRoutes } from "./features/settings/routes.mjs";
import { registerInterviewRoutes } from "./features/interviews/routes.mjs";
import { registerMediaRoutes } from "./features/media/routes.mjs";
import { registerFeedbackRoutes } from "./features/feedback/routes.mjs";
import { createStaticFileHandler } from "./core/static-files.mjs";

const serveStatic = createStaticFileHandler();

export function buildRouter() {
  const router = createRouter();
  router.add("GET", "/api/v1/health", async (_req, res) => {
    sendJson(res, 200, { status: "ok", service: "interview-backend-api", time: nowIso() });
  }, { auth: false });
  registerAuthRoutes(router);
  registerProfileRoutes(router);
  registerSettingsRoutes(router);
  registerInterviewRoutes(router);
  registerMediaRoutes(router);
  registerFeedbackRoutes(router);
  return router;
}

function requestOrigin(req) {
  const protocol = String(req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http"))
    .split(",", 1)[0]
    .trim();
  return req.headers.host ? `${protocol}://${req.headers.host}` : null;
}

function isAllowedOrigin(req, origin) {
  return !origin || origin === config.appOrigin || origin === requestOrigin(req);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(req, origin)) res.setHeader("access-control-allow-origin", origin);
  res.setHeader("access-control-allow-credentials", "true");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  return origin;
}

function rejectOrigin(req, origin) {
  return ["POST", "PUT", "DELETE", "OPTIONS"].includes(req.method) && !isAllowedOrigin(req, origin);
}

export function createServer({ router = buildRouter() } = {}) {
  return http.createServer(async (req, res) => {
    try {
      const origin = applyCors(req, res);
      if (rejectOrigin(req, origin)) return sendJson(res, 403, { code: "FORBIDDEN_ORIGIN", message: "Origin is not allowed" });
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
      }

      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const matched = router.match(req.method, url.pathname);
      if (!matched) {
        if (!url.pathname.startsWith("/api/") && await serveStatic(req, res, url.pathname)) return;
        return router.notFound(res);
      }

      const cookies = parseCookies(req.headers.cookie);
      const user = matched.entry.auth ? findUserBySession(cookies[config.sessionCookieName]) : null;
      if (matched.entry.auth && !user) return sendJson(res, 401, { code: "UNAUTHORIZED", message: "Login required" });
      await matched.entry.handler(req, res, { user }, matched.params);
    } catch (error) {
      const response = toErrorResponse(error);
      if (!res.headersSent) sendJson(res, response.statusCode, response.body);
    }
  });
}

export function startServer(port = config.port) {
  const server = createServer();
  server.listen(port, () => console.log(`interview-backend-api listening on http://localhost:${port}`));
  return server;
}

const isEntryPoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntryPoint) startServer();
