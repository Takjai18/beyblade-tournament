/** Bracket generation — SINGLE_ELIM + ROUND_ROBIN (Phase 1) */

export type SeedingMode = "seed" | "random" | "registration";

export interface BracketPlayer {
  id: string;
  name: string;
  seed: number | null;
  createdAt: Date;
}

export interface GeneratedMatch {
  round: number;
  matchNumber: number;
  player1Id: string | null;
  player2Id: string | null;
  /** bye: one side null, auto-advance later if needed */
  status: "PENDING" | "READY" | "COMPLETED";
}

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Classic seed order for bracket slots: [1,8,4,5,2,7,3,6] for size 8 */
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
  // seed: lower seed number first; missing seed → registration order at end
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

  // slot i gets seed order[i]; seed numbers are 1-based into ordered[]
  const slots: (string | null)[] = order.map((seedNum) => {
    const idx = seedNum - 1;
    return idx < ordered.length ? ordered[idx].id : null;
  });

  const matches: GeneratedMatch[] = [];
  const totalRounds = Math.log2(size);

  // Round 1
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
    });
  }

  // Later rounds — empty slots, filled on complete
  for (let round = 2; round <= totalRounds; round++) {
    const count = size / Math.pow(2, round);
    for (let m = 0; m < count; m++) {
      matches.push({
        round,
        matchNumber: m + 1,
        player1Id: null,
        player2Id: null,
        status: "PENDING",
      });
    }
  }

  // Advance bye winners into round 2
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
  seeding: SeedingMode = "seed"
): GeneratedMatch[] {
  if (players.length < 2) {
    throw new Error("至少需要 2 位玩家才能產生對戰表");
  }

  const ordered = sortPlayers(players, seeding);
  const ids: (string | null)[] = ordered.map((p) => p.id);
  if (ids.length % 2 === 1) ids.push(null); // bye

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
      });
    }
    // rotate keeping first fixed
    const fixed = arr[0];
    const rest = arr.slice(1);
    const last = rest.pop()!;
    rest.unshift(last);
    arr.splice(0, arr.length, fixed, ...rest);
  }

  return matches;
}
