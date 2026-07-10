import { useState } from "react";
import type { Player } from "../lib/api";

const EMOJIS = ["🌀", "⚡", "🔥", "❄️", "🐉", "⭐", "🎯", "💥", "🛡️", "👑"];

interface Props {
  initial?: Partial<Player>;
  onSubmit: (data: {
    name: string;
    emoji: string;
    seed?: number;
  }) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

export function PlayerForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = "新增玩家",
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "🌀");
  const [seed, setSeed] = useState(initial?.seed?.toString() ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("請輸入名字");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        emoji,
        seed: seed ? Number(seed) : undefined,
      });
      setName("");
      setSeed("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="label">名字</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="選手名稱"
          maxLength={50}
          autoFocus
        />
      </div>
      <div>
        <label className="label">Emoji</label>
        <div className="flex flex-wrap gap-2">
          {EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => setEmoji(em)}
              className={`h-10 w-10 rounded-xl text-lg transition ${
                emoji === em
                  ? "bg-cyan-400/20 ring-2 ring-cyan-400"
                  : "bg-slate-800 hover:bg-slate-700"
              }`}
            >
              {em}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Seed（可選）</label>
        <input
          className="input"
          type="number"
          min={1}
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder="種子順位"
        />
      </div>
      {error && (
        <p className="text-sm text-orange-400" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary flex-1" disabled={loading}>
          {loading ? "處理中…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            取消
          </button>
        )}
      </div>
    </form>
  );
}
