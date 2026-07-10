import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api } from "../lib/api";
import { Scoreboard } from "../components/Scoreboard";
import {
  getSocket,
  joinTournamentRoom,
  leaveTournamentRoom,
  SOCKET_EVENTS,
} from "../lib/socket";
import { useTournamentStore } from "../stores/tournamentStore";
import { sfx } from "../lib/sfx";

export function MatchScorePage() {
  const { slug = "", matchId = "" } = useParams();
  const qc = useQueryClient();
  const session = useTournamentStore((s) => s.session);
  const [toast, setToast] = useState<string | null>(null);

  const { data: match, isLoading, error } = useQuery({
    queryKey: ["match", matchId],
    queryFn: () => api.getMatch(matchId),
    enabled: Boolean(matchId),
    refetchInterval: false,
  });

  const { data: actions } = useQuery({
    queryKey: ["match-actions", matchId],
    queryFn: () => api.getMatchActions(matchId),
    enabled: Boolean(matchId),
  });

  const canScore =
    !!session &&
    session.tournamentId === match?.tournamentId &&
    (session.role === "HOST" || session.role === "REFEREE");

  const pointsToWin =
    Number(match?.tournament?.settings?.pointsToWin) === 7 ? 7 : 4;

  // Socket sync
  useEffect(() => {
    if (!match?.tournamentId) return;
    let cancelled = false;

    (async () => {
      try {
        await joinTournamentRoom(
          match.tournamentId,
          canScore ? session?.role ?? "VIEWER" : "VIEWER",
          canScore ? session?.pin : undefined
        );
      } catch {
        if (!cancelled) {
          try {
            await joinTournamentRoom(match.tournamentId, "VIEWER");
          } catch {
            /* ignore */
          }
        }
      }
    })();

    const s = getSocket();
    const onMatch = (payload: { match?: { id: string } }) => {
      if (payload?.match?.id === matchId) {
        qc.invalidateQueries({ queryKey: ["match", matchId] });
        qc.invalidateQueries({ queryKey: ["match-actions", matchId] });
      } else {
        // still refresh in case next match advance
        qc.invalidateQueries({ queryKey: ["match", matchId] });
      }
    };
    s.on(SOCKET_EVENTS.MATCH_UPDATED, onMatch);
    s.on(SOCKET_EVENTS.ACTION_LOGGED, () => {
      qc.invalidateQueries({ queryKey: ["match-actions", matchId] });
    });

    return () => {
      cancelled = true;
      s.off(SOCKET_EVENTS.MATCH_UPDATED, onMatch);
      leaveTournamentRoom();
    };
  }, [match?.tournamentId, matchId, canScore, session?.role, session?.pin, qc]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const is3on3 = Boolean(match?.tournament?.settings?.is3on3);

  const scoreMut = useMutation({
    mutationFn: (vars: {
      type: "SPIN" | "OVER" | "BURST" | "XTREME";
      playerId: string;
      beyIndex?: number;
    }) =>
      api.scoreMatch(matchId, {
        ...vars,
        refereeName: session?.displayName ?? "HOST",
      }),
    onSuccess: (res) => {
      qc.setQueryData(["match", matchId], res.match);
      qc.invalidateQueries({ queryKey: ["match-actions", matchId] });
      if (res.autoCompleted) {
        sfx.complete();
        setToast("對戰結束！");
      }
    },
  });

  const beyMut = useMutation({
    mutationFn: (body: { currentBey1?: number; currentBey2?: number }) =>
      api.setMatchBey(matchId, body),
    onSuccess: (m) => {
      qc.setQueryData(["match", matchId], m);
    },
  });

  const undoMut = useMutation({
    mutationFn: () =>
      api.undoMatch(matchId, {
        refereeName: session?.displayName ?? "HOST",
      }),
    onSuccess: (res) => {
      qc.setQueryData(["match", matchId], res.match);
      qc.invalidateQueries({ queryKey: ["match-actions", matchId] });
    },
  });

  const completeMut = useMutation({
    mutationFn: () =>
      api.completeMatch(matchId, {
        refereeName: session?.displayName ?? "HOST",
      }),
    onSuccess: (res) => {
      qc.setQueryData(["match", matchId], res.match);
      setToast("已手動結束");
    },
  });

  const startMut = useMutation({
    mutationFn: () =>
      api.startMatch(matchId, {
        refereeName: session?.displayName ?? "HOST",
      }),
    onSuccess: (m) => {
      qc.setQueryData(["match", matchId], m);
      setToast("對戰開始");
    },
  });

  const busy =
    scoreMut.isPending ||
    undoMut.isPending ||
    completeMut.isPending ||
    startMut.isPending ||
    beyMut.isPending;

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-950 text-slate-500">
        載入計分板…
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-slate-950">
        <p className="text-orange-300">找不到對戰</p>
        <Link to={slug ? `/t/${slug}` : "/"} className="btn-secondary">
          返回
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh bg-slate-950">
      {/* Minimal chrome — full screen scoreboard */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link
          to={`/t/${match.tournament?.slug ?? slug}`}
          className="btn-ghost !py-1.5 !text-xs text-slate-400"
        >
          <ArrowLeft className="h-4 w-4" />
          主控台
        </Link>
        <span className="truncate text-xs text-slate-600">
          {match.tournament?.name}
        </span>
        {!canScore && (
          <span className="badge bg-slate-800 text-slate-400">只讀</span>
        )}
        {canScore && (
          <span className="badge bg-cyan-500/20 text-cyan-300">裁判</span>
        )}
      </div>

      <div className="pt-10">
        <Scoreboard
          match={match}
          pointsToWin={pointsToWin}
          canScore={canScore}
          busy={busy}
          is3on3={is3on3}
          actions={actions}
          onScore={async (type, playerId, beyIndex) => {
            await scoreMut.mutateAsync({ type, playerId, beyIndex });
          }}
          onUndo={async () => {
            await undoMut.mutateAsync();
          }}
          onComplete={async () => {
            await completeMut.mutateAsync();
          }}
          onStart={async () => {
            await startMut.mutateAsync();
          }}
          onSetBey={async (side, index) => {
            await beyMut.mutateAsync(
              side === "p1"
                ? { currentBey1: index }
                : { currentBey2: index }
            );
          }}
        />
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
