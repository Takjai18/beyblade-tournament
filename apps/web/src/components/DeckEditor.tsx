import { useState } from "react";
import { newDeckId, validateDecks, type Deck } from "@beyblade/shared";
import { Plus, Trash2 } from "lucide-react";

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

  function update(idx: number, patch: Partial<Deck>) {
    const next = value.map((d, i) => (i === idx ? { ...d, ...patch } : d));
    const check = validateDecks(
      next.filter((d) => d.blade || d.ratchet || d.bit)
    );
    setError(check.ok ? null : check.error);
    onChange(next);
  }

  function add() {
    if (value.length >= 3) return;
    onChange([...value, emptyDeck(value.length)]);
  }

  function remove(idx: number) {
    onChange(
      value.filter((_, i) => i !== idx).map((d, i) => ({ ...d, order: i }))
    );
    setError(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="label !mb-0">3on3 Decks（最多 3 顆）</label>
        <button
          type="button"
          className="btn-ghost !py-1 !text-xs"
          disabled={disabled || value.length >= 3}
          onClick={add}
        >
          <Plus className="h-3.5 w-3.5" />
          新增陀螺
        </button>
      </div>

      {value.length === 0 && (
        <p className="text-xs text-slate-500">
          尚未設定 deck。3on3 賽事建議每名選手填 1–3 顆。
        </p>
      )}

      {value.map((d, idx) => (
        <div
          key={d.id}
          className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-cyan-400">
              Bey #{idx + 1}
            </span>
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
        </div>
      ))}

      {error && (
        <p className="text-xs text-orange-400" role="alert">
          {error}
        </p>
      )}
      <p className="text-[11px] text-slate-600">
        同名零件不可重複（Blade / Ratchet / Bit 各自 unique）
      </p>
    </div>
  );
}
