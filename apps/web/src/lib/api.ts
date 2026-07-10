const API_URL = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string }).error ?? res.statusText,
      res.status,
      (data as { details?: unknown }).details
    );
  }
  return data as T;
}

export interface TournamentListItem {
  id: string;
  slug: string;
  name: string;
  format: string;
  status: string;
  shareCode: string;
  createdAt: string;
  description?: string | null;
  playerCount: number;
}

export interface Player {
  id: string;
  tournamentId: string;
  name: string;
  emoji: string | null;
  avatarUrl: string | null;
  seed: number | null;
  decks: unknown[];
  currentOrder: number[];
  stats: unknown;
  isDropped: boolean;
  createdAt: string;
}

export interface FinishRecord {
  id: string;
  type: "SPIN" | "OVER" | "BURST" | "XTREME";
  points: number;
  playerId: string;
  timestamp: string;
  refereeId?: string;
  beyIndex?: number;
}

export interface Match {
  id: string;
  tournamentId: string;
  stageId: string | null;
  groupId?: string | null;
  round: number;
  matchNumber: number | null;
  player1Id: string | null;
  player2Id: string | null;
  score1: number;
  score2: number;
  status: string;
  notes?: string | null;
  finishes: FinishRecord[];
  currentBey1?: number | null;
  currentBey2?: number | null;
  startedAt: string | null;
  completedAt: string | null;
  player1?: Player | null;
  player2?: Player | null;
  group?: { id: string; name: string } | null;
  tournament?: {
    id: string;
    slug: string;
    name: string;
    format: string;
    settings: Record<string, unknown>;
    status: string;
  };
}

export interface ActionLog {
  id: string;
  tournamentId: string;
  matchId: string | null;
  action: string;
  payload: unknown;
  performedBy: string | null;
  createdAt: string;
}

export interface Tournament {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  format: string;
  settings: Record<string, unknown>;
  status: string;
  shareCode: string;
  streamUrl: string | null;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  players?: Player[];
  matches?: Match[];
  hasHostPin?: boolean;
  _count?: { players: number; matches: number };
}

export const api = {
  listTournaments: () => request<TournamentListItem[]>("/api/tournaments"),

  getTournament: (slug: string) =>
    request<Tournament>(`/api/tournaments/${slug}`),

  createTournament: (body: {
    name: string;
    description?: string;
    format: string;
    hostPin: string;
    settings?: Record<string, unknown>;
  }) =>
    request<Tournament>("/api/tournaments", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateTournament: (id: string, body: Record<string, unknown>) =>
    request<Tournament>(`/api/tournaments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteTournament: (id: string) =>
    request<void>(`/api/tournaments/${id}`, { method: "DELETE" }),

  listPlayers: (tournamentId: string) =>
    request<Player[]>(`/api/tournaments/${tournamentId}/players`),

  createPlayer: (
    tournamentId: string,
    body: {
      name: string;
      emoji?: string;
      seed?: number;
      decks?: unknown[];
      currentOrder?: number[];
    }
  ) =>
    request<Player>(`/api/tournaments/${tournamentId}/players`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updatePlayer: (id: string, body: Record<string, unknown>) =>
    request<Player>(`/api/players/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deletePlayer: (id: string) =>
    request<void>(`/api/players/${id}`, { method: "DELETE" }),

  joinReferee: (tournamentId: string, body: { pin: string; name: string }) =>
    request<{
      role: string;
      referee: unknown;
      tournamentId: string;
      slug: string;
    }>(`/api/tournaments/${tournamentId}/join-referee`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getStandings: (tournamentId: string) =>
    request<
      {
        playerId: string;
        name: string;
        emoji: string | null;
        seed: number | null;
        wins: number;
        losses: number;
        points: number;
      }[]
    >(`/api/tournaments/${tournamentId}/standings`),

  getByShareCode: (shareCode: string) =>
    request<Tournament>(`/api/watch/${shareCode}`),

  listMatches: (tournamentId: string) =>
    request<Match[]>(`/api/tournaments/${tournamentId}/matches`),

  getMatch: (id: string) => request<Match>(`/api/matches/${id}`),

  generateBracket: (
    tournamentId: string,
    body?: { format?: string; seeding?: string }
  ) =>
    request<{
      stage: unknown;
      matches: Match[];
      format: string;
      count: number;
    }>(`/api/tournaments/${tournamentId}/generate`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),

  swissNextRound: (tournamentId: string) =>
    request<{
      round: number;
      matches: Match[];
      newCount: number;
    }>(`/api/tournaments/${tournamentId}/swiss/next`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  setMatchBey: (
    id: string,
    body: { currentBey1?: number; currentBey2?: number }
  ) =>
    request<Match>(`/api/matches/${id}/bey`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  startMatch: (id: string, body?: { refereeName?: string }) =>
    request<Match>(`/api/matches/${id}/start`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),

  scoreMatch: (
    id: string,
    body: {
      type: "SPIN" | "OVER" | "BURST" | "XTREME";
      playerId: string;
      refereeName?: string;
      beyIndex?: number;
    }
  ) =>
    request<{
      match: Match;
      finish: FinishRecord;
      autoCompleted: boolean;
      nextMatch: Match | null;
    }>(`/api/matches/${id}/score`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  undoMatch: (id: string, body?: { refereeName?: string }) =>
    request<{ match: Match; removed: FinishRecord }>(
      `/api/matches/${id}/undo`,
      {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      }
    ),

  completeMatch: (id: string, body?: { refereeName?: string }) =>
    request<{ match: Match; nextMatch: Match | null }>(
      `/api/matches/${id}/complete`,
      {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      }
    ),

  getMatchActions: (id: string) =>
    request<ActionLog[]>(`/api/matches/${id}/actions`),

  aiStatus: () =>
    request<{ configured: boolean; model: string; feature: string }>(
      "/api/ai/status"
    ),

  identifyBey: (body: {
    imageBase64: string;
    mimeType?: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  }) =>
    request<{
      blade: string;
      ratchet: string;
      bit: string;
      assist?: string;
      confidence: number;
      notes?: string;
      raw?: string;
    }>("/api/ai/identify-bey", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
