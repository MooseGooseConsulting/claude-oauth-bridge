import type { Server } from "node:http";

import { ClaudeCliBackend, type ClaudeCliBackendOptions } from "./backend/claudeCli.js";
import type { BridgeBackend } from "./backend/types.js";
import { loadConfig, type BridgeConfig, type ConfigEnv, type CredentialProbe } from "./config.js";
import { createBridgeServer } from "./server.js";

export interface CreateBridgeAppOptions {
  env?: ConfigEnv;
  probe?: CredentialProbe;
  backendOptions?: Omit<ClaudeCliBackendOptions, "env" | "timeoutMs">;
}

export interface BridgeApp {
  server: Server;
  backend: BridgeBackend;
  config: BridgeConfig;
}

export function createBridgeApp(options: CreateBridgeAppOptions = {}): BridgeApp {
  const env = options.env ?? process.env;
  const config = loadConfig(env, options.probe);
  const backend = new ClaudeCliBackend({
    ...options.backendOptions,
    env,
    timeoutMs: config.requestTimeoutMs,
    maxOutputBytes: config.maxOutputBytes
  });
  const server = createBridgeServer({ backend, config });

  return { server, backend, config };
}
