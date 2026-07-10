import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { env } from "./lib/env.js";
import { tournamentRoutes } from "./routes/tournaments.js";
import { playerRoutes } from "./routes/players.js";

export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV === "development",
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
  });
  await app.register(sensible);

  app.get("/health", async () => ({
    ok: true,
    service: "beyblade-tournament-server",
    ts: new Date().toISOString(),
  }));

  await app.register(tournamentRoutes);
  await app.register(playerRoutes);

  return app;
}
