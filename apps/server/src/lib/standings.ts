import { prisma } from "./prisma.js";

export interface StandingRow {
  rank: number;
  playerId: string;
  name: string;
  emoji: string | null;
  seed: number | null;
  wins: number;
  losses: number;
  /** Match wins as points (Swiss convention: 1 per win, bye = 1) */
  matchPoints: number;
  /** Sum of in-match scores (Spin/Over/Burst points) */
  scorePoints: number;
  /** scorePoints for - against */
  scoreDiff: number;
  /** Buchholz: sum of opponents' match wins */
  buchholz: number;
  /** Top cut / 晉級 */
  qualify: boolean;
  isDropped: boolean;
}

function getSettings(settings: unknown) {
  const s =
    typeof settings === "object" && settings !== null
      ? (settings as Record<string, unknown>)
      : {};
  return {
    swissRounds: Number(s.swissRounds) || 5,
    /** How many advance; 0 = top half (min 1) */
    advanceCount: Number(s.advanceCount) || 0,
  };
}

export async function computeStandings(
  tournamentId: string
): Promise<{
  standings: StandingRow[];
  meta: {
    format: string;
    currentRound: number;
    maxRounds: number | null;
    swissComplete: boolean;
    openMatches: number;
    advanceCount: number;
  };
}> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: true,
      matches: true,
    },
  });
  if (!tournament) {
    throw new Error("找不到賽事");
  }

  const settings = getSettings(tournament.settings);
  const players = tournament.players.filter((p) => !p.isDropped);
  const matches = tournament.matches.filter((m) => m.status === "COMPLETED");

  type Acc = {
    wins: number;
    losses: number;
    matchPoints: number;
    scoreFor: number;
    scoreAgainst: number;
    opponents: string[];
  };

  const map = new Map<string, Acc>();
  for (const p of players) {
    map.set(p.id, {
      wins: 0,
      losses: 0,
      matchPoints: 0,
      scoreFor: 0,
      scoreAgainst: 0,
      opponents: [],
    });
  }

  for (const m of matches) {
    // Bye
    if (m.player1Id && !m.player2Id) {
      const a = map.get(m.player1Id);
      if (a) {
        a.wins += 1;
        a.matchPoints += 1;
      }
      continue;
    }
    if (m.player2Id && !m.player1Id) {
      const a = map.get(m.player2Id);
      if (a) {
        a.wins += 1;
        a.matchPoints += 1;
      }
      continue;
    }
    if (!m.player1Id || !m.player2Id) continue;

    const a = map.get(m.player1Id);
    const b = map.get(m.player2Id);
    if (!a || !b) continue;

    a.opponents.push(m.player2Id);
    b.opponents.push(m.player1Id);
    a.scoreFor += m.score1;
    a.scoreAgainst += m.score2;
    b.scoreFor += m.score2;
    b.scoreAgainst += m.score1;

    if (m.score1 > m.score2) {
      a.wins += 1;
      a.matchPoints += 1;
      b.losses += 1;
    } else if (m.score2 > m.score1) {
      b.wins += 1;
      b.matchPoints += 1;
      a.losses += 1;
    }
  }

  const rows = players.map((p) => {
    const acc = map.get(p.id)!;
    const buchholz = acc.opponents.reduce((sum, oid) => {
      const o = map.get(oid);
      return sum + (o?.wins ?? 0);
    }, 0);
    return {
      playerId: p.id,
      name: p.name,
      emoji: p.emoji,
      seed: p.seed,
      wins: acc.wins,
      losses: acc.losses,
      matchPoints: acc.matchPoints,
      scorePoints: acc.scoreFor,
      scoreDiff: acc.scoreFor - acc.scoreAgainst,
      buchholz,
      isDropped: p.isDropped,
    };
  });

  // Sort: matchPoints > scoreDiff > scorePoints > buchholz > seed
  rows.sort((a, b) => {
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
    if (b.scoreDiff !== a.scoreDiff) return b.scoreDiff - a.scoreDiff;
    if (b.scorePoints !== a.scorePoints) return b.scorePoints - a.scorePoints;
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    if (a.seed != null && b.seed != null) return a.seed - b.seed;
    return a.name.localeCompare(b.name, "zh-Hant");
  });

  const advanceCount =
    settings.advanceCount > 0
      ? Math.min(settings.advanceCount, rows.length)
      : Math.max(1, Math.floor(rows.length / 2));

  const standings: StandingRow[] = rows.map((r, i) => ({
    ...r,
    rank: i + 1,
    qualify: i < advanceCount,
  }));

  const currentRound = Math.max(0, ...tournament.matches.map((m) => m.round));
  const openMatches = tournament.matches.filter(
    (m) =>
      m.player1Id &&
      m.player2Id &&
      m.status !== "COMPLETED" &&
      m.status !== "CANCELLED"
  ).length;

  const maxRounds =
    tournament.format === "SWISS" ? settings.swissRounds : null;
  const swissComplete =
    tournament.format === "SWISS" &&
    currentRound >= (maxRounds ?? 0) &&
    openMatches === 0 &&
    tournament.matches.length > 0;

  return {
    standings,
    meta: {
      format: tournament.format,
      currentRound,
      maxRounds,
      swissComplete,
      openMatches,
      advanceCount,
    },
  };
}
