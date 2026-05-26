/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname),
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": "http://127.0.0.1:7788",
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setupGlobals.ts", "./src/test-setup.ts", "./tests/setupTests.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/__tests__/**", "src/lib/schemas/**", "**/*.test.*", "**/*.d.ts"],
      thresholds: { lines: 90 },
    },
  },
});
