import { defineConfig } from "vite";

const server = "http://127.0.0.1:8787";

export default defineConfig({
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
