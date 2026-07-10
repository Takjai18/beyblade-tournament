import { useState } from "react";
import { newDeckId, validateDecks, type Deck } from "@beyblade/shared";
import { Plus, Trash2 } from "lucide-react";
import { BeyIdentifyButton } from "./BeyIdentifyButton";

interface Props {
  value: Deck[];
  onChange: (decks: Deck[]) => void;
  disabled?: boolean;
}

const emptyDeck = (order: number): Deck => ({
  id: newDeckId(),
  blade: "",
  ratchet: "",
  bit: "",
  order,
});

export function DeckEditor({ value, onChange, disabled }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);

  function applyDecks(next: Deck[]) {
    const check = validateDecks(
      next.filter((d) => d.blade || d.ratchet || d.bit)
    );
    setError(check.ok ? null : check.error);
    onChange(next);
  }

  function update(idx: number, patch: Partial<Deck>) {
    applyDecks(value.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  function add() {
    if (value.length >= 3) return;
    applyDecks([...value, emptyDeck(value.length)]);
  }

  function remove(idx: number) {
    applyDecks(
      value.filter((_, i) => i !== idx).map((d, i) => ({ ...d, order: i }))
    );
    setError(null);
  }

  function applyIdentify(
    idx: number,
    result: {
      blade: string;
      ratchet: string;
      bit: string;
      assist?: string;
      confidence: number;
      notes?: string;
    }
  ) {
    update(idx, {
      blade: result.blade || value[idx]?.blade || "",
      ratchet: result.ratchet || value[idx]?.ratchet || "",
      bit: result.bit || value[idx]?.bit || "",
      assist: result.assist || value[idx]?.assist || "",
    });
    const pct = Math.round((result.confidence ?? 0) * 100);
    setAiNote(
      `AI 已填入 Bey #${idx + 1}（信心 ${pct}%）${
        result.notes ? ` · ${result.notes}` : ""
      }`
    );
  }

  function identifyNewDeck(result: {
    blade: string;
    ratchet: string;
    bit: string;
    assist?: string;
    confidence: number;
    notes?: string;
  }) {
    if (value.length >= 3) {
      setError("已有 3 顆陀螺，請先刪除或改對現有項目使用 AI");
      return;
    }
    const deck: Deck = {
      ...emptyDeck(value.length),
      blade: result.blade,
      ratchet: result.ratchet,
      bit: result.bit,
      assist: result.assist || undefined,
    };
    applyDecks([...value, deck]);
    const pct = Math.round((result.confidence ?? 0) * 100);
    setAiNote(`AI 已新增陀螺（信心 ${pct}%）`);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label className="label !mb-0">3on3 Decks（最多 3 顆）</label>
        <div className="flex items-center gap-1">
          {value.length < 3 && (
            <BeyIdentifyButton
              compact
              disabled={disabled}
              onResult={identifyNewDeck}
            />
          )}
          <button
            type="button"
            className="btn-ghost !py-1 !text-xs"
            disabled={disabled || value.length >= 3}
            onClick={add}
          >
            <Plus className="h-3.5 w-3.5" />
            新增
          </button>
        </div>
      </div>

      {value.length === 0 && (
        <p className="text-xs text-slate-500">
          尚未設定 deck。可手動填寫，或用「AI 辨識」拍照自動填零件。
        </p>
      )}

      {value.map((d, idx) => (
        <div
          key={d.id}
          className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-cyan-400">
              Bey #{idx + 1}
            </span>
            <div className="flex items-center gap-1">
              <BeyIdentifyButton
                compact
                disabled={disabled}
                onResult={(r) => applyIdentify(idx, r)}
              />
              <button
                type="button"
                className="btn-ghost !p-1 text-orange-400"
                disabled={disabled}
                onClick={() => remove(idx)}
                aria-label="刪除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <label className="label">Blade</label>
              <input
                className="input"
                value={d.blade}
                disabled={disabled}
                placeholder="e.g. DranSword"
                onChange={(e) => update(idx, { blade: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Ratchet</label>
              <input
                className="input"
                value={d.ratchet}
                disabled={disabled}
                placeholder="e.g. 3-60"
                onChange={(e) => update(idx, { ratchet: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Bit</label>
              <input
                className="input"
                value={d.bit}
                disabled={disabled}
                placeholder="e.g. Flat"
                onChange={(e) => update(idx, { bit: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Assist（可選）</label>
            <input
              className="input"
              value={d.assist ?? ""}
              disabled={disabled}
              placeholder="Assist Blade"
              onChange={(e) => update(idx, { assist: e.target.value })}
            />
          </div>
        </div>
      ))}

      {aiNote && (
        <p className="text-xs text-cyan-400/90">{aiNote}</p>
      )}
      {error && (
        <p className="text-xs text-orange-400" role="alert">
          {error}
        </p>
      )}
      <p className="text-[11px] text-slate-600">
        同名零件不可重複 · AI 使用伺服器端 Gemini Vision（需 GEMINI_API_KEY）
      </p>
    </div>
  );
}
