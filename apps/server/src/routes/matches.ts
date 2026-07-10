import type { FastifyInstance } from "fastify";
import {
  GenerateBracketSchema,
  ScoreMatchSchema,
  SOCKET_EVENTS,
} from "@beyblade/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  generateRoundRobin,
  generateSingleElim,
  type SeedingMode,
} from "../lib/bracket.js";
import {
  advanceWinner,
  applyMatchResultToStats,
  computeScores,
  createFinish,
  logAction,
  parseFinishes,
} from "../lib/scoring.js";
import { emitToTournament } from "../socket/index.js";

const matchInclude = {
  player1: true,
  player2: true,
} as const;

function getPointsToWin(settings: unknown): number {
  if (
    typeof settings === "object" &&
    settings !== null &&
    "pointsToWin" in settings
  ) {
    const v = Number((settings as { pointsToWin: number }).pointsToWin);
    if (v === 7) return 7;
  }
  return 4;
}

export async function matchRoutes(app: FastifyInstance) {
  // List matches
  app.get<{ Params: { id: string } }>(
    "/api/tournaments/:id/matches",
    async (req, reply) => {
      const matches = await prisma.match.findMany({
        where: { tournamentId: req.params.id },
        include: matchInclude,
        orderBy: [{ round: "asc" }, { matchNumber: "asc" }],
      });
      return reply.send(matches);
    }
  );

  // Get single match
  app.get<{ Params: { id: string } }>(
    "/api/matches/:id",
    async (req, reply) => {
      const match = await prisma.match.findUnique({
        where: { id: req.params.id },
        include: {
          ...matchInclude,
          tournament: {
            select: {
              id: true,
              slug: true,
              name: true,
              format: true,
              settings: true,
              status: true,
            },
          },
        },
      });
      if (!match) return reply.status(404).send({ error: "找不到對戰" });
      return reply.send(match);
    }
  );

  // Generate bracket
  app.post<{ Params: { id: string } }>(
    "/api/tournaments/:id/generate",
    async (req, reply) => {
      const parsed = GenerateBracketSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: "驗證失敗",
          details: parsed.error.flatten(),
        });
      }

      const tournament = await prisma.tournament.findUnique({
        where: { id: req.params.id },
        include: {
          players: { where: { isDropped: false } },
          matches: true,
        },
      });
      if (!tournament) {
        return reply.status(404).send({ error: "找不到賽事" });
      }

      const format = parsed.data.format ?? tournament.format;
      const seeding = (parsed.data.seeding ?? "seed") as SeedingMode;

      if (format === "SWISS" || format === "GROUP_SWISS" || format === "DOUBLE_ELIM") {
        return reply.status(400).send({
          error: `${format} 將於 Phase 2 支援；目前請用 SINGLE_ELIM 或 ROUND_ROBIN`,
        });
      }

      if (tournament.players.length < 2) {
        return reply.status(400).send({ error: "至少需要 2 位玩家" });
      }

      // Clear existing matches / stages for regenerate
      await prisma.match.deleteMany({ where: { tournamentId: tournament.id } });
      await prisma.group.deleteMany({
        where: { stage: { tournamentId: tournament.id } },
      });
      await prisma.stage.deleteMany({ where: { tournamentId: tournament.id } });

      const stage = await prisma.stage.create({
        data: {
          tournamentId: tournament.id,
          name:
            format === "ROUND_ROBIN" ? "循環賽" : "單敗淘汰",
          type: format,
          order: 1,
          isActive: true,
        },
      });

      const playerInputs = tournament.players.map((p) => ({
        id: p.id,
        name: p.name,
        seed: p.seed,
        createdAt: p.createdAt,
      }));

      const generated =
        format === "ROUND_ROBIN"
          ? generateRoundRobin(playerInputs, seeding)
          : generateSingleElim(playerInputs, seeding);

      await prisma.match.createMany({
        data: generated.map((m) => ({
          tournamentId: tournament.id,
          stageId: stage.id,
          round: m.round,
          matchNumber: m.matchNumber,
          player1Id: m.player1Id,
          player2Id: m.player2Id,
          status: m.status,
          finishes: [],
          score1: 0,
          score2: 0,
          completedAt: m.status === "COMPLETED" ? new Date() : null,
        })),
      });

      // Update tournament format/status if needed
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: {
          format,
          status:
            tournament.status === "DRAFT" || tournament.status === "REGISTRATION"
              ? "LIVE"
              : tournament.status,
          startedAt: tournament.startedAt ?? new Date(),
        },
      });

      await logAction({
        tournamentId: tournament.id,
        action: "GENERATE_BRACKET",
        payload: {
          format,
          seeding,
          matchCount: generated.length,
        },
        performedBy: "HOST",
      });

      const matches = await prisma.match.findMany({
        where: { tournamentId: tournament.id },
        include: matchInclude,
        orderBy: [{ round: "asc" }, { matchNumber: "asc" }],
      });

      emitToTournament(app.io, tournament.id, SOCKET_EVENTS.TOURNAMENT_UPDATED, {
        reason: "bracket_generated",
      });

      return reply.status(201).send({
        stage,
        matches,
        format,
        count: matches.length,
      });
    }
  );

  // Start match
  app.post<{ Params: { id: string } }>(
    "/api/matches/:id/start",
    async (req, reply) => {
      const match = await prisma.match.findUnique({
        where: { id: req.params.id },
        include: matchInclude,
      });
      if (!match) return reply.status(404).send({ error: "找不到對戰" });
      if (match.status === "COMPLETED" || match.status === "CANCELLED") {
        return reply.status(400).send({ error: "對戰已結束，無法開始" });
      }
      if (!match.player1Id || !match.player2Id) {
        return reply.status(400).send({ error: "雙方選手尚未就緒" });
      }

      const updated = await prisma.match.update({
        where: { id: match.id },
        data: {
          status: "LIVE",
          startedAt: match.startedAt ?? new Date(),
        },
        include: matchInclude,
      });

      const log = await logAction({
        tournamentId: match.tournamentId,
        matchId: match.id,
        action: "START_MATCH",
        payload: { matchId: match.id },
        performedBy:
          (req.body as { refereeName?: string } | undefined)?.refereeName ??
          "HOST",
      });

      emitToTournament(app.io, match.tournamentId, SOCKET_EVENTS.MATCH_UPDATED, {
        match: updated,
      });
      emitToTournament(app.io, match.tournamentId, SOCKET_EVENTS.ACTION_LOGGED, {
        log,
      });

      return reply.send(updated);
    }
  );

  // Score
  app.post<{ Params: { id: string } }>(
    "/api/matches/:id/score",
    async (req, reply) => {
      const parsed = ScoreMatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "驗證失敗",
          details: parsed.error.flatten(),
        });
      }

      const match = await prisma.match.findUnique({
        where: { id: req.params.id },
        include: {
          ...matchInclude,
          tournament: true,
        },
      });
      if (!match) return reply.status(404).send({ error: "找不到對戰" });
      if (match.status === "COMPLETED" || match.status === "CANCELLED") {
        return reply.status(400).send({ error: "對戰已結束" });
      }
      if (!match.player1Id || !match.player2Id) {
        return reply.status(400).send({ error: "雙方選手尚未就緒" });
      }

      const { type, playerId, refereeName, beyIndex } = parsed.data;
      if (playerId !== match.player1Id && playerId !== match.player2Id) {
        return reply.status(400).send({ error: "playerId 不屬於此對戰" });
      }

      const finishes = parseFinishes(match.finishes);
      const finish = createFinish(type, playerId, refereeName, beyIndex);
      finishes.push(finish);

      const { score1, score2 } = computeScores(
        finishes,
        match.player1Id,
        match.player2Id
      );

      const pointsToWin = getPointsToWin(match.tournament.settings);
      const reachesWin = score1 >= pointsToWin || score2 >= pointsToWin;
      const status = reachesWin ? ("COMPLETED" as const) : ("LIVE" as const);
      const completedAt = reachesWin ? new Date() : null;
      const autoCompleted = reachesWin;

      const updated = await prisma.match.update({
        where: { id: match.id },
        data: {
          finishes: finishes as unknown as Prisma.InputJsonValue[],
          score1,
          score2,
          status,
          startedAt: match.startedAt ?? new Date(),
          completedAt,
        },
        include: matchInclude,
      });

      const log = await logAction({
        tournamentId: match.tournamentId,
        matchId: match.id,
        action: "SCORE",
        payload: {
          finish,
          score1,
          score2,
          type,
          playerId,
        } as unknown as Prisma.InputJsonValue,
        performedBy: refereeName ?? "HOST",
      });

      let nextMatch = null;
      if (autoCompleted) {
        const winnerId =
          score1 >= pointsToWin ? match.player1Id! : match.player2Id!;
        await applyMatchResultToStats({
          player1Id: match.player1Id,
          player2Id: match.player2Id,
          score1,
          score2,
          finishes,
        });
        if (match.tournament.format === "SINGLE_ELIM") {
          nextMatch = await advanceWinner({
            tournamentId: match.tournamentId,
            stageId: match.stageId,
            round: match.round,
            matchNumber: match.matchNumber,
            winnerId,
          });
        }
        await logAction({
          tournamentId: match.tournamentId,
          matchId: match.id,
          action: "COMPLETE_MATCH",
          payload: {
            score1,
            score2,
            winnerId,
            auto: true,
          },
          performedBy: refereeName ?? "HOST",
        });
      }

      emitToTournament(app.io, match.tournamentId, SOCKET_EVENTS.MATCH_UPDATED, {
        match: updated,
        nextMatch,
      });
      emitToTournament(app.io, match.tournamentId, SOCKET_EVENTS.ACTION_LOGGED, {
        log,
      });
      if (autoCompleted) {
        emitToTournament(
          app.io,
          match.tournamentId,
          SOCKET_EVENTS.STANDINGS_UPDATED,
          { tournamentId: match.tournamentId }
        );
      }

      return reply.send({ match: updated, finish, autoCompleted, nextMatch });
    }
  );

  // Undo last finish (keeps history via ActionLog; rewinds finishes stack)
  app.post<{ Params: { id: string } }>(
    "/api/matches/:id/undo",
    async (req, reply) => {
      const refereeName =
        (req.body as { refereeName?: string } | undefined)?.refereeName ??
        "HOST";

      const match = await prisma.match.findUnique({
        where: { id: req.params.id },
        include: { ...matchInclude, tournament: true },
      });
      if (!match) return reply.status(404).send({ error: "找不到對戰" });

      const finishes = parseFinishes(match.finishes);
      if (finishes.length === 0) {
        return reply.status(400).send({ error: "沒有可撤銷的計分" });
      }

      // Only allow undo if match not completed OR allow undo completed within finishes
      // Spec: undo last 20 steps — we undo one finish at a time
      if (finishes.length > 20) {
        // still allow undo one at a time, but only last 20 exist effectively
      }

      const removed = finishes.pop()!;
      const wasCompleted = match.status === "COMPLETED";

      // If undoing after complete, we do NOT reverse player stats for Phase 1 simplicity
      // (full reverse is Phase 2) — but we reopen the match
      const { score1, score2 } = computeScores(
        finishes,
        match.player1Id,
        match.player2Id
      );

      const updated = await prisma.match.update({
        where: { id: match.id },
        data: {
          finishes: finishes as unknown as Prisma.InputJsonValue[],
          score1,
          score2,
          status: "LIVE",
          completedAt: null,
        },
        include: matchInclude,
      });

      const log = await logAction({
        tournamentId: match.tournamentId,
        matchId: match.id,
        action: "UNDO",
        payload: {
          removed,
          score1,
          score2,
          wasCompleted,
        } as unknown as Prisma.InputJsonValue,
        performedBy: refereeName,
      });

      emitToTournament(app.io, match.tournamentId, SOCKET_EVENTS.MATCH_UPDATED, {
        match: updated,
      });
      emitToTournament(app.io, match.tournamentId, SOCKET_EVENTS.ACTION_LOGGED, {
        log,
      });

      return reply.send({ match: updated, removed });
    }
  );

  // Manual complete
  app.post<{ Params: { id: string } }>(
    "/api/matches/:id/complete",
    async (req, reply) => {
      const refereeName =
        (req.body as { refereeName?: string } | undefined)?.refereeName ??
        "HOST";

      const match = await prisma.match.findUnique({
        where: { id: req.params.id },
        include: { ...matchInclude, tournament: true },
      });
      if (!match) return reply.status(404).send({ error: "找不到對戰" });
      if (match.status === "COMPLETED") {
        return reply.send(match);
      }
      if (!match.player1Id || !match.player2Id) {
        return reply.status(400).send({ error: "雙方選手尚未就緒" });
      }
      if (match.score1 === match.score2) {
        return reply.status(400).send({ error: "平手無法結束，請繼續計分" });
      }

      const finishes = parseFinishes(match.finishes);
      const updated = await prisma.match.update({
        where: { id: match.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
        include: matchInclude,
      });

      const winnerId =
        match.score1 > match.score2 ? match.player1Id : match.player2Id;

      await applyMatchResultToStats({
        player1Id: match.player1Id,
        player2Id: match.player2Id,
        score1: match.score1,
        score2: match.score2,
        finishes,
      });

      let nextMatch = null;
      if (match.tournament.format === "SINGLE_ELIM") {
        nextMatch = await advanceWinner({
          tournamentId: match.tournamentId,
          stageId: match.stageId,
          round: match.round,
          matchNumber: match.matchNumber,
          winnerId,
        });
      }

      const log = await logAction({
        tournamentId: match.tournamentId,
        matchId: match.id,
        action: "COMPLETE_MATCH",
        payload: {
          score1: match.score1,
          score2: match.score2,
          winnerId,
          auto: false,
        },
        performedBy: refereeName,
      });

      emitToTournament(app.io, match.tournamentId, SOCKET_EVENTS.MATCH_UPDATED, {
        match: updated,
        nextMatch,
      });
      emitToTournament(app.io, match.tournamentId, SOCKET_EVENTS.ACTION_LOGGED, {
        log,
      });
      emitToTournament(
        app.io,
        match.tournamentId,
        SOCKET_EVENTS.STANDINGS_UPDATED,
        { tournamentId: match.tournamentId }
      );

      return reply.send({ match: updated, nextMatch });
    }
  );

  // Recent action logs for a match (undo history panel)
  app.get<{ Params: { id: string } }>(
    "/api/matches/:id/actions",
    async (req, reply) => {
      const match = await prisma.match.findUnique({
        where: { id: req.params.id },
        select: { id: true, tournamentId: true },
      });
      if (!match) return reply.status(404).send({ error: "找不到對戰" });

      const logs = await prisma.actionLog.findMany({
        where: { matchId: match.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      return reply.send(logs);
    }
  );
}
