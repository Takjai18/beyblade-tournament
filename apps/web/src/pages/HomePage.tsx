import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Users, ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import { FormatBadge, StatusBadge } from "../components/StatusBadge";
import { useT } from "../stores/localeStore";

export function HomePage() {
  const t = useT();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["tournaments"],
    queryFn: api.listTournaments,
  });

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-cyan-400/10 blur-2xl" />
        <h1 className="text-2xl font-bold tracking-tight">{t("homeHero")}</h1>
        <p className="mt-2 text-sm text-slate-400">{t("homeSub")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/create" className="btn-primary">
            <Plus className="h-4 w-4" />
            {t("quickCreate")}
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            {t("myTournaments")}
          </h2>
          <button
            type="button"
            onClick={() => refetch()}
            className="btn-ghost !py-1 !text-xs"
          >
            {t("refresh")}
          </button>
        </div>

        {isLoading && (
          <div className="card text-center text-sm text-slate-500">
            {t("loading")}
          </div>
        )}
        {error && (
          <div className="card border-orange-500/30 text-sm text-orange-300">
            {t("loadError")}
            <button
              type="button"
              className="btn-secondary mt-3 w-full"
              onClick={() => refetch()}
            >
              {t("retry")}
            </button>
          </div>
        )}
        {data && data.length === 0 && (
          <div className="card text-center text-sm text-slate-500">
            {t("noTournaments")}
          </div>
        )}
        <ul className="space-y-2">
          {data?.map((item) => (
            <li key={item.id}>
              <Link
                to={`/t/${item.slug}`}
                className="card flex items-center gap-3 transition hover:border-cyan-400/40 hover:bg-slate-900"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{item.name}</span>
                    <StatusBadge status={item.status} />
                    <FormatBadge format={item.format} />
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {item.playerCount} {t("people")}
                    </span>
                    <span>
                      {new Date(item.createdAt).toLocaleDateString()}
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
