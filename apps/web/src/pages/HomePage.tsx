import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Users, ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import { FormatBadge, StatusBadge } from "../components/StatusBadge";

export function HomePage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["tournaments"],
    queryFn: api.listTournaments,
  });

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-cyan-400/10 blur-2xl" />
        <h1 className="text-2xl font-bold tracking-tight">
          爆旋陀螺比賽管理
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          手機優先 · 裁判即時計分 · 瑞士制 / 單敗 / 循環 · 4 分制
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/create" className="btn-primary">
            <Plus className="h-4 w-4" />
            快速建立賽事
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            我的賽事
          </h2>
          <button
            type="button"
            onClick={() => refetch()}
            className="btn-ghost !py-1 !text-xs"
          >
            重新整理
          </button>
        </div>

        {isLoading && (
          <div className="card text-center text-sm text-slate-500">
            載入中…
          </div>
        )}
        {error && (
          <div className="card border-orange-500/30 text-sm text-orange-300">
            無法載入賽事列表（請確認後端已啟動）
            <button
              type="button"
              className="btn-secondary mt-3 w-full"
              onClick={() => refetch()}
            >
              重試
            </button>
          </div>
        )}
        {data && data.length === 0 && (
          <div className="card text-center text-sm text-slate-500">
            尚無賽事，點上方按鈕開始建立。
          </div>
        )}
        <ul className="space-y-2">
          {data?.map((t) => (
            <li key={t.id}>
              <Link
                to={`/t/${t.slug}`}
                className="card flex items-center gap-3 transition hover:border-cyan-400/40 hover:bg-slate-900"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{t.name}</span>
                    <StatusBadge status={t.status} />
                    <FormatBadge format={t.format} />
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {t.playerCount} 人
                    </span>
                    <span>
                      {new Date(t.createdAt).toLocaleDateString("zh-TW")}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-600" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
