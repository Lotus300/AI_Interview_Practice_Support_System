export const config = {
  port: Number(process.env.PORT || 8080),
  appOrigin: process.env.APP_ORIGIN || "http://localhost:5173",
  sessionCookieName: process.env.SESSION_COOKIE_NAME || "interview_session",
  oauthStateCookieName: process.env.OAUTH_STATE_COOKIE_NAME || "interview_oauth_state",
  sessionSecret: process.env.SESSION_SECRET || "local-dev-session-secret",
  dataStore: process.env.DATA_STORE || "memory",
  gcpProjectId: process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "",
  firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || "(default)",
  secureCookies: process.env.NODE_ENV === "production",
  allowDemoAuth: process.env.ALLOW_DEMO_AUTH === "true" || process.env.NODE_ENV !== "production",
  googleOAuth: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:8080/api/v1/auth/google/callback"
  }
};

export function isGoogleOAuthConfigured() {
  return Boolean(
    config.googleOAuth.clientId &&
      config.googleOAuth.clientSecret &&
      config.googleOAuth.redirectUri
  );
}
