import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ConfigEnv } from "./config.js";

export interface LocalClaudeCredentialOptions {
  env?: ConfigEnv;
  homeDir?: string;
  fileExists?: (path: string) => boolean;
}

export function detectLocalClaudeCredentials(options: LocalClaudeCredentialOptions = {}): boolean {
  const env = options.env ?? process.env;
  const exists = options.fileExists ?? fileHasContent;

  return credentialPaths(env, options.homeDir ?? homedir()).some((path) => exists(path));
}

function credentialPaths(env: ConfigEnv, fallbackHome: string): string[] {
  const paths = new Set<string>();
  const configDir = trimPath(env.CLAUDE_CONFIG_DIR);
  if (configDir !== undefined) {
    paths.add(join(configDir, ".credentials.json"));
  }

  for (const home of [env.HOME, env.USERPROFILE, fallbackHome].map(trimPath)) {
    if (home !== undefined) {
      paths.add(join(home, ".claude", ".credentials.json"));
    }
  }

  return [...paths];
}

function fileHasContent(path: string): boolean {
  try {
    const stats = statSync(path);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function trimPath(value: string | undefined): string | undefined {
  return hasText(value) ? value.trim() : undefined;
}
