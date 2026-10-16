const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 8795);
const allowed = new Set([
  "index.html",
  "src/app.js",
  "src/engine.js",
  "src/styles.css",
  "docs/METHODOLOGY.md",
  "README.md",
  "LICENSE",
]);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};
const server = http.createServer(async (request, response) => {
  let name;
  try {
    name =
      decodeURIComponent(new URL(request.url, "http://localhost").pathname)
        .replace(/^\/LLM-calculator(?=\/|$)/, "")
        .replace(/^\/+/, "") || "index.html";
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  if (!allowed.has(name)) {
    response.writeHead(404).end("Not found");
    return;
  }
  try {
    const body = await fs.readFile(path.join(root, name));
    response.writeHead(200, {
      "Content-Type": types[path.extname(name)] || "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Local: http://127.0.0.1:${port}/LLM-calculator/`),
);
