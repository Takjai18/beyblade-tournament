import {
  IdentifyBeyResultSchema,
  type IdentifyBeyResult,
} from "@beyblade/shared";
import { env } from "./env.js";

const PROMPT = `You are an expert at identifying Beyblade X (爆旋陀螺 X / Beyblade X) tournament parts from photos.

Analyze the image and identify the assembled beyblade parts if visible:
- blade (上層攻擊環 / Blade name, e.g. DranSword, HellsScythe, WizardArrow, SharkEdge)
- ratchet (中層 / Ratchet like 3-60, 4-80, 5-70, 9-60)
- bit (下層 / Bit like Flat, Ball, Needle, Taper, Point, Rush, Accel)
- assist (optional Assist Blade if present)

Rules:
- Use common English product names used in competitive Beyblade X when possible.
- If unsure, make your best guess and lower confidence.
- If the image is not a beyblade, return empty strings and confidence 0.
- Respond with ONLY valid JSON, no markdown fences:

{
  "blade": "string",
  "ratchet": "string",
  "bit": "string",
  "assist": "string",
  "confidence": 0.0,
  "notes": "brief Chinese or English note"
}`;

function stripDataUrl(base64: string): { data: string; mime?: string } {
  const m = base64.match(/^data:([^;]+);base64,(.+)$/);
  if (m) return { data: m[2], mime: m[1] };
  return { data: base64.replace(/\s/g, "") };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // strip ```json fences if model ignores instructions
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(body.slice(start, end + 1));
  }
  return JSON.parse(body);
}

export function isGeminiConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

export async function identifyBeyblade(params: {
  imageBase64: string;
  mimeType: string;
}): Promise<IdentifyBeyResult> {
  if (!env.GEMINI_API_KEY) {
    throw new Error("未設定 GEMINI_API_KEY，無法使用 AI 辨識");
  }

  const { data, mime } = stripDataUrl(params.imageBase64);
  const mimeType = mime ?? params.mimeType;

  const model = env.GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: PROMPT },
            {
              inline_data: {
                mime_type: mimeType,
                data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 512,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    // Fallback model name hint
    throw new Error(
      `Gemini API 錯誤 (${res.status}): ${errText.slice(0, 300) || res.statusText}`
    );
  }

  const payload = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    error?: { message?: string };
  };

  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }

  const text =
    payload.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";

  if (!text) {
    throw new Error("Gemini 未回傳辨識結果");
  }

  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch {
    return IdentifyBeyResultSchema.parse({
      blade: "",
      ratchet: "",
      bit: "",
      confidence: 0,
      notes: "無法解析 AI 回應",
      raw: text.slice(0, 500),
    });
  }

  const result = IdentifyBeyResultSchema.safeParse({
    ...(typeof parsed === "object" && parsed !== null ? parsed : {}),
    raw: text.slice(0, 500),
  });

  if (!result.success) {
    return {
      blade: "",
      ratchet: "",
      bit: "",
      assist: "",
      confidence: 0,
      notes: "AI 回傳格式不正確",
      raw: text.slice(0, 500),
    };
  }

  return result.data;
}
