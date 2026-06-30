import { loadConfig } from "../src/config.js";
import { ClaudeCliBackend } from "../src/backend/claudeCli.js";

const runLive = process.env.RUN_LIVE_CLAUDE === "1" && loadConfig(process.env).oauthConfigured;

describe.skipIf(!runLive)("live Claude CLI bridge backend", () => {
  it("can answer through the OAuth-bearing Claude runtime", async () => {
    const backend = new ClaudeCliBackend({
      env: process.env,
      timeoutMs: 60_000
    });

    const result = await backend.complete({
      model: "sonnet",
      effort: "medium",
      prompt: "Reply exactly: oauth-bridge-ok",
      stream: false
    });

    expect(result.text).toContain("oauth-bridge-ok");
  });
});
