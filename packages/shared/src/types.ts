import type { Format, Role, Status, FinishType } from "./schemas.js";

export interface PlayerStats {
  wins: number;
  losses: number;
  points: number;
  finishes: {
    spin: number;
    over: number;
    burst: number;
    xtreme: number;
  };
  longestStreak: number;
  currentStreak: number;
}

export interface FinishRecord {
  id: string;
  type: FinishType;
  points: number;
  playerId: string;
  timestamp: string;
  refereeId?: string;
  beyIndex?: number;
}

export interface TournamentListItem {
  id: string;
  slug: string;
  name: string;
  format: Format;
  status: Status;
  shareCode: string;
  createdAt: string;
  playerCount: number;
}

export interface SocketJoinPayload {
  tournamentId: string;
  role: Role;
  pin?: string;
  name?: string;
}

export interface SocketScorePayload {
  matchId: string;
  type: FinishType;
  playerId: string;
}

export interface ApiError {
  error: string;
  details?: unknown;
}
