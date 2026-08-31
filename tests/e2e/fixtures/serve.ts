import { join, resolve } from "path";
import { readFileSync, existsSync } from "fs";

const ROOT = process.cwd();
const UI_DIR = join(ROOT, "src/ui");
const EXAMPLES_DIR = join(ROOT, "examples");

export async function createTestServer(port = 4567) {
  // Pre-bundle app.ts for browser
  const buildResult = await Bun.build({
    entrypoints: [join(UI_DIR, "app.ts")],
    target: "browser",
    minify: false,
    sourcemap: "inline",
  });

  if (!buildResult.success) {
    console.error("Failed to bundle UI app.ts:", buildResult.logs);
    throw new Error("UI bundle failed");
  }

  const bundledJs = await buildResult.outputs[0].text();

  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      if (pathname === "/" || pathname === "/index.html") {
        const html = readFileSync(join(UI_DIR, "index.html"), "utf-8");
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      if (pathname === "/index.js" || pathname === "/src/ui/app.js" || pathname === "/views/mainview/index.js") {
        return new Response(bundledJs, {
          headers: { "Content-Type": "application/javascript; charset=utf-8" },
        });
      }

      if (pathname.startsWith("/styles/")) {
        const stylePath = join(UI_DIR, pathname);
        if (existsSync(stylePath)) {
          return new Response(readFileSync(stylePath, "utf-8"), {
            headers: { "Content-Type": "text/css; charset=utf-8" },
          });
        }
      }

      if (pathname.startsWith("/examples/")) {
        const exampleFile = pathname.replace(/^\/examples\//, "");
        const filePath = join(EXAMPLES_DIR, exampleFile);
        if (existsSync(filePath)) {
          return new Response(readFileSync(filePath, "utf-8"), {
            headers: { "Content-Type": "application/json; charset=utf-8" },
          });
        }
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  return {
    server,
    url: `http://localhost:${port}`,
    stop: () => server.stop(),
  };
}

if (import.meta.main) {
  const port = Number(process.env.PORT) || 4567;
  const { url } = await createTestServer(port);
  console.log(`🚀 Citarium Test Server running at ${url}`);
}
