import test from "node:test";
import assert from "node:assert/strict";
import { buildGoogleAuthUrl, createOAuthNonce, createOAuthState } from "../src/oauth.mjs";

test("Google認可URLにstateとnonceを設定する", () => {
  const state = createOAuthState();
  const nonce = createOAuthNonce();
  const url = new URL(buildGoogleAuthUrl(state, nonce));
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("state"), state);
  assert.equal(url.searchParams.get("nonce"), nonce);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.ok(state.length >= 32);
  assert.ok(nonce.length >= 32);
  assert.notEqual(state, nonce);
});
