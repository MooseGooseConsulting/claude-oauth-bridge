import { createBridgeApp } from "./app.js";

try {
  const { server, config } = createBridgeApp();

  server.on("error", (error) => {
    process.stderr.write(`${JSON.stringify({ level: "error", event: "bridge_listen_failed", message: error.message })}\n`);
    process.exitCode = 1;
  });

  server.listen(config.port, config.host, () => {
    process.stdout.write(
      JSON.stringify({
        level: "info",
        event: "bridge_listening",
        backend: config.backend,
        oauthConfigured: config.oauthConfigured,
        host: config.host,
        port: config.port
      }) + "\n"
    );
  });
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown_error";
  process.stderr.write(`${JSON.stringify({ level: "error", event: "bridge_start_failed", message })}\n`);
  process.exitCode = 1;
}
