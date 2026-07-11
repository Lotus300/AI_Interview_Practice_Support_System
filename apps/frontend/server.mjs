import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.FRONTEND_PORT || 5173);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

http.createServer((req, res) => {
  const urlPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  const filePath = path.join(root, urlPath === "/" ? "index.html" : urlPath);
  const safePath = filePath.startsWith(root) ? filePath : path.join(root, "index.html");
  fs.readFile(safePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": contentTypes[path.extname(safePath)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(port, () => {
  console.log(`interview-frontend listening on http://localhost:${port}`);
});
