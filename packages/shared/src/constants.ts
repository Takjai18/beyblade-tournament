/** Finish type → points (4-point system base) */
export const FINISH_POINTS = {
  SPIN: 1,
  OVER: 2,
  BURST: 2,
  XTREME: 3,
} as const;

export type FinishTypeKey = keyof typeof FINISH_POINTS;

export const FORMAT_LABELS = {
  SINGLE_ELIM: { zh: "單敗淘汰", en: "Single Elimination" },
  DOUBLE_ELIM: { zh: "雙敗淘汰", en: "Double Elimination" },
  ROUND_ROBIN: { zh: "循環賽", en: "Round Robin" },
  SWISS: { zh: "瑞士制", en: "Swiss" },
  GROUP_SWISS: { zh: "分組瑞士制", en: "Group + Swiss" },
} as const;

export const STATUS_LABELS = {
  DRAFT: { zh: "草稿", en: "Draft" },
  REGISTRATION: { zh: "報名中", en: "Registration" },
  LIVE: { zh: "進行中", en: "Live" },
  FINISHED: { zh: "已結束", en: "Finished" },
  ARCHIVED: { zh: "已封存", en: "Archived" },
} as const;

export const DEFAULT_TOURNAMENT_SETTINGS = {
  pointsToWin: 4 as 4 | 7,
  is3on3: false,
  swissRounds: 5,
  allowReOrder: true,
  maxPlayers: 64,
};

export const SOCKET_EVENTS = {
  // Client → Server
  JOIN_TOURNAMENT: "join_tournament",
  LEAVE_TOURNAMENT: "leave_tournament",
  SCORE_MATCH: "score_match",
  UNDO_MATCH: "undo_match",
  UPDATE_DECK: "update_deck",
  // Server → Client
  TOURNAMENT_UPDATED: "tournament_updated",
  MATCH_UPDATED: "match_updated",
  STANDINGS_UPDATED: "standings_updated",
  PLAYER_UPDATED: "player_updated",
  ACTION_LOGGED: "action_logged",
  ERROR: "error",
} as const;

export function tournamentRoom(tournamentId: string) {
  return `tournament:${tournamentId}`;
}
