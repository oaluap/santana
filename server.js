import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 5173);
const ROOT = process.cwd();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function safePath(urlPath) {
  const cleaned = urlPath.split("?")[0].split("#")[0];
  const decoded = decodeURIComponent(cleaned);
  const norm = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  return join(ROOT, norm);
}

http
  .createServer((req, res) => {
    const url = req.url || "/";
    const path = url === "/" ? join(ROOT, "index.html") : safePath(url);
    try {
      const st = statSync(path);
      if (!st.isFile()) throw new Error("not file");
      const ext = extname(path).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      createReadStream(path).pipe(res);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(PORT, () => {
    console.log(`Servidor: http://localhost:${PORT}`);
  });

