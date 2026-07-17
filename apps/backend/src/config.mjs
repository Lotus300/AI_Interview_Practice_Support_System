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
  },
  speech: {
    location: process.env.SPEECH_LOCATION || "asia-northeast1",
    recognizer: process.env.SPEECH_RECOGNIZER || "_",
    model: process.env.SPEECH_MODEL || "chirp_3",
    languageCode: process.env.SPEECH_LANGUAGE_CODE || "ja-JP",
    timeoutMs: Number(process.env.SPEECH_TIMEOUT_MS || 30000),
    maxAudioBytes: Number(process.env.SPEECH_MAX_AUDIO_BYTES || 10000000)
  },
  vertexAi: {
    location: process.env.VERTEX_AI_LOCATION || "asia-northeast1",
    model: process.env.VERTEX_AI_MODEL || "gemini-2.5-flash",
    timeoutMs: Number(process.env.VERTEX_AI_TIMEOUT_MS || 60000)
  },
  feedbackTasks: {
    enabled: process.env.FEEDBACK_TASKS_ENABLED === "true",
    location: process.env.FEEDBACK_TASKS_LOCATION || process.env.GCP_REGION || "asia-northeast1",
    queue: process.env.FEEDBACK_TASKS_QUEUE || "feedback-generation",
    serviceUrl: process.env.FEEDBACK_TASKS_SERVICE_URL || process.env.APP_ORIGIN || "",
    serviceAccountEmail: process.env.FEEDBACK_TASKS_SERVICE_ACCOUNT || ""
  },
  voicevox: {
    baseUrl: process.env.VOICEVOX_BASE_URL || "",
    authMode: process.env.VOICEVOX_AUTH_MODE || "none",
    defaultSpeakerId: Number(process.env.VOICEVOX_DEFAULT_SPEAKER_ID || 13),
    timeoutMs: Number(process.env.VOICEVOX_TIMEOUT_MS || 60000),
    outputSamplingRate: Number(process.env.VOICEVOX_OUTPUT_SAMPLING_RATE || 16000),
    cacheTtlMs: Number(process.env.VOICEVOX_CACHE_TTL_MS || 120000),
    maxCacheEntries: Number(process.env.VOICEVOX_MAX_CACHE_ENTRIES || 20),
    previewCacheTtlMs: Number(process.env.VOICEVOX_PREVIEW_CACHE_TTL_MS || 3600000),
    previewCacheMaxEntries: Number(process.env.VOICEVOX_PREVIEW_CACHE_MAX_ENTRIES || 20)
  }
};

export function isGoogleOAuthConfigured() {
  return Boolean(
    config.googleOAuth.clientId &&
      config.googleOAuth.clientSecret &&
      config.googleOAuth.redirectUri
  );
}
