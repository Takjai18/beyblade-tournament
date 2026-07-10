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
  matches?: unknown[];
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
};
