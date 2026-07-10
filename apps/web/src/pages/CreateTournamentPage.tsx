import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FORMAT_LABELS } from "@beyblade/shared";
import { api, ApiError } from "../lib/api";
import { useTournamentStore } from "../stores/tournamentStore";

const FORMATS = Object.keys(FORMAT_LABELS) as (keyof typeof FORMAT_LABELS)[];

export function CreateTournamentPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const setSession = useTournamentStore((s) => s.setSession);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState<string>("SINGLE_ELIM");
  const [hostPin, setHostPin] = useState("");
  const [pointsToWin, setPointsToWin] = useState<4 | 7>(4);
  const [is3on3, setIs3on3] = useState(false);
  const [swissRounds, setSwissRounds] = useState(5);
  const [groupCount, setGroupCount] = useState(4);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: api.createTournament,
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["tournaments"] });
      setSession({
        tournamentId: t.id,
        slug: t.slug,
        role: "HOST",
        displayName: "Host",
        pin: hostPin,
      });
      navigate(`/t/${t.slug}`);
    },
    onError: (err) => {
      setError(
        err instanceof ApiError ? err.message : "建立失敗，請稍後再試"
      );
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,6}$/.test(hostPin)) {
      setError("Host PIN 必須為 4–6 位數字");
      return;
    }
    mutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      format,
      hostPin,
      settings: {
        pointsToWin,
        is3on3,
        swissRounds,
        groupCount,
      },
    });
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-bold">建立賽事</h1>
        <p className="mt-1 text-sm text-slate-400">
          設定名稱、賽制與主辦 PIN（用於主控台）
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="label">賽事名稱 *</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：週末 X 級邀請賽"
            required
            maxLength={100}
          />
        </div>

        <div>
          <label className="label">說明</label>
          <textarea
            className="input min-h-[80px] resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="地點、規則補充…"
            maxLength={2000}
          />
        </div>

        <div>
          <label className="label">賽制</label>
          <select
            className="input"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABELS[f].zh} ({FORMAT_LABELS[f].en})
              </option>
            ))}
          </select>
          {format === "SWISS" && (
            <p className="mt-1.5 text-xs text-slate-500">
              瑞士制：依勝負配對，可分多輪（下方設定輪數）。
            </p>
          )}
          {format === "DOUBLE_ELIM" && (
            <p className="mt-1.5 text-xs text-slate-500">
              雙敗：勝部 / 敗部 + 總決賽，輸兩場出局。
            </p>
          )}
          {format === "GROUP_SWISS" && (
            <p className="mt-1.5 text-xs text-slate-500">
              分組循環：先 snake 分組，組內循環賽。
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">勝利分數</label>
            <select
              className="input"
              value={pointsToWin}
              onChange={(e) =>
                setPointsToWin(Number(e.target.value) as 4 | 7)
              }
            >
              <option value={4}>4 分制</option>
              <option value={7}>7 分制</option>
            </select>
          </div>
          <div>
            <label className="label">3on3</label>
            <button
              type="button"
              onClick={() => setIs3on3((v) => !v)}
              className={`input flex items-center justify-between ${
                is3on3 ? "border-cyan-400 text-cyan-300" : ""
              }`}
            >
              <span>{is3on3 ? "開啟" : "關閉"}</span>
              <span
                className={`h-5 w-9 rounded-full p-0.5 transition ${
                  is3on3 ? "bg-cyan-400" : "bg-slate-700"
                }`}
              >
                <span
                  className={`block h-4 w-4 rounded-full bg-white transition ${
                    is3on3 ? "translate-x-4" : ""
                  }`}
                />
              </span>
            </button>
          </div>
        </div>

        {format === "SWISS" && (
          <div>
            <label className="label">瑞士制輪數</label>
            <input
              className="input"
              type="number"
              min={1}
              max={20}
              value={swissRounds}
              onChange={(e) => setSwissRounds(Number(e.target.value) || 5)}
            />
          </div>
        )}

        {format === "GROUP_SWISS" && (
          <div>
            <label className="label">組數</label>
            <input
              className="input"
              type="number"
              min={2}
              max={16}
              value={groupCount}
              onChange={(e) => setGroupCount(Number(e.target.value) || 4)}
            />
          </div>
        )}

        <div>
          <label className="label">Host PIN（4–6 位數字）*</label>
          <input
            className="input tracking-widest"
            type="password"
            inputMode="numeric"
            pattern="\d{4,6}"
            value={hostPin}
            onChange={(e) => setHostPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••"
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            進入主控台、計分時需要此 PIN，請妥善保存。
          </p>
        </div>

        {error && (
          <p className="text-sm text-orange-400" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={mutation.isPending || !name.trim()}
        >
          {mutation.isPending ? "建立中…" : "建立賽事"}
        </button>
      </form>
    </div>
  );
}
