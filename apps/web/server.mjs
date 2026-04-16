import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const root = new URL("./src/", import.meta.url);
const port = Number(process.env.SOFTWARE_FACTORY_WEB_PORT || 4173);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const allowedProxyHosts = new Set(["127.0.0.1", "localhost", "::1"]);

function resolveProxyTarget(rawTarget) {
  const target = new URL(rawTarget);
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("Protocolo de proxy invalido.");
  }
  if (!allowedProxyHosts.has(target.hostname)) {
    throw new Error("Host de proxy nao permitido.");
  }
  return target;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (url.pathname.startsWith("/api-proxy/")) {
      const targetParam = url.searchParams.get("target");
      if (!targetParam) {
        response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Parametro 'target' obrigatorio." }, null, 2));
        return;
      }

      const target = resolveProxyTarget(targetParam);
      const upstreamPath = url.pathname.replace(/^\/api-proxy/, "") || "/";
      const upstreamUrl = new URL(upstreamPath, target);

      url.searchParams.forEach((value, key) => {
        if (key !== "target") {
          upstreamUrl.searchParams.set(key, value);
        }
      });

      const upstream = await fetch(upstreamUrl, {
        method: request.method || "GET",
        headers: {
          accept: request.headers.accept || "application/json",
          "content-type": request.headers["content-type"] || "application/json",
        },
      });

      const body = await upstream.arrayBuffer();
      response.writeHead(upstream.status, {
        "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(Buffer.from(body));
      return;
    }

    const fileName = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
    const filePath = new URL(fileName, root);
    const content = await fs.readFile(filePath);
    const ext = path.extname(fileName).toLowerCase();
    response.writeHead(200, { "content-type": contentTypes[ext] || "application/octet-stream" });
    response.end(content);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not Found");
  }
});

server.listen(port, () => {
  console.log(`software-factory-web running at http://127.0.0.1:${port}`);
});
