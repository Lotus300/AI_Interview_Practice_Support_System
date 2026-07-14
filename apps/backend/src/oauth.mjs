import crypto from "node:crypto";
import { config } from "./config.mjs";

const googleAuthEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenEndpoint = "https://oauth2.googleapis.com/token";

export function createOAuthState() {
  return crypto.randomBytes(24).toString("base64url");
}

export function buildGoogleAuthUrl(state) {
  const url = new URL(googleAuthEndpoint);
  url.searchParams.set("client_id", config.googleOAuth.clientId);
  url.searchParams.set("redirect_uri", config.googleOAuth.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function exchangeGoogleCode(code) {
  const body = new URLSearchParams({
    code,
    client_id: config.googleOAuth.clientId,
    client_secret: config.googleOAuth.clientSecret,
    redirect_uri: config.googleOAuth.redirectUri,
    grant_type: "authorization_code"
  });

  const response = await fetch(googleTokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error("Google OAuth token exchange failed");
  }

  return response.json();
}

export async function verifyGoogleIdToken(idToken) {
  if (!idToken) throw new Error("Google OAuth id token is missing");
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) throw new Error("Google OAuth id token verification failed");
  const payload = await response.json();
  if (payload.aud !== config.googleOAuth.clientId) {
    throw new Error("Google OAuth audience mismatch");
  }
  if (!["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) {
    throw new Error("Google OAuth issuer mismatch");
  }
  if (Number(payload.exp) * 1000 < Date.now()) {
    throw new Error("Google OAuth id token expired");
  }
  if (!payload.sub) {
    throw new Error("Google OAuth subject is missing");
  }
  return {
    googleSub: payload.sub,
    email: payload.email || "",
    name: payload.name || payload.email || "Google User",
    picture: payload.picture || ""
  };
}
