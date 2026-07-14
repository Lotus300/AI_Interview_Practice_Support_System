import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = fileURLToPath(new URL("../../../frontend/", import.meta.url));
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2"
};

function resolveInsideRoot(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decoded.includes("\0")) return null;
  const relativePath = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const filePath = path.resolve(root, relativePath);
  return filePath === root || filePath.startsWith(`${root}${path.sep}`) ? filePath : null;
}

async function loadFile(filePath) {
  try {
    return await readFile(filePath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") return null;
    throw error;
  }
}

export function createStaticFileHandler({ root = defaultRoot } = {}) {
  const resolvedRoot = path.resolve(root);
  const indexPath = path.join(resolvedRoot, "index.html");

  return async function serveStatic(req, res, pathname) {
    if (!['GET', 'HEAD'].includes(req.method)) return false;
    const requestedPath = resolveInsideRoot(resolvedRoot, pathname);
    if (!requestedPath) return false;

    let filePath = requestedPath;
    let body = await loadFile(filePath);
    if (!body && !path.extname(pathname)) {
      filePath = indexPath;
      body = await loadFile(filePath);
    }
    if (!body) return false;

    res.writeHead(200, {
      "cache-control": "no-cache",
      "content-type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "x-content-type-options": "nosniff"
    });
    res.end(req.method === "HEAD" ? undefined : body);
    return true;
  };
}
