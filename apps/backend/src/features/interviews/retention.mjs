export const HISTORY_RETENTION_DAYS = 30;
export const HISTORY_RETENTION_MS = HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const HISTORY_PAGE_SIZE = 20;

export function historyCutoff(now = Date.now()) {
  return new Date(now - HISTORY_RETENTION_MS).toISOString();
}

export function historyExpiresAt(createdAt) {
  return new Date(Date.parse(createdAt) + HISTORY_RETENTION_MS).toISOString();
}

export function isHistoryExpired(session, now = Date.now()) {
  const expiresAt = session?.expiresAt || (session?.createdAt ? historyExpiresAt(session.createdAt) : null);
  return !expiresAt || Date.parse(expiresAt) <= now;
}
