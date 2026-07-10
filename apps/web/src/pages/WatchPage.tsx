import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { FormatBadge, StatusBadge } from "../components/StatusBadge";

export function WatchPage() {
  const { shareCode = "" } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["watch", shareCode],
    queryFn: () => api.getByShareCode(shareCode),
    enabled: Boolean(shareCode),
    refetchInterval: 5000,
  });

  if (isLoading) {
    return <div className="card text-center text-slate-500">載入中…</div>;
  }
  if (error || !data) {
    return (
      <div className="card text-center">
        <p className="text-orange-300">找不到賽事（share code 無效）</p>
        <Link to="/" className="btn-secondary mt-4 inline-flex">
          回首頁
        </Link>
      </div>
    );
  }

  const players = data.players ?? [];

  return (
    <div className="space-y-5">
      <section className="card">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge bg-orange-500/20 text-orange-300">觀眾模式</span>
          <StatusBadge status={data.status} />
          <FormatBadge format={data.format} />
        </div>
        <h1 className="mt-2 text-xl font-bold">{data.name}</h1>
        {data.description && (
          <p className="mt-1 text-sm text-slate-400">{data.description}</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          參賽者 ({players.length})
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
