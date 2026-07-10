import { useEffect, useState } from "react";
import { FINISH_POINTS } from "@beyblade/shared";
import type { FinishRecord, Match } from "../lib/api";
import { sfx } from "../lib/sfx";
import { Undo2, Flag, ChevronDown, ChevronUp } from "lucide-react";

type FinishType = "SPIN" | "OVER" | "BURST" | "XTREME";

const BUTTONS: {
  type: FinishType;
  label: string;
  sub: string;
  className: string;
}[] = [
  {
    type: "SPIN",
    label: "Spin",
    sub: `+${FINISH_POINTS.SPIN}`,
    className: "bg-slate-700 hover:bg-slate-600 active:bg-slate-500",
  },
  {
    type: "OVER",
    label: "Over",
    sub: `+${FINISH_POINTS.OVER}`,
    className: "bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-400",
  },
  {
    type: "BURST",
    label: "Burst",
    sub: `+${FINISH_POINTS.BURST}`,
    className: "bg-orange-600 hover:bg-orange-500 active:bg-orange-400",
  },
  {
    type: "XTREME",
    label: "Xtreme",
    sub: `+${FINISH_POINTS.XTREME}`,
    className:
      "bg-gradient-to-br from-fuchsia-600 to-orange-500 hover:from-fuchsia-500 hover:to-orange-400",
  },
];

interface Props {
  match: Match;
  pointsToWin: number;
  canScore: boolean;
  busy: boolean;
  onScore: (type: FinishType, playerId: string) => Promise<void>;
  onUndo: () => Promise<void>;
  onComplete: () => Promise<void>;
  onStart: () => Promise<void>;
  actions?: { id: string; action: string; createdAt: string; performedBy: string | null }[];
}

function ScoreDigit({ value, bounceKey }: { value: number; bounceKey: string }) {
  const [pop, setPop] = useState(false);
  useEffect(() => {
    setPop(true);
    const t = setTimeout(() => setPop(false), 280);
    return () => clearTimeout(t);
  }, [bounceKey, value]);

  return (
    <span
      className={`inline-block tabular-nums transition-transform duration-200 ${
        pop ? "scale-125 text-cyan-300" : "scale-100"
      }`}
    >
      {value}
    </span>
  );
}

export function Scoreboard({
  match,
  pointsToWin,
  canScore,
  busy,
  onScore,
  onUndo,
  onComplete,
  onStart,
  actions = [],
}: Props) {
  const [side, setSide] = useState<"p1" | "p2">("p1");
  const [logOpen, setLogOpen] = useState(false);
  const [lastScoreKey, setLastScoreKey] = useState("0");
  const [error, setError] = useState<string | null>(null);

  const p1 = match.player1;
  const p2 = match.player2;
  const finishes = (match.finishes ?? []) as FinishRecord[];
  const canUndo = finishes.length > 0 && canScore && match.status !== "CANCELLED";
  const isDone = match.status === "COMPLETED";
  const canStart =
    canScore &&
    (match.status === "READY" || match.status === "PENDING") &&
    match.player1Id &&
    match.player2Id;

  async function handleScore(type: FinishType) {
    const playerId = side === "p1" ? match.player1Id : match.player2Id;
    if (!playerId) return;
    setError(null);
    try {
      // Haptic if available
      if (navigator.vibrate) navigator.vibrate(30);
      sfx.playFinish(type);
      await onScore(type, playerId);
      setLastScoreKey(`${Date.now()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "計分失敗");
    }
  }

  async function handleUndo() {
    setError(null);
    try {
      sfx.undo();
      await onUndo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "撤銷失敗");
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      {/* Scores */}
      <div className="grid flex-none grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pt-4 sm:px-6">
        <button
          type="button"
          onClick={() => setSide("p1")}
          className={`rounded-2xl border p-3 text-left transition ${
            side === "p1"
              ? "border-cyan-400 bg-cyan-400/10"
              : "border-slate-800 bg-slate-900/60"
          }`}
        >
          <div className="text-2xl">{p1?.emoji ?? "🌀"}</div>
          <div className="truncate text-sm font-semibold sm:text-base">
            {p1?.name ?? "TBD"}
          </div>
          <div
            className={`mt-1 text-5xl font-black tracking-tight sm:text-6xl ${
              side === "p1" ? "text-cyan-300" : ""
            }`}
          >
            <ScoreDigit value={match.score1} bounceKey={`1-${lastScoreKey}-${match.score1}`} />
          </div>
        </button>

        <div className="flex flex-col items-center px-1">
          <span className="text-xs uppercase tracking-widest text-slate-500">
            R{match.round}
            {match.matchNumber != null ? ` · M${match.matchNumber}` : ""}
          </span>
          <span className="text-2xl font-bold text-slate-600">VS</span>
          <span
            className={`mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isDone
                ? "bg-emerald-500/20 text-emerald-300"
                : match.status === "LIVE"
                  ? "bg-orange-500/20 text-orange-300"
                  : "bg-slate-800 text-slate-400"
            }`}
          >
            {isDone ? "完結" : match.status}
          </span>
          <span className="mt-1 text-[10px] text-slate-600">
            先到 {pointsToWin}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setSide("p2")}
          className={`rounded-2xl border p-3 text-right transition ${
            side === "p2"
              ? "border-orange-400 bg-orange-400/10"
              : "border-slate-800 bg-slate-900/60"
          }`}
        >
          <div className="text-2xl">{p2?.emoji ?? "🌀"}</div>
          <div className="truncate text-sm font-semibold sm:text-base">
            {p2?.name ?? "TBD"}
          </div>
          <div
            className={`mt-1 text-5xl font-black tracking-tight sm:text-6xl ${
              side === "p2" ? "text-orange-300" : ""
            }`}
          >
            <ScoreDigit value={match.score2} bounceKey={`2-${lastScoreKey}-${match.score2}`} />
          </div>
        </button>
      </div>

      {/* Selected side hint */}
      <p className="mt-2 px-4 text-center text-xs text-slate-500">
        計分對象：
        <span className="font-semibold text-slate-200">
          {side === "p1" ? p1?.name ?? "P1" : p2?.name ?? "P2"}
        </span>
        （點擊上方選手卡片切換）
      </p>

      {error && (
        <p className="mx-4 mt-2 rounded-lg bg-orange-500/15 px-3 py-2 text-center text-sm text-orange-300">
          {error}
        </p>
      )}

      {/* Finish buttons */}
      <div className="mt-3 grid flex-1 grid-cols-2 content-start gap-3 px-3 pb-3 sm:px-6">
        {BUTTONS.map((b) => (
          <button
            key={b.type}
            type="button"
            disabled={!canScore || busy || isDone || !match.player1Id || !match.player2Id}
            onClick={() => handleScore(b.type)}
            className={`flex min-h-[72px] flex-col items-center justify-center rounded-2xl text-white shadow-lg transition active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 ${b.className}`}
          >
            <span className="text-lg font-bold tracking-wide sm:text-xl">
              {b.label}
            </span>
            <span className="text-sm opacity-90">{b.sub}</span>
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-none flex-wrap gap-2 border-t border-slate-800 bg-slate-950/95 px-3 py-3 sm:px-6">
        {canStart && (
          <button
            type="button"
            className="btn-primary min-h-12 flex-1"
            disabled={busy}
            onClick={() => onStart()}
          >
            開始對戰
          </button>
        )}
        <button
          type="button"
          className="btn-secondary min-h-12 flex-1"
          disabled={!canUndo || busy}
          onClick={handleUndo}
        >
          <Undo2 className="h-4 w-4" />
          Undo ({finishes.length})
        </button>
        {!isDone && canScore && (
          <button
            type="button"
            className="btn-danger min-h-12 flex-1"
            disabled={busy || match.score1 === match.score2}
            onClick={async () => {
              try {
                sfx.complete();
                await onComplete();
              } catch (e) {
                setError(e instanceof Error ? e.message : "結束失敗");
              }
            }}
          >
            <Flag className="h-4 w-4" />
            手動結束
          </button>
        )}
      </div>

      {/* Finish log */}
      <div className="flex-none border-t border-slate-900 px-3 pb-safe sm:px-6">
        <button
          type="button"
          className="flex w-full items-center justify-between py-2 text-xs text-slate-500"
          onClick={() => setLogOpen((v) => !v)}
        >
          <span>計分紀錄 / Action Log（最近 {Math.min(20, finishes.length)}）</span>
          {logOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </button>
        {logOpen && (
          <ul className="max-h-40 space-y-1 overflow-y-auto pb-4 text-xs">
            {[...finishes].reverse().slice(0, 20).map((f) => {
              const who =
                f.playerId === match.player1Id
                  ? p1?.name
                  : f.playerId === match.player2Id
                    ? p2?.name
                    : f.playerId.slice(0, 6);
              return (
                <li
                  key={f.id}
                  className="flex justify-between rounded-lg bg-slate-900/80 px-2 py-1.5 text-slate-400"
                >
                  <span>
                    <span className="font-medium text-slate-200">{who}</span>{" "}
                    {f.type} +{f.points}
                  </span>
                  <span className="text-slate-600">
                    {new Date(f.timestamp).toLocaleTimeString("zh-TW", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </li>
              );
            })}
            {finishes.length === 0 && (
              <li className="py-2 text-center text-slate-600">尚無計分</li>
            )}
            {actions.length > 0 && (
              <>
                <li className="pt-2 text-[10px] uppercase tracking-wide text-slate-600">
                  Server ActionLog
                </li>
                {actions.map((a) => (
                  <li key={a.id} className="text-slate-600">
                    {a.action} · {a.performedBy ?? "—"} ·{" "}
                    {new Date(a.createdAt).toLocaleTimeString("zh-TW")}
                  </li>
                ))}
              </>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
