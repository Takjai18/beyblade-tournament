import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Match } from "../lib/api";
import { FormatBadge, StatusBadge } from "../components/StatusBadge";
import {
  getSocket,
  joinTournamentRoom,
  leaveTournamentRoom,
  SOCKET_EVENTS,
} from "../lib/socket";
import { useT } from "../stores/localeStore";

export function WatchPage() {
  const { shareCode = "" } = useParams();
  const qc = useQueryClient();
  const t = useT();

  const { data, isLoading, error } = useQuery({
    queryKey: ["watch", shareCode],
    queryFn: () => api.getByShareCode(shareCode),
    enabled: Boolean(shareCode),
    refetchInterval: 15_000,
  });

  const { data: standings } = useQuery({
    queryKey: ["watch-standings", data?.id],
    queryFn: () => api.getStandings(data!.id),
    enabled: Boolean(data?.id),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (!data?.id) return;
    let cancelled = false;

    (async () => {
      try {
        await joinTournamentRoom(data.id, "VIEWER");
      } catch {
        if (!cancelled) {
          /* room join optional for watch */
        }
      }
    })();

    const s = getSocket();
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["watch", shareCode] });
      qc.invalidateQueries({ queryKey: ["watch-standings", data.id] });
    };
    s.on(SOCKET_EVENTS.MATCH_UPDATED, invalidate);
    s.on(SOCKET_EVENTS.PLAYER_UPDATED, invalidate);
    s.on(SOCKET_EVENTS.TOURNAMENT_UPDATED, invalidate);
    s.on(SOCKET_EVENTS.STANDINGS_UPDATED, invalidate);

    return () => {
      cancelled = true;
      s.off(SOCKET_EVENTS.MATCH_UPDATED, invalidate);
      s.off(SOCKET_EVENTS.PLAYER_UPDATED, invalidate);
      s.off(SOCKET_EVENTS.TOURNAMENT_UPDATED, invalidate);
      s.off(SOCKET_EVENTS.STANDINGS_UPDATED, invalidate);
      leaveTournamentRoom();
    };
  }, [data?.id, shareCode, qc]);

  if (isLoading) {
    return (
      <div className="card text-center text-slate-500">{t("loading")}</div>
    );
  }
  if (error || !data) {
    return (
      <div className="card text-center">
        <p className="text-orange-300">{t("invalidShare")}</p>
        <Link to="/" className="btn-secondary mt-4 inline-flex">
          {t("backHome")}
        </Link>
      </div>
    );
  }

  const players = data.players ?? [];
  const matches = ((data.matches ?? []) as Match[]).filter(
    (m) => m.player1Id && m.player2Id
  );
  const liveMatches = matches.filter((m) => m.status === "LIVE");
  const otherMatches = matches.filter((m) => m.status !== "LIVE");

  return (
    <div className="space-y-5">
      <section className="card">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge bg-orange-500/20 text-orange-300">
            {t("watchMode")}
          </span>
          <StatusBadge status={data.status} />
          <FormatBadge format={data.format} />
        </div>
        <h1 className="mt-2 text-xl font-bold">{data.name}</h1>
        {data.description && (
          <p className="mt-1 text-sm text-slate-400">{data.description}</p>
        )}
      </section>

      {/* Live matches first */}
      {liveMatches.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-orange-400">
            {t("live")}
          </h2>
          <ul className="space-y-2">
            {liveMatches.map((m) => (
              <MatchRow key={m.id} m={m} />
            ))}
          </ul>
        </section>
      )}

      {/* Standings */}
      {standings && standings.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            {t("standings")}
          </h2>
          <div className="card overflow-x-auto !p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">{t("name")}</th>
                  <th className="px-3 py-2 text-right">W</th>
                  <th className="px-3 py-2 text-right">L</th>
                  <th className="px-3 py-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, i) => (
                  <tr
                    key={row.playerId}
                    className="border-b border-slate-900 last:border-0"
                  >
                    <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">
                      <span className="mr-1">{row.emoji}</span>
                      {row.name}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-cyan-300">
                      {row.wins}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {row.losses}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {row.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* All matches */}
      {otherMatches.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            {t("matches")}
          </h2>
          <ul className="space-y-2">
            {otherMatches.map((m) => (
              <MatchRow key={m.id} m={m} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          {t("players")} ({players.length})
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {players.map((p) => (
            <li key={p.id} className="card !py-3 text-center">
              <div className="text-2xl">{p.emoji ?? "🌀"}</div>
              <div className="mt-1 truncate text-sm font-medium">{p.name}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function MatchRow({ m }: { m: Match }) {
  return (
    <li className="card flex items-center gap-3 !py-3">
      <span className="w-14 shrink-0 text-xs text-slate-500">
        R{m.round}
        {m.matchNumber != null ? `·${m.matchNumber}` : ""}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">
            {m.player1?.emoji} {m.player1?.name}
          </span>
          <span className="tabular-nums font-bold text-cyan-300">
            {m.score1}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="truncate">
            {m.player2?.emoji} {m.player2?.name}
          </span>
          <span className="tabular-nums font-bold text-orange-300">
            {m.score2}
          </span>
        </div>
      </div>
      {m.status === "LIVE" && (
        <span className="badge shrink-0 bg-orange-500/20 text-orange-300">
          LIVE
        </span>
      )}
      {m.status === "COMPLETED" && (
        <span className="badge shrink-0 bg-emerald-500/20 text-emerald-300">
          ✓
        </span>
      )}
    </li>
  );
}
