import type { FastifyInstance } from "fastify";
import { IdentifyBeyRequestSchema } from "@beyblade/shared";
import { env } from "../lib/env.js";
import { identifyBeyblade, isGeminiConfigured } from "../lib/gemini.js";

export async function aiRoutes(app: FastifyInstance) {
  app.get("/api/ai/status", async () => ({
    configured: isGeminiConfigured(),
    model: env.GEMINI_MODEL,
    feature: "beyblade-vision-identify",
  }));

  app.post("/api/ai/identify-bey", async (req, reply) => {
    if (!isGeminiConfigured()) {
      return reply.status(503).send({
        error:
          "AI 辨識未啟用。請在 server .env 設定 GEMINI_API_KEY（Google AI Studio）。",
        configured: false,
      });
    }

    const parsed = IdentifyBeyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "驗證失敗",
        details: parsed.error.flatten(),
      });
    }

    // Guard oversized payloads (~8MB base64 ~6MB image)
    if (parsed.data.imageBase64.length > 12_000_000) {
      return reply.status(413).send({ error: "圖片過大，請壓縮後再試（建議 < 4MB）" });
    }

    try {
      const result = await identifyBeyblade({
        imageBase64: parsed.data.imageBase64,
        mimeType: parsed.data.mimeType,
      });
      return reply.send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI 辨識失敗";
      req.log?.error?.({ err }, "identify-bey failed");
      return reply.status(502).send({ error: message });
    }
  });
}
