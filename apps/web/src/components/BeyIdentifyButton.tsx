import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, Loader2, Sparkles } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { fileToCompressedBase64 } from "../lib/image";

export interface IdentifyResult {
  blade: string;
  ratchet: string;
  bit: string;
  assist?: string;
  confidence: number;
  notes?: string;
}

interface Props {
  onResult: (result: IdentifyResult) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function BeyIdentifyButton({ onResult, disabled, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: status } = useQuery({
    queryKey: ["ai-status"],
    queryFn: api.aiStatus,
    staleTime: 60_000,
    retry: 1,
  });

  const configured = status?.configured ?? false;

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("請選擇圖片檔");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { base64, mimeType } = await fileToCompressedBase64(file);
      const result = await api.identifyBey({
        imageBase64: base64,
        mimeType,
      });
      onResult(result);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "辨識失敗"
      );
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={compact ? "" : "space-y-1"}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={disabled || loading || !configured}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <button
        type="button"
        className={
          compact
            ? "btn-ghost !py-1 !px-2 !text-xs text-cyan-300"
            : "btn-secondary !py-1.5 !text-xs"
        }
        disabled={disabled || loading || !configured}
        title={
          configured
            ? "拍照或上傳圖片，AI 辨識零件"
            : "未設定 GEMINI_API_KEY"
        }
        onClick={() => inputRef.current?.click()}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <>
            <Sparkles className="h-3.5 w-3.5" />
            {!compact && <Camera className="h-3.5 w-3.5" />}
          </>
        )}
        {loading ? "辨識中…" : "AI 辨識"}
      </button>
      {!configured && !compact && (
        <p className="text-[11px] text-slate-600">
          後端未設定 GEMINI_API_KEY
        </p>
      )}
      {error && (
        <p className="text-[11px] text-orange-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
