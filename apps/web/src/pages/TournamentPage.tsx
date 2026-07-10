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
} from "lucide-react";
import { api, type Player } from "../lib/api";
import { FormatBadge, StatusBadge } from "../components/StatusBadge";
import { PlayerForm } from "../components/PlayerForm";
import {
  getSocket,
  joinTournamentRoom,
  leaveTournamentRoom,
  SOCKET_EVENTS,
} from "../lib/socket";
import { useTournamentStore } from "../stores/tournamentStore";

export function TournamentPage() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();
  const { session, setSession, clearSession } = useTournamentStore();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [pinModal, setPinModal] = useState(false);
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

    return () => {
      cancelled = true;
      s.off(SOCKET_EVENTS.PLAYER_UPDATED, invalidate);
      s.off(SOCKET_EVENTS.TOURNAMENT_UPDATED, invalidate);
      leaveTournamentRoom();
    };
  }, [tournament?.id, isHost, session?.role, session?.pin, slug, qc]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const createPlayer = useMutation({
    mutationFn: (body: { name: string; emoji: string; seed?: number }) =>
      api.createPlayer(tournament!.id, body),
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
      body: { name: string; emoji: string; seed?: number };
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

  function copyShare() {
    if (!tournament) return;
    const url = `${window.location.origin}/watch/${tournament.shareCode}`;
    navigator.clipboard.writeText(url).then(() => setToast("已複製觀眾連結"));
  }

  if (isLoading) {
    return <div className="card text-center text-slate-500">載入賽事…</div>;
  }
  if (error || !tournament) {
    return (
      <div className="card text-center">
        <p className="text-orange-300">找不到賽事</p>
        <Link to="/" className="btn-secondary mt-4 inline-flex">
          回首頁
        </Link>
      </div>
    );
  }

  const players = tournament.players ?? [];

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
            <button type="button" className="btn-secondary !py-1.5 !text-xs" onClick={copyShare}>
              <Share2 className="h-3.5 w-3.5" />
              分享
            </button>
            {!isHost ? (
              <button
                type="button"
                className="btn-primary !py-1.5 !text-xs"
                onClick={() => setPinModal(true)}
              >
                <Lock className="h-3.5 w-3.5" />
                主辦登入
              </button>
            ) : (
              <button
                type="button"
                className="btn-ghost !py-1.5 !text-xs text-slate-400"
                onClick={() => clearSession()}
              >
                登出主辦
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
            玩家管理 ({players.length})
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
              新增
            </button>
          )}
        </div>

        {(showAdd || editing) && isHost && (
          <div className="card border-cyan-400/30">
            <h3 className="mb-3 text-sm font-semibold">
              {editing ? "編輯玩家" : "新增玩家"}
            </h3>
            <PlayerForm
              initial={editing ?? undefined}
              submitLabel={editing ? "儲存" : "新增玩家"}
              onCancel={() => {
                setShowAdd(false);
                setEditing(null);
              }}
              onSubmit={async (data) => {
                if (editing) {
                  await updatePlayer.mutateAsync({ id: editing.id, body: data });
                } else {
                  await createPlayer.mutateAsync(data);
                }
              }}
            />
          </div>
        )}

        {players.length === 0 ? (
          <div className="card text-center text-sm text-slate-500">
            尚未有玩家
            {!isHost && " · 請主辦登入後新增"}
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

      {/* Phase 1 placeholder */}
      <section className="card border-dashed border-slate-700 text-sm text-slate-500">
        <p className="font-medium text-slate-400">接下來（Phase 1 剩餘）</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>產生單敗 / 循環對戰表</li>
          <li>全螢幕計分板 + Undo</li>
          <li>觀眾模式 /watch/:shareCode + QR</li>
        </ul>
      </section>

      {/* PIN modal */}
      {pinModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <form
            onSubmit={handlePinSubmit}
            className="card w-full max-w-sm space-y-3 border-cyan-400/30"
          >
            <h3 className="font-semibold">主辦 / 裁判登入</h3>
            <div>
              <label className="label">顯示名稱</label>
              <input
                className="input"
                value={pinName}
                onChange={(e) => setPinName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Host PIN</label>
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
                確認
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPinModal(false)}
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
