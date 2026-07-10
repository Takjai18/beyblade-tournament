import { buildApp } from "./app.js";
import { env } from "./lib/env.js";
import { createSocketServer } from "./socket/index.js";

async function main() {
  const app = await buildApp();

  await app.listen({ port: env.PORT, host: env.HOST });
  const address = app.server.address();
  app.log.info(`HTTP listening on ${JSON.stringify(address)}`);

  const io = createSocketServer(app.server);
  app.io = io;
  app.log.info("Socket.io attached");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
