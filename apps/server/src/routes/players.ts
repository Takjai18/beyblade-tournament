import type { FastifyInstance } from "fastify";
import {
  CreatePlayerSchema,
  UpdatePlayerSchema,
  validateDecks,
  type Deck,
} from "@beyblade/shared";
import { prisma } from "../lib/prisma.js";
import type { Prisma } from "@prisma/client";

const emptyStats = {
  wins: 0,
  losses: 0,
  points: 0,
  finishes: { spin: 0, over: 0, burst: 0, xtreme: 0 },
  longestStreak: 0,
  currentStreak: 0,
};

export async function playerRoutes(app: FastifyInstance) {
  // List players for tournament
  app.get<{ Params: { id: string } }>(
    "/api/tournaments/:id/players",
    async (req, reply) => {
      const players = await prisma.player.findMany({
        where: { tournamentId: req.params.id },
        orderBy: [{ seed: "asc" }, { createdAt: "asc" }],
      });
      return reply.send(players);
    }
  );

  // Create player
  app.post<{ Params: { id: string } }>(
    "/api/tournaments/:id/players",
    async (req, reply) => {
      const parsed = CreatePlayerSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "驗證失敗",
          details: parsed.error.flatten(),
        });
      }

      const tournament = await prisma.tournament.findUnique({
        where: { id: req.params.id },
        include: { _count: { select: { players: true } } },
      });
      if (!tournament) {
        return reply.status(404).send({ error: "找不到賽事" });
      }

      const settings =
        typeof tournament.settings === "object" && tournament.settings !== null
          ? (tournament.settings as { maxPlayers?: number })
          : {};
      const maxPlayers = settings.maxPlayers ?? 64;
      if (tournament._count.players >= maxPlayers) {
        return reply.status(400).send({ error: `已達人數上限（${maxPlayers}）` });
      }

      const data = parsed.data;
      if (data.decks && data.decks.length > 0) {
        const check = validateDecks(data.decks as Deck[]);
        if (!check.ok) {
          return reply.status(400).send({ error: check.error });
        }
      }
      const decks = (data.decks ?? []) as Prisma.InputJsonValue[];
      const currentOrder =
        data.currentOrder ??
        (data.decks ?? []).map((_, i) => i);

      try {
        const player = await prisma.player.create({
          data: {
            tournamentId: tournament.id,
            name: data.name.trim(),
            emoji: data.emoji ?? "🌀",
            avatarUrl: data.avatarUrl || null,
            seed: data.seed,
            decks,
            currentOrder,
            stats: emptyStats,
          },
        });

        const io = app.io;
        if (io) {
          io.to(`tournament:${tournament.id}`).emit("player_updated", {
            player,
            action: "created",
          });
          io.to(`tournament:${tournament.id}`).emit("tournament_updated", {
            reason: "player_created",
          });
        }

        return reply.status(201).send(player);
      } catch (err: unknown) {
        const code =
          err && typeof err === "object" && "code" in err
            ? (err as { code: string }).code
            : "";
        if (code === "P2002") {
          return reply.status(409).send({ error: "此賽事已有同名玩家" });
        }
        throw err;
      }
    }
  );

  // Get single player
  app.get<{ Params: { id: string } }>(
    "/api/players/:id",
    async (req, reply) => {
      const player = await prisma.player.findUnique({
        where: { id: req.params.id },
        include: {
          tournament: {
            select: { id: true, slug: true, name: true, status: true },
          },
        },
      });
      if (!player) {
        return reply.status(404).send({ error: "找不到玩家" });
      }
      return reply.send(player);
    }
  );

  // Update player
  app.patch<{ Params: { id: string } }>(
    "/api/players/:id",
    async (req, reply) => {
      const parsed = UpdatePlayerSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "驗證失敗",
          details: parsed.error.flatten(),
        });
      }

      const existing = await prisma.player.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) {
        return reply.status(404).send({ error: "找不到玩家" });
      }

      const body = parsed.data;
      if (body.decks) {
        const check = validateDecks(body.decks as Deck[]);
        if (!check.ok) {
          return reply.status(400).send({ error: check.error });
        }
      }
      try {
        const player = await prisma.player.update({
          where: { id: req.params.id },
          data: {
            name: body.name?.trim(),
            emoji: body.emoji,
            avatarUrl:
              body.avatarUrl === undefined
                ? undefined
                : body.avatarUrl || null,
            seed: body.seed === undefined ? undefined : body.seed,
            decks: body.decks as Prisma.InputJsonValue[] | undefined,
            currentOrder: body.currentOrder,
            isDropped: body.isDropped,
            stats: body.stats as Prisma.InputJsonValue | undefined,
          },
        });

        const io = app.io;
        if (io) {
          io.to(`tournament:${player.tournamentId}`).emit("player_updated", {
            player,
            action: "updated",
          });
        }

        return reply.send(player);
      } catch (err: unknown) {
        const code =
          err && typeof err === "object" && "code" in err
            ? (err as { code: string }).code
            : "";
        if (code === "P2002") {
          return reply.status(409).send({ error: "此賽事已有同名玩家" });
        }
        throw err;
      }
    }
  );

  // Delete player
  app.delete<{ Params: { id: string } }>(
    "/api/players/:id",
    async (req, reply) => {
      const existing = await prisma.player.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) {
        return reply.status(404).send({ error: "找不到玩家" });
      }

      await prisma.player.delete({ where: { id: req.params.id } });

      const io = app.io;
      if (io) {
        io.to(`tournament:${existing.tournamentId}`).emit("player_updated", {
          playerId: existing.id,
          action: "deleted",
        });
      }

      return reply.status(204).send();
    }
  );
}
