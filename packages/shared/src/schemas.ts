import { z } from "zod";
import { DEFAULT_TOURNAMENT_SETTINGS } from "./constants.js";

export const FormatSchema = z.enum([
  "SINGLE_ELIM",
  "DOUBLE_ELIM",
  "ROUND_ROBIN",
  "SWISS",
  "GROUP_SWISS",
]);

export const StatusSchema = z.enum([
  "DRAFT",
  "REGISTRATION",
  "LIVE",
  "FINISHED",
  "ARCHIVED",
]);

export const MatchStatusSchema = z.enum([
  "PENDING",
  "READY",
  "LIVE",
  "COMPLETED",
  "CANCELLED",
]);

export const RoleSchema = z.enum(["HOST", "REFEREE", "PLAYER", "VIEWER"]);

export const FinishTypeSchema = z.enum(["SPIN", "OVER", "BURST", "XTREME"]);

export const DeckSchema = z.object({
  id: z.string(),
  blade: z.string().min(1),
  ratchet: z.string().min(1),
  bit: z.string().min(1),
  assist: z.string().optional(),
  photoUrl: z.string().url().optional().or(z.literal("")),
  notes: z.string().optional(),
  order: z.number().int().min(0),
});

export const TournamentSettingsSchema = z.object({
  pointsToWin: z.union([z.literal(4), z.literal(7)]).default(4),
  is3on3: z.boolean().default(false),
  swissRounds: z.number().int().min(1).max(20).default(5),
  allowReOrder: z.boolean().default(true),
  maxPlayers: z.number().int().min(2).max(256).default(64),
  /** GROUP_SWISS / group stage 組數 */
  groupCount: z.number().int().min(2).max(16).default(4),
});

export const CreateTournamentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  format: FormatSchema.default("SINGLE_ELIM"),
  settings: TournamentSettingsSchema.partial().optional(),
  hostPin: z
    .string()
    .regex(/^\d{4,6}$/, "Host PIN 必須為 4–6 位數字"),
  streamUrl: z.string().url().optional().or(z.literal("")),
  logoUrl: z.string().url().optional().or(z.literal("")),
});

export const UpdateTournamentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).nullable().optional(),
  format: FormatSchema.optional(),
  settings: TournamentSettingsSchema.partial().optional(),
  status: StatusSchema.optional(),
  streamUrl: z.string().url().nullable().optional().or(z.literal("")),
  logoUrl: z.string().url().nullable().optional().or(z.literal("")),
  hostPin: z
    .string()
    .regex(/^\d{4,6}$/)
    .optional(),
});

export const CreatePlayerSchema = z.object({
  name: z.string().min(1).max(50),
  emoji: z.string().max(8).optional().default("🌀"),
  avatarUrl: z.string().url().optional().or(z.literal("")),
  seed: z.number().int().positive().optional(),
  decks: z.array(DeckSchema).max(3).optional().default([]),
  currentOrder: z.array(z.number().int().min(0)).max(3).optional(),
});

export const UpdatePlayerSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  emoji: z.string().max(8).optional(),
  avatarUrl: z.string().url().nullable().optional().or(z.literal("")),
  seed: z.number().int().positive().nullable().optional(),
  decks: z.array(DeckSchema).max(3).optional(),
  currentOrder: z.array(z.number().int().min(0)).max(3).optional(),
  isDropped: z.boolean().optional(),
  stats: z.record(z.unknown()).optional(),
});

export const SetMatchBeySchema = z.object({
  currentBey1: z.number().int().min(0).max(2).optional(),
  currentBey2: z.number().int().min(0).max(2).optional(),
});

export const ScoreMatchSchema = z.object({
  type: FinishTypeSchema,
  playerId: z.string().min(1),
  refereeName: z.string().optional(),
  beyIndex: z.number().int().min(0).max(2).optional(),
});

export const JoinRefereeSchema = z.object({
  pin: z.string().min(4).max(6),
  name: z.string().min(1).max(50),
});

export const GenerateBracketSchema = z.object({
  format: FormatSchema.optional(),
  seeding: z.enum(["seed", "random", "registration"]).optional().default("seed"),
});

export const JoinTournamentSocketSchema = z.object({
  tournamentId: z.string().min(1),
  role: RoleSchema.default("VIEWER"),
  pin: z.string().optional(),
  name: z.string().optional(),
});

export type CreateTournamentInput = z.infer<typeof CreateTournamentSchema>;
export type UpdateTournamentInput = z.infer<typeof UpdateTournamentSchema>;
export type CreatePlayerInput = z.infer<typeof CreatePlayerSchema>;
export type UpdatePlayerInput = z.infer<typeof UpdatePlayerSchema>;
export type TournamentSettings = z.infer<typeof TournamentSettingsSchema>;
export type Deck = z.infer<typeof DeckSchema>;
export type Format = z.infer<typeof FormatSchema>;
export type Status = z.infer<typeof StatusSchema>;
export type FinishType = z.infer<typeof FinishTypeSchema>;
export type Role = z.infer<typeof RoleSchema>;

export function mergeSettings(
  partial?: Partial<TournamentSettings>
): TournamentSettings {
  return TournamentSettingsSchema.parse({
    ...DEFAULT_TOURNAMENT_SETTINGS,
    ...partial,
  });
}

/** Simple slugify for Chinese + English names */
export function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
  const suffix = Math.random().toString(36).slice(2, 7);
  return base ? `${base}-${suffix}` : `t-${suffix}`;
}
