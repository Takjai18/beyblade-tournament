import clsx from "clsx";

export interface StandingRow {
  rank: number;
  playerId: string;
  name: string;
  emoji: string | null;
  seed: number | null;
  wins: number;
  losses: number;
  matchPoints: number;
  scorePoints: number;
  scoreDiff: number;
  buchholz: number;
  qualify: boolean;
  points?: number;
}

export interface StandingsMeta {
  format: string;
  currentRound: number;
  maxRounds: number | null;
  swissComplete: boolean;
  openMatches: number;
  advanceCount: number;
}

interface Props {
  standings: StandingRow[];
  meta?: StandingsMeta | null;
  title?: string;
  /** Highlight 晉級 cut line */
  showQualify?: boolean;
}

export function StandingsTable({
  standings,
  meta,
  title = "排名 / 總分",
  showQualify = true,
}: Props) {
  if (!standings.length) {
    return (
      <div className="card text-center text-sm text-slate-500">尚無排名資料</div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            {title}
          </h2>
          {meta && (
            <p className="mt-0.5 text-xs text-slate-500">
              {meta.format === "SWISS" && meta.maxRounds != null && (
                <>
                  瑞士制 第 {meta.currentRound}/{meta.maxRounds} 輪
                  {meta.openMatches > 0 && ` · 未完 ${meta.openMatches} 場`}
                  {meta.swissComplete && " · 全部輪次已完成"}
                </>
              )}
              {meta.format !== "SWISS" && meta.currentRound > 0 && (
                <>目前輪次 R{meta.currentRound}</>
              )}
              {showQualify && meta.advanceCount > 0 && (
                <> · 晉級名額前 {meta.advanceCount}</>
              )}
            </p>
          )}
        </div>
        {meta?.swissComplete && (
          <span className="badge bg-emerald-500/20 text-emerald-300">
            瑞士制完結
          </span>
        )}
      </div>

      {meta?.swissComplete && (
        <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100">
          全部瑞士制輪次已打完。以下為最終總分排名
          {showQualify && meta.advanceCount > 0
            ? `；標示「晉級」為前 ${meta.advanceCount} 名。`
            : "。"}
        </div>
      )}

      <div className="card overflow-x-auto !p-0">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">玩家</th>
              <th className="px-3 py-2.5 text-right" title="Match wins">
                W
              </th>
              <th className="px-3 py-2.5 text-right">L</th>
              <th className="px-3 py-2.5 text-right" title="Match points">
                MP
              </th>
              <th className="px-3 py-2.5 text-right" title="In-match score points">
                得分
              </th>
              <th className="px-3 py-2.5 text-right" title="Score differential">
                淨分
              </th>
              <th className="px-3 py-2.5 text-right" title="Buchholz">
                BH
              </th>
              {showQualify && <th className="px-3 py-2.5 text-right">狀態</th>}
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => (
              <tr
                key={row.playerId}
                className={clsx(
                  "border-b border-slate-900 last:border-0",
                  row.qualify && showQualify && "bg-cyan-400/5"
                )}
              >
                <td className="px-3 py-2.5 tabular-nums text-slate-500">
                  {row.rank}
                </td>
                <td className="px-3 py-2.5 font-medium">
                  <span className="mr-1">{row.emoji}</span>
                  {row.name}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-cyan-300">
                  {row.wins}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">
                  {row.losses}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-bold text-slate-100">
                  {row.matchPoints}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">
                  {row.scorePoints}
                </td>
                <td
                  className={clsx(
                    "px-3 py-2.5 text-right tabular-nums",
                    row.scoreDiff > 0
                      ? "text-emerald-400"
                      : row.scoreDiff < 0
                        ? "text-orange-400"
                        : "text-slate-500"
                  )}
                >
                  {row.scoreDiff > 0 ? `+${row.scoreDiff}` : row.scoreDiff}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                  {row.buchholz}
                </td>
                {showQualify && (
                  <td className="px-3 py-2.5 text-right">
                    {row.qualify ? (
                      <span className="badge bg-cyan-500/20 text-cyan-300">
                        晉級
                      </span>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-600">
        排序：勝場(MP) → 淨分 → 得分 → Buchholz(對手勝場和) → Seed
      </p>
    </section>
  );
}
