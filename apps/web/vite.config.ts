import { defineConfig, type Plugin } from "vite";

const server = "http://127.0.0.1:8787";

// Customers get links like /approve/<token> and /link/<id>; serve the right page for them.
function prettyLinks(): Plugin {
  const routes: [RegExp, string][] = [
    [/^\/approve\/[^/?]+/, "/approve.html"],
    [/^\/link(\/[^/?]+)?\/?(\?|$)/, "/link.html"],
  ];
  return {
    name: "doorman-pretty-links",
    configureServer(dev) {
      dev.middlewares.use((req, _res, next) => {
        const match = routes.find(([pattern]) => pattern.test(req.url ?? ""));
        if (match) req.url = match[1];
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [prettyLinks()],
  server: {
    // Must match the Log in with PayPal return URL (http://127.0.0.1:5173/...).
    // PayPal rejects "localhost" there, and login cookies only work on the same host.
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": server,
      "/auth": server,
      "/agents": server,
      "/mcp": server,
      "/health": server,
    },
  },
});
