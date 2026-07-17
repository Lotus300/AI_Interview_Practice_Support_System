import { getDataStore } from "../store.mjs";
import { isHistoryExpired } from "../features/interviews/retention.mjs";

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    profileCompleted: user.profileCompleted
  };
}

export async function findOwnedSession(sessionId, userId) {
  const store = await getDataStore();
  const session = await store.getSession(sessionId);
  if (!session || session.deletedAt) return { error: [404, "NOT_FOUND", "Interview session not found"] };
  if (session.userId !== userId) return { error: [403, "FORBIDDEN", "Interview session does not belong to user"] };
  if (isHistoryExpired(session)) {
    await store.deleteSessionData(sessionId);
    return { error: [404, "HISTORY_EXPIRED", "保存期間を過ぎた練習履歴です"] };
  }
  return { session };
}

export function sendResourceError(res, sendJson, error) {
  return sendJson(res, error[0], { code: error[1], message: error[2] });
}
