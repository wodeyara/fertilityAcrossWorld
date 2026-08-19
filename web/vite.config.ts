import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Minimal typing for the one Node global we read at config time (avoids a full
// @types/node dependency just for the CI base-path override).
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  // Root ("/") for local dev and user/custom-domain sites; the CI build overrides
  // this with VITE_BASE=/<repo>/ for a GitHub Pages project site.
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
