import { ApiError } from "../../core/errors.mjs";
import { config } from "../../config.mjs";
import { createGoogleApiClient } from "../../core/google-api.mjs";

export function createCloudTasksDispatcher({ googleApi = createGoogleApiClient(), settings = config.feedbackTasks } = {}) {
  return {
    async enqueue(job) {
      if (!settings.enabled || !config.gcpProjectId || !settings.serviceUrl || !settings.serviceAccountEmail) {
        throw new ApiError(503, "FEEDBACK_QUEUE_NOT_CONFIGURED", "フィードバック非同期キューが設定されていません");
      }
      const parent = `projects/${config.gcpProjectId}/locations/${settings.location}/queues/${settings.queue}`;
      const url = `${settings.serviceUrl.replace(/\/$/, "")}/api/v1/internal/jobs/${encodeURIComponent(job.id)}/run`;
      const task = await googleApi.request(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {
        method: "POST",
        body: {
          task: {
            httpRequest: {
              httpMethod: "POST",
              url,
              headers: { "Content-Type": "application/json" },
              body: Buffer.from(JSON.stringify({ jobId: job.id })).toString("base64"),
              oidcToken: { serviceAccountEmail: settings.serviceAccountEmail, audience: settings.serviceUrl.replace(/\/$/, "") }
            }
          }
        }
      });
      return { name: task.name, pollingUrl: `/api/v1/jobs/${job.id}` };
    }
  };
}
