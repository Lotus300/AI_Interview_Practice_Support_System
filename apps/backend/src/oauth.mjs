import crypto from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { config } from "./config.mjs";

const googleAuthEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenEndpoint = "https://oauth2.googleapis.com/token";
const googleOAuthClient = new OAuth2Client(config.googleOAuth.clientId);

export function createOAuthState() {
  return crypto.randomBytes(24).toString("base64url");
}

export function createOAuthNonce() {
  return crypto.randomBytes(24).toString("base64url");
}

export function buildGoogleAuthUrl(state, nonce) {
  const url = new URL(googleAuthEndpoint);
  url.searchParams.set("client_id", config.googleOAuth.clientId);
  url.searchParams.set("redirect_uri", config.googleOAuth.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
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

export async function verifyGoogleIdToken(idToken, expectedNonce) {
  if (!idToken) throw new Error("Google OAuth id token is missing");
  const ticket = await googleOAuthClient.verifyIdToken({ idToken, audience: config.googleOAuth.clientId });
  const payload = ticket.getPayload();
  if (!payload) throw new Error("Google OAuth id token payload is missing");
  if (!expectedNonce || payload.nonce !== expectedNonce) throw new Error("Google OAuth nonce mismatch");
  if (!payload.sub) {
    throw new Error("Google OAuth subject is missing");
  }
  if (!payload.email || payload.email_verified !== true) {
    throw new Error("Google OAuth email is not verified");
  }
  return {
    googleSub: payload.sub,
    email: payload.email,
    name: payload.name || payload.email || "Google User",
    picture: payload.picture || ""
  };
}
