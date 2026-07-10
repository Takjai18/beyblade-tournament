import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

const include = { player1: true, player2: true } as const;

/**
 * Advance winner/loser after a completed double-elim match.
 * Match.notes: "W" | "L" | "GF"
 *
 * Drop rules (standard power-of-2):
 * - WB round r match m loser → LB
 * - WB winner → next WB (or GF p1)
 * - LB winner → next LB (or GF p2)
 */
export async function advanceDoubleElim(params: {
  tournamentId: string;
  stageId: string | null;
  match: {
    id: string;
    round: number;
    matchNumber: number | null;
    notes: string | null;
    player1Id: string | null;
    player2Id: string | null;
  };
  winnerId: string;
  loserId: string;
}) {
  const { tournamentId, stageId, match, winnerId, loserId } = params;
  const notes = match.notes ?? "W";
  const mn = match.matchNumber ?? 1;

  if (notes === "GF") {
    // Grand final done — tournament over (no further advance)
    return { nextMatches: [] as unknown[] };
  }

  const stageFilter = stageId ? { stageId } : {};
  const updated: unknown[] = [];

  async function fillSlot(
    where: Prisma.MatchWhereInput,
    playerId: string,
    asPlayer1: boolean
  ) {
    const target = await prisma.match.findFirst({
      where: { tournamentId, ...stageFilter, ...where },
    });
    if (!target) return null;

    // Don't overwrite if already has this player
    if (target.player1Id === playerId || target.player2Id === playerId) {
      return target;
    }

    let data: Prisma.MatchUpdateInput;
    if (asPlayer1) {
      if (target.player1Id && target.player1Id !== playerId) {
        // slot taken — try player2
        data = { player2: { connect: { id: playerId } } };
      } else {
        data = { player1: { connect: { id: playerId } } };
      }
    } else {
      if (target.player2Id && target.player2Id !== playerId) {
        data = { player1: { connect: { id: playerId } } };
      } else {
        data = { player2: { connect: { id: playerId } } };
      }
    }

    let next = await prisma.match.update({
      where: { id: target.id },
      data,
      include,
    });

    if (next.player1Id && next.player2Id && next.status === "PENDING") {
      next = await prisma.match.update({
        where: { id: next.id },
        data: { status: "READY" },
        include,
      });
    }
    updated.push(next);
    return next;
  }

  if (notes === "W") {
    // Winner advances in WB
    const wbMatches = await prisma.match.findMany({
      where: { tournamentId, ...stageFilter, notes: "W" },
      orderBy: [{ round: "desc" }],
      take: 1,
    });
    const maxWbRound = wbMatches[0]?.round ?? match.round;

    if (match.round < maxWbRound) {
      await fillSlot(
        {
          notes: "W",
          round: match.round + 1,
          matchNumber: Math.ceil(mn / 2),
        },
        winnerId,
        mn % 2 === 1
      );
    } else {
      // WB final winner → GF player1
      await fillSlot({ notes: "GF" }, winnerId, true);
    }

    // Loser drops to LB
    // Mapping: WBR1 losers pair into LBR1
    // WBR r (r>1) losers enter LB at round 2*(r-1)
    if (match.round === 1) {
      const lbMatchNum = Math.ceil(mn / 2);
      const asP1 = mn % 2 === 1;
      await fillSlot(
        { notes: "L", round: 1, matchNumber: lbMatchNum },
        loserId,
        asP1
      );
    } else {
      // Drop into even LB round that receives this WB round's losers
      // Convention: WB round r loser → LB round 2*(r-1) as player2 (from winners)
      const lbRound = 2 * (match.round - 1);
      const lbMatchNum = mn; // same match number within half
      await fillSlot(
        { notes: "L", round: lbRound, matchNumber: lbMatchNum },
        loserId,
        false // typically player2 = from winners drop
      );
    }
  }

  if (notes === "L") {
    // Winner advances in LB
    const lbAll = await prisma.match.findMany({
      where: { tournamentId, ...stageFilter, notes: "L" },
      orderBy: [{ round: "desc" }],
      take: 1,
    });
    const maxLbRound = lbAll[0]?.round ?? match.round;

    if (match.round < maxLbRound) {
      // Next LB round
      const nextRound = match.round + 1;
      // Odd→even: winners of Lr pair or wait
      const nextMn = Math.ceil(mn / 2);
      await fillSlot(
        { notes: "L", round: nextRound, matchNumber: nextMn },
        winnerId,
        mn % 2 === 1
      );
    } else {
      // LB final winner → GF player2
      await fillSlot({ notes: "GF" }, winnerId, false);
    }
  }

  return { nextMatches: updated };
}
