import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { detectLocalClaudeCredentials } from "../src/localClaudeCredentials.js";

describe("local Claude credential detection", () => {
  it("detects a Claude Code credentials file without reading credential values", () => {
    const root = mkdtempSync(join(tmpdir(), "claude-creds-"));
    const claudeDir = join(root, ".claude");
    const credentialsPath = join(claudeDir, ".credentials.json");
    mkdirSync(claudeDir);
    writeFileSync(credentialsPath, "{\"note\":\"present\"}");

    try {
      expect(detectLocalClaudeCredentials({ env: { HOME: root, USERPROFILE: root }, homeDir: root })).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not treat a missing credentials file as configured", () => {
    const root = mkdtempSync(join(tmpdir(), "claude-creds-"));

    try {
      expect(detectLocalClaudeCredentials({ env: { HOME: root, USERPROFILE: root }, homeDir: root })).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
