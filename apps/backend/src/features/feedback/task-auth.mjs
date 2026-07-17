import { OAuth2Client } from "google-auth-library";
import { ApiError } from "../../core/errors.mjs";
import { config } from "../../config.mjs";

export function createTaskAuthorizer({ client = new OAuth2Client(), settings = config.feedbackTasks } = {}) {
  return {
    async verify(req) {
      const token = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ""))?.[1];
      if (!token || !settings.serviceUrl || !settings.serviceAccountEmail) throw new ApiError(401, "UNAUTHORIZED_TASK", "Cloud Tasks認証が必要です");
      const ticket = await client.verifyIdToken({ idToken: token, audience: settings.serviceUrl.replace(/\/$/, "") });
      const payload = ticket.getPayload();
      if (payload?.email !== settings.serviceAccountEmail || payload.email_verified === false) throw new ApiError(403, "FORBIDDEN_TASK", "Cloud Tasks実行元が許可されていません");
      return payload;
    }
  };
}
