import type { FastifyInstance } from "fastify";
import {
  GenerateBracketSchema,
  ScoreMatchSchema,
  SetMatchBeySchema,
  SOCKET_EVENTS,
} from "@beyblade/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  buildSwissStandings,
  generateDoubleElim,
  generateGroupStage,
  generateRoundRobin,
  generateSingleElim,
  generateSwissRound,
  type SeedingMode,
} from "../lib/bracket.js";
import {
  applyMatchResultToStats,
  computeScores,
  createFinish,
  logAction,
  onMatchCompleted,
  parseFinishes,
} from "../lib/scoring.js";
import { emitToTournament } from "../socket/index.js";

const matchInclude = {
  player1: true,
  player2: true,
  group: true,
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

function getSettings(settings: unknown) {
  const s =
    typeof settings === "object" && settings !== null
      ? (settings as Record<string, unknown>)
      : {};
  return {
    pointsToWin: Number(s.pointsToWin) === 7 ? 7 : 4,
    is3on3: Boolean(s.is3on3),
    swissRounds: Number(s.swissRounds) || 5,
    groupCount: Number(s.groupCount) || 4,
  };
}

function stageName(format: string) {
  switch (format) {
    case "ROUND_ROBIN":
      return "循環賽";
    case "SWISS":
      return "瑞士制";
    case "GROUP_SWISS":
      return "分組賽";
    case "DOUBLE_ELIM":
      return "雙敗淘汰";
    default:
      return "單敗淘汰";
  }
}

export async function matchRoutes(app: FastifyInstance) {
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

  // Generate bracket (all formats)
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
        },
      });
      if (!tournament) {
        return reply.status(404).send({ error: "找不到賽事" });
      }

      const format = parsed.data.format ?? tournament.format;
      const seeding = (parsed.data.seeding ?? "seed") as SeedingMode;
      const settings = getSettings(tournament.settings);

      if (tournament.players.length < 2) {
        return reply.status(400).send({ error: "至少需要 2 位玩家" });
      }

      await prisma.match.deleteMany({ where: { tournamentId: tournament.id } });
      await prisma.group.deleteMany({
        where: { stage: { tournamentId: tournament.id } },
      });
      await prisma.stage.deleteMany({ where: { tournamentId: tournament.id } });

      // Reset player stats for clean bracket
      await prisma.player.updateMany({
        where: { tournamentId: tournament.id },
        data: {
          stats: {
            wins: 0,
            losses: 0,
            points: 0,
            finishes: { spin: 0, over: 0, burst: 0, xtreme: 0 },
            longestStreak: 0,
            currentStreak: 0,
          },
        },
      });

      const stage = await prisma.stage.create({
        data: {
          tournamentId: tournament.id,
          name: stageName(format),
          type: format,
          order: 1,
          isActive: true,
          settings: { swissRound: format === "SWISS" ? 1 : undefined },
        },
      });

      const playerInputs = tournament.players.map((p) => ({
        id: p.id,
        name: p.name,
        seed: p.seed,
        createdAt: p.createdAt,
      }));

      type MatchCreate = {
        tournamentId: string;
        stageId: string;
        groupId?: string;
        round: number;
        matchNumber: number;
        player1Id: string | null;
        player2Id: string | null;
        status: "PENDING" | "READY" | "COMPLETED";
        notes?: string | null;
        finishes: Prisma.InputJsonValue[];
        score1: number;
        score2: number;
        completedAt: Date | null;
      };

      const toCreate: MatchCreate[] = [];

      if (format === "ROUND_ROBIN") {
        const generated = generateRoundRobin(playerInputs, seeding, "RR");
        for (const m of generated) {
          toCreate.push({
            tournamentId: tournament.id,
            stageId: stage.id,
            round: m.round,
            matchNumber: m.matchNumber,
            player1Id: m.player1Id,
            player2Id: m.player2Id,
            status: m.status,
            notes: m.notes ?? "RR",
            finishes: [],
            score1: 0,
            score2: 0,
            completedAt: m.status === "COMPLETED" ? new Date() : null,
          });
        }
      } else if (format === "SWISS") {
        const standings = buildSwissStandings(playerInputs, []);
        const generated = generateSwissRound(standings, 1);
        for (const m of generated) {
          toCreate.push({
            tournamentId: tournament.id,
            stageId: stage.id,
            round: m.round,
            matchNumber: m.matchNumber,
            player1Id: m.player1Id,
            player2Id: m.player2Id,
            status: m.status,
            notes: "S",
            finishes: [],
            score1: m.status === "COMPLETED" ? 1 : 0,
            score2: 0,
            completedAt: m.status === "COMPLETED" ? new Date() : null,
          });
        }
        // Apply bye wins to stats
        for (const m of generated) {
          if (m.status === "COMPLETED" && m.player1Id && !m.player2Id) {
            await prisma.player.update({
              where: { id: m.player1Id },
              data: {
                stats: {
                  wins: 1,
                  losses: 0,
                  points: 1,
                  finishes: { spin: 0, over: 0, burst: 0, xtreme: 0 },
                  longestStreak: 1,
                  currentStreak: 1,
                },
              },
            });
          }
        }
      } else if (format === "GROUP_SWISS") {
        const { groups, matches: generated } = generateGroupStage(
          playerInputs,
          settings.groupCount,
          seeding
        );
        const groupIds: string[] = [];
        for (let i = 0; i < groups.length; i++) {
          const g = await prisma.group.create({
            data: {
              stageId: stage.id,
              name: groups[i].name,
              order: i,
            },
          });
          groupIds.push(g.id);
        }
        for (const m of generated) {
          const groupId =
            m.groupIndex != null ? groupIds[m.groupIndex] : undefined;
          toCreate.push({
            tournamentId: tournament.id,
            stageId: stage.id,
            groupId,
            round: m.round,
            matchNumber: m.matchNumber,
            player1Id: m.player1Id,
            player2Id: m.player2Id,
            status: m.status,
            notes: m.notes ?? "G",
            finishes: [],
            score1: 0,
            score2: 0,
            completedAt: m.status === "COMPLETED" ? new Date() : null,
          });
        }
      } else if (format === "DOUBLE_ELIM") {
        const generated = generateDoubleElim(playerInputs, seeding);
        for (const m of generated) {
          toCreate.push({
            tournamentId: tournament.id,
            stageId: stage.id,
            round: m.round,
            matchNumber: m.matchNumber,
            player1Id: m.player1Id,
            player2Id: m.player2Id,
            status: m.status,
            notes: m.notes ?? "W",
            finishes: [],
            score1: 0,
            score2: 0,
            completedAt: m.status === "COMPLETED" ? new Date() : null,
          });
        }
      } else {
        // SINGLE_ELIM
        const generated = generateSingleElim(playerInputs, seeding);
        for (const m of generated) {
          toCreate.push({
            tournamentId: tournament.id,
            stageId: stage.id,
            round: m.round,
            matchNumber: m.matchNumber,
            player1Id: m.player1Id,
            player2Id: m.player2Id,
            status: m.status,
            notes: m.notes ?? "W",
            finishes: [],
            score1: 0,
            score2: 0,
            completedAt: m.status === "COMPLETED" ? new Date() : null,
          });
        }
      }

      // createMany doesn't support all relations well with nulls - use create in batches
      for (const row of toCreate) {
        await prisma.match.create({ data: row });
      }

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
          matchCount: toCreate.length,
        },
        performedBy: "HOST",
      });

      const matches = await prisma.match.findMany({
        where: { tournamentId: tournament.id },
        include: matchInclude,
        orderBy: [{ notes: "asc" }, { round: "asc" }, { matchNumber: "asc" }],
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

  // Next Swiss round
  app.post<{ Params: { id: string } }>(
    "/api/tournaments/:id/swiss/next",
    async (req, reply) => {
      const tournament = await prisma.tournament.findUnique({
        where: { id: req.params.id },
        include: {
          players: { where: { isDropped: false } },
          matches: true,
          stages: { where: { isActive: true }, take: 1 },
        },
      });
      if (!tournament) {
        return reply.status(404).send({ error: "找不到賽事" });
      }
      if (tournament.format !== "SWISS") {
        return reply.status(400).send({ error: "僅瑞士制可用" });
      }

      const settings = getSettings(tournament.settings);
      const currentMaxRound = Math.max(
        0,
        ...tournament.matches.map((m) => m.round)
      );

      if (currentMaxRound >= settings.swissRounds) {
        return reply.status(400).send({
          error: `已達瑞士制輪數上限（${settings.swissRounds}）`,
        });
      }

      // All non-bye matches of current round must be completed
      const open = tournament.matches.filter(
        (m) =>
          m.round === currentMaxRound &&
          m.player1Id &&
          m.player2Id &&
          m.status !== "COMPLETED" &&
          m.status !== "CANCELLED"
      );
      if (open.length > 0) {
        return reply.status(400).send({
          error: `第 ${currentMaxRound} 輪尚有 ${open.length} 場未完成`,
        });
      }

      const standings = buildSwissStandings(
        tournament.players.map((p) => ({
          id: p.id,
          name: p.name,
          seed: p.seed,
          createdAt: p.createdAt,
        })),
        tournament.matches
      );

      const nextRound = currentMaxRound + 1;
      const generated = generateSwissRound(standings, nextRound);
      const stageId = tournament.stages[0]?.id;

      for (const m of generated) {
        await prisma.match.create({
          data: {
            tournamentId: tournament.id,
            stageId: stageId ?? undefined,
            round: m.round,
            matchNumber: m.matchNumber,
            player1Id: m.player1Id,
            player2Id: m.player2Id,
            status: m.status,
            notes: "S",
            finishes: [],
            score1: m.status === "COMPLETED" ? 1 : 0,
            score2: 0,
            completedAt: m.status === "COMPLETED" ? new Date() : null,
          },
        });
        if (m.status === "COMPLETED" && m.player1Id && !m.player2Id) {
          const p = await prisma.player.findUnique({
            where: { id: m.player1Id },
          });
          if (p) {
            const st =
              typeof p.stats === "object" && p.stats !== null
                ? (p.stats as Record<string, number>)
                : {};
            await prisma.player.update({
              where: { id: p.id },
              data: {
                stats: {
                  ...st,
                  wins: Number(st.wins ?? 0) + 1,
                  points: Number(st.points ?? 0) + 1,
                  currentStreak: Number(st.currentStreak ?? 0) + 1,
                  longestStreak: Math.max(
                    Number(st.longestStreak ?? 0),
                    Number(st.currentStreak ?? 0) + 1
                  ),
                },
              },
            });
          }
        }
      }

      await logAction({
        tournamentId: tournament.id,
        action: "SWISS_NEXT_ROUND",
        payload: { round: nextRound, matchCount: generated.length },
        performedBy: "HOST",
      });

      const matches = await prisma.match.findMany({
        where: { tournamentId: tournament.id },
        include: matchInclude,
        orderBy: [{ round: "asc" }, { matchNumber: "asc" }],
      });

      emitToTournament(app.io, tournament.id, SOCKET_EVENTS.TOURNAMENT_UPDATED, {
        reason: "swiss_next_round",
        round: nextRound,
      });

      return reply.status(201).send({
        round: nextRound,
        matches,
        newCount: generated.length,
      });
    }
  );

  // Set current bey (3on3)
  app.patch<{ Params: { id: string } }>(
    "/api/matches/:id/bey",
    async (req, reply) => {
      const parsed = SetMatchBeySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "驗證失敗",
          details: parsed.error.flatten(),
        });
      }
      const match = await prisma.match.findUnique({
        where: { id: req.params.id },
      });
      if (!match) return reply.status(404).send({ error: "找不到對戰" });

      const updated = await prisma.match.update({
        where: { id: match.id },
        data: {
          currentBey1: parsed.data.currentBey1,
          currentBey2: parsed.data.currentBey2,
        },
        include: matchInclude,
      });

      emitToTournament(
        app.io,
        match.tournamentId,
        SOCKET_EVENTS.MATCH_UPDATED,
        { match: updated }
      );
      return reply.send(updated);
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/matches/:id/start",
    async (req, reply) => {
      const match = await prisma.match.findUnique({
        where: { id: req.params.id },
        include: {
          ...matchInclude,
          tournament: true,
        },
      });
      if (!match) return reply.status(404).send({ error: "找不到對戰" });
      if (match.status === "COMPLETED" || match.status === "CANCELLED") {
        return reply.status(400).send({ error: "對戰已結束，無法開始" });
      }
      if (!match.player1Id || !match.player2Id) {
        return reply.status(400).send({ error: "雙方選手尚未就緒" });
      }

      const settings = getSettings(match.tournament.settings);
      let currentBey1 = match.currentBey1;
      let currentBey2 = match.currentBey2;
      if (settings.is3on3) {
        const order1 = match.player1?.currentOrder ?? [0, 1, 2];
        const order2 = match.player2?.currentOrder ?? [0, 1, 2];
        currentBey1 = currentBey1 ?? order1[0] ?? 0;
        currentBey2 = currentBey2 ?? order2[0] ?? 0;
      }

      const updated = await prisma.match.update({
        where: { id: match.id },
        data: {
          status: "LIVE",
          startedAt: match.startedAt ?? new Date(),
          currentBey1,
          currentBey2,
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
      const resolvedBey =
        beyIndex ??
        (playerId === match.player1Id
          ? (match.currentBey1 ?? undefined)
          : (match.currentBey2 ?? undefined));
      const finish = createFinish(
        type,
        playerId,
        refereeName,
        resolvedBey
      );
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
        const loserId =
          winnerId === match.player1Id ? match.player2Id! : match.player1Id!;
        await applyMatchResultToStats({
          player1Id: match.player1Id,
          player2Id: match.player2Id,
          score1,
          score2,
          finishes,
        });
        nextMatch = await onMatchCompleted({
          format: match.tournament.format,
          tournamentId: match.tournamentId,
          stageId: match.stageId,
          match: {
            id: match.id,
            round: match.round,
            matchNumber: match.matchNumber,
            notes: match.notes,
            player1Id: match.player1Id,
            player2Id: match.player2Id,
            score1,
            score2,
          },
          winnerId,
          loserId,
        });
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

        // Swiss: all rounds done → mark FINISHED
        if (match.tournament.format === "SWISS") {
          try {
            const { computeStandings } = await import("../lib/standings.js");
            const { meta } = await computeStandings(match.tournamentId);
            if (meta.swissComplete) {
              await prisma.tournament.update({
                where: { id: match.tournamentId },
                data: {
                  status: "FINISHED",
                  finishedAt: new Date(),
                },
              });
            }
          } catch {
            /* ignore */
          }
        }
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
        emitToTournament(
          app.io,
          match.tournamentId,
          SOCKET_EVENTS.TOURNAMENT_UPDATED,
          { reason: "match_completed" }
        );
      }

      return reply.send({ match: updated, finish, autoCompleted, nextMatch });
    }
  );

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

      const removed = finishes.pop()!;
      const wasCompleted = match.status === "COMPLETED";
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
        return reply.send({ match, nextMatch: null });
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
      const loserId =
        winnerId === match.player1Id ? match.player2Id : match.player1Id;

      await applyMatchResultToStats({
        player1Id: match.player1Id,
        player2Id: match.player2Id,
        score1: match.score1,
        score2: match.score2,
        finishes,
      });

      const nextMatch = await onMatchCompleted({
        format: match.tournament.format,
        tournamentId: match.tournamentId,
        stageId: match.stageId,
        match: {
          id: match.id,
          round: match.round,
          matchNumber: match.matchNumber,
          notes: match.notes,
          player1Id: match.player1Id,
          player2Id: match.player2Id,
          score1: match.score1,
          score2: match.score2,
        },
        winnerId,
        loserId,
      });

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
