import { FINISH_POINTS, type FinishType } from "@beyblade/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export interface FinishRecord {
  id: string;
  type: FinishType;
  points: number;
  playerId: string;
  timestamp: string;
  refereeId?: string;
  beyIndex?: number;
}

export function parseFinishes(raw: unknown): FinishRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw as FinishRecord[];
}

export function computeScores(
  finishes: FinishRecord[],
  player1Id: string | null,
  player2Id: string | null
): { score1: number; score2: number } {
  let score1 = 0;
  let score2 = 0;
  for (const f of finishes) {
    if (f.playerId === player1Id) score1 += f.points;
    else if (f.playerId === player2Id) score2 += f.points;
  }
  return { score1, score2 };
}

export function createFinish(
  type: FinishType,
  playerId: string,
  refereeName?: string,
  beyIndex?: number
): FinishRecord {
  return {
    id: `fin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    points: FINISH_POINTS[type],
    playerId,
    timestamp: new Date().toISOString(),
    refereeId: refereeName,
    beyIndex,
  };
}

export async function logAction(params: {
  tournamentId: string;
  matchId?: string;
  action: string;
  payload: Prisma.InputJsonValue;
  performedBy?: string;
}) {
  return prisma.actionLog.create({
    data: {
      tournamentId: params.tournamentId,
      matchId: params.matchId,
      action: params.action,
      payload: params.payload,
      performedBy: params.performedBy ?? "HOST",
    },
  });
}

const emptyStats = {
  wins: 0,
  losses: 0,
  points: 0,
  finishes: { spin: 0, over: 0, burst: 0, xtreme: 0 },
  longestStreak: 0,
  currentStreak: 0,
};

type Stats = typeof emptyStats;

function asStats(raw: unknown): Stats {
  if (typeof raw !== "object" || raw === null) return { ...emptyStats };
  const s = raw as Partial<Stats>;
  return {
    wins: Number(s.wins ?? 0),
    losses: Number(s.losses ?? 0),
    points: Number(s.points ?? 0),
    finishes: {
      spin: Number((s.finishes as Stats["finishes"])?.spin ?? 0),
      over: Number((s.finishes as Stats["finishes"])?.over ?? 0),
      burst: Number((s.finishes as Stats["finishes"])?.burst ?? 0),
      xtreme: Number((s.finishes as Stats["finishes"])?.xtreme ?? 0),
    },
    longestStreak: Number(s.longestStreak ?? 0),
    currentStreak: Number(s.currentStreak ?? 0),
  };
}

/** Update player W/L/points when a match is completed */
export async function applyMatchResultToStats(match: {
  player1Id: string | null;
  player2Id: string | null;
  score1: number;
  score2: number;
  finishes: FinishRecord[];
}) {
  if (!match.player1Id || !match.player2Id) return;
  if (match.score1 === match.score2) return; // no ties expected

  const winnerId =
    match.score1 > match.score2 ? match.player1Id : match.player2Id;
  const loserId =
    match.score1 > match.score2 ? match.player2Id : match.player1Id;

  const [p1, p2] = await Promise.all([
    prisma.player.findUnique({ where: { id: match.player1Id } }),
    prisma.player.findUnique({ where: { id: match.player2Id } }),
  ]);
  if (!p1 || !p2) return;

  const updateOne = async (
    playerId: string,
    current: unknown,
    won: boolean,
    scorePoints: number,
    playerFinishes: FinishRecord[]
  ) => {
    const stats = asStats(current);
    if (won) {
      stats.wins += 1;
      stats.currentStreak += 1;
      stats.longestStreak = Math.max(stats.longestStreak, stats.currentStreak);
    } else {
      stats.losses += 1;
      stats.currentStreak = 0;
    }
    stats.points += scorePoints;
    for (const f of playerFinishes) {
      const key = f.type.toLowerCase() as keyof Stats["finishes"];
      if (key in stats.finishes) stats.finishes[key] += 1;
    }
    await prisma.player.update({
      where: { id: playerId },
      data: { stats },
    });
  };

  const f1 = match.finishes.filter((f) => f.playerId === match.player1Id);
  const f2 = match.finishes.filter((f) => f.playerId === match.player2Id);

  await updateOne(
    match.player1Id,
    p1.stats,
    winnerId === match.player1Id,
    match.score1,
    f1
  );
  await updateOne(
    match.player2Id,
    p2.stats,
    winnerId === match.player2Id,
    match.score2,
    f2
  );

  return { winnerId, loserId };
}

/** Advance winner into next single-elim match */
export async function advanceWinner(params: {
  tournamentId: string;
  stageId: string | null;
  round: number;
  matchNumber: number | null;
  winnerId: string;
}) {
  const { tournamentId, stageId, round, matchNumber, winnerId } = params;
  if (matchNumber == null) return null;

  const nextRound = round + 1;
  const nextMatchNumber = Math.ceil(matchNumber / 2);

  const next = await prisma.match.findFirst({
    where: {
      tournamentId,
      ...(stageId ? { stageId } : {}),
      round: nextRound,
      matchNumber: nextMatchNumber,
    },
  });
  if (!next) return null;

  const isPlayer1Slot = matchNumber % 2 === 1;
  const data: Prisma.MatchUpdateInput = isPlayer1Slot
    ? { player1: { connect: { id: winnerId } } }
    : { player2: { connect: { id: winnerId } } };

  // If both sides filled after this, mark READY
  const updated = await prisma.match.update({
    where: { id: next.id },
    data,
    include: { player1: true, player2: true },
  });

  if (updated.player1Id && updated.player2Id && updated.status === "PENDING") {
    return prisma.match.update({
      where: { id: updated.id },
      data: { status: "READY" },
      include: { player1: true, player2: true },
    });
  }
  return updated;
}
