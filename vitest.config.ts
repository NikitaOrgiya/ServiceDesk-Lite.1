import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // In Next.js, bundlers resolve "server-only" to a no-op via the
      // "react-server" export condition. Vitest runs in plain Node, so mirror
      // that here instead of hitting the package's throwing default export.
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    exclude: ["node_modules", ".next", "e2e", "tests/e2e"],
  },
});
