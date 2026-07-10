import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Pencil,
  Trash2,
  UserPlus,
  Share2,
  Lock,
  Radio,
  Swords,
  Play,
} from "lucide-react";
import { api, type Match, type Player } from "../lib/api";
import { FormatBadge, StatusBadge } from "../components/StatusBadge";
import { PlayerForm } from "../components/PlayerForm";
import { QRShare } from "../components/QRShare";
import {
  getSocket,
  joinTournamentRoom,
  leaveTournamentRoom,
  SOCKET_EVENTS,
} from "../lib/socket";
import { useTournamentStore } from "../stores/tournamentStore";
import { useT } from "../stores/localeStore";

export function TournamentPage() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();
  const t = useT();
  const { session, setSession, clearSession } = useTournamentStore();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [pinModal, setPinModal] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinName, setPinName] = useState("Host");
  const [pinError, setPinError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const {
    data: tournament,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["tournament", slug],
    queryFn: () => api.getTournament(slug),
    enabled: Boolean(slug),
  });

  const isHost =
    session?.tournamentId === tournament?.id &&
    (session?.role === "HOST" || session?.role === "REFEREE");

  // Socket join for live updates
  useEffect(() => {
    if (!tournament?.id) return;
    let cancelled = false;

    (async () => {
      try {
        await joinTournamentRoom(
          tournament.id,
          isHost ? session?.role ?? "VIEWER" : "VIEWER",
          isHost ? session?.pin : undefined
        );
      } catch {
        // viewer join without pin is fine for room broadcast
        if (!cancelled) {
          try {
            await joinTournamentRoom(tournament.id, "VIEWER");
          } catch {
            /* ignore */
          }
        }
      }
    })();

    const s = getSocket();
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["tournament", slug] });
    };
    s.on(SOCKET_EVENTS.PLAYER_UPDATED, invalidate);
    s.on(SOCKET_EVENTS.TOURNAMENT_UPDATED, invalidate);
    s.on(SOCKET_EVENTS.MATCH_UPDATED, invalidate);
    s.on(SOCKET_EVENTS.STANDINGS_UPDATED, invalidate);

    return () => {
      cancelled = true;
      s.off(SOCKET_EVENTS.PLAYER_UPDATED, invalidate);
      s.off(SOCKET_EVENTS.TOURNAMENT_UPDATED, invalidate);
      s.off(SOCKET_EVENTS.MATCH_UPDATED, invalidate);
      s.off(SOCKET_EVENTS.STANDINGS_UPDATED, invalidate);
      leaveTournamentRoom();
    };
  }, [tournament?.id, isHost, session?.role, session?.pin, slug, qc]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const createPlayer = useMutation({
    mutationFn: (body: {
      name: string;
      emoji: string;
      seed?: number;
      decks?: unknown[];
      currentOrder?: number[];
    }) => api.createPlayer(tournament!.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tournament", slug] });
      setShowAdd(false);
      setToast("已新增玩家");
    },
  });

  const updatePlayer = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: Record<string, unknown>;
    }) => api.updatePlayer(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tournament", slug] });
      setEditing(null);
      setToast("已更新玩家");
    },
  });

  const deletePlayer = useMutation({
    mutationFn: (id: string) => api.deletePlayer(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tournament", slug] });
      setToast("已刪除玩家");
    },
  });

  const updateStatus = useMutation({
    mutationFn: (status: string) =>
      api.updateTournament(tournament!.id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tournament", slug] });
      setToast("狀態已更新");
    },
  });

  const generateBracket = useMutation({
    mutationFn: () =>
      api.generateBracket(tournament!.id, {
        format: tournament!.format,
        seeding: "seed",
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["tournament", slug] });
      setToast(`已產生 ${res.count} 場對戰`);
    },
    onError: (err) => {
      setToast(err instanceof Error ? err.message : "產生對戰表失敗");
    },
  });

  const swissNext = useMutation({
    mutationFn: () => api.swissNextRound(tournament!.id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["tournament", slug] });
      setToast(`瑞士制第 ${res.round} 輪已產生（${res.newCount} 場）`);
    },
    onError: (err) => {
      setToast(err instanceof Error ? err.message : "產生下一輪失敗");
    },
  });

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tournament) return;
    setPinError(null);
    try {
      const res = await api.joinReferee(tournament.id, {
        pin,
        name: pinName || "Host",
      });
      setSession({
        tournamentId: tournament.id,
        slug: tournament.slug,
        role: res.role as "HOST",
        displayName: pinName || "Host",
        pin,
      });
      setPinModal(false);
      setToast("已解鎖主控台");
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "PIN 錯誤");
    }
  }

  if (isLoading) {
    return (
      <div className="card text-center text-slate-500">{t("loading")}</div>
    );
  }
  if (error || !tournament) {
    return (
      <div className="card text-center">
        <p className="text-orange-300">{t("notFound")}</p>
        <Link to="/" className="btn-secondary mt-4 inline-flex">
          {t("backHome")}
        </Link>
      </div>
    );
  }

  const players = tournament.players ?? [];
  const matches = (tournament.matches ?? []) as Match[];
  const playableMatches = matches.filter(
    (m) => m.player1Id && m.player2Id && m.status !== "CANCELLED"
  );

  return (
    <div className="space-y-5">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <section className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold">{tournament.name}</h1>
              <StatusBadge status={tournament.status} />
              <FormatBadge format={tournament.format} />
            </div>
            {tournament.description && (
              <p className="mt-1 text-sm text-slate-400">
                {tournament.description}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary !py-1.5 !text-xs"
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="h-3.5 w-3.5" />
              {t("share")}
            </button>
            {!isHost ? (
              <button
                type="button"
                className="btn-primary !py-1.5 !text-xs"
                onClick={() => setPinModal(true)}
              >
                <Lock className="h-3.5 w-3.5" />
                {t("hostLogin")}
              </button>
            ) : (
              <button
                type="button"
                className="btn-ghost !py-1.5 !text-xs text-slate-400"
                onClick={() => clearSession()}
              >
                {t("hostLogout")}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Radio className="h-3 w-3 text-cyan-400" />
            Socket room: tournament:{tournament.id.slice(0, 8)}…
          </span>
          <span>Code: {tournament.shareCode.slice(0, 8)}…</span>
        </div>

        {isHost && (
          <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-3">
            {(["REGISTRATION", "LIVE", "FINISHED"] as const).map((s) => (
              <button
                key={s}
                type="button"
                disabled={updateStatus.isPending}
                onClick={() => updateStatus.mutate(s)}
                className={`btn-secondary !py-1 !text-xs ${
                  tournament.status === s ? "!border-cyan-400 !text-cyan-300" : ""
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Players */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            {t("players")} ({players.length})
          </h2>
          {isHost && (
            <button
              type="button"
              className="btn-primary !py-1.5 !text-xs"
              onClick={() => {
                setEditing(null);
                setShowAdd(true);
              }}
            >
              <UserPlus className="h-3.5 w-3.5" />
              {t("addPlayer")}
            </button>
          )}
        </div>

        {(showAdd || editing) && isHost && (
          <div className="card border-cyan-400/30">
            <h3 className="mb-3 text-sm font-semibold">
              {editing ? t("editPlayer") : t("addPlayer")}
            </h3>
            <PlayerForm
              initial={editing ?? undefined}
              submitLabel={editing ? t("save") : t("addPlayer")}
              onCancel={() => {
                setShowAdd(false);
                setEditing(null);
              }}
              onSubmit={async (data) => {
                if (editing) {
                  await updatePlayer.mutateAsync({
                    id: editing.id,
                    body: data as Record<string, unknown>,
                  });
                } else {
                  await createPlayer.mutateAsync(data);
                }
              }}
              showDecks={Boolean(tournament.settings?.is3on3) || true}
            />
          </div>
        )}

        {players.length === 0 ? (
          <div className="card text-center text-sm text-slate-500">
            {t("noPlayers")}
            {!isHost && ` · ${t("hostToAdd")}`}
          </div>
        ) : (
          <ul className="space-y-2">
            {players.map((p, i) => (
              <li
                key={p.id}
                className="card flex items-center gap-3 !py-3"
              >
                <span className="text-2xl">{p.emoji ?? "🌀"}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {p.name}
                    {p.isDropped && (
                      <span className="ml-2 text-xs text-orange-400">
                        已棄權
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    #{i + 1}
                    {p.seed != null && ` · Seed ${p.seed}`}
                    {Array.isArray(p.decks) && p.decks.length > 0 && (
                      <> · {p.decks.length} decks</>
                    )}
                  </div>
                </div>
                {isHost && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="btn-ghost !p-2"
                      onClick={() => {
                        setShowAdd(false);
                        setEditing(p);
                      }}
                      aria-label="編輯"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="btn-ghost !p-2 text-orange-400"
                      onClick={() => {
                        if (confirm(`確定刪除 ${p.name}？`)) {
                          deletePlayer.mutate(p.id);
                        }
                      }}
                      aria-label="刪除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Matches */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            {t("matches")} ({playableMatches.length}
            {matches.length !== playableMatches.length
              ? ` / ${matches.length}`
              : ""}
            )
          </h2>
          {isHost && (
            <div className="flex flex-wrap gap-2">
              {tournament.format === "SWISS" && matches.length > 0 && (
                <button
                  type="button"
                  className="btn-secondary !py-1.5 !text-xs"
                  disabled={swissNext.isPending}
                  onClick={() => swissNext.mutate()}
                >
                  {swissNext.isPending ? "…" : "下一輪瑞士制"}
                </button>
              )}
              <button
                type="button"
                className="btn-primary !py-1.5 !text-xs"
                disabled={generateBracket.isPending || players.length < 2}
                onClick={() => {
                  if (
                    matches.length > 0 &&
                    !confirm(
                      "Regenerate will clear all matches & scores. Continue? / 重新產生會清除現有對戰與分數，確定？"
                    )
                  ) {
                    return;
                  }
                  generateBracket.mutate();
                }}
              >
                <Swords className="h-3.5 w-3.5" />
                {generateBracket.isPending
                  ? t("generating")
                  : matches.length
                    ? t("regenerateBracket")
                    : t("generateBracket")}
              </button>
            </div>
          )}
        </div>

        {matches.length === 0 ? (
          <div className="card text-center text-sm text-slate-500">
            {t("noMatches")}
            {players.length < 2 && ` · ${t("needPlayers")}`}
          </div>
        ) : (
          <ul className="space-y-2">
            {matches.map((m) => {
              const bracket =
                m.notes === "W"
                  ? "WB"
                  : m.notes === "L"
                    ? "LB"
                    : m.notes === "GF"
                      ? "GF"
                      : m.notes === "S"
                        ? "S"
                        : m.group?.name
                          ? m.group.name.replace("Group ", "G")
                          : "";
              const label = `${bracket ? bracket + " " : ""}R${m.round}${
                m.matchNumber != null ? `·${m.matchNumber}` : ""
              }`;
              const isBye = !m.player1Id || !m.player2Id;
              return (
                <li key={m.id}>
                  {isBye ? (
                    <div className="card flex items-center gap-3 !py-3 opacity-60">
                      <span className="w-20 shrink-0 text-xs text-slate-500">
                        {label}
                      </span>
                      <span className="flex-1 text-sm text-slate-400">
                        {m.player1?.name ?? m.player2?.name ?? "—"} · BYE
                      </span>
                      <span className="text-xs text-slate-600">
                        {m.status}
                      </span>
                    </div>
                  ) : (
                    <Link
                      to={`/t/${tournament.slug}/match/${m.id}`}
                      className="card flex items-center gap-3 !py-3 transition hover:border-cyan-400/40"
                    >
                      <span className="w-20 shrink-0 text-xs text-slate-500">
                        {label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <span className="truncate">
                            {m.player1?.emoji} {m.player1?.name}
                          </span>
                          <span className="tabular-nums text-cyan-300">
                            {m.score1}
                          </span>
                          <span className="text-slate-600">–</span>
                          <span className="tabular-nums text-orange-300">
                            {m.score2}
                          </span>
                          <span className="truncate">
                            {m.player2?.emoji} {m.player2?.name}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {m.status === "LIVE" && (
                            <span className="text-orange-400">LIVE · </span>
                          )}
                          {m.status === "COMPLETED" && (
                            <span className="text-emerald-400">完結 · </span>
                          )}
                          {t("enterScoreboard")}
                        </div>
                      </div>
                      <Play className="h-4 w-4 shrink-0 text-cyan-400" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <QRShare
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        shareCode={tournament.shareCode}
        tournamentName={tournament.name}
      />

      {/* PIN modal */}
      {pinModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <form
            onSubmit={handlePinSubmit}
            className="card w-full max-w-sm space-y-3 border-cyan-400/30"
          >
            <h3 className="font-semibold">{t("hostLogin")}</h3>
            <div>
              <label className="label">{t("displayName")}</label>
              <input
                className="input"
                value={pinName}
                onChange={(e) => setPinName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">{t("hostPin")}</label>
              <input
                className="input tracking-widest"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                autoFocus
              />
            </div>
            {pinError && (
              <p className="text-sm text-orange-400">{pinError}</p>
            )}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1">
                {t("confirm")}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPinModal(false)}
              >
                {t("cancel")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
