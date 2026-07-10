import { Link, Outlet } from "react-router-dom";
import { Swords } from "lucide-react";
import { useLocaleStore, useT } from "../stores/localeStore";

export function Layout() {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-4">
          <Link to="/" className="flex min-w-0 items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-400">
              <Swords className="h-4 w-4" />
            </span>
            <span className="truncate">
              {t("appName")}
              <span className="ml-1.5 hidden text-xs font-normal text-slate-500 sm:inline">
                {locale === "zh-Hant" ? "BladeArena" : t("appNameEn")}
              </span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <div
              className="flex rounded-lg border border-slate-800 p-0.5 text-[11px] font-semibold"
              role="group"
              aria-label={t("language")}
            >
              <button
                type="button"
                onClick={() => setLocale("zh-Hant")}
                className={`rounded-md px-2 py-1 ${
                  locale === "zh-Hant"
                    ? "bg-cyan-400/20 text-cyan-300"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                繁
              </button>
              <button
                type="button"
                onClick={() => setLocale("en")}
                className={`rounded-md px-2 py-1 ${
                  locale === "en"
                    ? "bg-cyan-400/20 text-cyan-300"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                EN
              </button>
            </div>
            <Link to="/create" className="btn-primary !py-1.5 !text-xs">
              {t("createTournament")}
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-600">
        BeybladeX Tournament Manager · Phase 1
      </footer>
    </div>
  );
}
