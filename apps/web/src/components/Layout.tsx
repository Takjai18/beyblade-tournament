import { Link, Outlet } from "react-router-dom";
import { Swords } from "lucide-react";

export function Layout() {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-400">
              <Swords className="h-4 w-4" />
            </span>
            <span>
              陀螺賽事通
              <span className="ml-1.5 hidden text-xs font-normal text-slate-500 sm:inline">
                BladeArena
              </span>
            </span>
          </Link>
          <Link to="/create" className="btn-primary !py-1.5 !text-xs">
            建立賽事
          </Link>
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
