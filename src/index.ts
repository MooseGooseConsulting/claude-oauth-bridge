import { createBridgeApp } from "./app.js";

const { server, config } = createBridgeApp();

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
