import { create } from "zustand";
import { persist } from "zustand/middleware";

type Role = "HOST" | "REFEREE" | "PLAYER" | "VIEWER";

interface TournamentSession {
  tournamentId: string;
  slug: string;
  role: Role;
  displayName: string;
  pin?: string;
}

interface TournamentStore {
  session: TournamentSession | null;
  setSession: (session: TournamentSession | null) => void;
  clearSession: () => void;
}

export const useTournamentStore = create<TournamentStore>()(
  persist(
    (set) => ({
      session: null,
      setSession: (session) => set({ session }),
      clearSession: () => set({ session: null }),
    }),
    { name: "blade-arena-session" }
  )
);
