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

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
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
