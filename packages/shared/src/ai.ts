import { z } from "zod";

export const IdentifyBeyRequestSchema = z.object({
  imageBase64: z.string().min(100, "圖片資料過短"),
  mimeType: z
    .enum(["image/jpeg", "image/png", "image/webp", "image/gif"])
    .default("image/jpeg"),
});

export const IdentifyBeyResultSchema = z.object({
  blade: z.string().default(""),
  ratchet: z.string().default(""),
  bit: z.string().default(""),
  assist: z.string().optional().default(""),
  confidence: z.number().min(0).max(1).default(0.5),
  notes: z.string().optional().default(""),
  raw: z.string().optional(),
});

export type IdentifyBeyRequest = z.infer<typeof IdentifyBeyRequestSchema>;
export type IdentifyBeyResult = z.infer<typeof IdentifyBeyResultSchema>;
