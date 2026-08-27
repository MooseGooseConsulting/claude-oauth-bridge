import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    restoreMocks: true,
    exclude: ["**/node_modules/**", "**/dist/**", "**/coverage/**"],
    testTimeout: 10_000
  }
});
