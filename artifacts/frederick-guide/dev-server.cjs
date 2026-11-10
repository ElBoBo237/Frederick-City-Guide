const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const apiHost = process.env.API_HOST || "127.0.0.1";
const apiPort = Number(process.env.API_PORT) || 8080;
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

http
  .createServer((req, res) => {
    const requestUrl = new URL(req.url || "/", "http://localhost");
    if (requestUrl.pathname === "/api" || requestUrl.pathname.startsWith("/api/")) {
      const proxy = http.request(
        {
          hostname: apiHost,
          port: apiPort,
          path: `${requestUrl.pathname}${requestUrl.search}`,
          method: req.method,
          headers: { ...req.headers, host: `${apiHost}:${apiPort}` },
        },
        (apiResponse) => {
          res.writeHead(apiResponse.statusCode || 502, apiResponse.headers);
          apiResponse.pipe(res);
        },
      );

      proxy.on("error", () => {
        if (res.headersSent) {
          res.destroy();
          return;
        }

        res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            error: "The API server is not running. Start the API server on port 8080 and try again.",
          }),
        );
      });

      req.pipe(proxy);
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(requestUrl.pathname);
    } catch {
      res.writeHead(400).end("Bad request");
      return;
    }

    const target = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!target.startsWith(`${root}${path.sep}`)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    fs.readFile(target, (error, data) => {
      if (error) {
        res.writeHead(404).end("Not found");
        return;
      }

      res
        .writeHead(200, {
          "Content-Type": mimeTypes[path.extname(target)] || "application/octet-stream",
        })
        .end(data);
    });
  })
  .listen(Number(process.env.PORT) || 5000, "0.0.0.0");
