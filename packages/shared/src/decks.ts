import { z } from "zod";
import { DeckSchema, type Deck } from "./schemas.js";

/** Validate 3on3 decks: max 3, unique part names (blade/ratchet/bit) across decks */
export function validateDecks(decks: Deck[]): { ok: true } | { ok: false; error: string } {
  if (decks.length > 3) {
    return { ok: false, error: "最多 3 顆陀螺（3on3）" };
  }

  const blades = new Set<string>();
  const ratchets = new Set<string>();
  const bits = new Set<string>();

  for (let i = 0; i < decks.length; i++) {
    const d = decks[i];
    const blade = d.blade.trim().toLowerCase();
    const ratchet = d.ratchet.trim().toLowerCase();
    const bit = d.bit.trim().toLowerCase();

    if (!blade || !ratchet || !bit) {
      return { ok: false, error: `第 ${i + 1} 顆：Blade / Ratchet / Bit 必填` };
    }

    // CX 系列等可後續放寬；Phase 2 預設不可重複
    if (blades.has(blade)) {
      return { ok: false, error: `Blade「${d.blade}」不可重複` };
    }
    if (ratchets.has(ratchet)) {
      return { ok: false, error: `Ratchet「${d.ratchet}」不可重複` };
    }
    if (bits.has(bit)) {
      return { ok: false, error: `Bit「${d.bit}」不可重複` };
    }
    blades.add(blade);
    ratchets.add(ratchet);
    bits.add(bit);
  }

  return { ok: true };
}

export const DecksArraySchema = z
  .array(DeckSchema)
  .max(3)
  .superRefine((decks, ctx) => {
    const result = validateDecks(decks);
    if (!result.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.error });
    }
  });

export function newDeckId() {
  return `deck_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
