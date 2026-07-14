import { route, sendJson } from "../http.mjs";

export function createRouter() {
  const routes = [];

  return {
    add(method, path, handler, { auth = true } = {}) {
      routes.push({ method, path, handler, auth });
    },

    match(method, pathname) {
      return routes
        .map((entry) => ({ entry, params: route(method, pathname, entry) }))
        .find((candidate) => candidate.params) ?? null;
    },

    notFound(res) {
      sendJson(res, 404, { code: "NOT_FOUND", message: "Route not found" });
    },

    get size() {
      return routes.length;
    }
  };
}
