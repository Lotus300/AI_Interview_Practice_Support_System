import { getDataStore } from "../store.mjs";

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    profileCompleted: user.profileCompleted
  };
}

export async function findOwnedSession(sessionId, userId) {
  const session = await (await getDataStore()).getSession(sessionId);
  if (!session || session.deletedAt) return { error: [404, "NOT_FOUND", "Interview session not found"] };
  if (session.userId !== userId) return { error: [403, "FORBIDDEN", "Interview session does not belong to user"] };
  return { session };
}

export function sendResourceError(res, sendJson, error) {
  return sendJson(res, error[0], { code: error[1], message: error[2] });
}
