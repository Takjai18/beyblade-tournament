/** Bracket generation — Phase 1 + Phase 2 formats */

export type SeedingMode = "seed" | "random" | "registration";

export interface BracketPlayer {
  id: string;
  name: string;
  seed: number | null;
  createdAt: Date;
  /** from player.stats for swiss pairing */
  wins?: number;
  losses?: number;
  points?: number;
}

export interface GeneratedMatch {
  round: number;
  matchNumber: number;
  player1Id: string | null;
  player2Id: string | null;
  status: "PENDING" | "READY" | "COMPLETED";
  /** W = winners, L = losers, GF = grand final, G = group stage */
  notes?: string;
  groupIndex?: number;
}

export interface SwissStanding {
  id: string;
  wins: number;
  losses: number;
  points: number;
  seed: number | null;
  opponents: string[];
}

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function seedOrder(bracketSize: number): number[] {
  let seeds = [1];
  while (seeds.length < bracketSize) {
    const next: number[] = [];
    const sum = seeds.length * 2 + 1;
    for (const s of seeds) {
      next.push(s);
      next.push(sum - s);
    }
    seeds = next;
  }
  return seeds;
}

export function sortPlayers(
  players: BracketPlayer[],
  mode: SeedingMode
): BracketPlayer[] {
  const list = [...players];
  if (mode === "random") {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }
  if (mode === "registration") {
    return list.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
  }
  return list.sort((a, b) => {
    if (a.seed != null && b.seed != null) return a.seed - b.seed;
    if (a.seed != null) return -1;
    if (b.seed != null) return 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export function generateSingleElim(
  players: BracketPlayer[],
  seeding: SeedingMode = "seed"
): GeneratedMatch[] {
  if (players.length < 2) {
    throw new Error("至少需要 2 位玩家才能產生對戰表");
  }

  const ordered = sortPlayers(players, seeding);
  const size = nextPowerOf2(ordered.length);
  const order = seedOrder(size);

  const slots: (string | null)[] = order.map((seedNum) => {
    const idx = seedNum - 1;
    return idx < ordered.length ? ordered[idx].id : null;
  });

  const matches: GeneratedMatch[] = [];
  const totalRounds = Math.log2(size);

  let matchNumber = 1;
  for (let i = 0; i < size; i += 2) {
    const p1 = slots[i];
    const p2 = slots[i + 1];
    const isBye = p1 == null || p2 == null;
    matches.push({
      round: 1,
      matchNumber: matchNumber++,
      player1Id: p1,
      player2Id: p2,
      status: isBye && (p1 || p2) ? "COMPLETED" : p1 && p2 ? "READY" : "PENDING",
      notes: "W",
    });
  }

  for (let round = 2; round <= totalRounds; round++) {
    const count = size / Math.pow(2, round);
    for (let m = 0; m < count; m++) {
      matches.push({
        round,
        matchNumber: m + 1,
        player1Id: null,
        player2Id: null,
        status: "PENDING",
        notes: "W",
      });
    }
  }

  if (totalRounds >= 2) {
    const r1 = matches.filter((m) => m.round === 1);
    for (const m of r1) {
      if (m.status !== "COMPLETED") continue;
      const winner = m.player1Id ?? m.player2Id;
      if (!winner) continue;
      const next = matches.find(
        (x) =>
          x.round === 2 &&
          x.matchNumber === Math.ceil(m.matchNumber / 2)
      );
      if (!next) continue;
      if (m.matchNumber % 2 === 1) next.player1Id = winner;
      else next.player2Id = winner;
      if (next.player1Id && next.player2Id) next.status = "READY";
    }
  }

  return matches;
}

export function generateRoundRobin(
  players: BracketPlayer[],
  seeding: SeedingMode = "seed",
  notes = "G"
): GeneratedMatch[] {
  if (players.length < 2) {
    throw new Error("至少需要 2 位玩家才能產生對戰表");
  }

  const ordered = sortPlayers(players, seeding);
  const ids: (string | null)[] = ordered.map((p) => p.id);
  if (ids.length % 2 === 1) ids.push(null);

  const n = ids.length;
  const rounds = n - 1;
  const half = n / 2;
  const arr = [...ids];
  const matches: GeneratedMatch[] = [];

  for (let r = 0; r < rounds; r++) {
    let matchNumber = 1;
    for (let i = 0; i < half; i++) {
      const p1 = arr[i];
      const p2 = arr[n - 1 - i];
      if (p1 == null && p2 == null) continue;
      const isBye = p1 == null || p2 == null;
      matches.push({
        round: r + 1,
        matchNumber: matchNumber++,
        player1Id: p1,
        player2Id: p2,
        status: isBye ? "COMPLETED" : "READY",
        notes,
      });
    }
    const fixed = arr[0];
    const rest = arr.slice(1);
    const last = rest.pop()!;
    rest.unshift(last);
    arr.splice(0, arr.length, fixed, ...rest);
  }

  return matches;
}

/**
 * Double elimination: winners bracket + losers bracket + grand final.
 * notes: "W" | "L" | "GF"
 * W rounds use same structure as single elim.
 * L rounds: round numbers continue after WB max, but we encode LB round in matchNumber
 *   and use notes="L" with round = lbRound for clarity.
 */
export function generateDoubleElim(
  players: BracketPlayer[],
  seeding: SeedingMode = "seed"
): GeneratedMatch[] {
  if (players.length < 2) {
    throw new Error("至少需要 2 位玩家才能產生對戰表");
  }

  const ordered = sortPlayers(players, seeding);
  const size = nextPowerOf2(ordered.length);
  if (size < 2) throw new Error("人數不足");

  const order = seedOrder(size);
  const slots: (string | null)[] = order.map((seedNum) => {
    const idx = seedNum - 1;
    return idx < ordered.length ? ordered[idx].id : null;
  });

  const matches: GeneratedMatch[] = [];
  const wbRounds = Math.log2(size);

  // --- Winners bracket ---
  let mn = 1;
  for (let i = 0; i < size; i += 2) {
    const p1 = slots[i];
    const p2 = slots[i + 1];
    const isBye = p1 == null || p2 == null;
    matches.push({
      round: 1,
      matchNumber: mn++,
      player1Id: p1,
      player2Id: p2,
      status: isBye && (p1 || p2) ? "COMPLETED" : p1 && p2 ? "READY" : "PENDING",
      notes: "W",
    });
  }
  for (let round = 2; round <= wbRounds; round++) {
    const count = size / Math.pow(2, round);
    for (let m = 0; m < count; m++) {
      matches.push({
        round,
        matchNumber: m + 1,
        player1Id: null,
        player2Id: null,
        status: "PENDING",
        notes: "W",
      });
    }
  }

  // Advance WB byes
  for (const m of matches.filter((x) => x.notes === "W" && x.round === 1)) {
    if (m.status !== "COMPLETED") continue;
    const winner = m.player1Id ?? m.player2Id;
    if (!winner) continue;
    const next = matches.find(
      (x) =>
        x.notes === "W" &&
        x.round === 2 &&
        x.matchNumber === Math.ceil(m.matchNumber / 2)
    );
    if (!next) continue;
    if (m.matchNumber % 2 === 1) next.player1Id = winner;
    else next.player2Id = winner;
    if (next.player1Id && next.player2Id) next.status = "READY";
  }

  // --- Losers bracket structure ---
  // LB round k has size/2^k matches approximately
  // Standard: LB has (wbRounds * 2 - 1) rounds for full DE
  // Simplified structure that works with drop-down logic:
  // L-round r (1..wbRounds*2-1): empty pending matches
  const lbRounds = wbRounds * 2 - 1;
  for (let lr = 1; lr <= lbRounds; lr++) {
    // Number of matches in LB round
    // Odd LB rounds receive WB drop-ins: size/2^((lr+1)/2) / 2
    let count: number;
    if (lr === 1) {
      count = size / 4; // half of WBR1 losers paired
    } else if (lr % 2 === 0) {
      // even: wait for next WB losers
      count = size / Math.pow(2, lr / 2 + 1);
    } else {
      count = size / Math.pow(2, (lr + 1) / 2 + 1);
    }
    count = Math.max(1, Math.floor(count));
    // Last LB rounds collapse to 1
    if (lr >= lbRounds - 1) count = 1;
    // Fix for size 4: L1=1, L2=1, L3=1
    if (size === 4) {
      if (lr === 1) count = 1;
      else if (lr === 2) count = 1;
      else if (lr === 3) count = 1;
    }
    if (size === 2) {
      // just GF after one WB match - no LB needed if only 2, but DE still has rematch
      continue;
    }

    for (let m = 0; m < count; m++) {
      matches.push({
        round: lr,
        matchNumber: m + 1,
        player1Id: null,
        player2Id: null,
        status: "PENDING",
        notes: "L",
      });
    }
  }

  // Grand final
  matches.push({
    round: 1,
    matchNumber: 1,
    player1Id: null,
    player2Id: null,
    status: "PENDING",
    notes: "GF",
  });

  // For size 2: only W R1 + GF
  if (size === 2) {
    return matches.filter((m) => m.notes === "W" || m.notes === "GF");
  }

  return matches;
}

/** Score-based Swiss pairing for one round (avoid rematches when possible) */
export function generateSwissRound(
  standings: SwissStanding[],
  round: number
): GeneratedMatch[] {
  if (standings.length < 2) {
    throw new Error("至少需要 2 位玩家");
  }

  // Sort: wins desc, points desc, seed asc, id
  const sorted = [...standings].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.points !== a.points) return b.points - a.points;
    if (a.seed != null && b.seed != null) return a.seed - b.seed;
    if (a.seed != null) return -1;
    if (b.seed != null) return 1;
    return a.id.localeCompare(b.id);
  });

  const unpaired = sorted.map((s) => s.id);
  const opponentMap = new Map(standings.map((s) => [s.id, new Set(s.opponents)]));
  const matches: GeneratedMatch[] = [];
  let matchNumber = 1;

  // Bye for odd count — highest remaining? usually lowest ranked unpaired gets bye for fairness;
  // Swiss often gives bye to top unpaired if no rematch issues. Use bottom of list for bye.
  let byePlayer: string | null = null;
  if (unpaired.length % 2 === 1) {
    byePlayer = unpaired.pop()!;
    matches.push({
      round,
      matchNumber: matchNumber++,
      player1Id: byePlayer,
      player2Id: null,
      status: "COMPLETED",
      notes: "S",
    });
  }

  while (unpaired.length >= 2) {
    const p1 = unpaired.shift()!;
    // Find best opponent: closest in standings who hasn't played
    let oppIdx = unpaired.findIndex(
      (id) => !opponentMap.get(p1)?.has(id)
    );
    if (oppIdx < 0) oppIdx = 0; // forced rematch
    const p2 = unpaired.splice(oppIdx, 1)[0];
    matches.push({
      round,
      matchNumber: matchNumber++,
      player1Id: p1,
      player2Id: p2,
      status: "READY",
      notes: "S",
    });
  }

  return matches;
}

/** Snake-draft into groups, then RR per group */
export function generateGroupStage(
  players: BracketPlayer[],
  groupCount: number,
  seeding: SeedingMode = "seed"
): { groups: { name: string; playerIds: string[] }[]; matches: GeneratedMatch[] } {
  if (players.length < 2) {
    throw new Error("至少需要 2 位玩家");
  }
  const gCount = Math.max(2, Math.min(groupCount, Math.floor(players.length / 2)));
  const ordered = sortPlayers(players, seeding);

  const groups: { name: string; playerIds: string[] }[] = Array.from(
    { length: gCount },
    (_, i) => ({
      name: `Group ${String.fromCharCode(65 + i)}`,
      playerIds: [] as string[],
    })
  );

  // Snake draft: 0→n-1 then n-1→0
  let gi = 0;
  let dir = 1;
  for (const p of ordered) {
    groups[gi].playerIds.push(p.id);
    const next = gi + dir;
    if (next >= gCount || next < 0) {
      dir *= -1;
    } else {
      gi = next;
    }
  }

  const matches: GeneratedMatch[] = [];
  groups.forEach((g, groupIndex) => {
    if (g.playerIds.length < 2) return;
    const groupPlayers = g.playerIds.map((id) => {
      const p = ordered.find((x) => x.id === id)!;
      return p;
    });
    const rr = generateRoundRobin(groupPlayers, "registration", "G");
    for (const m of rr) {
      matches.push({ ...m, groupIndex });
    }
  });

  return { groups, matches };
}

export function buildSwissStandings(
  players: BracketPlayer[],
  completedMatches: {
    player1Id: string | null;
    player2Id: string | null;
    score1: number;
    score2: number;
    status: string;
  }[]
): SwissStanding[] {
  const map = new Map<string, SwissStanding>();
  for (const p of players) {
    map.set(p.id, {
      id: p.id,
      wins: 0,
      losses: 0,
      points: 0,
      seed: p.seed,
      opponents: [],
    });
  }

  for (const m of completedMatches) {
    if (m.status !== "COMPLETED") continue;
    if (!m.player1Id && m.player2Id) {
      // bye for p2
      const s = map.get(m.player2Id);
      if (s) {
        s.wins += 1;
        s.points += 1;
      }
      continue;
    }
    if (m.player1Id && !m.player2Id) {
      const s = map.get(m.player1Id);
      if (s) {
        s.wins += 1;
        s.points += 1;
      }
      continue;
    }
    if (!m.player1Id || !m.player2Id) continue;
    const a = map.get(m.player1Id);
    const b = map.get(m.player2Id);
    if (!a || !b) continue;
    a.opponents.push(m.player2Id);
    b.opponents.push(m.player1Id);
    a.points += m.score1;
    b.points += m.score2;
    if (m.score1 > m.score2) {
      a.wins += 1;
      b.losses += 1;
    } else if (m.score2 > m.score1) {
      b.wins += 1;
      a.losses += 1;
    }
  }

  return [...map.values()];
}
