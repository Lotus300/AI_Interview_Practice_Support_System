import { URL } from "node:url";
import { config, isGoogleOAuthConfigured } from "../../config.mjs";
import { buildGoogleAuthUrl, createOAuthNonce, createOAuthState, exchangeGoogleCode, verifyGoogleIdToken } from "../../oauth.mjs";
import { clearOAuthStateCookie, clearSessionCookie, parseCookies, sendJson, sendNoContent, setOAuthStateCookie, setSessionCookie } from "../../http.mjs";
import { consumeOAuthState, createSessionForUser, ensureDemoUser, findOrCreateGoogleUser, revokeSession, saveOAuthState } from "../../store.mjs";
import { publicUser } from "../../core/resources.mjs";

function redirect(res, location, setCookie) {
  const headers = { location };
  if (setCookie) headers["set-cookie"] = setCookie;
  res.writeHead(302, headers);
  res.end();
}

export function registerAuthRoutes(router) {
  router.add("GET", "/api/v1/auth/google/start", async (_req, res) => {
    if (isGoogleOAuthConfigured()) {
      const state = createOAuthState();
      const nonce = createOAuthNonce();
      await saveOAuthState(state, nonce);
      return sendJson(res, 200, { mode: "google_oauth", authUrl: buildGoogleAuthUrl(state, nonce) }, { "set-cookie": setOAuthStateCookie(state) });
    }

    if (!config.allowDemoAuth) {
      return sendJson(res, 503, { code: "OAUTH_NOT_CONFIGURED", message: "Google OAuth is not configured" });
    }

    const user = await ensureDemoUser();
    const sessionId = await createSessionForUser(user.id);
    sendJson(res, 200, { mode: "demo_oauth", message: "Demo OAuth completed.", user: publicUser(user) }, { "set-cookie": setSessionCookie(sessionId) });
  }, { auth: false });

  router.add("GET", "/api/v1/auth/google/callback", async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cookies = parseCookies(req.headers.cookie);
    const oauthState = code && state && state === cookies[config.oauthStateCookieName]
      ? await consumeOAuthState(state)
      : null;
    if (!oauthState) {
      return redirect(res, `${config.appOrigin}/?auth=failed`, clearOAuthStateCookie());
    }

    try {
      const token = await exchangeGoogleCode(code);
      const profile = await verifyGoogleIdToken(token.id_token, oauthState.nonce);
      const user = await findOrCreateGoogleUser(profile);
      redirect(res, config.appOrigin, [setSessionCookie(await createSessionForUser(user.id)), clearOAuthStateCookie()]);
    } catch {
      redirect(res, `${config.appOrigin}/?auth=failed`, clearOAuthStateCookie());
    }
  }, { auth: false });

  router.add("GET", "/api/v1/auth/me", async (_req, res, ctx) => sendJson(res, 200, { user: publicUser(ctx.user) }));

  router.add("POST", "/api/v1/auth/logout", async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    await revokeSession(cookies[config.sessionCookieName]);
    sendNoContent(res, { "set-cookie": clearSessionCookie() });
  });
}
