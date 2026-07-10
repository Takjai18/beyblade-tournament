import type { FastifyInstance } from "fastify";
import {
  CreateTournamentSchema,
  UpdateTournamentSchema,
  JoinRefereeSchema,
  mergeSettings,
  slugify,
} from "@beyblade/shared";
import { prisma } from "../lib/prisma.js";

const tournamentInclude = {
  players: { orderBy: { createdAt: "asc" as const } },
  matches: {
    include: {
      player1: true,
      player2: true,
    },
    orderBy: [{ round: "asc" as const }, { matchNumber: "asc" as const }],
  },
  stages: { orderBy: { order: "asc" as const } },
  referees: true,
  _count: { select: { players: true, matches: true } },
};

export async function tournamentRoutes(app: FastifyInstance) {
  // List tournaments (recent)
  app.get("/api/tournaments", async (_req, reply) => {
    const list = await prisma.tournament.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        slug: true,
        name: true,
        format: true,
        status: true,
        shareCode: true,
        createdAt: true,
        description: true,
        _count: { select: { players: true } },
      },
    });
    return reply.send(
      list.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        format: t.format,
        status: t.status,
        shareCode: t.shareCode,
        createdAt: t.createdAt,
        description: t.description,
        playerCount: t._count.players,
      }))
    );
  });

  // Create tournament
  app.post("/api/tournaments", async (req, reply) => {
    const parsed = CreateTournamentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "驗證失敗",
        details: parsed.error.flatten(),
      });
    }

    const data = parsed.data;
    const settings = mergeSettings(data.settings);
    let slug = slugify(data.name);

    // Ensure unique slug
    const existing = await prisma.tournament.findUnique({ where: { slug } });
    if (existing) {
      slug = slugify(`${data.name}-${Date.now().toString(36)}`);
    }

    const tournament = await prisma.tournament.create({
      data: {
        name: data.name,
        description: data.description,
        format: data.format,
        settings,
        hostPin: data.hostPin,
        streamUrl: data.streamUrl || null,
        logoUrl: data.logoUrl || null,
        slug,
        status: "REGISTRATION",
      },
      include: tournamentInclude,
    });

    return reply.status(201).send(tournament);
  });

  // Get by slug
  app.get<{ Params: { slug: string } }>(
    "/api/tournaments/:slug",
    async (req, reply) => {
      const tournament = await prisma.tournament.findUnique({
        where: { slug: req.params.slug },
        include: tournamentInclude,
      });
      if (!tournament) {
        return reply.status(404).send({ error: "找不到賽事" });
      }
      // Don't expose hostPin in public GET — strip for viewers
      const { hostPin: _pin, ...rest } = tournament;
      return reply.send({ ...rest, hasHostPin: Boolean(_pin) });
    }
  );

  // Get by share code (watch mode)
  app.get<{ Params: { shareCode: string } }>(
    "/api/watch/:shareCode",
    async (req, reply) => {
      const tournament = await prisma.tournament.findUnique({
        where: { shareCode: req.params.shareCode },
        include: tournamentInclude,
      });
      if (!tournament) {
        return reply.status(404).send({ error: "找不到賽事" });
      }
      const { hostPin: _pin, ...rest } = tournament;
      return reply.send({ ...rest, hasHostPin: Boolean(_pin) });
    }
  );

  // Update tournament
  app.patch<{ Params: { id: string } }>(
    "/api/tournaments/:id",
    async (req, reply) => {
      const parsed = UpdateTournamentSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "驗證失敗",
          details: parsed.error.flatten(),
        });
      }

      const existing = await prisma.tournament.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) {
        return reply.status(404).send({ error: "找不到賽事" });
      }

      const body = parsed.data;
      const currentSettings =
        typeof existing.settings === "object" && existing.settings !== null
          ? (existing.settings as Record<string, unknown>)
          : {};

      const tournament = await prisma.tournament.update({
        where: { id: req.params.id },
        data: {
          name: body.name,
          description: body.description === undefined ? undefined : body.description,
          format: body.format,
          status: body.status,
          hostPin: body.hostPin,
          streamUrl:
            body.streamUrl === undefined
              ? undefined
              : body.streamUrl || null,
          logoUrl:
            body.logoUrl === undefined ? undefined : body.logoUrl || null,
          settings: body.settings
            ? mergeSettings({ ...currentSettings, ...body.settings })
            : undefined,
          startedAt:
            body.status === "LIVE" && !existing.startedAt
              ? new Date()
              : undefined,
          finishedAt:
            body.status === "FINISHED" ? new Date() : undefined,
        },
        include: tournamentInclude,
      });

      const io = app.io;
      if (io) {
        io.to(`tournament:${tournament.id}`).emit("tournament_updated", {
          tournament,
        });
      }

      return reply.send(tournament);
    }
  );

  // Delete tournament
  app.delete<{ Params: { id: string } }>(
    "/api/tournaments/:id",
    async (req, reply) => {
      const existing = await prisma.tournament.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) {
        return reply.status(404).send({ error: "找不到賽事" });
      }
      await prisma.tournament.delete({ where: { id: req.params.id } });
      return reply.status(204).send();
    }
  );

  // Join as referee / host verify
  app.post<{ Params: { id: string } }>(
    "/api/tournaments/:id/join-referee",
    async (req, reply) => {
      const parsed = JoinRefereeSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "驗證失敗",
          details: parsed.error.flatten(),
        });
      }

      const tournament = await prisma.tournament.findUnique({
        where: { id: req.params.id },
      });
      if (!tournament) {
        return reply.status(404).send({ error: "找不到賽事" });
      }

      const { pin, name } = parsed.data;
      const isHost = pin === tournament.hostPin;

      if (!isHost) {
        // Phase 1: single host pin unlocks HOST/REFEREE
        return reply.status(401).send({ error: "PIN 錯誤" });
      }

      const found = await prisma.referee.findFirst({
        where: { tournamentId: tournament.id, name },
      });
      const referee = found
        ? await prisma.referee.update({
            where: { id: found.id },
            data: { role: "HOST", pin },
          })
        : await prisma.referee.create({
            data: {
              tournamentId: tournament.id,
              name,
              pin,
              role: "HOST",
            },
          });

      return reply.send({
        role: "HOST",
        referee,
        tournamentId: tournament.id,
        slug: tournament.slug,
      });
    }
  );

  // Standings (match-based: W/L, score, Buchholz, 晉級)
  app.get<{ Params: { id: string } }>(
    "/api/tournaments/:id/standings",
    async (req, reply) => {
      try {
        const { computeStandings } = await import("../lib/standings.js");
        const result = await computeStandings(req.params.id);
        // Keep array shape for older clients + meta
        return reply.send({
          ...result,
          // flat alias: points = matchPoints for WatchPage compat
          rows: result.standings.map((s) => ({
            ...s,
            points: s.matchPoints,
          })),
        });
      } catch {
        return reply.status(404).send({ error: "找不到賽事" });
      }
    }
  );
}
