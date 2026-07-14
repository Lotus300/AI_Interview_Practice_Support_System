const localDevelopmentApi = globalThis.location?.hostname === "localhost" && globalThis.location?.port === "5173"
  ? "http://localhost:8080/api/v1"
  : "/api/v1";
const apiBase = globalThis.INTERVIEW_API_BASE || localDevelopmentApi;

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers["content-type"] = "application/json";
  const response = await fetch(`${apiBase}${path}`, { credentials: "include", ...options, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || response.statusText);
  }
  return response.status === 204 ? null : response.json();
}

export const interviewApi = {
  list: () => api("/interview-sessions"),
  get: (id) => api(`/interview-sessions/${id}`),
  create: (input) => api("/interview-sessions", { method: "POST", body: JSON.stringify(input) }),
  remove: (id) => api(`/interview-sessions/${id}`, { method: "DELETE" }),
  initialQuestion: (id) => api(`/interview-sessions/${id}/initial-question`, { method: "POST", body: "{}" }),
  submitAnswer: (id, input) => api(`/interview-sessions/${id}/answers`, { method: "POST", body: JSON.stringify(input) }),
  nextQuestion: (id) => api(`/interview-sessions/${id}/next-question`, { method: "POST", body: "{}" }),
  finish: (id) => api(`/interview-sessions/${id}/finish`, { method: "POST", body: "{}" }),
  startFeedback: (id) => api(`/interview-sessions/${id}/feedback`, { method: "POST", body: "{}" }),
  feedback: (id) => api(`/interview-sessions/${id}/feedback`)
};
